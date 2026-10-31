import { percentile, type AudioAnalysis } from '../audio/analyzer.ts'

/**
 * Поиск драматургии песни. Детектор ударов видит только отдельные щелчки,
 * а здесь мы смотрим на громкость в масштабе секунд и ищем три события:
 *
 *  pause   — внезапная тишина или выпавший бас после плотного места;
 *  impact  — смена части песни: припев, «дроп», вступление после паузы;
 *  buildup — разгон: звук несколько секунд подряд становится плотнее.
 *
 * Современные треки сведены почти ровно по громкости, поэтому одной громкости
 * мало. Смена части чаще видна по тембру: меняется набор частот, а уровень тот же.
 *
 * Это простая эвристика, а не понимание музыки: она ошибается на тихих песнях
 * без резких переходов. Зато не зависит от жанра и работает на любом файле.
 */

export type MomentKind = 'buildup' | 'pause' | 'impact'

export interface Moment {
  kind: MomentKind
  start: number
  end: number
}

/** Длина окон, в которых сравнивается громкость «до» и «после», в секундах. */
const COMPARE_SEC = 0.75
const IMPACT_RATIO = 1.45
const IMPACT_MIN_LEVEL = 0.4
const MIN_IMPACT_GAP_SEC = 8
const PAUSE_MIN_SEC = 0.22
const PAUSE_MAX_SEC = 4
/** Пауза: громкость упала ниже этой доли от той, что была перед ней. */
const PAUSE_DROP_RATIO = 0.3
const PAUSE_MIN_LEVEL_BEFORE = 0.3
const PAUSE_LOOK_BACK_SEC = 1
const BUILDUP_MAX_SEC = 8
const BUILDUP_MIN_SEC = 2.5
/** Во сколько раз плотность звука должна вырасти за разгон. */
const BUILDUP_MIN_RISE = 1.06
const EDGE_SEC = 2
/** Полуширина окна, в котором ищется пик громкости. */
const PEAK_REACH_SEC = 0.2
/** Окно усреднения силы части песни: припев длиннее нескольких тактов. */
const INTENSITY_WINDOW_SEC = 5
/** Окно сравнения силы до и после границы части. */
const SECTION_COMPARE_SEC = 7
const SECTION_MIN_JUMP = 0.22
const SECTION_MIN_SEC = 12
const GRID_STEP_SEC = 4
const GRID_WINDOW_SEC = 8
const GRID_MIN_BEAT_SEC = 0.33
const GRID_MAX_BEAT_SEC = 1
/** Ниже этого ритма считай что нет: сетка только навредит. */
const GRID_MIN_CONFIDENCE = 1.3
/** Какую долю от лучшего счёта должен набрать главный темп, чтобы остаться. */
const GRID_KEEP_MAIN_SHARE = 0.6
/** Смена тембра: шаг сетки, окно сравнения и самая малая заметная разница. */
const TIMBRE_STEP_SEC = 0.1
const TIMBRE_WINDOW_SEC = 1.5
const TIMBRE_BANDS = 8
const TIMBRE_MIN_CHANGE = 0.025
/** Какая доля самых заметных моментов трека может считаться сменой части. */
const TIMBRE_PEAK_PERCENTILE = 0.9
/** Выпавший бас заметен и при меньшем падении, чем полная тишина. */
const BASS_DROP_RATIO = 0.55
/** Пауза должна быть во столько раз длиннее обычного промежутка между ударами. */
const PAUSE_BEATS = 1.7
const BEAT_LOOK_BACK_SEC = 4

/**
 * Сила части песни по кадрам, 0..1. Считается по заполненности спектра: сколько
 * частот звучит одновременно. Ни число ударов, ни громкость для этого не годятся:
 * быстрая читка даёт много ударов, а тяжёлый бас во вступлении даёт громкость,
 * хотя мощной частью песни это не делает. Припев заполняет низ, середину и верх.
 * Нормировка по самому треку: 0 — его спокойные места, 1 — самые мощные.
 */
export function songIntensity(analysis: AudioAnalysis): Float32Array {
  const count = analysis.frameCount
  const prefix = new Float64Array(count + 1)
  for (let i = 0; i < count; i++) {
    prefix[i + 1] = prefix[i] + (analysis.bass[i] + analysis.mid[i] + analysis.treble[i]) / 3
  }

  const reach = Math.round((INTENSITY_WINDOW_SEC / 2) * analysis.fps)
  const smooth = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const from = Math.max(0, i - reach)
    const to = Math.min(count, i + reach)
    smooth[i] = (prefix[to] - prefix[from]) / (to - from)
  }

  const low = percentile(smooth, 0.1)
  const high = percentile(smooth, 0.9)
  const range = Math.max(high - low, 0.001)
  const curve = new Float32Array(count)
  for (let i = 0; i < count; i++) curve[i] = Math.min(1, Math.max(0, (smooth[i] - low) / range))
  return curve
}

/** Крупная часть песни: вступление, куплет, бридж, припев. */
export interface Section {
  start: number
  end: number
  /** Средняя сила части, 0..1. */
  level: number
}

/**
 * Делит песню на крупные части по скачкам силы. Смотрим на средние за несколько
 * секунд, поэтому повторяющиеся выпадения баса внутри бита частями не считаются.
 */
export function findSections(analysis: AudioAnalysis, intensity: Float32Array): Section[] {
  const fps = analysis.fps
  const prefix = new Float64Array(intensity.length + 1)
  for (let i = 0; i < intensity.length; i++) prefix[i + 1] = prefix[i] + intensity[i]
  const mean = (from: number, to: number): number => {
    const a = Math.max(0, from)
    const b = Math.min(intensity.length, to)
    return b <= a ? 0 : (prefix[b] - prefix[a]) / (b - a)
  }

  const reach = Math.round(SECTION_COMPARE_SEC * fps)
  const step = Math.round(0.25 * fps)
  const candidates: { frame: number; jump: number }[] = []
  let previousJump = 0
  let rising = false
  for (let frame = reach; frame < intensity.length - reach; frame += step) {
    const jump = Math.abs(mean(frame, frame + reach) - mean(frame - reach, frame))
    if (jump < previousJump && rising && previousJump >= SECTION_MIN_JUMP) {
      candidates.push({ frame: frame - step, jump: previousJump })
    }
    rising = jump > previousJump
    previousJump = jump
  }

  // Сначала самые большие скачки: мелкие рядом с ними не считаются
  candidates.sort((a, b) => b.jump - a.jump)
  const boundaries: number[] = []
  const minGap = SECTION_MIN_SEC * fps
  for (const candidate of candidates) {
    let isFree = true
    for (const boundary of boundaries) {
      if (Math.abs(boundary - candidate.frame) < minGap) isFree = false
    }
    if (isFree) boundaries.push(candidate.frame)
  }
  boundaries.sort((a, b) => a - b)

  const sections: Section[] = []
  const edges = [0, ...boundaries, intensity.length]
  for (let i = 0; i + 1 < edges.length; i++) {
    sections.push({ start: edges[i] / fps, end: edges[i + 1] / fps, level: mean(edges[i], edges[i + 1]) })
  }
  return sections
}

/** Сетка ритма на отрезке песни. Темп может меняться, поэтому отрезков много. */
interface GridWindow {
  /** Длина доли и положение первой доли, в кадрах. */
  beatFrames: number
  phaseFrame: number
  /** Насколько ритм выражен: около 1 — ритма нет, например разговор. */
  confidence: number
}

export interface BeatGrid {
  windows: GridWindow[]
  stepFrames: number
}

/**
 * Находит сетку долей. Автокорреляция: сравниваем поток ударов с ним же, сдвинутым
 * на разные интервалы. Если музыка ритмична, на длине доли совпадений заметно больше.
 */
export function findBeatGrid(analysis: AudioAnalysis): BeatGrid {
  const pulses = onsetPulses(analysis)
  const stepFrames = Math.round(GRID_STEP_SEC * analysis.fps)
  const length = Math.round(GRID_WINDOW_SEC * analysis.fps)
  const minLag = Math.round(GRID_MIN_BEAT_SEC * analysis.fps)
  const maxLag = Math.round(GRID_MAX_BEAT_SEC * analysis.fps)

  // Первый проход: для каждого отрезка оцениваем все интервалы
  const allScores: Float32Array[] = []
  const starts: number[] = []
  for (let center = 0; center < analysis.frameCount; center += stepFrames) {
    const start = Math.max(0, Math.min(center - Math.round(length / 2), analysis.frameCount - length))
    const end = Math.min(analysis.frameCount, start + length)
    const scores = new Float32Array(maxLag + 1)
    for (let lag = minLag; lag <= maxLag; lag++) {
      for (let i = start; i + lag < end; i++) scores[lag] += pulses[i] * pulses[i + lag]
    }
    allScores.push(scores)
    starts.push(start)
  }

  // Главный темп трека: интервал, который чаще всего побеждает
  const wins = new Float32Array(maxLag + 2)
  for (const scores of allScores) wins[bestLag(scores, minLag, maxLag)] += 1
  const mainLag = bestLag(wins, minLag, maxLag)

  // Второй проход: отрезок отступает от главного темпа, только если другой явно сильнее.
  // Иначе ритм 2:3 внутри одного темпа выглядел бы как постоянная смена темпа.
  const windows: GridWindow[] = []
  for (let index = 0; index < allScores.length; index++) {
    const scores = allScores[index]
    const best = bestLag(scores, minLag, maxLag)
    const nearMain = bestLag(scores, Math.max(minLag, mainLag - 1), Math.min(maxLag, mainLag + 1))
    const lag = scores[nearMain] >= scores[best] * GRID_KEEP_MAIN_SHARE ? nearMain : best

    let total = 0
    for (let i = minLag; i <= maxLag; i++) total += scores[i]
    const mean = total / (maxLag - minLag + 1)

    const start = starts[index]
    const end = Math.min(analysis.frameCount, start + length)
    let phaseFrame = start
    let bestPhaseScore = -1
    for (let phase = 0; phase < lag; phase++) {
      let score = 0
      for (let i = start + phase; i < end; i += lag) score += pulses[i]
      if (score > bestPhaseScore) {
        bestPhaseScore = score
        phaseFrame = start + phase
      }
    }
    windows.push({ beatFrames: lag, phaseFrame, confidence: mean > 0 ? scores[lag] / mean : 1 })
  }
  return { windows, stepFrames }
}

function bestLag(scores: Float32Array, from: number, to: number): number {
  let best = from
  for (let lag = from; lag <= to; lag++) {
    if (scores[lag] > scores[best]) best = lag
  }
  return best
}

/**
 * Сами удары в виде коротких импульсов. Сплошная кривая не подходит: соседние кадры
 * в ней похожи, и автокорреляция всегда выбирала самый короткий интервал.
 */
function onsetPulses(analysis: AudioAnalysis): Float32Array {
  const pulses = new Float32Array(analysis.frameCount)
  for (let frame = 0; frame < analysis.frameCount; frame++) {
    if (analysis.onsets[frame] !== 1) continue
    const value = analysis.onsetStrength[frame] + beatBass(analysis, frame)
    for (let i = Math.max(0, frame - 2); i <= Math.min(analysis.frameCount - 1, frame + 2); i++) {
      pulses[i] = Math.max(pulses[i], value)
    }
  }
  return pulses
}

/** Бас сразу после удара: доли обычно отмечены именно низом. */
function beatBass(analysis: AudioAnalysis, frame: number): number {
  return analysis.bass[Math.min(frame + 4, analysis.frameCount - 1)]
}

/** Ближайшая к кадру точка сетки на половинных долях; без ритма — сам кадр. */
export function snapToGrid(grid: BeatGrid, frame: number): number {
  const index = Math.min(grid.windows.length - 1, Math.round(frame / grid.stepFrames))
  const window = grid.windows[index]
  if (window.confidence < GRID_MIN_CONFIDENCE) return frame
  const half = window.beatFrames / 2
  return Math.round(window.phaseFrame + Math.round((frame - window.phaseFrame) / half) * half)
}

/** Есть ли в этом месте песни выраженный ритм. */
export function hasRhythm(grid: BeatGrid, frame: number): boolean {
  const index = Math.min(grid.windows.length - 1, Math.round(frame / grid.stepFrames))
  return grid.windows[index].confidence >= GRID_MIN_CONFIDENCE
}

export function findMoments(analysis: AudioAnalysis): Moment[] {
  const levels = loudnessLevels(analysis)
  const prefix = new Float64Array(levels.length + 1)
  for (let i = 0; i < levels.length; i++) prefix[i + 1] = prefix[i] + levels[i]

  const meanLevel = (fromSec: number, toSec: number): number => {
    const from = Math.max(0, Math.round(fromSec * analysis.fps))
    const to = Math.min(levels.length, Math.round(toSec * analysis.fps))
    return to <= from ? 0 : (prefix[to] - prefix[from]) / (to - from)
  }

  const pauses = findPauses(analysis, levels, meanLevel, PAUSE_DROP_RATIO)
  addBassDropouts(analysis, pauses)
  pauses.sort((a, b) => a.start - b.start)

  const impacts = findImpacts(analysis, meanLevel, pauses)
  addTimbreChanges(analysis, impacts)
  impacts.sort((a, b) => a.start - b.start)

  const buildups = findBuildups([...pauses, ...impacts], fullnessMeter(analysis))

  const moments = [...pauses, ...impacts, ...buildups]
  moments.sort((a, b) => a.start - b.start)
  return moments
}

/**
 * Громкость 0..1 относительно громких мест самого трека. В каждом кадре берём
 * пик в окрестности: между ударами бочки звук тоже почти затухает, и без этого
 * любой обычный промежуток выглядел бы как пауза.
 */
function loudnessLevels(analysis: AudioAnalysis): Float32Array {
  return peakLevels(analysis.raw.rms, analysis)
}

function peakLevels(values: Float32Array, analysis: AudioAnalysis): Float32Array {
  const reference = Math.max(percentile(values, 0.95), 0.01)
  const reach = Math.round(PEAK_REACH_SEC * analysis.fps)
  const levels = new Float32Array(analysis.frameCount)
  for (let i = 0; i < levels.length; i++) {
    let peak = 0
    const last = Math.min(levels.length - 1, i + reach)
    for (let j = Math.max(0, i - reach); j <= last; j++) peak = Math.max(peak, values[j])
    levels[i] = Math.min(1, peak / reference)
  }
  return levels
}

function findPauses(
  analysis: AudioAnalysis,
  levels: Float32Array,
  meanLevel: (fromSec: number, toSec: number) => number,
  dropRatio: number,
): Moment[] {
  const pauses: Moment[] = []
  const fps = analysis.fps
  let frame = Math.round(EDGE_SEC * fps)
  const lastFrame = Math.round((analysis.duration - EDGE_SEC) * fps)

  while (frame < lastFrame) {
    const time = frame / fps
    const before = meanLevel(time - PAUSE_LOOK_BACK_SEC, time)
    const isDrop = before >= PAUSE_MIN_LEVEL_BEFORE && levels[frame] < before * dropRatio
    if (!isDrop) {
      frame += 1
      continue
    }

    // Ищем, где звук вернулся
    let end = frame
    while (end < lastFrame && levels[end] < before * Math.min(dropRatio + 0.2, 0.8)) end += 1
    const length = (end - frame) / fps
    // Окно пика съедает края тишины с обеих сторон, возвращаем их обратно
    const silence = length + PEAK_REACH_SEC * 2
    const isLongerThanBeat = silence >= localBeatGap(analysis, time) * PAUSE_BEATS
    if (length >= PAUSE_MIN_SEC && length <= PAUSE_MAX_SEC && end < lastFrame && isLongerThanBeat) {
      pauses.push({ kind: 'pause', start: time, end: end / fps })
    }
    frame = end + 1
  }
  return pauses
}

/** Паузы в басу: мелодия звучит, а низ выпал. Слышится как обрыв, хотя громкость почти та же. */
function addBassDropouts(analysis: AudioAnalysis, pauses: Moment[]): void {
  const levels = peakLevels(analysis.raw.bass, analysis)
  const prefix = new Float64Array(levels.length + 1)
  for (let i = 0; i < levels.length; i++) prefix[i + 1] = prefix[i] + levels[i]
  const meanBass = (fromSec: number, toSec: number): number => {
    const from = Math.max(0, Math.round(fromSec * analysis.fps))
    const to = Math.min(levels.length, Math.round(toSec * analysis.fps))
    return to <= from ? 0 : (prefix[to] - prefix[from]) / (to - from)
  }

  for (const dropout of findPauses(analysis, levels, meanBass, BASS_DROP_RATIO)) {
    let overlaps = false
    for (const pause of pauses) {
      if (dropout.start < pause.end && dropout.end > pause.start) overlaps = true
    }
    if (!overlaps) pauses.push(dropout)
  }
}

/** Обычный промежуток между ударами перед этим местом: медиана за несколько секунд. */
function localBeatGap(analysis: AudioAnalysis, time: number): number {
  const gaps: number[] = []
  let previous = -1
  for (const onset of analysis.onsetTimes) {
    if (onset > time) break
    if (onset < time - BEAT_LOOK_BACK_SEC) continue
    if (previous >= 0) gaps.push(onset - previous)
    previous = onset
  }
  if (gaps.length === 0) return 0
  gaps.sort((a, b) => a - b)
  return gaps[Math.floor(gaps.length / 2)]
}

function findImpacts(
  analysis: AudioAnalysis,
  meanLevel: (fromSec: number, toSec: number) => number,
  pauses: Moment[],
): Moment[] {
  const impacts: Moment[] = []

  // После каждой паузы музыка возвращается: это всегда взрыв
  for (const pause of pauses) {
    const time = nearestOnset(analysis, pause.end)
    impacts.push({ kind: 'impact', start: time, end: time })
  }

  const STEP_SEC = 0.1
  let bestTime = -1
  let bestRatio = 0
  const commit = () => {
    if (bestTime < 0) return
    let isFree = true
    for (const impact of impacts) {
      if (Math.abs(impact.start - bestTime) < MIN_IMPACT_GAP_SEC) isFree = false
    }
    if (isFree) {
      const time = nearestOnset(analysis, bestTime)
      impacts.push({ kind: 'impact', start: time, end: time })
    }
    bestTime = -1
    bestRatio = 0
  }

  for (let time = EDGE_SEC; time < analysis.duration - EDGE_SEC; time += STEP_SEC) {
    const before = meanLevel(time - COMPARE_SEC, time)
    const after = meanLevel(time, time + COMPARE_SEC)
    const ratio = after / Math.max(before, 0.05)
    if (ratio >= IMPACT_RATIO && after >= IMPACT_MIN_LEVEL) {
      if (ratio > bestRatio) {
        bestRatio = ratio
        bestTime = time
      }
    } else {
      commit()
    }
  }
  commit()

  impacts.sort((a, b) => a.start - b.start)
  return impacts
}

/**
 * Смена части песни: сравниваем средний спектр до и после каждого момента.
 * Порог считается по самому треку: «заметно» значит «заметно для этой песни».
 */
function addTimbreChanges(analysis: AudioAnalysis, impacts: Moment[]): void {
  const blocks = timbreBlocks(analysis)
  const windowBlocks = Math.round(TIMBRE_WINDOW_SEC / TIMBRE_STEP_SEC)
  const changes = new Float32Array(blocks.length)

  for (let i = windowBlocks; i < blocks.length - windowBlocks; i++) {
    let difference = 0
    for (let band = 0; band < TIMBRE_BANDS; band++) {
      let before = 0
      let after = 0
      for (let j = 1; j <= windowBlocks; j++) {
        before += blocks[i - j][band]
        after += blocks[i + j - 1][band]
      }
      difference += Math.abs(after - before) / windowBlocks
    }
    changes[i] = difference / TIMBRE_BANDS
  }

  // Порог по перцентилю, а не по среднему: одна большая смена части песни
  // не должна скрывать все остальные
  const threshold = Math.max(TIMBRE_MIN_CHANGE, percentile(changes, TIMBRE_PEAK_PERCENTILE))

  // Берём сильнейшие пики, не ближе минимального интервала друг к другу
  const peaks: number[] = []
  for (let i = windowBlocks; i < changes.length - windowBlocks; i++) {
    if (changes[i] >= threshold && changes[i] >= changes[i - 1] && changes[i] > changes[i + 1]) peaks.push(i)
  }
  peaks.sort((a, b) => changes[b] - changes[a])

  for (const peak of peaks) {
    const time = peak * TIMBRE_STEP_SEC
    if (time < EDGE_SEC || time > analysis.duration - EDGE_SEC) continue
    let isFree = true
    for (const impact of impacts) {
      if (Math.abs(impact.start - time) < MIN_IMPACT_GAP_SEC) isFree = false
    }
    if (isFree) {
      const start = nearestOnset(analysis, time)
      impacts.push({ kind: 'impact', start, end: start })
    }
  }
}

/** Средний спектр в крупных полосах с шагом 0,1 с: мелкие колебания здесь не нужны. */
function timbreBlocks(analysis: AudioAnalysis): Float32Array[] {
  const bins = analysis.spectrumBins
  const framesPerBlock = Math.max(1, Math.round(TIMBRE_STEP_SEC * analysis.fps))
  const binsPerBand = Math.floor(bins / TIMBRE_BANDS)
  const count = Math.floor(analysis.frameCount / framesPerBlock)
  const blocks: Float32Array[] = []

  for (let block = 0; block < count; block++) {
    const bands = new Float32Array(TIMBRE_BANDS)
    for (let frame = block * framesPerBlock; frame < (block + 1) * framesPerBlock; frame++) {
      for (let band = 0; band < TIMBRE_BANDS; band++) {
        for (let bin = 0; bin < binsPerBand; bin++) {
          bands[band] += analysis.spectrum[frame * bins + band * binsPerBand + bin]
        }
      }
    }
    for (let band = 0; band < TIMBRE_BANDS; band++) bands[band] /= framesPerBlock * binsPerBand
    blocks.push(bands)
  }
  return blocks
}

/** Плотность звука: средняя высота всего спектра. Растёт, даже когда громкость ровная. */
function fullnessMeter(analysis: AudioAnalysis): (fromSec: number, toSec: number) => number {
  const prefix = new Float64Array(analysis.frameCount + 1)
  for (let frame = 0; frame < analysis.frameCount; frame++) {
    let sum = 0
    for (let bin = 0; bin < analysis.spectrumBins; bin++) sum += analysis.spectrum[frame * analysis.spectrumBins + bin]
    prefix[frame + 1] = prefix[frame] + sum / analysis.spectrumBins
  }
  return (fromSec, toSec) => {
    const from = Math.max(0, Math.round(fromSec * analysis.fps))
    const to = Math.min(analysis.frameCount, Math.round(toSec * analysis.fps))
    return to <= from ? 0 : (prefix[to] - prefix[from]) / (to - from)
  }
}

/** Перед каждым событием смотрим назад, пока плотность звука не перестанет расти. */
function findBuildups(targets: Moment[], meanLevel: (fromSec: number, toSec: number) => number): Moment[] {
  const buildups: Moment[] = []
  for (const target of targets) {
    if (target.kind === 'impact' && isRightAfterPause(target, targets)) continue

    const end = target.start
    let start = end
    while (end - start < BUILDUP_MAX_SEC && start - 1 >= EDGE_SEC) {
      const newer = meanLevel(start - 1, start)
      const older = meanLevel(start - 2, start - 1)
      if (older > newer * 1.02) break
      start -= 1
    }
    if (end - start >= BUILDUP_MIN_SEC && meanLevel(end - 1, end) > meanLevel(start, start + 1) * BUILDUP_MIN_RISE) {
      buildups.push({ kind: 'buildup', start, end })
    }
  }
  return buildups
}

function isRightAfterPause(impact: Moment, moments: Moment[]): boolean {
  for (const moment of moments) {
    if (moment.kind === 'pause' && Math.abs(moment.end - impact.start) < 0.5) return true
  }
  return false
}

/** Притягивает время к ближайшему удару: так событие совпадает с реальным звуком. */
function nearestOnset(analysis: AudioAnalysis, time: number): number {
  const reach = 0.25
  let best = time
  let bestError = reach
  for (const onset of analysis.onsetTimes) {
    const error = Math.abs(onset - time)
    if (error < bestError) {
      bestError = error
      best = onset
    }
  }
  return best
}
