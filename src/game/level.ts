import type { AudioAnalysis } from '../audio/analyzer.ts'

/**
 * Генератор уровня: превращает анализ трека в список нот.
 * Результат зависит только от анализа и сложности, поэтому один и тот же
 * трек всегда даёт один и тот же уровень, и рекорды можно сравнивать.
 */

/**
 * spark — искра: поймать щитом;
 * pulse — кольцо на сильной басовой доле: нажать в момент касания орбиты;
 * shard — осколок: щитом не задевать.
 */
export type NoteKind = 'spark' | 'pulse' | 'shard'

export interface Note {
  id: number
  time: number
  /** Угол на орбите в радианах. У кольца не используется: оно идёт по всей окружности. */
  angle: number
  kind: NoteKind
}

export type DifficultyId = 'easy' | 'normal' | 'hard'

export interface Difficulty {
  id: DifficultyId
  label: string
  /** Минимальный интервал между нотами, в секундах. */
  minGapSec: number
  /** Самая большая скорость поворота щита, которую требует уровень, рад/с. */
  maxTurnPerSec: number
  /** Каждый какой промежуток между искрами получает осколок. 0 — осколков нет. */
  shardEvery: number
  /** Можно ли проиграть, потеряв всю энергию. */
  canFail: boolean
}

export const DIFFICULTIES: Difficulty[] = [
  { id: 'easy', label: 'Лёгкая', minGapSec: 0.5, maxTurnPerSec: 2.5, shardEvery: 0, canFail: false },
  { id: 'normal', label: 'Средняя', minGapSec: 0.33, maxTurnPerSec: 3.5, shardEvery: 6, canFail: true },
  { id: 'hard', label: 'Сложная', minGapSec: 0.2, maxTurnPerSec: 4.5, shardEvery: 3, canFail: true },
]

/** Половина ширины щита в радианах. */
export const SHIELD_HALF_ANGLE = 0.4
/** На сколько осколок отстоит от следующей искры: заведомо больше ширины щита. */
const SHARD_OFFSET = 1.1
/** Ноты раньше этого времени не ставим: игроку нужно успеть приготовиться. */
const LEAD_IN_SEC = 1.5
/** Обрыв звука в конце трека детектор видит как удар, такие удары отбрасываем. */
const TAIL_SEC = 0.25
/** С какой громкости баса удар считается кольцом. */
const PULSE_BASS_LEVEL = 0.7
const MIN_PULSE_GAP_SEC = 0.45
/** Ближе этого к кольцу осколок не ставим. */
const PULSE_CLEAR_SEC = 0.16

export function findDifficulty(id: DifficultyId): Difficulty {
  for (const difficulty of DIFFICULTIES) {
    if (difficulty.id === id) return difficulty
  }
  return DIFFICULTIES[0]
}

export function generateLevel(analysis: AudioAnalysis, difficulty: Difficulty): Note[] {
  const frames = pickNoteFrames(analysis, difficulty.minGapSec)
  const random = createRandom(analysis.frameCount)

  const notes: Note[] = []
  let shieldAngle = Math.PI / 2 // в начале игры щит стоит сверху
  let direction = 1
  let lastSparkTime = LEAD_IN_SEC
  let lastPulseTime = -Infinity
  let sparksSinceShard = 0

  for (const frame of frames) {
    const time = frame / analysis.fps

    const isPulse = peakBassAfter(analysis, frame) >= PULSE_BASS_LEVEL && time - lastPulseTime >= MIN_PULSE_GAP_SEC
    if (isPulse) {
      notes.push({ id: notes.length, time, angle: 0, kind: 'pulse' })
      lastPulseTime = time
      continue
    }

    // Искра: шаг ограничен тем, куда щит успеет доехать за прошедшее время
    const gap = time - lastSparkTime
    if (random() < 0.35) direction = -direction
    const previousAngle = shieldAngle
    const maxStep = difficulty.maxTurnPerSec * gap
    shieldAngle += direction * Math.min(maxStep, Math.PI) * (0.35 + 0.65 * random())

    sparksSinceShard += 1
    const needShard = difficulty.shardEvery > 0 && sparksSinceShard >= difficulty.shardEvery
    if (needShard && gap >= 0.3) {
      // Осколок за следующей искрой на пути щита: наказывает за перелёт цели
      const beyondTarget = shieldAngle + Math.sign(shieldAngle - previousAngle || 1) * SHARD_OFFSET
      notes.push({ id: notes.length, time: lastSparkTime + gap / 2, angle: beyondTarget, kind: 'shard' })
      sparksSinceShard = 0
    }

    notes.push({ id: notes.length, time, angle: shieldAngle, kind: 'spark' })
    lastSparkTime = time
  }

  notes.sort((a, b) => a.time - b.time)
  return withoutShardsNearPulses(notes)
}

/**
 * Убирает осколки рядом с кольцами. Кольцо ждёт нажатия ещё немного после
 * касания, и осколок за ним был бы разобран с опозданием.
 */
function withoutShardsNearPulses(notes: Note[]): Note[] {
  const kept: Note[] = []
  for (const note of notes) {
    let isTooClose = false
    if (note.kind === 'shard') {
      for (const other of notes) {
        if (other.kind === 'pulse' && Math.abs(other.time - note.time) < PULSE_CLEAR_SEC) isTooClose = true
      }
    }
    if (!isTooClose) kept.push(note)
  }
  return kept
}

/**
 * Выбирает кадры с ударами. Сначала берём самые важные удары, затем остальные,
 * если рядом ещё нет ноты. Поэтому на лёгкой сложности остаются главные доли,
 * а не первые попавшиеся.
 */
export function pickNoteFrames(analysis: AudioAnalysis, minGapSec: number): number[] {
  const candidates: number[] = []
  for (let frame = 0; frame < analysis.frameCount; frame++) {
    const time = frame / analysis.fps
    const insideTrack = time >= LEAD_IN_SEC && time <= analysis.duration - TAIL_SEC
    if (analysis.onsets[frame] === 1 && insideTrack) candidates.push(frame)
  }
  candidates.sort((a, b) => beatWeight(analysis, b) - beatWeight(analysis, a))

  const picked: number[] = []
  const minGapFrames = minGapSec * analysis.fps
  for (const frame of candidates) {
    let isFree = true
    for (const other of picked) {
      if (Math.abs(other - frame) < minGapFrames) {
        isFree = false
        break
      }
    }
    if (isFree) picked.push(frame)
  }

  picked.sort((a, b) => a - b)
  return picked
}

/**
 * Важность удара для игры. Бас весит больше: широкополосный хэт детектор считает
 * сильнее бочки, но слышим и отстукиваем мы именно бочку.
 */
function beatWeight(analysis: AudioAnalysis, frame: number): number {
  return analysis.onsetStrength[frame] + 2 * peakBassAfter(analysis, frame)
}

/**
 * Самый громкий бас сразу после удара. Смотреть в сам кадр нельзя: окно FFT
 * замечает удар чуть раньше, чем успевает вырасти сглаженная огибающая.
 */
function peakBassAfter(analysis: AudioAnalysis, frame: number): number {
  const lastFrame = Math.min(frame + 5, analysis.frameCount - 1)
  let peak = 0
  for (let i = frame; i <= lastFrame; i++) peak = Math.max(peak, analysis.bass[i])
  return peak
}

/** Простой генератор псевдослучайных чисел: при одном зерне даёт одну и ту же серию. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}
