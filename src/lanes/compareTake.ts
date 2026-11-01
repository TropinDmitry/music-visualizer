import type { AudioAnalysis } from '../audio/analyzer.ts'
import type { LaneNote } from './level.ts'

/**
 * Сравнение живой записи с уровнем. Человек нажимает под музыку как хочется, а здесь
 * считаем, насколько это совпало с генератором и что именно он отбивал: удары,
 * мелодию или ни то ни другое.
 */

export interface Press {
  time: number
  /** a, s, d, left, right или space. */
  key: string
  /** Сколько клавишу держали, в секундах. */
  duration: number
}

export interface TakeReport {
  presses: number
  notes: number
  /** На сколько человек в среднем нажимает позже звука. Это вычитается из всего сравнения. */
  lagSec: number
  /** Какая доля нажатий попала в ноту. */
  pressesOnNotes: number
  /** Какая доля нот попала в нажатие. */
  notesWithPresses: number
  /** Какая доля нажатий пришлась на удар детектора, ноту мелодии, слог. */
  pressesOnOnsets: number
  pressesOnMelody: number
  pressesOnSyllables: number
  /** Нажатий, долгих как луч, и лучей в уровне. */
  longPresses: number
  holds: number
  /** Нажатий и нот за каждые 10 секунд записанного отрезка. */
  blocks: { start: number; presses: number; notes: number }[]
}

/** Нажатие и нота считаются одним событием, если разошлись не больше этого. */
const MATCH_SEC = 0.1
/** Дальше этого звук точно не тот, на который нажимали: для оценки опоздания не годится. */
const LAG_REACH_SEC = 0.2
const BLOCK_SEC = 10
const LONG_PRESS_SEC = 0.4

export function compareTake(presses: Press[], notes: LaneNote[], analysis: AudioAnalysis): TakeReport {
  const sorted = [...presses].sort((a, b) => a.time - b.time)
  if (sorted.length === 0) return emptyReport(notes)

  const from = sorted[0].time - 1
  const to = sorted[sorted.length - 1].time + 1
  const inTake = notes.filter((note) => note.time >= from && note.time <= to)
  const noteTimes = uniqueTimes(inTake)

  const syllables: number[] = []
  for (let frame = 0; frame < analysis.frameCount; frame++) {
    if (analysis.vocalOnsets[frame] === 1) syllables.push(frame / analysis.fps)
  }

  const lagSec = estimateLag(sorted, analysis.onsetTimes)
  const times = sorted.map((press) => press.time - lagSec)
  const shareNear = (targets: number[]) => times.filter((time) => isNear(time, targets)).length / times.length

  return {
    presses: sorted.length,
    notes: noteTimes.length,
    lagSec,
    pressesOnNotes: shareNear(noteTimes),
    notesWithPresses: noteTimes.filter((time) => isNear(time, times)).length / Math.max(1, noteTimes.length),
    pressesOnOnsets: shareNear(analysis.onsetTimes),
    pressesOnMelody: shareNear(analysis.melody.noteTimes),
    pressesOnSyllables: shareNear(syllables),
    longPresses: sorted.filter((press) => press.duration >= LONG_PRESS_SEC).length,
    holds: uniqueTimes(inTake.filter((note) => note.kind === 'hold')).length,
    blocks: countBlocks(times, noteTimes, from, to),
  }
}

/** Опоздание берём по медиане: случайные нажатия мимо звука её почти не сдвигают. */
function estimateLag(presses: Press[], onsets: number[]): number {
  const delays: number[] = []
  for (const press of presses) {
    let nearest = Infinity
    for (const onset of onsets) {
      if (Math.abs(press.time - onset) < Math.abs(nearest)) nearest = press.time - onset
    }
    if (Math.abs(nearest) <= LAG_REACH_SEC) delays.push(nearest)
  }
  if (delays.length === 0) return 0
  delays.sort((a, b) => a - b)
  return delays[Math.floor(delays.length / 2)]
}

function countBlocks(presses: number[], notes: number[], from: number, to: number): TakeReport['blocks'] {
  const blocks: TakeReport['blocks'] = []
  for (let start = Math.floor(from / BLOCK_SEC) * BLOCK_SEC; start < to; start += BLOCK_SEC) {
    const isInBlock = (time: number) => time >= start && time < start + BLOCK_SEC
    blocks.push({ start, presses: presses.filter(isInBlock).length, notes: notes.filter(isInBlock).length })
  }
  return blocks
}

function uniqueTimes(notes: LaneNote[]): number[] {
  return [...new Set(notes.map((note) => note.time))]
}

function isNear(time: number, targets: number[]): boolean {
  for (const target of targets) {
    if (Math.abs(target - time) <= MATCH_SEC) return true
  }
  return false
}

function emptyReport(notes: LaneNote[]): TakeReport {
  return {
    presses: 0,
    notes: notes.length,
    lagSec: 0,
    pressesOnNotes: 0,
    notesWithPresses: 0,
    pressesOnOnsets: 0,
    pressesOnMelody: 0,
    pressesOnSyllables: 0,
    longPresses: 0,
    holds: 0,
    blocks: [],
  }
}
