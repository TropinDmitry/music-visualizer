import { FFT, hannWindow } from './fft.ts'

/**
 * Офлайн-анализ трека по кадрам.
 *
 * Идея: заранее (до превью и экспорта) один раз проходим по всему треку и для
 * каждого кадра считаем набор чисел — громкость, энергию в полосах, спектр,
 * удары. Визуализация потом просто читает эти массивы по времени. Поэтому
 * картинка в превью и в экспортированном видео совпадает кадр в кадр, а экспорт
 * может идти быстрее реального времени.
 */

export interface AnalysisOptions {
  /** Сколько кадров анализа на секунду. */
  fps: number
  /** Размер окна FFT (степень двойки). 2048 при 44,1 кГц ≈ 46 мс. */
  fftSize: number
  /** Границы полос в герцах: [от, до). */
  bands: { bass: [number, number]; mid: [number, number]; treble: [number, number] }
  /** Сколько столбиков в «логарифмическом» спектре для визуализации. */
  spectrumBins: number
  /** Сглаживание: время атаки и спада огибающей, в секундах. */
  attack: number
  release: number
  /** Детектор ударов. */
  onset: {
    /** Во сколько раз поток должен превысить локальное среднее. */
    sensitivity: number
    /** Полуширина окна локального среднего, в секундах. */
    windowSec: number
    /** Минимальный интервал между ударами, в секундах. */
    minGapSec: number
    /** Время затухания «импульса» после удара (до ~5 %), в секундах. */
    pulseDecaySec: number
  }
}

export const DEFAULT_ANALYSIS_OPTIONS: AnalysisOptions = {
  fps: 60,
  fftSize: 2048,
  bands: { bass: [20, 250], mid: [250, 4000], treble: [4000, 16000] },
  spectrumBins: 64,
  attack: 0.01,
  release: 0.18,
  onset: { sensitivity: 1.6, windowSec: 0.3, minGapSec: 0.1, pulseDecaySec: 0.35 },
}

export interface AudioAnalysis {
  fps: number
  frameCount: number
  duration: number
  sampleRate: number
  /** Сглаженные и нормализованные (0..1) значения по кадрам. */
  bass: Float32Array
  mid: Float32Array
  treble: Float32Array
  rms: Float32Array
  /** «Сырые» значения: амплитуда в полосе / RMS без сглаживания и нормализации. */
  raw: { bass: Float32Array; mid: Float32Array; treble: Float32Array; rms: Float32Array }
  /** Сила «новизны» спектра (spectral flux), нормализована в 0..1. */
  onsetStrength: Float32Array
  /** 1 — на этом кадре найден удар. */
  onsets: Uint8Array
  /**
   * Вероятное начало слога певца. Это не распознавание речи: ищем рост энергии
   * в полосе голоса, которого нет на краях спектра. Бочка живёт внизу, хэт вверху,
   * а новый слог поднимает именно середину. Малый барабан и гитара могут обмануть.
   */
  vocalOnsets: Uint8Array
  vocalStrength: Float32Array
  /** Времена ударов в секундах. */
  onsetTimes: number[]
  /** 1 в момент удара, затем экспоненциально затухает к 0. Удобно для вспышек. */
  beatPulse: Float32Array
  /**
   * Накопленная энергия: сумма сглаженного RMS по времени. Монотонно растёт,
   * поэтому стили используют её как «фазу» движения — сцена ускоряется на громких
   * местах, но при перемотке не нужно ничего «проигрывать» заново.
   */
  energyIntegral: Float32Array
  spectrumBins: number
  /** Спектр 0..1, кадры подряд: [кадр0: bins значений][кадр1: ...]. */
  spectrum: Float32Array
}

/** Всё тише −80 дБ считаем тишиной: иначе шум округления давал бы «удары». */
const FLUX_FLOOR_DB = -80
/** Полоса, где сосредоточена энергия голоса и его разборчивость, в герцах. */
const VOCAL_LOW_HZ = 300
const VOCAL_HIGH_HZ = 3400
/** Быстрее этого слоги в песне почти не идут. */
const VOCAL_MIN_GAP_SEC = 0.12
/** Насколько рост вне полосы голоса гасит рост в ней: так отсекаются удары. */
const VOCAL_DRUM_PENALTY = 0.8

export type ProgressCallback = (fraction: number) => void

/**
 * Главная функция анализа.
 * @param samples моно-сигнал (-1..1)
 * @param sampleRate частота дискретизации
 */
export function analyzeAudio(
  samples: Float32Array,
  sampleRate: number,
  options: Partial<AnalysisOptions> = {},
  onProgress?: ProgressCallback,
): AudioAnalysis {
  const opts: AnalysisOptions = {
    ...DEFAULT_ANALYSIS_OPTIONS,
    ...options,
    onset: { ...DEFAULT_ANALYSIS_OPTIONS.onset, ...options.onset },
    bands: { ...DEFAULT_ANALYSIS_OPTIONS.bands, ...options.bands },
  }
  const { fps, fftSize, spectrumBins } = opts
  const duration = samples.length / sampleRate
  const frameCount = Math.max(1, Math.ceil(duration * fps))
  const half = fftSize / 2
  const binHz = sampleRate / fftSize

  const fft = new FFT(fftSize)
  const window = hannWindow(fftSize)
  let windowSum = 0
  for (let i = 0; i < fftSize; i++) windowSum += window[i]
  // Эквивалентная шумовая полоса окна Ханна = 1.5 бина. Нужна, чтобы энергия
  // синуса, «размазанная» окном по нескольким бинам, давала его амплитуду.
  const ENBW = 1.5

  const frame = new Float32Array(fftSize)
  const mags = new Float32Array(half + 1)
  const prevSpectrumDb = new Float32Array(spectrumBins).fill(FLUX_FLOOR_DB)
  const isVocalBin = markVocalBins(spectrumBins, Math.min(16000, sampleRate / 2))

  const rawBass = new Float32Array(frameCount)
  const rawMid = new Float32Array(frameCount)
  const rawTreble = new Float32Array(frameCount)
  const rawRms = new Float32Array(frameCount)
  const flux = new Float32Array(frameCount)
  const vocalRise = new Float32Array(frameCount)
  const otherRise = new Float32Array(frameCount)
  const spectrumDb = new Float32Array(frameCount * spectrumBins)

  const bandRange = ([lo, hi]: [number, number]) =>
    [Math.max(1, Math.ceil(lo / binHz)), Math.min(half, Math.floor(hi / binHz))] as const
  const bassBins = bandRange(opts.bands.bass)
  const midBins = bandRange(opts.bands.mid)
  const trebleBins = bandRange(opts.bands.treble)
  const spectrumEdges = logSpacedBinEdges(spectrumBins, 30, Math.min(16000, sampleRate / 2), binHz, half)

  // Амплитуда синуса A на входе даёт пик |X| ≈ A * sum(window) / 2,
  // поэтому делим на это число — так «1» означает полную шкалу.
  const ampScale = 2 / windowSum

  const bandAmplitude = ([from, to]: readonly [number, number]) => {
    let power = 0
    for (let k = from; k <= to; k++) power += mags[k] * mags[k]
    return Math.sqrt(power / ENBW)
  }

  for (let f = 0; f < frameCount; f++) {
    // Окно центрировано на времени кадра t = f / fps; за краями трека — нули
    const center = Math.round((f / fps) * sampleRate)
    const start = center - half
    let sumSquares = 0
    for (let i = 0; i < fftSize; i++) {
      const idx = start + i
      const s = idx >= 0 && idx < samples.length ? samples[idx] : 0
      sumSquares += s * s
      frame[i] = s * window[i]
    }
    rawRms[f] = Math.sqrt(sumSquares / fftSize)

    fft.magnitudes(frame, mags)
    for (let k = 0; k <= half; k++) mags[k] *= ampScale

    rawBass[f] = bandAmplitude(bassBins)
    rawMid[f] = bandAmplitude(midBins)
    rawTreble[f] = bandAmplitude(trebleBins)

    // Логарифмический спектр: в каждом столбике берём пик бинов FFT,
    // попавших в его диапазон частот, и переводим в децибелы
    for (let b = 0; b < spectrumBins; b++) {
      let peak = 0
      for (let k = spectrumEdges[b]; k < spectrumEdges[b + 1]; k++) peak = Math.max(peak, mags[k])
      const db = Math.max(20 * Math.log10(peak + 1e-9), FLUX_FLOOR_DB)
      spectrumDb[f * spectrumBins + b] = db

      // Spectral flux: сумма положительных приростов громкости по столбикам.
      // Считаем по логарифмическим столбикам, а не по бинам FFT: иначе
      // широкополосный хэт (сотни бинов) «перекрикивает» бочку (пара бинов).
      const rise = db - prevSpectrumDb[b]
      if (f > 0 && rise > 0) {
        flux[f] += rise
        if (isVocalBin[b]) vocalRise[f] += rise
        else otherRise[f] += rise
      }
      prevSpectrumDb[b] = db
    }

    if (onProgress && f % 512 === 0) onProgress(f / frameCount)
  }

  // --- Постобработка -------------------------------------------------------

  const bass = smoothEnvelope(normalize(rawBass), fps, opts.attack, opts.release)
  const mid = smoothEnvelope(normalize(rawMid), fps, opts.attack, opts.release)
  const treble = smoothEnvelope(normalize(rawTreble), fps, opts.attack, opts.release)
  const rms = smoothEnvelope(normalize(rawRms), fps, opts.attack, opts.release)

  const { onsets, onsetTimes } = detectOnsets(flux, fps, opts.onset)
  const onsetStrength = normalize(flux, 1)
  const vocalFlux = vocalOnsetCurve(vocalRise, otherRise, isVocalBin)
  const vocalStrength = normalize(vocalFlux, 0.5)
  const { onsets: vocalOnsets } = detectOnsets(vocalFlux, fps, { ...opts.onset, minGapSec: VOCAL_MIN_GAP_SEC })
  const beatPulse = makeBeatPulse(onsets, fps, opts.onset.pulseDecaySec)

  const energyIntegral = new Float32Array(frameCount)
  let acc = 0
  for (let f = 0; f < frameCount; f++) {
    acc += rms[f] / fps
    energyIntegral[f] = acc
  }

  const spectrum = normalizeSpectrum(spectrumDb)
  smoothSpectrumInPlace(spectrum, spectrumBins, fps, opts.attack, opts.release)

  onProgress?.(1)

  return {
    fps,
    frameCount,
    duration,
    sampleRate,
    bass,
    mid,
    treble,
    rms,
    raw: { bass: rawBass, mid: rawMid, treble: rawTreble, rms: rawRms },
    onsetStrength,
    onsets,
    vocalOnsets,
    vocalStrength,
    onsetTimes,
    beatPulse,
    energyIntegral,
    spectrumBins,
    spectrum,
  }
}

// --- Вспомогательные функции (экспортируются для тестов) ---------------------

/**
 * Делит массив на «почти максимум» (98-й перцентиль), чтобы один случайный пик
 * не сжимал всю шкалу. floor не даёт усилить тишину и шум до единицы:
 * 0.01 ≈ −40 дБ от полной шкалы.
 */
export function normalize(values: Float32Array, floor = 0.01): Float32Array {
  const reference = Math.max(percentile(values, 0.98), floor)
  const out = new Float32Array(values.length)
  for (let i = 0; i < values.length; i++) out[i] = Math.min(1, values[i] / reference)
  return out
}

export function percentile(values: Float32Array, p: number): number {
  if (values.length === 0) return 0
  const sorted = Float32Array.from(values).sort()
  return sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))]
}

/**
 * Огибающая с разной скоростью атаки и спада: быстро реагирует на рост,
 * плавно затухает. Классический приём из компрессоров и VU-метров.
 */
export function smoothEnvelope(values: Float32Array, fps: number, attackSec: number, releaseSec: number): Float32Array {
  const a = 1 - Math.exp(-1 / (fps * Math.max(attackSec, 1e-6)))
  const r = 1 - Math.exp(-1 / (fps * Math.max(releaseSec, 1e-6)))
  const out = new Float32Array(values.length)
  let y = 0
  for (let i = 0; i < values.length; i++) {
    const x = values[i]
    y += (x > y ? a : r) * (x - y)
    out[i] = y
  }
  return out
}

/**
 * Поиск ударов по spectral flux: кадр считается ударом, если поток
 *  1) выше локального среднего × sensitivity (адаптивный порог — работает и в
 *     тихих, и в громких частях трека);
 *  2) выше абсолютного минимума (чтобы тишина и ровный шум не давали ударов);
 *  3) является максимумом в окрестности ±minGapSec — так из двух близких
 *     пиков остаётся более сильный, а не тот, что раньше.
 */
export function detectOnsets(
  flux: Float32Array,
  fps: number,
  { sensitivity, windowSec, minGapSec }: AnalysisOptions['onset'],
): { onsets: Uint8Array; onsetTimes: number[] } {
  const n = flux.length
  const onsets = new Uint8Array(n)
  const onsetTimes: number[] = []
  const w = Math.max(1, Math.round(windowSec * fps))
  const minGap = Math.max(1, Math.round(minGapSec * fps))

  let maxFlux = 0
  for (let i = 0; i < n; i++) maxFlux = Math.max(maxFlux, flux[i])
  const absoluteMin = Math.max(1e-3, 0.08 * maxFlux)

  // Префиксные суммы для быстрого скользящего среднего
  const prefix = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + flux[i]

  for (let i = 1; i < n; i++) {
    const v = flux[i]
    if (v < absoluteMin) continue
    const lo = Math.max(0, i - w)
    const hi = Math.min(n, i + w + 1)
    const localMean = (prefix[hi] - prefix[lo]) / (hi - lo)
    if (v < localMean * sensitivity) continue

    let isPeak = true
    for (let j = Math.max(0, i - minGap); j <= Math.min(n - 1, i + minGap); j++) {
      if (flux[j] > v || (flux[j] === v && j < i)) {
        isPeak = false
        break
      }
    }
    if (!isPeak) continue

    onsets[i] = 1
    onsetTimes.push(i / fps)
  }
  return { onsets, onsetTimes }
}

/** Импульс 1 → 0 после каждого удара: удобный сигнал для вспышек и «толчков». */
export function makeBeatPulse(onsets: Uint8Array, fps: number, decaySec: number): Float32Array {
  // Подбираем коэффициент так, чтобы за decaySec импульс упал до ~5 %
  const k = Math.exp(Math.log(0.05) / Math.max(1, decaySec * fps))
  const out = new Float32Array(onsets.length)
  let y = 0
  for (let i = 0; i < onsets.length; i++) {
    y = onsets[i] ? 1 : y * k
    out[i] = y
  }
  return out
}

/**
 * Границы столбиков спектра в индексах бинов FFT, распределённые по
 * логарифмической шкале (как слышит человек). Каждый столбик — минимум один бин.
 */
export function logSpacedBinEdges(count: number, minHz: number, maxHz: number, binHz: number, maxBin: number): Int32Array {
  const edges = new Int32Array(count + 1)
  const ratio = maxHz / minHz
  let prev = 0
  for (let i = 0; i <= count; i++) {
    const hz = minHz * Math.pow(ratio, i / count)
    let k = Math.min(maxBin + 1, Math.round(hz / binHz))
    if (i > 0 && k <= prev) k = Math.min(maxBin + 1, prev + 1)
    edges[i] = k
    prev = k
  }
  return edges
}

/**
 * Переводит спектр из дБ в 0..1: верх шкалы — 99-й перцентиль по всему треку,
 * диапазон — 50 дБ. Абсолютный «пол» −60 дБ не даёт тишине выглядеть как сигнал.
 */
function normalizeSpectrum(db: Float32Array): Float32Array {
  const RANGE_DB = 50
  const top = Math.max(percentile(db, 0.99), -60 + RANGE_DB)
  const bottom = top - RANGE_DB
  const out = new Float32Array(db.length)
  for (let i = 0; i < db.length; i++) {
    out[i] = Math.min(1, Math.max(0, (db[i] - bottom) / RANGE_DB))
  }
  return out
}

/** Какие столбики логарифмического спектра попадают в полосу голоса. */
function markVocalBins(bins: number, maxHz: number): boolean[] {
  const marks: boolean[] = []
  const ratio = maxHz / 30
  for (let b = 0; b < bins; b++) {
    const hz = 30 * Math.pow(ratio, (b + 0.5) / bins)
    marks.push(hz >= VOCAL_LOW_HZ && hz <= VOCAL_HIGH_HZ)
  }
  return marks
}

/** Средний рост в полосе голоса минус рост вне её: удар поднимает весь спектр и гасится. */
function vocalOnsetCurve(vocalRise: Float32Array, otherRise: Float32Array, isVocalBin: boolean[]): Float32Array {
  let vocalBins = 0
  for (const isVocal of isVocalBin) {
    if (isVocal) vocalBins += 1
  }
  const otherBins = Math.max(1, isVocalBin.length - vocalBins)
  const curve = new Float32Array(vocalRise.length)
  for (let i = 0; i < curve.length; i++) {
    const inside = vocalRise[i] / Math.max(1, vocalBins)
    const outside = otherRise[i] / otherBins
    curve[i] = Math.max(0, inside - VOCAL_DRUM_PENALTY * outside)
  }
  return curve
}

/** То же сглаживание огибающей, но для каждого столбика спектра отдельно. */
function smoothSpectrumInPlace(spectrum: Float32Array, bins: number, fps: number, attackSec: number, releaseSec: number): void {
  const frameCount = spectrum.length / bins
  const column = new Float32Array(frameCount)
  for (let b = 0; b < bins; b++) {
    for (let f = 0; f < frameCount; f++) column[f] = spectrum[f * bins + b]
    const smoothed = smoothEnvelope(column, fps, attackSec, releaseSec)
    for (let f = 0; f < frameCount; f++) spectrum[f * bins + b] = smoothed[f]
  }
}

/** Сводит многоканальный звук в моно для анализа. */
export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]
  const length = channels[0].length
  const out = new Float32Array(length)
  for (const ch of channels) {
    for (let i = 0; i < length; i++) out[i] += ch[i]
  }
  for (let i = 0; i < length; i++) out[i] /= channels.length
  return out
}
