import type { AudioAnalysis } from '../audio/analyzer.ts'
import { pickNoteFrames } from '../game/level.ts'

/**
 * Уровень для трёх дорожек. Дорожка выбирается по высоте звука: низкие удары
 * идут налево, высокие направо. Поэтому руки следуют за музыкой, а ноты не
 * выглядят случайными.
 */

/**
 * tap — круг, swipe — стрелка, star — редкая золотая нота с удвоенными очками,
 * hold — нота с лучом: клавишу надо зажать и держать до конца луча.
 */
export type NoteKind = 'tap' | 'swipe' | 'star' | 'hold'

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

export function findDifficulty(id: DifficultyId): Difficulty {
  for (const difficulty of DIFFICULTIES) {
    if (difficulty.id === id) return difficulty
  }
  return DIFFICULTIES[0]
}

export function generateLaneLevel(analysis: AudioAnalysis, difficulty: Difficulty): LaneNote[] {
  const frames = pickNoteFrames(analysis, difficulty.minGapSec)
  const lanes = chooseLanes(analysis, frames)

  const notes: LaneNote[] = []
  let swipeDirection = 1
  for (let i = 0; i < frames.length; i++) {
    const isSwipe = (i + 1) % difficulty.swipeEvery === 0
    const isStar = !isSwipe && (i + 1) % STAR_EVERY === 0
    if (isSwipe) swipeDirection = -swipeDirection

    let kind: NoteKind = 'tap'
    if (isSwipe) kind = 'swipe'
    if (isStar) kind = 'star'
    notes.push({
      id: i,
      time: frames[i] / analysis.fps,
      lane: lanes[i],
      kind,
      direction: isSwipe ? swipeDirection : 0,
    })
  }
  return addHolds(notes, difficulty)
}

/**
 * Превращает часть кругов в ноты с лучом. Луч тянется до следующего удара,
 * поэтому конец удержания попадает в музыку. Ноты под лучом убираем: на сложной
 * сложности остаются только соседние дорожки, остальным руку нужно освободить.
 */
function addHolds(notes: LaneNote[], difficulty: Difficulty): LaneNote[] {
  const result: LaneNote[] = []
  let tapsSinceHold = 0
  let i = 0

  while (i < notes.length) {
    const note = notes[i]
    tapsSinceHold += 1
    const endIndex = tapsSinceHold >= HOLD_EVERY && note.kind === 'tap' ? findHoldEnd(notes, i) : -1

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
function findHoldEnd(notes: LaneNote[], start: number): number {
  for (let j = start + 1; j < notes.length; j++) {
    const gap = notes[j].time - notes[start].time
    if (gap > HOLD_MAX_SEC) return -1
    if (gap >= HOLD_MIN_SEC) return j
  }
  return -1
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
