import type { AudioAnalysis } from '../audio/analyzer.ts'
import { beatWeight, pickNoteFrames } from '../game/level.ts'
import {
  findMoments,
  findSections,
  findSoftPulses,
  findSustains,
  songIntensity,
  withoutPulses,
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
  /** Какую долю от самого сильного удара рядом должен набрать удар, чтобы стать нотой. */
  strengthShare: number
  /** Серии стрелок идут не чаще, чем раз в столько секунд. */
  arrowPeriodSec: number
  /** В сильных частях песни каждая какая нота становится парной. 0 — парных нет. */
  pairEvery: number
  /** Самое короткое расстояние между нотами, которое вообще можно сыграть. */
  floorGapSec: number
  /** Сколько нот максимум за любую секунду. */
  maxPerSecond: number
  /** Сколько стрелок максимум в серии. */
  arrowRun: number
  /** На протяжных звуках два луча сразу. */
  doubleHolds: boolean
  canFail: boolean
}

export const DIFFICULTIES: Difficulty[] = [
  { id: 'easy', label: 'Лёгкая', minGapSec: 0.45, strengthShare: 0.88, arrowPeriodSec: 20, pairEvery: 0, floorGapSec: 0.4, maxPerSecond: 2, arrowRun: 3, doubleHolds: false, canFail: false },
  { id: 'normal', label: 'Средняя', minGapSec: 0.28, strengthShare: 0.8, arrowPeriodSec: 12, pairEvery: 16, floorGapSec: 0.26, maxPerSecond: 4, arrowRun: 3, doubleHolds: false, canFail: true },
  { id: 'hard', label: 'Сложная', minGapSec: 0.14, strengthShare: 0.72, arrowPeriodSec: 7, pairEvery: 11, floorGapSec: 0.14, maxPerSecond: 7, arrowRun: 4, doubleHolds: true, canFail: true },
]

/** Каждая какая нота становится звездой, если она не стрелка. */
const STAR_EVERY = 17
/** Короче этого луч теряет смысл. */
const HOLD_MIN_SEC = 0.9
/** Последние секунды разгона, где ноты идут чаще. */
const BUILDUP_RUSH_SEC = 2.5
const BUILDUP_RUSH_GAP = 0.6
/** Узор «лесенка» на разгоне: рука бежит по дорожкам туда и обратно. */
const STAIRS = [0, 1, 2, 1]
/** Вокруг акцента оставляем воздух, чтобы он прозвучал отдельно. */
const ACCENT_CLEAR_SEC = 0.2
/** Выше этой силы песни часть нот становится парными. */
const INTENSE_LEVEL = 0.55
/** С чем сравниваем удар: с самым сильным в такой окрестности. */
const STRENGTH_REACH_SEC = 2
/** В режиме «По голосу» обычному удару нужно быть ещё заметнее. */
const VOICE_FOCUS_BEAT_EXTRA = 0.25
/** В обычном режиме слог становится нотой, только если он сильный: голос поверх ритма. */
const SYLLABLE_EXTRA = 0.25
/** Удары ближе этого играются только ровной дробью, а случайную россыпь не сыграть. */
const FAST_GAP_SEC = 0.17
const EVEN_GAP_TOLERANCE_SEC = 0.04
/** В активной части порог ниже: нотами становятся и звуки потише, игра идёт бодрее. */
const ACTIVE_SHARE_DROP = 0.2
const LEAD_IN_SEC = 1.5
const TAIL_FRAMES = 15
/** Вокруг серии стрелок игра освобождает место: руке нужно время перейти на другие клавиши. */
const ARROW_CLEAR_SEC = 0.3
/** Серия «пам-пам-пам»: неторопливые удары на равном расстоянии. */
const ARROW_MIN_HITS = 3
const ARROW_MIN_GAP_SEC = 0.26
const ARROW_MAX_GAP_SEC = 0.9
const ARROW_EVEN_SHARE = 0.18
/** Во сколько раз удар серии сильнее того, что звучит между ударами. */
const ARROW_MIN_CLARITY = 1.6
/** Сколько секунд перед серией берём для сравнения: удары должны выделяться. */
const ARROW_LOOK_BACK_SEC = 3
/** Парные ноты на смене ритма не чаще этого: иначе акценты теряют вес. */
const MIN_ACCENT_GAP_SEC = 12
/** Смену части ищем рядом с найденным событием, чтобы попасть в реальный удар. */
const SECTION_SNAP_SEC = 1.5
const LONG_PAUSE_SEC = 0.55
/** Длинный звук играется одним лучом, но не бесконечным: рука должна отдыхать. */
const SUSTAIN_HOLD_MAX_SEC = 6
const SUSTAIN_HOLD_GAP_SEC = 0.35
/** Пробел рядом с началом протяжного звука мешает: на этом месте главный луч. */
const SPACE_SUSTAIN_CLEAR_SEC = 1.5
/** Пара дорожек для протяжного звука: всегда одна и та же, крайние. */
const SUSTAIN_LANES = [0, 2]
/** Пробел событие редкое: два рядом обесценивают друг друга. */
const MIN_SPACE_GAP_SEC = 8

/** Что происходило внутри генератора: нужно только странице-рентгену. */
export interface LevelTrace {
  /** Кадры ударов, прошедших порог силы. */
  audible: number[]
  /** Кадры, оставшиеся после минимального расстояния. */
  spaced: number[]
  /** Кадры, оставшиеся после проверки быстрых нот на ровность. */
  even: number[]
  /** Все ноты до последнего предела плотности. */
  beforeLimit: LaneNote[]
}

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
  trace?: LevelTrace,
): LaneNote[] {
  const moments = findMoments(analysis)
  const intensity = songIntensity(analysis)
  const rawSustains = findSustains(analysis)
  const pulses = findSoftPulses(analysis, rawSustains)
  const sustains = withoutPulses(rawSustains, pulses)
  const frames = pickFramesWithMoments(analysis, difficulty, moments, focus, pulses, intensity, trace)
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
  const withArrows = placeArrowSeries(notes, difficulty, analysis, sustains)
  const withPairs = addPairs(withArrows, difficulty, analysis, intensity)
  const withSustains = addSustainHolds(withPairs, difficulty, sustains)
  const withAccents = addAccents(withSustains, moments, sections, sustains)
  if (trace) trace.beforeLimit = withAccents
  return limitDensity(withAccents, difficulty)
}

/** Серия ровных чётких ударов, кандидат на стрелки. */
interface ArrowSeries {
  hits: LaneNote[]
  score: number
}

/**
 * Стрелки ставятся на чёткие удары «пам-пам-пам»: несколько нот на равном
 * расстоянии, между которыми почти ничего не звучит. Никакого таймера: нет таких
 * ударов, нет и стрелок. Сначала берём самые выразительные серии.
 */
function placeArrowSeries(
  notes: LaneNote[],
  difficulty: Difficulty,
  analysis: AudioAnalysis,
  sustains: Moment[],
): LaneNote[] {
  const candidates = findArrowSeries(notes, difficulty, analysis)
  candidates.sort((a, b) => b.score - a.score)

  const chosen: ArrowSeries[] = []
  for (const series of candidates) {
    const start = series.hits[0].time
    if (isNearSustain(start, sustains)) continue
    let isFree = true
    for (const other of chosen) {
      if (Math.abs(other.hits[0].time - start) < difficulty.arrowPeriodSec) isFree = false
    }
    if (isFree) chosen.push(series)
  }
  chosen.sort((a, b) => a.hits[0].time - b.hits[0].time)

  const removed = new Set<LaneNote>()
  let direction = 1
  for (const series of chosen) {
    const first = series.hits[0].time - ARROW_CLEAR_SEC
    const last = series.hits[series.hits.length - 1].time + ARROW_CLEAR_SEC
    for (const note of notes) {
      if (note.time >= first && note.time <= last && !series.hits.includes(note)) removed.add(note)
    }
    for (const hit of series.hits) {
      hit.kind = 'swipe'
      hit.direction = direction
      direction = -direction
    }
  }
  return notes.filter((note) => !removed.has(note))
}

/** Перебирает ноты и собирает все ровные серии с чёткими ударами. */
function findArrowSeries(notes: LaneNote[], difficulty: Difficulty, analysis: AudioAnalysis): ArrowSeries[] {
  const series: ArrowSeries[] = []
  let i = 0
  while (i + 1 < notes.length) {
    const gap = notes[i + 1].time - notes[i].time
    let end = i + 1
    const isUsableGap = gap >= ARROW_MIN_GAP_SEC && gap <= ARROW_MAX_GAP_SEC
    while (isUsableGap && end + 1 < notes.length) {
      const nextGap = notes[end + 1].time - notes[end].time
      if (Math.abs(nextGap - gap) > gap * ARROW_EVEN_SHARE) break
      end += 1
    }

    const length = Math.min(end - i + 1, difficulty.arrowRun)
    if (isUsableGap && end - i + 1 >= ARROW_MIN_HITS) {
      const hits = notes.slice(i, i + length)
      const clarity = seriesClarity(hits, analysis)
      if (clarity >= ARROW_MIN_CLARITY) {
        series.push({ hits, score: clarity * standOut(hits, analysis) })
      }
      // Длинный ровный ряд даёт несколько кандидатов: лучшие выберем по силе
      i += length
    } else {
      i += 1
    }
  }
  return series
}

/** Удар сильнее того, что звучит между ударами: 2 значит вдвое сильнее. */
function seriesClarity(hits: LaneNote[], analysis: AudioAnalysis): number {
  let hitPower = 0
  let betweenPower = 0.01
  for (let i = 0; i < hits.length; i++) {
    const frame = Math.round(hits[i].time * analysis.fps)
    hitPower += peakStrength(analysis, frame - 2, frame + 3) / hits.length
    if (i + 1 < hits.length) {
      const nextFrame = Math.round(hits[i + 1].time * analysis.fps)
      betweenPower = Math.max(betweenPower, peakStrength(analysis, frame + 5, nextFrame - 4))
    }
  }
  return hitPower / betweenPower
}

/** Насколько серия выделяется на фоне секунд перед ней. */
function standOut(hits: LaneNote[], analysis: AudioAnalysis): number {
  const start = Math.round(hits[0].time * analysis.fps)
  const before = Math.max(0, start - Math.round(ARROW_LOOK_BACK_SEC * analysis.fps))
  let sum = 0
  for (let frame = before; frame < start; frame++) sum += analysis.onsetStrength[frame]
  const mean = sum / Math.max(1, start - before)
  return peakStrength(analysis, start - 2, start + 3) / Math.max(mean, 0.01)
}

function peakStrength(analysis: AudioAnalysis, from: number, to: number): number {
  let peak = 0
  const last = Math.min(to, analysis.frameCount)
  for (let frame = Math.max(0, from); frame < last; frame++) peak = Math.max(peak, analysis.onsetStrength[frame])
  return peak
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
 * Какие удары становятся нотами. Каждый сравнивается с самым сильным ударом рядом:
 * остаётся то, что слышно. Частоту никто не задаёт, она получается из самой музыки:
 * где подряд идут равные по силе удары, там ноты частые, где редкие бочки с мелочью
 * между ними, там редкие. Ноты стоят точно на ударах, без выравнивания.
 */
function pickRhythmFrames(
  analysis: AudioAnalysis,
  difficulty: Difficulty,
  focus: NoteFocus,
  intensity: Float32Array,
  trace?: LevelTrace,
): number[] {
  const importance = new Map<number, number>()

  const beats = pickNoteFrames(analysis, 0)
  const beatWeights = beats.map((frame) => beatWeight(analysis, frame))
  const beatShare = difficulty.strengthShare + (focus === 'voice' ? VOICE_FOCUS_BEAT_EXTRA : 0)
  addAudible(importance, beats, beatWeights, beatShare, analysis.fps, intensity)

  if (focus !== 'beat') {
    const syllables: number[] = []
    const lastFrame = analysis.frameCount - TAIL_FRAMES
    for (let frame = Math.round(LEAD_IN_SEC * analysis.fps); frame < lastFrame; frame++) {
      if (analysis.vocalOnsets[frame] === 1) syllables.push(frame)
    }
    const weights = syllables.map((frame) => analysis.vocalStrength[frame])
    const syllableShare = difficulty.strengthShare + (focus === 'voice' ? 0 : SYLLABLE_EXTRA)
    addAudible(importance, syllables, weights, syllableShare, analysis.fps, intensity)
  }

  const candidates = [...importance.keys()]
  candidates.sort((a, b) => (importance.get(b) ?? 0) - (importance.get(a) ?? 0))
  const gapFrames = difficulty.minGapSec * analysis.fps
  const picked: number[] = []
  for (const frame of candidates) {
    let isFree = true
    for (const other of picked) {
      if (Math.abs(other - frame) < gapFrames) isFree = false
    }
    if (isFree) picked.push(frame)
  }
  picked.sort((a, b) => a - b)
  const even = dropUnevenFast(picked, analysis.fps)
  if (trace) {
    trace.audible = candidates
    trace.spaced = picked
    trace.even = even
  }
  return even
}

/** Мягкий пульс тоже становится нотами: детектор ударов его не слышит. */
function addPulses(frames: number[], pulses: number[], fps: number, minGapSec: number): void {
  for (const time of pulses) {
    const frame = Math.round(time * fps)
    let isFree = true
    for (const other of frames) {
      if (Math.abs(other - frame) < minGapSec * fps) isFree = false
    }
    if (isFree) frames.push(frame)
  }
  frames.sort((a, b) => a - b)
}

/** Оставляет удары, близкие по силе к самому сильному в окрестности. */
function addAudible(
  importance: Map<number, number>,
  frames: number[],
  weights: number[],
  share: number,
  fps: number,
  intensity: Float32Array,
): void {
  const reach = STRENGTH_REACH_SEC * fps
  for (let i = 0; i < frames.length; i++) {
    let peak = 0
    for (let j = 0; j < frames.length; j++) {
      if (Math.abs(frames[j] - frames[i]) <= reach) peak = Math.max(peak, weights[j])
    }
    const ratio = peak > 0 ? weights[i] / peak : 0
    const frameIntensity = intensity[Math.min(frames[i], intensity.length - 1)]
    if (ratio >= share - ACTIVE_SHARE_DROP * frameIntensity) importance.set(frames[i], Math.max(importance.get(frames[i]) ?? 0, ratio))
  }
}

/** Быстрые ноты остаются, только если идут ровной дробью: её пальцы и слышат, и успевают. */
function dropUnevenFast(frames: number[], fps: number): number[] {
  const gapAt = (i: number) => (frames[i + 1] - frames[i]) / fps
  const isEvenFast = (i: number) => {
    if (i < 0 || i + 2 >= frames.length) return false
    const isFast = gapAt(i) < FAST_GAP_SEC && gapAt(i + 1) < FAST_GAP_SEC
    return isFast && Math.abs(gapAt(i) - gapAt(i + 1)) <= EVEN_GAP_TOLERANCE_SEC
  }

  const kept: number[] = []
  for (let i = 0; i < frames.length; i++) {
    const previous = kept[kept.length - 1]
    const isClose = previous !== undefined && (frames[i] - previous) / fps < FAST_GAP_SEC
    if (isClose && !isEvenFast(i - 2) && !isEvenFast(i - 1) && !isEvenFast(i)) continue
    kept.push(frames[i])
  }
  return kept
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
  focus: NoteFocus,
  pulses: number[],
  intensity: Float32Array,
  trace?: LevelTrace,
): number[] {
  const picked = pickRhythmFrames(analysis, difficulty, focus, intensity, trace)
  addPulses(picked, pulses, analysis.fps, difficulty.minGapSec)
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
