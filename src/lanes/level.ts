import type { AudioAnalysis } from '../audio/analyzer.ts'
import { beatWeight, pickNoteFrames } from '../game/level.ts'
import {
  findMoments,
  findPhraseEnds,
  findSections,
  findSoftPulses,
  findSongParts,
  findSustains,
  songIntensity,
  splitAtBigChanges,
  withoutPulses,
  type Moment,
  type SongPart,
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
  /** Только у свайпа: -1 влево, 1 вправо, 0 вверх. Зависит от дорожки. */
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
  /** Что звучит на каждом шаге ритма: доли шага, на которых ноты стоят всегда. */
  pulsePattern: number[]
  /** Лесенки и лучи вместе с нотами: только там, где пальцы уже натренированы. */
  isAdvanced: boolean
  /** Сколько стрелок максимум в серии. */
  arrowRun: number
  /** На протяжных звуках два луча сразу. */
  doubleHolds: boolean
  canFail: boolean
}

export const DIFFICULTIES: Difficulty[] = [
  { id: 'easy', label: 'Лёгкая', minGapSec: 0.45, strengthShare: 0.88, pulsePattern: [0], isAdvanced: false, arrowPeriodSec: 20, pairEvery: 0, floorGapSec: 0.4, maxPerSecond: 2, arrowRun: 3, doubleHolds: false, canFail: false },
  { id: 'normal', label: 'Средняя', minGapSec: 0.28, strengthShare: 0.8, pulsePattern: [0, 0.5], isAdvanced: false, arrowPeriodSec: 12, pairEvery: 16, floorGapSec: 0.26, maxPerSecond: 4, arrowRun: 3, doubleHolds: false, canFail: true },
  { id: 'hard', label: 'Сложная', minGapSec: 0.14, strengthShare: 0.72, pulsePattern: [0, 0.5], isAdvanced: true, arrowPeriodSec: 7, pairEvery: 11, floorGapSec: 0.14, maxPerSecond: 7, arrowRun: 4, doubleHolds: true, canFail: true },
]

/** Каждая какая нота становится звездой, если она не стрелка. */
const STAR_EVERY = 17
/** Короче этого луч теряет смысл. */
const HOLD_MIN_SEC = 0.9
const HOLD_MAX_SEC = 2.5
/** Примерно через столько нот обычная нота становится нотой с лучом. */
const HOLD_EVERY = 14
/** Каждый такой луч на сложной сложности двойной. */
const DOUBLE_HOLD_EVERY = 3
const HOLD_END_GAP_SEC = 0.1
/** Огрызок луча перед пробелом не нужен. */
const SPACE_TRIMMED_HOLD_MIN_SEC = 0.5
/** Луч на доле: такая часть шага, как в живой игре. */
const BEAT_HOLD_SHARE = 0.8
const BEAT_HOLD_REST_SEC = 0.5
const SWELL_LOOK_FRAMES = 20
const SWELL_RATIO = 1.25
const TRIPLE_WINDOW_SEC = 0.9
/** Последние секунды разгона, где ноты идут чаще. */
const BUILDUP_RUSH_SEC = 2.5
const BUILDUP_RUSH_GAP = 0.6
/** Узор «лесенка» на разгоне: рука бежит по дорожкам туда и обратно. */
const STAIRS = [0, 1, 2, 1]
/** Шаг ритма делится на столько долей: на них встают и удары, и рисунок. */
const STEP_SLOTS = 4
const SHORT_STEP_SEC = 0.75
/** Ниже этой силы часть спокойная, выше второй мощная: лесенки только в мощной. */
const CALM_LEVEL = 0.3
const ACTIVE_LEVEL = 0.6
/** В каждой такой фразе самый насыщенный шаг становится лесенкой. */
const PHRASE_STEPS = 4
/** Сколько настоящих ударов нужно в шаге, чтобы лесенка была под музыку. */
const LADDER_MIN_HITS = 2
/** Ноты дальше этого уже не одна серия пальцев. */
const ROLL_MAX_GAP_SEC = 0.5
const ROLL_BACK_EVERY = 3
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
const CHANGE_NEAR_ONSET_SEC = 0.1
const PITCH_LOOK_AHEAD_FRAMES = 4
/** С какими нотами вокруг сравниваем высоту. */
const PITCH_REACH_SEC = 2
/** Меньше трёх полутонов разброса это одна нота, а не ход мелодии. */
const PITCH_MIN_RANGE = 3
/** Дальше этого соседние удары пульса принадлежат разным отрезкам. */
const PULSE_MAX_STEP_SEC = 1.3
/** Сильный удар сразу перед пульсом остаётся нотой. */
const PULSE_EDGE_SEC = 0.05
const EVEN_GAP_TOLERANCE_SEC = 0.04
/** В активной части порог ниже, в спокойной выше: так плотность идёт за силой песни. */
const ACTIVE_SHARE_DROP = 0.3
const CALM_SHARE_RISE = 0.12
const LEAD_IN_SEC = 1.5
/** Раньше этого нот нет: песня только началась. */
const FIRST_NOTE_SEC = 3
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
/** За сколько секунд до конца фразы идут стрелки и сколько места вокруг них оставить. */
const PHRASE_ARROW_LEADS = [1.03, 0.64, 0.34]
const PHRASE_ARROW_CLEAR_SEC = 0.2
/** Порядок дорожек в тройке меняется от серии к серии. */
const ARROW_LANE_ORDERS = [
  [0, 2, 1],
  [2, 0, 1],
  [1, 0, 2],
  [1, 2, 0],
]
/** Парные ноты на смене ритма не чаще этого: иначе акценты теряют вес. */
const MIN_ACCENT_GAP_SEC = 12
/** Смену части ищем рядом с найденным событием, чтобы попасть в реальный удар. */
const SECTION_SNAP_SEC = 1.5
const LONG_PAUSE_SEC = 0.55
/** Длинный звук играется одним лучом, но не бесконечным: рука должна отдыхать. */
const SUSTAIN_HOLD_MAX_SEC = 6
const SUSTAIN_HOLD_GAP_SEC = 0.35
const SUSTAIN_END_KEEP_SEC = 0.1
/** Такая тишина перед лучом уже заметна как опоздание, а дальше это другая часть песни. */
const SUSTAIN_LATE_SEC = 1.2
const SUSTAIN_STRETCH_SEC = 3
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
  /** Кадры нот мелодии, ставших кандидатами. */
  changes: number[]
  /** Кадры, оставшиеся после минимального расстояния. */
  spaced: number[]
  /** Кадры, оставшиеся после проверки быстрых нот на ровность. */
  even: number[]
  /** Отрезки песни и их режимы. */
  parts: SongPart[]
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
  const rawSustains = splitAtBigChanges(analysis, findSustains(analysis))
  const pulses = findSoftPulses(analysis, rawSustains)
  const sustains = withoutPulses(rawSustains, pulses)
  const parts = findSongParts(analysis, sustains, pulses)
  const picked = pickFramesWithMoments(analysis, difficulty, moments, focus, intensity, trace)
  const softChains = focus === 'voice' ? [] : splitPulses(pulses)
  const chains = focus === 'voice' ? [] : parts.map((part) => part.chain)
  const heard = difficulty.isAdvanced ? allHeardFrames(analysis, picked) : picked
  const { frames, ladder, rhythmic, beats } = arrangeRhythm(picked, heard, softChains, chains, analysis.fps, difficulty, intensity)
  // Сетка ритма начинается с нуля, а человеку нужно время взять руки на клавиши
  const firstFrame = FIRST_NOTE_SEC * analysis.fps
  const allowed = frames.filter((frame) => frame >= firstFrame && isAllowed(frame / analysis.fps, moments))
  if (trace) trace.parts = parts
  const rollLanes = difficulty.isAdvanced ? chooseRollLanes(rhythmic, analysis.fps) : new Map<number, number>()
  const lanes = chooseLanes(analysis, allowed)

  const notes: LaneNote[] = []
  let stairStep = 0
  for (let i = 0; i < allowed.length; i++) {
    const time = allowed[i] / analysis.fps
    let lane = rollLanes.get(allowed[i]) ?? lanes[i]
    if (isInRush(time, moments) && !rollLanes.has(allowed[i])) {
      lane = STAIRS[stairStep % STAIRS.length]
      stairStep += 1
    }
    const kind: NoteKind = (i + 1) % STAR_EVERY === 0 ? 'star' : 'tap'
    notes.push({ id: i, time, lane, kind, direction: 0 })
  }

  markLastNotesBeforePauses(notes, moments)
  const sections = findSections(analysis, intensity)
  const phraseEnds = focus === 'voice' ? [] : findPhraseEnds(analysis, [...softChains, ...chains], moments)
  const withArrows =
    phraseEnds.length > 0
      ? placePhraseArrows(notes, phraseEnds, difficulty, sustains, moments, (time) => intensityAt(intensity, time, analysis.fps))
      : placeArrowSeries(notes, difficulty, analysis, sustains)
  const ladderFrames = new Set(ladder)
  const isLadder = (note: LaneNote) => ladderFrames.has(Math.round(note.time * analysis.fps))
  const withPairs = addPairs(withArrows, difficulty, analysis, intensity, isLadder)
  const withSustains = addSustainHolds(withPairs, difficulty, sustains)
  const rhythmicFrames = new Set(rhythmic)
  const withHolds = addHolds(withSustains, difficulty, moments, isLadder, analysis, beats, rhythmicFrames)
  const withAccents = addAccents(withHolds, moments, sections, sustains)
  if (trace) trace.beforeLimit = withAccents
  // Последним: предыдущие шаги убирают ноты, и соседями могут оказаться ноты с одной дорожки
  return avoidTriples(dropNotesUnderBeams(trimBeamsAtSpaces(limitDensity(withAccents, difficulty))), isLadder)
}

/**
 * Живая игра показала: стрелки идут тройкой перед концом фразы, как подводка к
 * следующему блоку. Смещения взяты из записи, в секундах от конца фразы.
 */
function placePhraseArrows(
  notes: LaneNote[],
  phraseEnds: number[],
  difficulty: Difficulty,
  sustains: Moment[],
  moments: Moment[],
  levelAt: (time: number) => number,
): LaneNote[] {
  let result = notes
  let serie = 0
  const arrows: LaneNote[] = []
  const count = Math.min(difficulty.arrowRun, PHRASE_ARROW_LEADS.length)
  const leads = PHRASE_ARROW_LEADS.slice(PHRASE_ARROW_LEADS.length - count)
  for (const end of phraseEnds) {
    const isPause = leads.some((lead) => end - lead < FIRST_NOTE_SEC || !isAllowed(end - lead, moments))
    if (isPause || levelAt(end - leads[0]) < CALM_LEVEL || isNearSustain(end - leads[0], sustains)) continue
    const first = end - leads[0] - PHRASE_ARROW_CLEAR_SEC
    const last = end - leads[leads.length - 1] + PHRASE_ARROW_CLEAR_SEC
    result = result.filter((note) => note.time < first || note.time > last)
    const lanes = ARROW_LANE_ORDERS[serie % ARROW_LANE_ORDERS.length]
    serie += 1
    leads.forEach((lead, index) => {
      const lane = lanes[index % lanes.length]
      arrows.push({ id: 0, time: end - lead, lane, kind: 'swipe', direction: arrowDirection(lane) })
    })
  }
  const merged = [...result, ...arrows]
  merged.sort((a, b) => a.time - b.time)
  return merged
}

/** Стрелка показывает туда, где стоит: слева влево, справа вправо, по центру вверх. */
function arrowDirection(lane: number): number {
  return lane - 1
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
  for (const series of chosen) {
    const first = series.hits[0].time - ARROW_CLEAR_SEC
    const last = series.hits[series.hits.length - 1].time + ARROW_CLEAR_SEC
    for (const note of notes) {
      if (note.time >= first && note.time <= last && !series.hits.includes(note)) removed.add(note)
    }
    for (const hit of series.hits) {
      hit.kind = 'swipe'
      hit.direction = arrowDirection(hit.lane)
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
 * Обычная нота время от времени становится нотой с лучом. На сложной сложности
 * остальные дорожки продолжают играть: держишь одну и нажимаешь другие.
 * Лесенку луч не перекрывает, иначе из неё выпадут ступени.
 */
function addHolds(
  notes: LaneNote[],
  difficulty: Difficulty,
  moments: Moment[],
  isLadder: (note: LaneNote) => boolean,
  analysis: AudioAnalysis,
  beats: Map<number, number>,
  rhythmic: Set<number>,
): LaneNote[] {
  const result: LaneNote[] = []
  const skipped = new Set<LaneNote>()
  let notesSinceHold = 0
  let holdCount = 0
  let lastHoldEnd = 0

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i]
    if (skipped.has(note)) continue
    notesSinceHold += 1
    const frame = Math.round(note.time * analysis.fps)
    const isFree = note.kind === 'tap' && !isInRush(note.time, moments) && note.time >= lastHoldEnd
    let duration = 0
    if (isFree && rhythmic.has(frame)) {
      // В ритме луч ставит сам звук: на сильной доле он нарастает и тянется
      const step = beats.get(frame)
      if (step && soundSwells(analysis, frame)) duration = step * BEAT_HOLD_SHARE
    } else if (isFree && notesSinceHold >= HOLD_EVERY && !isLadder(note)) {
      // Луч по счётчику не заходит на ритм: там лучи ставит сам звук
      const isBusy = (other: LaneNote) => isLadder(other) || rhythmic.has(Math.round(other.time * analysis.fps))
      const possible = holdDuration(notes, i, moments, isBusy)
      if (possible >= HOLD_MIN_SEC) duration = possible
    }
    if (duration === 0) {
      result.push(note)
      continue
    }

    holdCount += 1
    notesSinceHold = 0
    lastHoldEnd = note.time + duration + BEAT_HOLD_REST_SEC
    const isDouble = difficulty.doubleHolds && holdCount % DOUBLE_HOLD_EVERY === 0
    const lanes = isDouble ? [note.lane, (note.lane + 1) % 3] : [note.lane]
    for (const lane of lanes) result.push({ ...note, lane, kind: 'hold', duration })

    // На простых сложностях рука одна: пока держишь луч, других нот нет
    for (let j = i + 1; j < notes.length && notes[j].time < note.time + duration; j++) {
      if (lanes.includes(notes[j].lane) || !difficulty.isAdvanced) skipped.add(notes[j])
    }
  }
  return result
}

/** Пробел идёт на все дорожки: луч заканчивается до него, чтобы ничего не пересекалось. */
function trimBeamsAtSpaces(notes: LaneNote[]): LaneNote[] {
  const spaces = notes.filter((note) => note.kind === 'space')
  const result: LaneNote[] = []
  for (const note of notes) {
    if (note.kind !== 'hold') {
      result.push(note)
      continue
    }
    let end = note.time + (note.duration ?? 0)
    for (const space of spaces) {
      if (space.time >= note.time && space.time < end) end = space.time - HOLD_END_GAP_SEC
    }
    const duration = end - note.time
    if (duration >= SPACE_TRIMMED_HOLD_MIN_SEC) result.push({ ...note, duration })
  }
  return result
}

/** На дорожке луча не должно быть ничего другого: это сбивает с толку. */
function dropNotesUnderBeams(notes: LaneNote[]): LaneNote[] {
  return notes.filter((note, index) => {
    if (note.kind === 'hold' || note.kind === 'space') return true
    return !isLaneHeld(notes, index, note.lane)
  })
}

/** Третья нота подряд на той же дорожке скучна, сдвигаем её на свободную. */
function avoidTriples(notes: LaneNote[], isLadder: (note: LaneNote) => boolean): LaneNote[] {
  const result = notes.map((note) => ({ ...note }))
  for (let i = 2; i < result.length; i++) {
    const note = result[i]
    if (note.kind !== 'tap' && note.kind !== 'star') continue
    if (isLadder(note) || result[i - 1].lane !== note.lane || result[i - 2].lane !== note.lane) continue
    if (note.time - result[i - 2].time >= TRIPLE_WINDOW_SEC) continue
    for (const lane of [(note.lane + 1) % 3, (note.lane + 2) % 3]) {
      if (!isLaneHeld(result, i, lane)) {
        note.lane = lane
        break
      }
    }
  }
  return result
}

/** Идёт ли по дорожке луч в момент этой ноты. */
function isLaneHeld(notes: LaneNote[], index: number, lane: number): boolean {
  const time = notes[index].time
  for (let i = index - 1; i >= 0 && time - notes[i].time < SUSTAIN_HOLD_MAX_SEC; i--) {
    const isHold = notes[i].kind === 'hold' && notes[i].lane === lane
    if (isHold && notes[i].time + (notes[i].duration ?? 0) > time) return true
  }
  return false
}

/** Звук после доли заметно растёт: так выглядит долгий аккорд, а не короткий удар. */
function soundSwells(analysis: AudioAnalysis, frame: number): boolean {
  const later = Math.min(frame + SWELL_LOOK_FRAMES, analysis.frameCount - 1)
  return analysis.mid[later] >= analysis.mid[frame] * SWELL_RATIO
}

/** Сколько можно держать: до ближайшей подходящей ноты, не заходя на лесенку и паузу. */
function holdDuration(
  notes: LaneNote[],
  start: number,
  moments: Moment[],
  isBusy: (note: LaneNote) => boolean,
): number {
  let end = notes[start].time + HOLD_MAX_SEC
  for (let j = start + 1; j < notes.length && notes[j].time < end; j++) {
    if (isBusy(notes[j]) || notes[j].kind === 'hold') end = notes[j].time - HOLD_END_GAP_SEC
  }
  for (const moment of moments) {
    if (moment.kind === 'pause' && moment.start > notes[start].time && moment.start < end) end = moment.start
  }
  return end - notes[start].time
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
    // Конец не трогаем: звук кончается ударом, и этот удар и есть нота
    result = result.filter((note) => note.time < start || note.time >= sustain.end - SUSTAIN_END_KEEP_SEC)

    // Если перед лучом игра уже молчит, он начинается с последней ноты: иначе выйдет с опозданием
    const previous = lastNoteBefore(result, sustain.start)
    const silence = previous ? sustain.start - previous.time : 0
    const startsEarlier = previous !== null && silence >= SUSTAIN_LATE_SEC && silence <= SUSTAIN_STRETCH_SEC
    if (startsEarlier) result = result.filter((note) => note.time !== previous.time)

    let time = startsEarlier ? previous.time : sustain.start
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

function lastNoteBefore(notes: LaneNote[], time: number): LaneNote | null {
  let last: LaneNote | null = null
  for (const note of notes) {
    if (note.time < time && (note.kind === 'tap' || note.kind === 'star' || note.kind === 'accent')) last = note
  }
  return last
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

  // Смена ноты в риффе не даёт прироста громкости, поэтому мелодия идёт отдельно
  const melodyFrames: number[] = []
  const melodyStrengths: number[] = []
  if (focus !== 'voice') {
    const lastTime = analysis.duration - TAIL_FRAMES / analysis.fps
    const { noteTimes, noteStrengths } = analysis.melody
    for (let i = 0; i < noteTimes.length; i++) {
      if (noteTimes[i] < LEAD_IN_SEC || noteTimes[i] > lastTime) continue
      const frame = Math.round(noteTimes[i] * analysis.fps)
      // Рядом уже есть удар: он точнее по времени
      if (hasOnsetNear(analysis, frame)) continue
      melodyFrames.push(frame)
      melodyStrengths.push(noteStrengths[i])
    }
  }
  addAudible(importance, melodyFrames, melodyStrengths, difficulty.strengthShare, analysis.fps, intensity)

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
    trace.changes = melodyFrames
    trace.spaced = picked
    trace.even = even
  }
  return even
}

function hasOnsetNear(analysis: AudioAnalysis, frame: number): boolean {
  const reach = Math.round(CHANGE_NEAR_ONSET_SEC * analysis.fps)
  const to = Math.min(analysis.frameCount - 1, frame + reach)
  for (let i = Math.max(0, frame - reach); i <= to; i++) {
    if (analysis.onsets[i] === 1) return true
  }
  return false
}

/** Мягкий пульс лежит одним списком: разрезаем его на отдельные цепочки. */
function splitPulses(pulses: number[]): number[][] {
  const chains: number[][] = []
  let chain: number[] = []
  for (const time of pulses) {
    if (chain.length > 0 && time - chain[chain.length - 1] > PULSE_MAX_STEP_SEC) {
      chains.push(chain)
      chain = []
    }
    chain.push(time)
  }
  if (chain.length > 0) chains.push(chain)
  return chains
}

/**
 * Там, где ритм выражен, ноты встают на доли шага. Рисунок идёт от самой музыки:
 * редкий шаг остаётся редким, а самый насыщенный шаг фразы становится лесенкой.
 * Вне цепочек ноты не трогаем: там они идут за яркими звуками и словами.
 */
function arrangeRhythm(
  picked: number[],
  heard: number[],
  softChains: number[][],
  chains: number[][],
  fps: number,
  difficulty: Difficulty,
  intensity: Float32Array,
): { frames: number[]; ladder: number[]; rhythmic: number[]; beats: Map<number, number> } {
  let frames = [...picked]
  const ladder: number[] = []
  const rhythmic: number[] = []
  const beats = new Map<number, number>()

  for (const chain of [...softChains, ...chains]) {
    if (chain.length < 2) continue
    const isSoft = softChains.includes(chain)
    const steps: Set<number>[] = []
    for (let i = 0; i + 1 < chain.length; i++) {
      const slotSec = (chain[i + 1] - chain[i]) / STEP_SLOTS
      const slots = new Set<number>()
      // Мелочь отбиваем только в мощной части, иначе спокойное начало сложнее припева
      const level = intensityAt(intensity, chain[i], fps)
      for (const frame of level < ACTIVE_LEVEL ? picked : heard) {
        const slot = Math.round((frame / fps - chain[i]) / slotSec)
        if (slot >= 0 && slot < STEP_SLOTS) slots.add(slot)
      }
      steps.push(slots)
    }

    const first = chain[0] - PULSE_EDGE_SEC
    const last = chain[chain.length - 1]
    frames = frames.filter((frame) => frame / fps < first || frame / fps >= last)

    const canLadder = (step: number) => intensityAt(intensity, chain[step], fps) >= ACTIVE_LEVEL
    const ladderSteps = difficulty.isAdvanced ? chooseLadderSteps(steps, canLadder) : new Set<number>()
    for (let i = 0; i < steps.length; i++) {
      const slotSec = (chain[i + 1] - chain[i]) / STEP_SLOTS
      const toFrame = (slot: number) => Math.round((chain[i] + slot * slotSec) * fps)
      beats.set(toFrame(0), chain[i + 1] - chain[i])
      if (ladderSteps.has(i)) {
        for (let slot = 0; slot < STEP_SLOTS; slot++) ladder.push(toFrame(slot))
        // Если музыка не кончилась, лесенка тянется до шести нот
        const isLong = i + 1 < steps.length && steps[i + 1].size >= LADDER_MIN_HITS
        if (isLong && !ladderSteps.has(i + 1)) ladder.push(toFrame(STEP_SLOTS), toFrame(STEP_SLOTS + 1))
        continue
      }
      const isShort = chain[i + 1] - chain[i] < SHORT_STEP_SEC
      const isCalm = intensityAt(intensity, chain[i], fps) < CALM_LEVEL
      for (const slot of chooseSlots(steps[i], difficulty, isSoft, isShort, isCalm)) {
        frames.push(toFrame(slot))
        rhythmic.push(toFrame(slot))
      }
    }
  }

  frames.push(...ladder)
  rhythmic.push(...ladder)
  const unique = [...new Set(frames)]
  unique.sort((a, b) => a - b)
  return { frames: unique, ladder, rhythmic, beats }
}

function intensityAt(intensity: Float32Array, time: number, fps: number): number {
  return intensity[Math.min(Math.max(0, Math.round(time * fps)), intensity.length - 1)]
}

/** Живая игра отбивает почти все удары на сетке, а не только сильные. */
function allHeardFrames(analysis: AudioAnalysis, picked: number[]): number[] {
  const heard = [...picked]
  for (let frame = 0; frame < analysis.frameCount; frame++) {
    if (analysis.onsets[frame] === 1) heard.push(frame)
  }
  return heard
}

/** В каждой фразе лесенкой становится шаг, где музыка сама звучит чаще всего. */
function chooseLadderSteps(steps: Set<number>[], canLadder: (step: number) => boolean): Set<number> {
  const chosen = new Set<number>()
  for (let start = 0; start < steps.length; start += PHRASE_STEPS) {
    let best = -1
    for (let i = start; i < Math.min(start + PHRASE_STEPS, steps.length); i++) {
      const isRich = steps[i].size >= LADDER_MIN_HITS && canLadder(i)
      if (isRich && (best === -1 || steps[i].size >= steps[best].size)) best = i
    }
    if (best !== -1) chosen.add(best)
  }
  return chosen
}

/** Обычный шаг: настоящие удары плюс опорные доли, чтобы рука не теряла ритм. */
function chooseSlots(
  real: Set<number>,
  difficulty: Difficulty,
  isSoft: boolean,
  isShort: boolean,
  isCalm: boolean,
): Set<number> {
  // На коротком шаге все доли дали бы пять нажатий в секунду всю песню подряд
  const slots = new Set([...real].filter((slot) => !(isShort || isCalm) || slot % 2 === 0))
  // На мягком пульсе ударов почти не слышно, поэтому рисунок «тук, ту-тук» держит сам шаг
  if (isSoft && difficulty.isAdvanced) slots.add(STEP_SLOTS - 1)
  // Спокойной части хватает опоры на начало шага: иначе она сложнее припева
  if (isCalm) {
    slots.add(0)
    return slots
  }
  for (const share of difficulty.pulsePattern) slots.add(Math.round(share * STEP_SLOTS))
  return slots
}

/**
 * Ролл: в живой игре пальцы идут по кругу A, S, D, A, а не туда-обратно, и одна
 * клавиша подряд почти не встречается. Новая серия начинается после паузы,
 * каждая третья идёт в обратную сторону.
 */
function chooseRollLanes(rhythmic: number[], fps: number): Map<number, number> {
  const sorted = [...new Set(rhythmic)].sort((a, b) => a - b)
  const lanes = new Map<number, number>()
  let index = 0
  let run = 0
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && (sorted[i] - sorted[i - 1]) / fps > ROLL_MAX_GAP_SEC) {
      index = 0
      run += 1
    }
    const lane = index % 3
    lanes.set(sorted[i], run % ROLL_BACK_EVERY === ROLL_BACK_EVERY - 1 ? 2 - lane : lane)
    index += 1
  }
  return lanes
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
    if (ratio >= share + CALM_SHARE_RISE - ACTIVE_SHARE_DROP * frameIntensity) importance.set(frames[i], Math.max(importance.get(frames[i]) ?? 0, ratio))
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
  isLadder: (note: LaneNote) => boolean,
): LaneNote[] {
  if (difficulty.pairEvery === 0) return notes
  const result: LaneNote[] = []
  let notesSincePair = 0
  for (const note of notes) {
    const frame = Math.min(Math.round(note.time * analysis.fps), intensity.length - 1)
    if (intensity[frame] >= INTENSE_LEVEL) notesSincePair += 1
    if (note.kind === 'tap' && notesSincePair >= difficulty.pairEvery && !isLadder(note)) {
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
  intensity: Float32Array,
  trace?: LevelTrace,
): number[] {
  const picked = pickRhythmFrames(analysis, difficulty, focus, intensity, trace)
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
    const melodyLane = laneByPitch(analysis, frames[i])
    if (melodyLane !== -1) lane = melodyLane
    // Больше двух нот подряд на одной дорожке скучно: сдвигаем третью
    if (i >= 2 && lanes[i - 1] === lane && lanes[i - 2] === lane) lane = (lane + 1) % 3
    lanes.push(lane)
  }
  return lanes
}

/**
 * Там, где ясно звучит мелодия, дорожку выбирает высота: нота выше соседних уходит
 * вправо, ниже влево. Рука повторяет ход мелодии. Без мелодии вернёт -1.
 */
function laneByPitch(analysis: AudioAnalysis, frame: number): number {
  const { pitch } = analysis.melody
  // Смотрим чуть позже начала: окно FFT длинное, новая нота проявляется не сразу
  const current = pitch[Math.min(frame + PITCH_LOOK_AHEAD_FRAMES, pitch.length - 1)]
  if (current === 0) return -1

  const reach = Math.round(PITCH_REACH_SEC * analysis.fps)
  let low = current
  let high = current
  for (let i = Math.max(0, frame - reach); i < Math.min(pitch.length, frame + reach); i++) {
    if (pitch[i] === 0) continue
    low = Math.min(low, pitch[i])
    high = Math.max(high, pitch[i])
  }
  if (high - low < PITCH_MIN_RANGE) return -1
  return Math.min(2, Math.floor(((current - low) / (high - low)) * 3))
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
