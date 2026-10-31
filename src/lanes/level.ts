import type { AudioAnalysis } from '../audio/analyzer.ts'
import { pickNoteFrames } from '../game/level.ts'

/**
 * Уровень для трёх дорожек. Дорожка выбирается по высоте звука: низкие удары
 * идут налево, высокие направо. Поэтому руки следуют за музыкой, а ноты не
 * выглядят случайными.
 */

export type NoteKind = 'tap' | 'swipe'

export interface LaneNote {
  id: number
  time: number
  lane: number
  kind: NoteKind
  /** Только у свайпа: -1 влево, 1 вправо. */
  direction: number
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
    if (isSwipe) swipeDirection = -swipeDirection
    notes.push({
      id: i,
      time: frames[i] / analysis.fps,
      lane: lanes[i],
      kind: isSwipe ? 'swipe' : 'tap',
      direction: isSwipe ? swipeDirection : 0,
    })
  }
  return notes
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
