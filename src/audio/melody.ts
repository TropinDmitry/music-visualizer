import { FFT, hannWindow } from './fft.ts'

/**
 * Слежение за мелодией. Детектор ударов видит только прирост громкости, поэтому
 * смена ноты в плавном синтезаторе для него не событие. Здесь смотрим на саму
 * высоту: для каждого полутона считаем, сколько энергии лежит на нём и на его
 * гармониках, и берём самый весомый. Это не расшифровка партии: в плотной музыке
 * ведущий звук может оказаться и не тем, что слышит человек.
 */

export interface MelodyTrack {
  /** Высота по кадрам анализа: номер ноты MIDI или 0, если ведущего звука нет. */
  pitch: Float32Array
  /** Начала нот в секундах. */
  noteTimes: number[]
  /** Высота каждой ноты. */
  notePitches: number[]
  /** Насколько ясно нота звучит: во сколько раз ведущий полутон сильнее среднего. */
  noteStrengths: number[]
}

/** 4096 при 44,1 кГц это 93 мс и 11 Гц на бин: хватает различить соседние полутоны от 200 Гц. */
const MELODY_FFT_SIZE = 4096
const STEP_FRAMES = 2
/** Диапазон ведущей партии: от соль малой октавы до до четвёртой. */
const LOWEST_NOTE = 55
const HIGHEST_NOTE = 96
const HARMONICS = 4
const HARMONIC_WEIGHT = 0.7
/** Ниже этого перевеса ведущего звука нет, а есть шум или плотная смесь. */
const MIN_CLARITY = 1.8
/** Сглаживаем высоту по пяти шагам: так одиночный сбой не становится нотой. */
const MEDIAN_RADIUS = 2
/** Короче этого нота не считается: случайные скачки длятся один-два шага. */
const MIN_NOTE_SEC = 0.12
const NEAR_BEST_SHARE = 0.8
const LA_FREQUENCY = 440
const LA_NOTE = 69

export function trackMelody(samples: Float32Array, sampleRate: number, fps: number, frameCount: number): MelodyTrack {
  const stepCount = Math.ceil(frameCount / STEP_FRAMES)
  const rawPitch = new Float32Array(stepCount)
  const clarity = new Float32Array(stepCount)

  const half = MELODY_FFT_SIZE / 2
  const fft = new FFT(MELODY_FFT_SIZE)
  const window = hannWindow(MELODY_FFT_SIZE)
  const frame = new Float32Array(MELODY_FFT_SIZE)
  const mags = new Float32Array(half + 1)
  const binsForNotes = noteBins(sampleRate)
  const salience = new Float32Array(binsForNotes.length)

  let previous = -1
  for (let step = 0; step < stepCount; step++) {
    const center = Math.round(((step * STEP_FRAMES) / fps) * sampleRate)
    const start = center - half
    for (let i = 0; i < MELODY_FFT_SIZE; i++) {
      const index = start + i
      frame[i] = index >= 0 && index < samples.length ? samples[index] * window[i] : 0
    }
    fft.magnitudes(frame, mags)

    let best = 0
    let sum = 0
    for (let note = 0; note < binsForNotes.length; note++) {
      salience[note] = noteSalience(mags, binsForNotes[note], half)
      sum += salience[note]
      if (salience[note] > salience[best]) best = note
    }
    const mean = sum / binsForNotes.length
    clarity[step] = mean > 1e-6 ? salience[best] / mean : 0
    const chosen = clarity[step] >= MIN_CLARITY ? closestStrongNote(salience, best, previous) : -1
    rawPitch[step] = chosen === -1 ? 0 : LOWEST_NOTE + chosen
    if (chosen !== -1) previous = chosen
  }

  const smooth = medianFilter(rawPitch)
  const pitch = new Float32Array(frameCount)
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    pitch[frameIndex] = smooth[Math.floor(frameIndex / STEP_FRAMES)]
  }
  return { pitch, ...findNotes(smooth, clarity, fps) }
}

/**
 * Сильнейший полутон часто оказывается октавой настоящей ноты. Если рядом с прошлой
 * нотой есть почти такой же сильный, берём его: мелодия редко скачет на октаву.
 */
function closestStrongNote(salience: Float32Array, best: number, previous: number): number {
  if (previous === -1) return best
  let chosen = best
  for (let note = 0; note < salience.length; note++) {
    const isStrong = salience[note] >= salience[best] * NEAR_BEST_SHARE
    const isCloser = Math.abs(note - previous) < Math.abs(chosen - previous)
    if (isStrong && isCloser) chosen = note
  }
  return chosen
}

/** Бины FFT для каждого полутона и его гармоник. */
function noteBins(sampleRate: number): number[][] {
  const bins: number[][] = []
  for (let note = LOWEST_NOTE; note <= HIGHEST_NOTE; note++) {
    const frequency = LA_FREQUENCY * 2 ** ((note - LA_NOTE) / 12)
    const harmonics: number[] = []
    for (let harmonic = 1; harmonic <= HARMONICS; harmonic++) {
      harmonics.push(Math.round(((frequency * harmonic) / sampleRate) * MELODY_FFT_SIZE))
    }
    bins.push(harmonics)
  }
  return bins
}

/** Сумма гармоник. Корень не даёт одной громкой гармонике решить всё самой. */
function noteSalience(mags: Float32Array, harmonics: number[], half: number): number {
  let sum = 0
  let weight = 1
  for (const bin of harmonics) {
    if (bin < half) sum += weight * Math.sqrt(Math.max(mags[bin], mags[bin - 1], mags[bin + 1]))
    weight *= HARMONIC_WEIGHT
  }
  return sum
}

function medianFilter(values: Float32Array): Float32Array {
  const result = new Float32Array(values.length)
  for (let i = 0; i < values.length; i++) {
    const around: number[] = []
    for (let j = Math.max(0, i - MEDIAN_RADIUS); j <= Math.min(values.length - 1, i + MEDIAN_RADIUS); j++) {
      around.push(values[j])
    }
    around.sort((a, b) => a - b)
    result[i] = around[Math.floor(around.length / 2)]
  }
  return result
}

/** Нота начинается там, где высота сменилась и продержалась достаточно долго. */
function findNotes(pitch: Float32Array, clarity: Float32Array, fps: number): Omit<MelodyTrack, 'pitch'> {
  const stepSec = STEP_FRAMES / fps
  const noteTimes: number[] = []
  const notePitches: number[] = []
  const noteStrengths: number[] = []

  let start = 0
  while (start < pitch.length) {
    let end = start + 1
    while (end < pitch.length && pitch[end] === pitch[start]) end += 1

    const isNote = pitch[start] > 0 && (end - start) * stepSec >= MIN_NOTE_SEC
    const isNew = notePitches.length === 0 || notePitches[notePitches.length - 1] !== pitch[start]
    const isAfterRest = noteTimes.length > 0 && start * stepSec - noteTimes[noteTimes.length - 1] > 1
    if (isNote && (isNew || isAfterRest)) {
      noteTimes.push(start * stepSec)
      notePitches.push(pitch[start])
      let peak = 0
      for (let i = start; i < end; i++) peak = Math.max(peak, clarity[i])
      noteStrengths.push(peak)
    }
    start = end
  }
  return { noteTimes, notePitches, noteStrengths }
}
