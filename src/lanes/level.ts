import type { AudioAnalysis } from '../audio/analyzer.ts'
import { pickNoteFrames } from '../game/level.ts'
import { findMoments, type Moment } from './structure.ts'

/**
 * Уровень для трёх дорожек. Дорожка выбирается по высоте звука: низкие удары
 * идут налево, высокие направо. Поэтому руки следуют за музыкой, а ноты не
 * выглядят случайными.
 */

/**
 * tap — круг, swipe — стрелка, star — редкая золотая нота с удвоенными очками,
 * hold — нота с лучом: клавишу надо зажать и держать до конца луча,
 * accent — акцент на взрыве песни: две ноты сразу на крайних дорожках.
 */
export type NoteKind = 'tap' | 'swipe' | 'star' | 'hold' | 'accent'

export interface LaneNote {
  id: number
  time: number
  lane: number
  kind: NoteKind
  /** Только у свайпа: -1 влево, 1 вправо. */
  direction: number
  /** Только у ноты с лучом: сколько секунд держать. */
  duration?: number
}

export type DifficultyId = 'easy' | 'normal' | 'hard'

export interface Difficulty {
  id: DifficultyId
  label: string
  minGapSec: number
  /** Каждая какая нота становится свайпом. */
  swipeEvery: number
  canFail: boolean
}

export const DIFFICULTIES: Difficulty[] = [
  { id: 'easy', label: 'Лёгкая', minGapSec: 0.45, swipeEvery: 12, canFail: false },
  { id: 'normal', label: 'Средняя', minGapSec: 0.3, swipeEvery: 8, canFail: true },
  { id: 'hard', label: 'Сложная', minGapSec: 0.18, swipeEvery: 6, canFail: true },
]

/** Каждая какая нота становится звездой, если она не стрелка. */
const STAR_EVERY = 17
/** Примерно через столько обычных нот появляется нота с лучом. */
const HOLD_EVERY = 14
const HOLD_MIN_SEC = 0.9
const HOLD_MAX_SEC = 3
/** Луч заканчивается чуть раньше следующей ноты, чтобы руке хватило времени. */
const HOLD_END_GAP_SEC = 0.1
/** Последние секунды разгона, где ноты идут чаще. */
const BUILDUP_RUSH_SEC = 2.5
const BUILDUP_RUSH_GAP = 0.6
/** Узор «лесенка» на разгоне: рука бежит по дорожкам туда и обратно. */
const STAIRS = [0, 1, 2, 1]
/** Вокруг акцента оставляем воздух, чтобы он прозвучал отдельно. */
const ACCENT_CLEAR_SEC = 0.2

export function findDifficulty(id: DifficultyId): Difficulty {
  for (const difficulty of DIFFICULTIES) {
    if (difficulty.id === id) return difficulty
  }
  return DIFFICULTIES[0]
}

export function generateLaneLevel(analysis: AudioAnalysis, difficulty: Difficulty): LaneNote[] {
  const moments = findMoments(analysis)
  const frames = pickFramesWithMoments(analysis, difficulty, moments)
  const lanes = chooseLanes(analysis, frames)

  const notes: LaneNote[] = []
  let swipeDirection = 1
  let stairStep = 0
  for (let i = 0; i < frames.length; i++) {
    const time = frames[i] / analysis.fps
    const isSwipe = (i + 1) % difficulty.swipeEvery === 0
    const isStar = !isSwipe && (i + 1) % STAR_EVERY === 0
    if (isSwipe) swipeDirection = -swipeDirection

    let lane = lanes[i]
    if (isInRush(time, moments)) {
      lane = STAIRS[stairStep % STAIRS.length]
      stairStep += 1
    }

    let kind: NoteKind = 'tap'
    if (isSwipe) kind = 'swipe'
    if (isStar) kind = 'star'
    notes.push({ id: i, time, lane, kind, direction: isSwipe ? swipeDirection : 0 })
  }

  markLastNotesBeforePauses(notes, moments)
  return addAccents(addHolds(notes, difficulty, moments), moments)
}

/** Отбирает удары с учётом драматургии: чаще на разгоне, ничего в паузе и у акцента. */
function pickFramesWithMoments(analysis: AudioAnalysis, difficulty: Difficulty, moments: Moment[]): number[] {
  const picked = pickNoteFrames(analysis, difficulty.minGapSec)
  const rushCandidates = pickNoteFrames(analysis, difficulty.minGapSec * BUILDUP_RUSH_GAP)

  const frames: number[] = []
  for (const frame of picked) {
    if (isAllowed(frame / analysis.fps, moments)) frames.push(frame)
  }
  const rushGap = difficulty.minGapSec * BUILDUP_RUSH_GAP * analysis.fps
  for (const frame of rushCandidates) {
    const time = frame / analysis.fps
    if (!isInRush(time, moments) || !isAllowed(time, moments)) continue
    let isFree = true
    for (const other of frames) {
      if (Math.abs(other - frame) < rushGap) isFree = false
    }
    if (isFree) frames.push(frame)
  }
  frames.sort((a, b) => a - b)
  return frames
}

function isAllowed(time: number, moments: Moment[]): boolean {
  for (const moment of moments) {
    if (moment.kind === 'pause' && time > moment.start - 0.05 && time < moment.end + ACCENT_CLEAR_SEC) return false
    if (moment.kind === 'impact' && Math.abs(time - moment.start) < ACCENT_CLEAR_SEC) return false
  }
  return true
}

function isInRush(time: number, moments: Moment[]): boolean {
  for (const moment of moments) {
    if (moment.kind === 'buildup' && time < moment.end && time >= moment.end - BUILDUP_RUSH_SEC) return true
  }
  return false
}

/** Последняя нота перед паузой становится звездой: точка в конце музыкальной фразы. */
function markLastNotesBeforePauses(notes: LaneNote[], moments: Moment[]): void {
  for (const moment of moments) {
    if (moment.kind !== 'pause') continue
    for (let i = notes.length - 1; i >= 0; i--) {
      if (notes[i].time > moment.start) continue
      if (notes[i].kind === 'tap') notes[i].kind = 'star'
      break
    }
  }
}

/** На каждом взрыве две ноты сразу: самое заметное событие уровня. */
function addAccents(notes: LaneNote[], moments: Moment[]): LaneNote[] {
  const result = [...notes]
  for (const moment of moments) {
    if (moment.kind !== 'impact') continue
    result.push({ id: 0, time: moment.start, lane: 0, kind: 'accent', direction: 0 })
    result.push({ id: 0, time: moment.start, lane: 2, kind: 'accent', direction: 0 })
  }
  result.sort((a, b) => a.time - b.time)
  for (let i = 0; i < result.length; i++) result[i] = { ...result[i], id: i }
  return result
}

/**
 * Превращает часть кругов в ноты с лучом. Луч тянется до следующего удара,
 * поэтому конец удержания попадает в музыку. Ноты под лучом убираем: на сложной
 * сложности остаются только соседние дорожки, остальным руку нужно освободить.
 */
function addHolds(notes: LaneNote[], difficulty: Difficulty, moments: Moment[]): LaneNote[] {
  const result: LaneNote[] = []
  let tapsSinceHold = 0
  let i = 0

  while (i < notes.length) {
    const note = notes[i]
    tapsSinceHold += 1
    const canHold = tapsSinceHold >= HOLD_EVERY && note.kind === 'tap' && !isInRush(note.time, moments)
    const endIndex = canHold ? findHoldEnd(notes, i, moments) : -1

    if (endIndex === -1) {
      result.push({ ...note, id: result.length })
      i += 1
      continue
    }

    const duration = notes[endIndex].time - note.time - HOLD_END_GAP_SEC
    result.push({ ...note, id: result.length, kind: 'hold', duration })
    if (difficulty.id === 'hard') {
      for (let j = i + 1; j < endIndex; j++) {
        if (notes[j].lane !== note.lane) result.push({ ...notes[j], id: result.length })
      }
    }
    tapsSinceHold = 0
    i = endIndex
  }
  return result
}

/** Индекс ноты, на которой закончится луч, или -1, если подходящей нет. */
function findHoldEnd(notes: LaneNote[], start: number, moments: Moment[]): number {
  for (let j = start + 1; j < notes.length; j++) {
    const gap = notes[j].time - notes[start].time
    if (gap > HOLD_MAX_SEC) return -1
    if (gap >= HOLD_MIN_SEC) return crossesMoment(notes[start].time, notes[j].time, moments) ? -1 : j
  }
  return -1
}

/** Луч не должен тянуться через паузу или взрыв: он перекроет сам момент. */
function crossesMoment(from: number, to: number, moments: Moment[]): boolean {
  for (const moment of moments) {
    if (moment.kind !== 'buildup' && moment.start < to + ACCENT_CLEAR_SEC && moment.end > from) return true
  }
  return false
}

/** Для каждого удара считает «центр тяжести» спектра и делит удары на три равные группы. */
function chooseLanes(analysis: AudioAnalysis, frames: number[]): number[] {
  const brightness: number[] = []
  for (const frame of frames) brightness.push(spectrumCenter(analysis, frame))

  const sorted = [...brightness].sort((a, b) => a - b)
  const lowLimit = sorted[Math.floor(sorted.length / 3)]
  const highLimit = sorted[Math.floor((sorted.length * 2) / 3)]

  const lanes: number[] = []
  for (let i = 0; i < brightness.length; i++) {
    let lane = 1
    if (brightness[i] < lowLimit) lane = 0
    if (brightness[i] >= highLimit) lane = 2
    // Больше двух нот подряд на одной дорожке скучно: сдвигаем третью
    if (i >= 2 && lanes[i - 1] === lane && lanes[i - 2] === lane) lane = (lane + 1) % 3
    lanes.push(lane)
  }
  return lanes
}

function spectrumCenter(analysis: AudioAnalysis, frame: number): number {
  // Смотрим чуть позже удара: окно FFT замечает его заранее
  const row = Math.min(frame + 3, analysis.frameCount - 1) * analysis.spectrumBins
  let weightedSum = 0
  let sum = 0
  for (let bin = 0; bin < analysis.spectrumBins; bin++) {
    const value = analysis.spectrum[row + bin]
    weightedSum += bin * value
    sum += value
  }
  return sum === 0 ? 0 : weightedSum / sum
}
