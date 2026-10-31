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

/** Отрезок припева без нот: игрок трясёт мышью или часто жмёт пробел. */
export interface ShakeZone {
  id: number
  start: number
  end: number
  target: number
}

export interface LaneLevel {
  notes: LaneNote[]
  shakeZones: ShakeZone[]
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

const SHAKE_LENGTH_SEC = 3
const SHAKE_TARGET = 12
/** Один отрезок встряски примерно на столько секунд трека. */
const SECONDS_PER_SHAKE = 45
const MIN_DURATION_FOR_SHAKE = 30
const SHAKE_EDGE_SEC = 5

export function findDifficulty(id: DifficultyId): Difficulty {
  for (const difficulty of DIFFICULTIES) {
    if (difficulty.id === id) return difficulty
  }
  return DIFFICULTIES[0]
}

export function generateLaneLevel(analysis: AudioAnalysis, difficulty: Difficulty): LaneLevel {
  const shakeZones = findShakeZones(analysis)
  const frames = pickFramesOutsideZones(analysis, difficulty, shakeZones)
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

  return { notes, shakeZones }
}

function pickFramesOutsideZones(analysis: AudioAnalysis, difficulty: Difficulty, zones: ShakeZone[]): number[] {
  const frames: number[] = []
  for (const frame of pickNoteFrames(analysis, difficulty.minGapSec)) {
    const time = frame / analysis.fps
    let insideZone = false
    for (const zone of zones) {
      if (time >= zone.start - 0.2 && time <= zone.end + 0.2) insideZone = true
    }
    if (!insideZone) frames.push(frame)
  }
  return frames
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

/** В каждом большом куске трека ищет самые громкие три секунды: обычно это припев. */
function findShakeZones(analysis: AudioAnalysis): ShakeZone[] {
  if (analysis.duration < MIN_DURATION_FOR_SHAKE) return []

  const zones: ShakeZone[] = []
  const windowFrames = Math.round(SHAKE_LENGTH_SEC * analysis.fps)
  const prefix = new Float64Array(analysis.frameCount + 1)
  for (let i = 0; i < analysis.frameCount; i++) prefix[i + 1] = prefix[i] + analysis.rms[i]

  const usable = analysis.duration - SHAKE_EDGE_SEC * 2
  const count = Math.max(1, Math.floor(usable / SECONDS_PER_SHAKE))
  for (let part = 0; part < count; part++) {
    const from = Math.round((SHAKE_EDGE_SEC + (usable * part) / count) * analysis.fps)
    const to = Math.round((SHAKE_EDGE_SEC + (usable * (part + 1)) / count) * analysis.fps) - windowFrames

    let bestStart = from
    let bestLoudness = -1
    for (let start = from; start <= to; start++) {
      const loudness = prefix[start + windowFrames] - prefix[start]
      if (loudness > bestLoudness) {
        bestLoudness = loudness
        bestStart = start
      }
    }
    const start = bestStart / analysis.fps
    zones.push({ id: part, start, end: start + SHAKE_LENGTH_SEC, target: SHAKE_TARGET })
  }
  return zones
}
