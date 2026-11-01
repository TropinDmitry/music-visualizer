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

export type MomentKind = 'buildup' | 'pause' | 'impact' | 'sustain'

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
const SUSTAIN_STEP_SEC = 0.25
const SUSTAIN_WINDOW_SEC = 1.5
const SUSTAIN_MIN_SEC = 1.5
const SUSTAIN_MERGE_GAP_SEC = 1
/** Такой промежуток без ударов уже похож на затишье, а не на рисунок ритма. */
const SUSTAIN_QUIET_GAP_SEC = 0.5
/** Мягкая пульсация: сравниваем спектр до и после момента, ударов тут детектор не видит. */
const PULSE_STEP_FRAMES = 3
const PULSE_SIDE_FRAMES = 4
const PULSE_BEFORE_FRAMES = 9
const PULSE_AFTER_FRAMES = 3
const PULSE_MIN_CHANGE = 0.004
/** Изменение должно торчать над соседними: плавный взлёт тона пиков не даёт. */
const PULSE_MIN_PROMINENCE = 1.3
/** Пульс возвращается к тому же звуку. Взлёт тона уходит всё дальше, и это не пульс. */
const PULSE_SAME_SOUND = 0.7
/** Такая смена спектра значит, что музыка стала другой: протяжный звук здесь кончился. */
const BIG_CHANGE = 0.03
/** В такой фразе 16 шагов: по записи живой игры стрелки шли именно с этим периодом. */
const PHRASE_STEPS = 16
const PHRASE_TOLERANCE_SEC = 0.15
/** Если событий на сетке блоков меньше, фраз в песне не видно. */
const PHRASE_MIN_IMPACTS = 3
/** Песня делится на отрезки, и у каждого свой режим: темп и рисунок внутри песни меняются. */
const PART_SEC = 8
/** Ритм выражен ярко, если настоящих ударов в цепочке не меньше этой доли. */
const RHYTHM_HIT_SHARE = 0.6
const RHYTHM_MIN_HITS = 5
/** Шаг короче этого удваиваем: рисунок на него не ляжет, рука не успеет. */
const RHYTHM_MIN_STEP_SEC = 0.6
/** И она должна быть внезапной: плавный взлёт тона меняет спектр постоянно. */
const BIG_CHANGE_SHARPNESS = 3
/** Какой шаг считается пульсом и сколько ударов подряд нужно, чтобы поверить в него. */
const PULSE_MIN_PERIOD_SEC = 0.4
const PULSE_MAX_PERIOD_SEC = 1.2
const PULSE_MIN_HITS = 6
const PULSE_TOLERANCE_SEC = 0.05
/** Соседние протяжные участки ищем как один: пульс идёт и через разрывы между ними. */
const PULSE_JOIN_GAP_SEC = 2
/** Меньше какой доли обычного числа ударов место считается протяжным. */
const SUSTAIN_SPARSE_SHARE = 0.45
const SUSTAIN_MIN_PRESENCE = 0.22
/** На сколько столбиков спектра должен подняться тембр, чтобы это был взлёт. */
const SUSTAIN_RISE_SEC = 1.5
const SUSTAIN_MIN_RISE = 4
/** Окно сравнения силы до и после границы части. */
const SECTION_COMPARE_SEC = 7
const SECTION_MIN_JUMP = 0.22
const SECTION_MIN_SEC = 12
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

/**
 * Протяжные участки: звук есть, а отдельных ударов мало, либо тембр плавно ползёт
 * вверх, как взлёт перед дропом. Отдельными нотами такое не сыграть, это работа
 * для длинных лучей.
 */
/** Момент, когда спектр заметно поменялся, и размер этой перемены. */
export interface SoundChange {
  time: number
  size: number
  /** Во сколько раз перемена больше, чем было рядом. */
  sharpness: number
}

export function findSustains(analysis: AudioAnalysis): Moment[] {
  const fps = analysis.fps
  const stepFrames = Math.round(SUSTAIN_STEP_SEC * fps)
  const windowFrames = Math.round(SUSTAIN_WINDOW_SEC * fps)
  const blockCount = Math.floor(analysis.frameCount / stepFrames)

  const onsetCounts = new Float32Array(blockCount)
  const brightness = new Float32Array(blockCount)
  const presence = new Float32Array(blockCount)
  for (let block = 0; block < blockCount; block++) {
    const from = Math.max(0, block * stepFrames - windowFrames / 2)
    const to = Math.min(analysis.frameCount, block * stepFrames + windowFrames / 2)
    let weighted = 0
    let total = 0
    let mids = 0
    for (let frame = from; frame < to; frame++) {
      onsetCounts[block] += analysis.onsets[frame]
      mids += analysis.mid[frame] + analysis.treble[frame]
      const row = frame * analysis.spectrumBins
      for (let bin = 0; bin < analysis.spectrumBins; bin++) {
        weighted += bin * analysis.spectrum[row + bin]
        total += analysis.spectrum[row + bin]
      }
    }
    brightness[block] = total > 0 ? weighted / total : 0
    presence[block] = mids / Math.max(1, (to - from) * 2)
  }

  const typicalOnsets = percentile(onsetCounts, 0.5)
  const riseBlocks = Math.round(SUSTAIN_RISE_SEC / SUSTAIN_STEP_SEC)
  const isSustained = new Uint8Array(blockCount)
  for (let block = 0; block < blockCount; block++) {
    if (presence[block] < SUSTAIN_MIN_PRESENCE) continue
    const isSparse = onsetCounts[block] <= typicalOnsets * SUSTAIN_SPARSE_SHARE
    const past = block - riseBlocks
    const isRising = past >= 0 && brightness[block] - brightness[past] >= SUSTAIN_MIN_RISE
    if (isSparse || isRising) isSustained[block] = 1
  }

  const sustains: Moment[] = []
  let block = 0
  while (block < blockCount) {
    if (!isSustained[block]) {
      block += 1
      continue
    }
    let end = block
    while (end + 1 < blockCount && isSustained[end + 1]) end += 1
    // Окно подсчёта ударов смотрит и назад, поэтому участок признаётся протяжным
    // с опозданием на половину окна. Возвращаем начало к удару, с которого звук пошёл.
    const detected = (block * stepFrames) / fps
    const start = soundStart(analysis, detected)
    const stop = ((end + 1) * stepFrames) / fps
    if (stop - start >= SUSTAIN_MIN_SEC) sustains.push({ kind: 'sustain', start, end: stop })
    block = end + 1
  }
  return mergeClose(sustains)
}

/**
 * Внутри протяжного участка может идти мягкий ровный пульс: звук тянется, но
 * меняется в ритме, и играть его лучом неправильно. Удары тут слабые, поэтому ищем
 * сами изменения спектра и верим им, только если они идут ровной цепочкой:
 * случайные изменения в цепочку не складываются.
 */
export function findSoftPulses(analysis: AudioAnalysis, sustains: Moment[]): number[] {
  const pulses: number[] = []
  let first = 0
  while (first < sustains.length) {
    let last = first
    while (last + 1 < sustains.length && sustains[last + 1].start - sustains[last].end <= PULSE_JOIN_GAP_SEC) last += 1
    const peaks = spectrumChanges(analysis, sustains[first].start, sustains[last].end).map((peak) => peak.time)
    const chain = longestChain(peaks)
    if (chain.length > 0 && staysTheSameSound(analysis, chain)) pulses.push(...extendBack(chain, sustains))
    first = last + 1
  }
  return pulses
}

/** Отрезок песни: chain — ровная цепочка ударов, если ритм выражен, иначе пусто. */
export interface SongPart {
  start: number
  end: number
  chain: number[]
}

/**
 * Решает для каждого отрезка, идти за ритмом или за яркими звуками. Ритм берём,
 * только если он выражен: почти каждый шаг цепочки попадает в настоящий удар.
 * Участки с лучами и мягким пульсом пропускаем, у них свой рисунок.
 */
export function findSongParts(analysis: AudioAnalysis, sustains: Moment[], softPulses: number[]): SongPart[] {
  const parts: SongPart[] = []
  for (let start = 0; start < analysis.duration; start += PART_SEC) {
    const end = Math.min(analysis.duration, start + PART_SEC)
    const isBusy = sustains.some((sustain) => sustain.start < end && sustain.end > start)
    const hasPulse = softPulses.some((time) => time >= start && time < end)
    const peaks = analysis.onsetTimes.filter((time) => time >= start && time < end)
    const chain = isBusy || hasPulse ? [] : longestChain(peaks, RHYTHM_MIN_HITS)

    let hits = 0
    for (const time of chain) {
      if (peaks.includes(time)) hits += 1
    }
    const isClear = chain.length > 0 && hits / chain.length >= RHYTHM_HIT_SHARE
    parts.push({ start, end, chain: isClear ? longEnoughStep(chain) : [] })
  }
  return parts
}

function longEnoughStep(chain: number[]): number[] {
  const step = (chain[chain.length - 1] - chain[0]) / (chain.length - 1)
  if (step >= RHYTHM_MIN_STEP_SEC) return chain
  return chain.filter((_, index) => index % 2 === 0)
}

/**
 * Где кончаются фразы. Музыка строится блоками по 16 шагов, и сильные события песни
 * приходятся на их границы. Каждое событие пробуем как опору и берём ту, от которой
 * ровным шагом блоков попадается больше всего других событий.
 */
export function findPhraseEnds(analysis: AudioAnalysis, chains: number[][], moments: Moment[]): number[] {
  const steps: number[] = []
  for (const chain of chains) {
    for (let i = 0; i + 1 < chain.length; i++) steps.push(chain[i + 1] - chain[i])
  }
  const impacts = moments.filter((moment) => moment.kind === 'impact').map((moment) => moment.start)
  if (steps.length === 0 || impacts.length === 0) return []
  steps.sort((a, b) => a - b)
  const phrase = steps[Math.floor(steps.length / 2)] * PHRASE_STEPS

  let anchor = impacts[0]
  let bestCount = 0
  for (const impact of impacts) {
    let count = 0
    for (const other of impacts) {
      const blocks = Math.round((other - impact) / phrase)
      if (Math.abs(other - impact - blocks * phrase) <= PHRASE_TOLERANCE_SEC) count += 1
    }
    if (count > bestCount) {
      bestCount = count
      anchor = impact
    }
  }
  if (bestCount < PHRASE_MIN_IMPACTS) return []

  const isPlayed = (time: number) =>
    chains.some((chain) => chain.length > 0 && time >= chain[0] && time <= chain[chain.length - 1] + phrase / PHRASE_STEPS)
  const ends: number[] = []
  const first = anchor - Math.floor(anchor / phrase) * phrase
  for (let time = first; time < analysis.duration; time += phrase) {
    if (isPlayed(time - phrase / PHRASE_STEPS)) ends.push(time)
  }
  return ends
}

/** Режет протяжные участки там, где звук резко сменился. */
export function splitAtBigChanges(analysis: AudioAnalysis, sustains: Moment[]): Moment[] {
  const result: Moment[] = []
  for (const sustain of sustains) {
    let start = sustain.start
    for (const change of spectrumChanges(analysis, sustain.start, sustain.end)) {
      const isBig = change.size >= BIG_CHANGE && change.sharpness >= BIG_CHANGE_SHARPNESS
      if (!isBig || change.time - start < SUSTAIN_MIN_SEC) continue
      result.push({ ...sustain, start, end: change.time })
      start = change.time
    }
    if (sustain.end - start >= SUSTAIN_MIN_SEC) result.push({ ...sustain, start })
  }
  return result
}

/** Убирает из протяжных участков отрезки с пульсом: там не луч, а ноты. */
export function withoutPulses(sustains: Moment[], pulses: number[]): Moment[] {
  const result: Moment[] = []
  for (const sustain of sustains) {
    const inside = pulses.filter((time) => time >= sustain.start && time <= sustain.end)
    if (inside.length === 0) {
      result.push(sustain)
      continue
    }
    const before = inside[0] - sustain.start
    const after = sustain.end - inside[inside.length - 1]
    if (before >= SUSTAIN_MIN_SEC) result.push({ ...sustain, end: inside[0] })
    if (after >= SUSTAIN_MIN_SEC) result.push({ ...sustain, start: inside[inside.length - 1] })
  }
  return result
}

/** Сравнивает звук в начале и в конце цепочки. */
function staysTheSameSound(analysis: AudioAnalysis, chain: number[]): boolean {
  const start = spectrumAround(analysis, Math.round(chain[0] * analysis.fps))
  const end = spectrumAround(analysis, Math.round(chain[chain.length - 1] * analysis.fps))
  return similarity(start, end) >= PULSE_SAME_SOUND
}

/** Моменты на отрезке, где спектр заметно меняется. */
function spectrumChanges(analysis: AudioAnalysis, fromSec: number, toSec: number): SoundChange[] {
  const from = Math.max(PULSE_BEFORE_FRAMES, Math.round(fromSec * analysis.fps))
  const to = Math.min(analysis.frameCount - PULSE_SIDE_FRAMES - PULSE_AFTER_FRAMES, Math.round(toSec * analysis.fps))
  const frames: number[] = []
  const changes: number[] = []
  for (let frame = from; frame < to; frame += PULSE_STEP_FRAMES) {
    const before = spectrumAround(analysis, frame - PULSE_BEFORE_FRAMES)
    const after = spectrumAround(analysis, frame + PULSE_AFTER_FRAMES)
    frames.push(frame)
    changes.push(1 - similarity(before, after))
  }

  const peaks: SoundChange[] = []
  for (let i = 2; i + 2 < changes.length; i++) {
    const isPeak = changes[i] > changes[i - 1] && changes[i] >= changes[i + 1] && changes[i] > changes[i - 2]
    const valley = Math.min(changes[i - 2], changes[i + 2])
    const isProminent = changes[i] >= valley * PULSE_MIN_PROMINENCE
    if (isPeak && isProminent && changes[i] > PULSE_MIN_CHANGE) {
      peaks.push({ time: frames[i] / analysis.fps, size: changes[i], sharpness: changes[i] / Math.max(valley, 1e-6) })
    }
  }
  return peaks
}

/** Спектр нескольких кадров. Корень уравнивает тихие полосы с громкими. */
function spectrumAround(analysis: AudioAnalysis, start: number): Float32Array {
  const bins = analysis.spectrumBins
  const sum = new Float32Array(bins)
  for (let frame = start; frame < start + PULSE_SIDE_FRAMES; frame++) {
    for (let bin = 0; bin < bins; bin++) sum[bin] += Math.sqrt(analysis.spectrum[frame * bins + bin])
  }
  return sum
}

function similarity(a: Float32Array, b: Float32Array): number {
  let product = 0
  let squareA = 0
  let squareB = 0
  for (let i = 0; i < a.length; i++) {
    product += a[i] * b[i]
    squareA += a[i] * a[i]
    squareB += b[i] * b[i]
  }
  return squareA > 0 && squareB > 0 ? product / Math.sqrt(squareA * squareB) : 1
}

/** Первый найденный удар бывает не первым: тянем пульс назад до начала своего участка. */
function extendBack(chain: number[], sustains: Moment[]): number[] {
  const period = (chain[chain.length - 1] - chain[0]) / (chain.length - 1)
  let earliest = 0
  for (const sustain of sustains) {
    if (sustain.start <= chain[0]) earliest = sustain.start
  }
  const result = [...chain]
  while (result[0] - period >= earliest + PULSE_TOLERANCE_SEC) result.unshift(result[0] - period)
  return result
}

/**
 * Лучшая ровная цепочка: перебираем начало и шаг. Считаем только настоящие удары,
 * а при равенстве берём шаг длиннее, иначе половинный шаг выиграл бы за счёт
 * придуманных ударов между настоящими.
 */
function longestChain(peaks: number[], minHits = PULSE_MIN_HITS): number[] {
  let best: number[] = []
  let bestHits = 0
  for (const start of peaks) {
    for (let period = PULSE_MIN_PERIOD_SEC; period <= PULSE_MAX_PERIOD_SEC; period += 0.01) {
      const chain = walkChain(peaks, start, period)
      let hits = 0
      for (const time of chain) {
        if (peaks.includes(time)) hits += 1
      }
      if (hits >= bestHits) {
        best = chain
        bestHits = hits
      }
    }
  }
  return bestHits >= minHits ? best : []
}

/** Идёт от удара с шагом. Один пропуск прощаем: мягкий удар мог не найтись. */
function walkChain(peaks: number[], start: number, period: number): number[] {
  const chain = [start]
  let misses = 0
  while (misses < 2) {
    const expected = chain[chain.length - 1] + period
    let found = -1
    for (const peak of peaks) {
      if (Math.abs(peak - expected) <= PULSE_TOLERANCE_SEC) found = peak
    }
    if (found >= 0) {
      chain.push(found)
      misses = 0
    } else {
      chain.push(expected)
      misses += 1
    }
  }
  // Хвост из пропусков цепочке не принадлежит
  return chain.slice(0, chain.length - misses)
}

/**
 * Где начался протяжный звук. Обычно это последний удар перед затишьем: дальше
 * играет только протяжка. Если ударов рядом нет, берём самую сильную смену звука.
 */
function soundStart(analysis: AudioAnalysis, detected: number): number {
  const from = detected - SUSTAIN_WINDOW_SEC
  const to = detected + SUSTAIN_WINDOW_SEC / 2
  const onsets = analysis.onsetTimes
  for (let i = 0; i < onsets.length; i++) {
    if (onsets[i] < from || onsets[i] > to) continue
    const next = i + 1 < onsets.length ? onsets[i + 1] : analysis.duration
    if (next - onsets[i] >= SUSTAIN_QUIET_GAP_SEC) return onsets[i]
  }

  let best: SoundChange | null = null
  for (const change of spectrumChanges(analysis, from, to)) {
    if (!best || change.size > best.size) best = change
  }
  return best ? best.time : detected
}

/** Соседние протяжные участки с крошечным разрывом это один звук. */
function mergeClose(sustains: Moment[]): Moment[] {
  const merged: Moment[] = []
  for (const sustain of sustains) {
    const previous = merged[merged.length - 1]
    if (previous && sustain.start - previous.end <= SUSTAIN_MERGE_GAP_SEC) previous.end = sustain.end
    else merged.push({ ...sustain })
  }
  return merged
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
