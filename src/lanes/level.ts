import type { AudioAnalysis } from '../audio/analyzer.ts'
import { beatWeight, pickNoteFrames } from '../game/level.ts'
import {
  findBeatGrid,
  findMoments,
  findSections,
  findSustains,
  hasRhythm,
  snapToGrid,
  songIntensity,
  type BeatGrid,
  type Moment,
  type Section,
} from './structure.ts'

/**
 * Уровень для трёх дорожек. Дорожка выбирается по высоте звука: низкие удары
 * идут налево, высокие направо. Поэтому руки следуют за музыкой, а ноты не
 * выглядят случайными.
 */

/**
 * tap — круг, swipe — стрелка, star — редкая золотая нота с удвоенными очками,
 * hold — нота с лучом: клавишу надо зажать и держать до конца луча,
 * accent — парная нота: две ноты сразу на разных дорожках,
 * space — длинная нота на все дорожки: нажать пробел.
 */
export type NoteKind = 'tap' | 'swipe' | 'star' | 'hold' | 'accent' | 'space'

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

/**
 * На что ориентируются ноты. Универсального ответа нет: песне с текстом подходит
 * голос, инструменталу ритм, поэтому выбор остаётся за игроком.
 */
export type NoteFocus = 'auto' | 'voice' | 'beat'

export const NOTE_FOCUSES: { id: NoteFocus; label: string }[] = [
  { id: 'auto', label: 'Авто' },
  { id: 'voice', label: 'По голосу' },
  { id: 'beat', label: 'По ритму' },
]

export interface Difficulty {
  id: DifficultyId
  label: string
  minGapSec: number
  /** Примерно раз в столько секунд появляется стрелка. */
  arrowPeriodSec: number
  /** В сильных частях песни каждая какая нота становится парной. 0 — парных нет. */
  pairEvery: number
  /** Самое короткое расстояние между нотами, которое вообще можно сыграть. */
  floorGapSec: number
  /** Сколько нот максимум за любую секунду. */
  maxPerSecond: number
  /** Сколько стрелок в серии перед сменой части. */
  arrowRun: number
  /** На протяжных звуках два луча сразу. */
  doubleHolds: boolean
  canFail: boolean
}

export const DIFFICULTIES: Difficulty[] = [
  { id: 'easy', label: 'Лёгкая', minGapSec: 0.45, arrowPeriodSec: 28, pairEvery: 0, floorGapSec: 0.4, maxPerSecond: 2, arrowRun: 2, doubleHolds: false, canFail: false },
  { id: 'normal', label: 'Средняя', minGapSec: 0.3, arrowPeriodSec: 20, pairEvery: 16, floorGapSec: 0.28, maxPerSecond: 3, arrowRun: 3, doubleHolds: false, canFail: true },
  { id: 'hard', label: 'Сложная', minGapSec: 0.18, arrowPeriodSec: 14, pairEvery: 11, floorGapSec: 0.2, maxPerSecond: 4, arrowRun: 4, doubleHolds: true, canFail: true },
]

/** Каждая какая нота становится звездой, если она не стрелка. */
const STAR_EVERY = 17
/** Короткий луч ставим, только если после ноты правда свободно столько секунд. */
const HOLD_MIN_SEC = 0.9
const HOLD_MAX_SEC = 2
/** Луч заканчивается чуть раньше следующей ноты, чтобы руке хватило времени. */
const HOLD_END_GAP_SEC = 0.25
/** Последние секунды разгона, где ноты идут чаще. */
const BUILDUP_RUSH_SEC = 2.5
const BUILDUP_RUSH_GAP = 0.6
/** Узор «лесенка» на разгоне: рука бежит по дорожкам туда и обратно. */
const STAIRS = [0, 1, 2, 1]
/** Вокруг акцента оставляем воздух, чтобы он прозвучал отдельно. */
const ACCENT_CLEAR_SEC = 0.2
/** Интервал между нотами умножается на это число в тихих и в сильных частях. */
const CALM_GAP_FACTOR = 1.9
const INTENSE_GAP_FACTOR = 0.7
/** Выше этой силы песни редкие места заполняются дополнительными нотами. */
const INTENSE_LEVEL = 0.55
/** Запас веса голоса над любым ударом: вес удара не бывает больше трёх. */
const VOCAL_PRIORITY = 3
/** В режиме «Авто» слог важнее обычного удара, но не отменяет ритм. */
const VOCAL_AUTO_BONUS = 1.2
/** Вне сетки ритма нота теряет столько важности. */
const OFF_GRID_PENALTY = 0.45
/** Удар считается попавшим в сетку, если отстоит от неё не больше этого. */
const GRID_TOLERANCE_FRAMES = 5
const LEAD_IN_SEC = 1.5
const TAIL_FRAMES = 15
/** Вокруг стрелки игра сама освобождает место: руке нужно время перейти на другие клавиши. */
const ARROW_CLEAR_SEC = 0.45
/** Выделяющийся удар важнее обычного, даже если стоит чуть вне сетки. */
const PROMINENT_BONUS = 1.2
const PROMINENCE_WINDOW_SEC = 1.5
/** Парные ноты на смене ритма не чаще этого: иначе акценты теряют вес. */
const MIN_ACCENT_GAP_SEC = 12
/** Смену части ищем рядом с найденным событием, чтобы попасть в реальный удар. */
const SECTION_SNAP_SEC = 1.5
const LONG_PAUSE_SEC = 0.55
/** Шаг внутри серии стрелок и на сколько серия заканчивается до смены части. */
const ARROW_RUN_GAP_SEC = 0.32
const ARROW_RUN_SPAN_SEC = 2.4
const ARROW_RUN_END_SEC = 0.25
const ARROW_RUN_AVOID_SEC = 5
/** Длинный звук играется одним лучом, но не бесконечным: рука должна отдыхать. */
const SUSTAIN_HOLD_MAX_SEC = 6
const SUSTAIN_HOLD_GAP_SEC = 0.35
/** Пробел рядом с началом протяжного звука мешает: на этом месте главный луч. */
const SPACE_SUSTAIN_CLEAR_SEC = 1.5
/** Пара дорожек для протяжного звука: всегда одна и та же, крайние. */
const SUSTAIN_LANES = [0, 2]
/** Пробел событие редкое: два рядом обесценивают друг друга. */
const MIN_SPACE_GAP_SEC = 8

export function findDifficulty(id: DifficultyId): Difficulty {
  for (const difficulty of DIFFICULTIES) {
    if (difficulty.id === id) return difficulty
  }
  return DIFFICULTIES[0]
}

export function generateLaneLevel(
  analysis: AudioAnalysis,
  difficulty: Difficulty,
  focus: NoteFocus = 'auto',
): LaneNote[] {
  const moments = findMoments(analysis)
  const intensity = songIntensity(analysis)
  const frames = pickFramesWithMoments(analysis, difficulty, moments, intensity, focus)
  const lanes = chooseLanes(analysis, frames)

  const notes: LaneNote[] = []
  let stairStep = 0
  for (let i = 0; i < frames.length; i++) {
    const time = frames[i] / analysis.fps
    let lane = lanes[i]
    if (isInRush(time, moments)) {
      lane = STAIRS[stairStep % STAIRS.length]
      stairStep += 1
    }
    const kind: NoteKind = (i + 1) % STAR_EVERY === 0 ? 'star' : 'tap'
    notes.push({ id: i, time, lane, kind, direction: 0 })
  }

  markLastNotesBeforePauses(notes, moments)
  const sections = findSections(analysis, intensity)
  const withRuns = placeArrowRuns(notes, difficulty, sections)
  const withArrows = placeArrows(withRuns, difficulty, sections)
  const withPairs = addPairs(withArrows, difficulty, analysis, intensity)
  const withHolds = addHolds(withPairs)
  const sustains = findSustains(analysis)
  const withSustains = addSustainHolds(withHolds, difficulty, sustains)
  return limitDensity(addAccents(withSustains, moments, sections, sustains), difficulty)
}

/**
 * Серия стрелок перед сменой части: короткая россыпь чётких ударов подводит к
 * кульминации или затиханию. Рука уже на стрелках, поэтому шаг может быть короче,
 * чем между одиночной стрелкой и обычными нотами.
 */
function placeArrowRuns(notes: LaneNote[], difficulty: Difficulty, sections: Section[]): LaneNote[] {
  const removed = new Set<LaneNote>()
  let direction = 1
  for (let i = 1; i < sections.length; i++) {
    const end = sections[i].start - ARROW_RUN_END_SEC
    const start = end - ARROW_RUN_SPAN_SEC
    const window = notes.filter((note) => note.time >= start && note.time <= end && !removed.has(note))

    // Идём от конца: последние удары перед сменой самые важные
    const run: LaneNote[] = []
    for (let j = window.length - 1; j >= 0 && run.length < difficulty.arrowRun; j--) {
      const note = window[j]
      const fitsGap = run.length === 0 || run[run.length - 1].time - note.time >= ARROW_RUN_GAP_SEC
      if (note.kind === 'tap' && fitsGap) run.push(note)
    }
    if (run.length < 2) continue

    run.reverse()
    for (const note of run) {
      note.kind = 'swipe'
      note.direction = direction
      direction = -direction
    }
    const first = run[0].time - ARROW_CLEAR_SEC
    const last = run[run.length - 1].time + ARROW_CLEAR_SEC
    for (const note of notes) {
      if (note.time >= first && note.time <= last && !run.includes(note)) removed.add(note)
    }
  }
  return notes.filter((note) => !removed.has(note))
}

/**
 * Протяжный звук играется одним лучом от начала звука, на сложной сложности
 * двумя на крайних дорожках. Отдельные ноты внутри убираем: рука занята лучом.
 */
function addSustainHolds(notes: LaneNote[], difficulty: Difficulty, sustains: Moment[]): LaneNote[] {
  let result = notes
  const holds: LaneNote[] = []
  for (const sustain of sustains) {
    const start = sustain.start - ACCENT_CLEAR_SEC
    result = result.filter((note) => note.time < start || note.time > sustain.end + ACCENT_CLEAR_SEC)

    let time = sustain.start
    while (sustain.end - time >= HOLD_MIN_SEC) {
      const duration = Math.min(SUSTAIN_HOLD_MAX_SEC, sustain.end - time)
      const lanes = difficulty.doubleHolds ? SUSTAIN_LANES : [1]
      for (const lane of lanes) holds.push({ id: 0, time, lane, kind: 'hold', direction: 0, duration })
      time += duration + SUSTAIN_HOLD_GAP_SEC
    }
  }
  const merged = [...result, ...holds]
  merged.sort((a, b) => a.time - b.time)
  return merged
}

/**
 * Предел плотности: уровень не должен требовать невозможного. Работает последним,
 * когда расставлены все ноты. Пробел, стрелки и лучи главнее обычных нот: если
 * такая нота стоит вплотную к обычной, уходит обычная. Парная нота считается как
 * одно нажатие.
 */
function limitDensity(notes: LaneNote[], difficulty: Difficulty): LaneNote[] {
  const isProtected = (note: LaneNote) => note.kind === 'space' || note.kind === 'swipe' || note.kind === 'hold'
  const kept: LaneNote[] = []

  for (const note of notes) {
    const previous = kept[kept.length - 1]
    const isSameMoment = previous !== undefined && previous.time === note.time
    if (isSameMoment) {
      kept.push(note)
      continue
    }

    if (isProtected(note)) {
      // Луч вплотную к другой главной ноте не сыграть: он уступает
      const isCrowded = previous !== undefined && note.time - previous.time < difficulty.floorGapSec
      if (note.kind === 'hold' && isCrowded && isProtected(previous)) continue

      // Убираем слишком близкие обычные ноты перед главной, вместе с парой
      while (kept.length > 0) {
        const last = kept[kept.length - 1]
        if (isProtected(last) || note.time - last.time >= difficulty.floorGapSec) break
        kept.pop()
      }
      kept.push(note)
      continue
    }

    const tooClose = previous !== undefined && note.time - previous.time < difficulty.floorGapSec
    if (tooClose || pressesInLastSecond(kept, note.time) >= difficulty.maxPerSecond) continue
    kept.push(note)
  }

  for (let i = 0; i < kept.length; i++) kept[i] = { ...kept[i], id: i }
  return kept
}

/** Сколько отдельных нажатий было за секунду до этого момента. */
function pressesInLastSecond(kept: LaneNote[], time: number): number {
  let presses = 0
  for (let i = kept.length - 1; i >= 0 && time - kept[i].time < 1; i--) {
    if (i === 0 || kept[i].time !== kept[i - 1].time) presses += 1
  }
  return presses
}

/**
 * Одиночная стрелка — редкое событие внутри части: соседние ноты убираются,
 * чтобы успеть перенести руку.
 */
function placeArrows(notes: LaneNote[], difficulty: Difficulty, sections: Section[]): LaneNote[] {
  const targets: number[] = []
  const lastTime = notes.length > 0 ? notes[notes.length - 1].time : 0
  for (let time = difficulty.arrowPeriodSec; time < lastTime; time += difficulty.arrowPeriodSec) {
    // Рядом с серией перед сменой части одиночная стрелка не нужна
    let isFree = true
    for (let i = 1; i < sections.length; i++) {
      if (Math.abs(sections[i].start - time) < ARROW_RUN_AVOID_SEC) isFree = false
    }
    if (isFree) targets.push(time)
  }

  const removed = new Set<LaneNote>()
  let direction = 1
  for (const target of targets) {
    let nearest: LaneNote | null = null
    for (const note of notes) {
      if (note.kind !== 'tap' || removed.has(note)) continue
      if (nearest === null || Math.abs(note.time - target) < Math.abs(nearest.time - target)) nearest = note
    }
    if (!nearest || Math.abs(nearest.time - target) > difficulty.arrowPeriodSec / 2) continue

    nearest.kind = 'swipe'
    nearest.direction = direction
    direction = -direction
    for (const note of notes) {
      if (note !== nearest && Math.abs(note.time - nearest.time) < ARROW_CLEAR_SEC) removed.add(note)
    }
  }
  return notes.filter((note) => !removed.has(note))
}

/** Минимальный интервал между нотами в этом месте песни: в сильных частях короче. */
function localGap(frame: number, minGapSec: number, intensity: Float32Array): number {
  const factor = CALM_GAP_FACTOR + (INTENSE_GAP_FACTOR - CALM_GAP_FACTOR) * intensity[frame]
  return minGapSec * factor
}

/**
 * Важность кандидата на ноту. В режиме «По голосу» слог важнее всего. В остальных
 * главное ритм: нота вне сетки ощущается как рассинхрон, поэтому такие кандидаты
 * слабее, а слог лишь усиливает ноту, если она и так в такт.
 */
function noteWeight(analysis: AudioAnalysis, frame: number, focus: NoteFocus, grid: BeatGrid): number {
  const isVocal = analysis.vocalOnsets[frame] === 1
  if (focus === 'voice' && isVocal) return VOCAL_PRIORITY + analysis.vocalStrength[frame]

  const onGrid = !hasRhythm(grid, frame) || Math.abs(snapToGrid(grid, frame) - frame) <= GRID_TOLERANCE_FRAMES
  let weight = beatWeight(analysis, frame) + prominence(analysis, frame) * PROMINENT_BONUS
  if (focus === 'auto' && isVocal && onGrid) weight += VOCAL_AUTO_BONUS
  return onGrid ? weight : weight * OFF_GRID_PENALTY
}

/** Насколько удар выделяется на фоне соседних: 0 — как все, 1 — заметно сильнее. */
function prominence(analysis: AudioAnalysis, frame: number): number {
  const reach = Math.round(PROMINENCE_WINDOW_SEC * analysis.fps)
  const from = Math.max(0, frame - reach)
  const to = Math.min(analysis.frameCount, frame + reach)
  let sum = 0
  for (let i = from; i < to; i++) sum += analysis.onsetStrength[i]
  const mean = sum / Math.max(1, to - from)
  return Math.min(1, Math.max(0, analysis.onsetStrength[frame] / Math.max(mean, 0.01) / 4 - 0.25))
}

/** Все кандидаты на ноты: удары и начала слогов. */
function noteCandidates(analysis: AudioAnalysis, difficulty: Difficulty): number[] {
  const candidates = pickNoteFrames(analysis, difficulty.minGapSec * INTENSE_GAP_FACTOR * 0.8)
  const lastFrame = analysis.frameCount - TAIL_FRAMES
  for (let frame = Math.round(LEAD_IN_SEC * analysis.fps); frame < lastFrame; frame++) {
    if (analysis.vocalOnsets[frame] === 1) candidates.push(frame)
  }
  return candidates
}

/** Отбирает ноты: сначала важные, а частоту задаёт сила части песни. */
function pickByIntensity(
  analysis: AudioAnalysis,
  difficulty: Difficulty,
  intensity: Float32Array,
  focus: NoteFocus,
): number[] {
  const grid = findBeatGrid(analysis)
  const candidates = noteCandidates(analysis, difficulty)
  const weights = new Map<number, number>()
  for (const frame of candidates) weights.set(frame, noteWeight(analysis, frame, focus, grid))
  candidates.sort((a, b) => (weights.get(b) ?? 0) - (weights.get(a) ?? 0))

  const picked: number[] = []
  for (const frame of candidates) {
    const gapFrames = localGap(frame, difficulty.minGapSec, intensity) * analysis.fps
    let isFree = true
    for (const other of picked) {
      if (Math.abs(other - frame) < gapFrames) isFree = false
    }
    if (isFree) picked.push(frame)
  }
  picked.sort((a, b) => a - b)
  const aligned = focus === 'voice' ? picked : alignToGrid(picked, grid)
  return fillIntenseGaps(aligned, analysis, difficulty, intensity)
}

/** Подтягивает ноты, стоящие рядом с сеткой, точно на неё: так ритм ровнее на ощупь. */
function alignToGrid(frames: number[], grid: BeatGrid): number[] {
  const aligned: number[] = []
  for (const frame of frames) {
    const snapped = snapToGrid(grid, frame)
    const target = Math.abs(snapped - frame) <= GRID_TOLERANCE_FRAMES ? snapped : frame
    if (aligned[aligned.length - 1] !== target) aligned.push(target)
  }
  return aligned
}

/**
 * В припеве удары сливаются, и нот выходит мало. Если между нотами слишком
 * длинный промежуток, ставим ноту посередине: так ритм дробится вдвое и остаётся
 * в такт, потому что соседние ноты уже стоят на ударах.
 */
function fillIntenseGaps(
  frames: number[],
  analysis: AudioAnalysis,
  difficulty: Difficulty,
  intensity: Float32Array,
): number[] {
  const result = [...frames]
  for (let i = 0; i + 1 < frames.length; i++) {
    const middle = Math.round((frames[i] + frames[i + 1]) / 2)
    const wanted = localGap(middle, difficulty.minGapSec, intensity) * analysis.fps
    const isLongGap = frames[i + 1] - frames[i] >= wanted * 2
    if (intensity[middle] >= INTENSE_LEVEL && isLongGap) result.push(middle)
  }
  result.sort((a, b) => a - b)
  return result
}

/** В сильных частях часть обычных нот становится парной: припев и на ощупь мощнее. */
function addPairs(
  notes: LaneNote[],
  difficulty: Difficulty,
  analysis: AudioAnalysis,
  intensity: Float32Array,
): LaneNote[] {
  if (difficulty.pairEvery === 0) return notes
  const result: LaneNote[] = []
  let notesSincePair = 0
  for (const note of notes) {
    const frame = Math.min(Math.round(note.time * analysis.fps), intensity.length - 1)
    if (intensity[frame] >= INTENSE_LEVEL) notesSincePair += 1
    if (note.kind === 'tap' && notesSincePair >= difficulty.pairEvery) {
      notesSincePair = 0
      result.push({ ...note, kind: 'accent' })
      result.push({ ...note, kind: 'accent', lane: (note.lane + 1 + (result.length % 2)) % 3 })
    } else {
      result.push(note)
    }
  }
  return result
}

/** Отбирает удары с учётом драматургии: чаще на разгоне, ничего в паузе и у акцента. */
function pickFramesWithMoments(
  analysis: AudioAnalysis,
  difficulty: Difficulty,
  moments: Moment[],
  intensity: Float32Array,
  focus: NoteFocus,
): number[] {
  const picked = pickByIntensity(analysis, difficulty, intensity, focus)
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

/** Ноты убираем только из длинных пауз: короткое затишье между ударами это сам ритм. */
function isAllowed(time: number, moments: Moment[]): boolean {
  for (const moment of moments) {
    const isLongPause = moment.kind === 'pause' && moment.end - moment.start >= LONG_PAUSE_SEC
    if (isLongPause && time > moment.start - 0.05 && time < moment.end + ACCENT_CLEAR_SEC) return false
  }
  return true
}

function isInRush(time: number, moments: Moment[]): boolean {
  for (const moment of moments) {
    if (moment.kind === 'buildup' && time < moment.end && time >= moment.end - BUILDUP_RUSH_SEC) return true
  }
  return false
}

/** Последняя нота перед длинной паузой становится звездой: точка в конце фразы. */
function markLastNotesBeforePauses(notes: LaneNote[], moments: Moment[]): void {
  for (const moment of moments) {
    if (moment.kind !== 'pause' || moment.end - moment.start < LONG_PAUSE_SEC) continue
    for (let i = notes.length - 1; i >= 0; i--) {
      if (notes[i].time > moment.start) continue
      if (notes[i].kind === 'tap') notes[i].kind = 'star'
      break
    }
  }
}

/**
 * Границы настоящих частей песни получают длинную ноту SPACE. Остальные резкие
 * переходы получают парную ноту, но редко: выпадения баса внутри бита повторяются
 * каждые несколько секунд, и если отмечать все, акценты перестанут быть событием.
 */
function addAccents(
  notes: LaneNote[],
  moments: Moment[],
  sections: Section[],
  sustains: Moment[],
): LaneNote[] {
  const impacts = moments.filter((moment) => moment.kind === 'impact')
  // Сначала длинные паузы: возвращение музыки слышно точнее, чем граница части
  const candidates: number[] = []
  for (const moment of moments) {
    if (moment.kind === 'pause' && moment.end - moment.start >= LONG_PAUSE_SEC) {
      candidates.push(nearestImpact(moment.end, impacts))
    }
  }
  for (let i = 1; i < sections.length; i++) candidates.push(nearestImpact(sections[i].start, impacts))

  const spaceTimes: number[] = []
  for (const time of candidates) {
    const isTaken = spaceTimes.some((other) => Math.abs(other - time) < MIN_SPACE_GAP_SEC)
    if (!isTaken && !isNearSustain(time, sustains)) spaceTimes.push(time)
  }

  const result = [...notes]
  for (const time of spaceTimes) result.push({ id: 0, time, lane: 1, kind: 'space', direction: 0 })

  let lastAccent = -Infinity
  for (const impact of impacts) {
    const isNearSpace = spaceTimes.some((time) => Math.abs(time - impact.start) < MIN_ACCENT_GAP_SEC)
    if (isNearSpace || impact.start - lastAccent < MIN_ACCENT_GAP_SEC) continue
    if (isNearSustain(impact.start, sustains)) continue
    lastAccent = impact.start
    result.push({ id: 0, time: impact.start, lane: 0, kind: 'accent', direction: 0 })
    result.push({ id: 0, time: impact.start, lane: 2, kind: 'accent', direction: 0 })
  }

  result.sort((a, b) => a.time - b.time)
  // Обычные ноты вплотную к SPACE убираем: длинная нота должна звучать одна
  const cleared = result.filter((note) => {
    if (note.kind === 'space') return true
    return !spaceTimes.some((time) => Math.abs(time - note.time) < ACCENT_CLEAR_SEC)
  })
  for (let i = 0; i < cleared.length; i++) cleared[i] = { ...cleared[i], id: i }
  return cleared
}

/** Время внутри протяжного участка или рядом с его началом. */
function isNearSustain(time: number, sustains: Moment[]): boolean {
  for (const sustain of sustains) {
    if (time >= sustain.start - SPACE_SUSTAIN_CLEAR_SEC && time <= sustain.end) return true
  }
  return false
}

function nearestImpact(time: number, impacts: Moment[]): number {
  let best = time
  let bestError = SECTION_SNAP_SEC
  for (const impact of impacts) {
    const error = Math.abs(impact.start - time)
    if (error < bestError) {
      bestError = error
      best = impact.start
    }
  }
  return best
}

/**
 * Короткий луч ставится только там, где после ноты и правда тихо: нота как бы
 * звучит дальше. Никаких лучей по счётчику: такие не связаны со звуком.
 */
function addHolds(notes: LaneNote[]): LaneNote[] {
  const result: LaneNote[] = []
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i]
    const next = notes[i + 1]
    const gap = next ? next.time - note.time : 0
    if (note.kind === 'tap' && gap >= HOLD_MIN_SEC + HOLD_END_GAP_SEC) {
      result.push({ ...note, kind: 'hold', duration: Math.min(HOLD_MAX_SEC, gap - HOLD_END_GAP_SEC) })
    } else {
      result.push(note)
    }
  }
  return result
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
