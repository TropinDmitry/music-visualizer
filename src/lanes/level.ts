import { findSyllables, type AudioAnalysis } from '../audio/analyzer.ts'
import { beatWeight, pickNoteFrames } from '../game/level.ts'
import {
  findMoments,
  findPhraseEnds,
  findSections,
  findSoftPulses,
  chainStep,
  findSongParts,
  isSongTempo,
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

export const NOTE_FOCUSES: { id: NoteFocus; label: string; hint: string }[] = [
  { id: 'auto', label: 'Авто', hint: 'Сам выбирает: ритм, мелодия, а где быстро читают, там слоги' },
  { id: 'voice', label: 'По голосу', hint: 'Весь уровень на слогах: для рэпа и быстрой читки' },
  { id: 'beat', label: 'По ритму', hint: 'Только удары и сетка ритма, голос не учитывается' },
]

export interface Difficulty {
  id: DifficultyId
  label: string
  minGapSec: number
  /** Какую долю от самого сильного удара рядом должен набрать удар, чтобы стать нотой. */
  strengthShare: number
  /** Серии стрелок идут не чаще, чем раз в столько секунд. */
  arrowPeriodSec: number
  /** Пара нот на чётком ударе мощной части не чаще раза в столько секунд. 0 — парных нет. */
  pairGapSec: number
  /** На самых сильных переходах вместо пары ставится нота сразу на все три дорожки. */
  triples: boolean
  /** Самое короткое расстояние между нотами, которое вообще можно сыграть. */
  floorGapSec: number
  /** Сколько нот максимум за любую секунду. */
  maxPerSecond: number
  /** Что звучит на каждом шаге ритма: доли шага, на которых ноты стоят всегда. */
  pulsePattern: number[]
  /** Лесенки и лучи вместе с нотами: только там, где пальцы уже натренированы. */
  isAdvanced: boolean
  /** Самый короткий промежуток между слогами в быстрой читке. */
  readingGapSec: number
  /** В каждых скольких шагах ритма одна лесенка. */
  ladderPhraseSteps: number
  /** Вне лесенок ноты только на восьмых: так средняя сложность читается, но не скучна. */
  isEighthsOnly: boolean
  /** Сколько стрелок максимум в серии. */
  arrowRun: number
  /** На протяжных звуках два луча сразу. */
  doubleHolds: boolean
  canFail: boolean
}

export const DIFFICULTIES: Difficulty[] = [
  { id: 'easy', label: 'Лёгкая', minGapSec: 0.45, strengthShare: 0.88, pulsePattern: [0], isAdvanced: false, readingGapSec: 0.42, ladderPhraseSteps: 4, isEighthsOnly: true, arrowPeriodSec: 20, pairGapSec: 0, triples: false, floorGapSec: 0.4, maxPerSecond: 2, arrowRun: 3, doubleHolds: false, canFail: false },
  { id: 'normal', label: 'Средняя', minGapSec: 0.2, strengthShare: 0.76, pulsePattern: [0, 0.5], isAdvanced: true, readingGapSec: 0.16, ladderPhraseSteps: 8, isEighthsOnly: true, arrowPeriodSec: 12, pairGapSec: 2, triples: false, floorGapSec: 0.15, maxPerSecond: 7, arrowRun: 3, doubleHolds: false, canFail: true },
  { id: 'hard', label: 'Сложная', minGapSec: 0.14, strengthShare: 0.72, pulsePattern: [0, 0.5], isAdvanced: true, readingGapSec: 0.08, ladderPhraseSteps: 4, isEighthsOnly: false, arrowPeriodSec: 7, pairGapSec: 0.9, triples: true, floorGapSec: 0.08, maxPerSecond: 12, arrowRun: 4, doubleHolds: true, canFail: true },
]

/** Каждая какая нота становится звездой, если она не стрелка. */
const STAR_EVERY = 17
/** Короче этого луч теряет смысл. */
const HOLD_MIN_SEC = 0.9
const HOLD_MAX_SEC = 2.5
/** Долгая нота мелодии становится лучом, если держится хотя бы столько. */
const MELODY_HOLD_MIN_SEC = 1.1
/** Каждый такой луч на сложной сложности двойной. */
const DOUBLE_HOLD_EVERY = 3
const HOLD_END_GAP_SEC = 0.1
/** Огрызок луча перед пробелом не нужен. */
const SPACE_TRIMMED_HOLD_MIN_SEC = 0.5
/** Луч на доле: такая часть шага, как в живой игре. */
const BEAT_HOLD_SHARE = 0.8
const BEAT_HOLD_REST_SEC = 0.5
/**
 * Луч на доле держит протяжный звук. Если внутри него отдельные звуки идут
 * не реже RIFF_MIN_RATE в секунду, это рифф, как в разгоне Levels около 50-й
 * секунды, и он играется нотами. Под двойным лучом на 72-й секунде звуков около
 * двух в секунду, он остаётся. Звуки у самого начала луча не считаются: это удар,
 * с которого луч начался.
 */
const BEAT_HOLD_MAX_HITS = 2
const RIFF_MIN_RATE = 3
const HOLD_INNER_MARGIN_SEC = 0.08
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
/** Шаг длиннее этого делится вдвое мельче. */
const LONG_STEP_SEC = 1.05
const SHORT_STEP_SEC = 0.75
/** С такой частоты слогов отрезок считается быстрой читкой. */
const READING_MIN_RATE = 4
/** Столько слогов в секунду значит, что голос читает, а не тянет звук. */
const TALKING_RATE = 3
const READING_WINDOW_SEC = 2
const READING_STEP_SEC = 0.5
const READING_JOIN_GAP_SEC = 1
/** Короче этого всплеск слогов не считается читкой. */
const READING_MIN_SEC = 2
/** Порог подъёма для слогов внутри читки: ниже обычного, скороговорка почти без провалов. */
const READING_RISE_DB = 1
/** Если в паузе бита голос даёт столько слогов в секунду, это не пауза. */
const PAUSE_SPEECH_RATE = 2
/** Ниже этой силы часть спокойная, выше второй мощная: лесенки только в мощной. */
const CALM_LEVEL = 0.3
const ACTIVE_LEVEL = 0.6
/** Сколько настоящих ударов нужно в шаге, чтобы лесенка была под музыку. */
const LADDER_MIN_HITS = 2
/** Ноты дальше этого уже не одна серия пальцев. */
const ROLL_MAX_GAP_SEC = 0.5
/**
 * Такт считается повтором прежнего, если похож на него не меньше этого и по ударам,
 * и по тембру. При таком пороге в L's Ideology, построенном на петлях, повторов 85%,
 * в Levels и Lollipop около половины, а в оркестровом Somnus 14%.
 */
const REPEAT_MIN_SIMILARITY = 0.93
const REPEAT_LENGTH_TOLERANCE = 0.03
/** Во сколько раз громкость повтора может отличаться от образца. */
const REPEAT_LOUDNESS_RATIO = 1.15
const REPEAT_SLOTS = 16
/** Число нот в образце и в самом такте должно отличаться не больше чем в 1/0,8 раза. */
const REPEAT_MIN_KEEP = 0.8
/** Образец может заходить в начало повтора на столько: соседние такты делят границу. */
const REPEAT_EDGE_SLACK_SEC = 0.05
/** Сколько должна продержаться новая высота, чтобы считаться нотой риффа. */
const PITCH_CHANGE_HOLD_SEC = 0.08
/** Рисунки пальцев: круги в обе стороны, зигзаги и возвраты к одной дорожке. */
const ROLL_MOTIFS = [
  [0, 1, 2],
  [2, 0, 1, 0],
  [2, 1, 0],
  [0, 2, 1, 2],
  [1, 0, 2],
  [0, 1, 0, 2],
  [1, 2, 0],
  [2, 1, 2, 0],
  [0, 2, 1],
  [1, 2, 1, 0],
  [2, 0, 1],
  [1, 0, 1, 2],
]
/** Шаг по списку взаимно прост с его длиной, поэтому пройдутся все рисунки. */
const ROLL_MOTIF_STRIDE = 5
/** Сколько нот держится один рисунок в длинной серии. */
const ROLL_MOTIF_NOTES = 7
/** Вокруг акцента оставляем воздух, чтобы он прозвучал отдельно. */
const ACCENT_CLEAR_SEC = 0.2
/** Выше этой силы песни часть нот становится парными. */
const INTENSE_LEVEL = 0.55
/** Парными становятся удары из верхних 65% по чёткости в мощных частях. */
const PAIR_TOP_SHARE = 0.35
/** Рядом с парой нет других нот ближе этого: двумя пальцами жмут отдельный удар. */
const PAIR_CLEAR_SEC = 0.15
/** Вторая дорожка пары: для каждой первой по очереди соседняя и дальняя. */
const PAIR_PARTNERS = [
  [1, 2],
  [2, 0],
  [1, 0],
]
/** С чем сравниваем удар: с самым сильным в такой окрестности. */
const STRENGTH_REACH_SEC = 2
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
/** Ширина группы стрелок вокруг заметного удара. */
const ARROW_WINDOW_SEC = 1.6
/** Где у конца фразы ищем самый заметный удар. */
const ARROW_SEARCH_SEC = 3
const ARROW_SEARCH_AFTER_SEC = 0.5
/** Стрелкой становится удар не слабее этой доли самого сильного в окне. */
const ARROW_STRONG_SHARE = 0.5
/** Насколько дорожка, с которой стрелки шли чаще, проигрывает в выборе. */
const ARROW_SAME_LANE_PENALTY = 0.6
const ARROW_MIN_SPACING_SEC = 0.2
/** С чем сравниваем удар, чтобы понять, выделяется ли он. */
const ARROW_CONTRAST_SEC = 0.5
const ARROW_CONTRAST_FLOOR = 0.02
/**
 * Перед серией стрелок и после неё обычных нот нет: руке надо перейти на стрелки
 * и обратно. После серии место дольше: последняя стрелка ещё ждёт на чаше.
 */
const ARROW_BEFORE_SEC = 0.2
/** Соседняя нота продолжает серию стрелок, если она хотя бы такой доли силы самого сильного удара. */
const ARROW_JOIN_SHARE = 0.3
const ARROW_AFTER_SEC = 0.3
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
const MIN_SPACE_GAP_SEC = 15
/** Тишина для пробела: хотя бы столько и втрое тише того, что было до неё. */
const SPACE_SILENCE_SEC = 0.8
const SPACE_SILENCE_SHARE = 0.3
/**
 * Сила до и после границы части сравнивается в окнах вплотную к ней: сила не
 * перетекает через границу, и отступ только захватил бы соседнюю часть. В Levels
 * перед дропом на 75-й секунде три секунды затишья, а до них мощный разгон.
 */
const SPACE_LOOK_SEC = 2.5
const SPACE_EDGE_SEC = 0
/** После границы сила может набираться несколько секунд, поэтому окно «после» длиннее. */
const SPACE_AFTER_SEC = 5
/** Подъём силы песни на границе части, после которого стоит пробел. */
const SPACE_MIN_RISE = 0.3

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
  const moments = withoutSpokenPauses(findMoments(analysis), analysis)
  const intensity = songIntensity(analysis)
  const rawSustains = splitAtBigChanges(analysis, findSustains(analysis))
  const foundPulses = findSoftPulses(analysis, rawSustains)
  const firstParts = findSongParts(analysis, withoutPulses(rawSustains, foundPulses), foundPulses)
  // Мягкий пульс верен, только если он идёт в темпе самой песни: иначе это случайные смены аккордов
  const pulses = isPulseInTempo(foundPulses, firstParts) ? foundPulses : []
  const sustains = withoutPulses(rawSustains, pulses)
  const parts = pulses === foundPulses ? firstParts : findSongParts(analysis, sustains, pulses)
  const picked = pickFramesWithMoments(analysis, difficulty, moments, focus, intensity, trace)
  const softChains = focus === 'voice' ? [] : splitPulses(pulses)
  const reading = findReadingSpans(analysis, sustains, focus)
  const isRead = (time: number) => reading.some((span) => time >= span.start && time < span.end)
  const chains = focus === 'voice' ? [] : parts.map((part) => part.chain)
  const heard = difficulty.isAdvanced ? allHeardFrames(analysis, picked) : picked
  const arranged = arrangeRhythm(picked, heard, softChains, chains, analysis.fps, difficulty, intensity)
  const { ladder, rhythmic, beats, softBeats } = arranged
  const syllables = pickSyllables(analysis, reading, difficulty)
  const frames = [...arranged.frames.filter((frame) => !isRead(frame / analysis.fps)), ...syllables]
  frames.sort((a, b) => a - b)
  rhythmic.push(...syllables)
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

  // Одинаковая музыка играется одинаково: повтор такта получает рисунок первого
  const repeated = focus === 'voice' ? notes : repeatBars(notes, analysis, [...softChains, ...chains], ladder, rhythmic)
  notes.splice(0, notes.length, ...repeated)
  markLastNotesBeforePauses(notes, moments)
  const sections = findSections(analysis, intensity)
  const phraseEnds = focus === 'voice' ? [] : findPhraseEnds(analysis, [...softChains, ...chains], moments)
  const withArrows = placeArrowAccents(notes, analysis, difficulty, phraseEnds, sustains, moments)
  // Быструю читку не разбиваем парами и лучами: это один поток слогов
  const ladderFrames = new Set([...ladder, ...syllables])
  const isLadder = (note: LaneNote) => ladderFrames.has(Math.round(note.time * analysis.fps))
  const withPairs = addPairs(withArrows, difficulty, analysis, intensity, isLadder)
  const withSustains = addSustainHolds(withPairs, difficulty, sustains.filter((sustain) => !isRead(sustain.start)))
  const rhythmicFrames = new Set(rhythmic)
  const withHolds = addHolds(withSustains, difficulty, moments, isLadder, analysis, beats, rhythmicFrames, reading, softBeats)
  const withAccents = addAccents(withHolds, moments, sections, sustains, analysis, intensity, difficulty)
  if (trace) trace.beforeLimit = withAccents
  // Последним: предыдущие шаги убирают ноты, и соседями могут оказаться ноты с одной дорожки
  return avoidTriples(dropNotesUnderBeams(trimBeamsAtSpaces(limitDensity(withAccents, difficulty))), isLadder)
}

/**
 * Повторы. Ручную карту выдаёт прежде всего то, что одинаковая музыка играется
 * одинаково: припев во второй раз тем же рисунком, что и в первый. Детектор же
 * в каждом такте слышит чуть иначе, и рисунок плывёт. Поэтому такт, очень похожий
 * на один из прежних и по ударам, и по тембру, получает его ноты и дорожки.
 * Похожесть меряется дважды: где в такте удары и какой у него спектр. Берётся
 * меньшая из двух, чтобы тот же бит под другой мелодией повтором не считался.
 */
function repeatBars(
  notes: LaneNote[],
  analysis: AudioAnalysis,
  chains: number[][],
  ladder: number[],
  rhythmic: number[],
): LaneNote[] {
  const bars = findBars(chains, 0)
  // Отрезок мог начать счёт сетки не с первой доли такта: образцы берём и со сдвигом
  // на полтакта, иначе повтор в соседнем отрезке не узнать
  const sources = [...bars, ...findBars(chains, 1)].sort((a, b) => a[0] - b[0])
  const prints = bars.map((bar) => barPrint(analysis, bar))
  const sourcePrints = sources.map((bar) => barPrint(analysis, bar))
  const ladderSet = new Set(ladder)
  const rhythmicSet = new Set(rhythmic)
  const isPlain = (note: LaneNote) => note.kind === 'tap' || note.kind === 'star'
  // Повтор всегда копирует исходный такт, а не копию: каждый второй повтор зеркальный,
  // ритм тот же, а рука ходит в обе стороны, как в ручных картах
  const rootOf = new Map<number, [number, number]>()
  const uses = new Map<number, number>()
  const original = notes
  let result = notes
  for (let i = 0; i < bars.length; i++) {
    const [from, to] = bars[i]
    let source = -1
    let best = REPEAT_MIN_SIMILARITY
    for (let j = 0; j < sources.length && sources[j][1] <= from + REPEAT_EDGE_SLACK_SEC; j++) {
      // Такт, в начале которого ещё нет нот, образцом быть не может: он неполный
      if (sources[j][0] < FIRST_NOTE_SEC) continue
      const length = sources[j][1] - sources[j][0]
      if (Math.abs(length - (to - from)) > (to - from) * REPEAT_LENGTH_TOLERANCE) continue
      // Тот же рисунок тише или громче это другая часть песни: куплет, а не припев
      const loudness = prints[i].loudness / Math.max(1e-9, sourcePrints[j].loudness)
      if (loudness < 1 / REPEAT_LOUDNESS_RATIO || loudness > REPEAT_LOUDNESS_RATIO) continue
      const similarity = Math.min(cosine(prints[i].hits, sourcePrints[j].hits), cosine(prints[i].timbre, sourcePrints[j].timbre))
      if (similarity >= best) {
        best = similarity
        source = j
      }
    }
    if (source === -1) continue
    const [sourceFrom, sourceTo] = rootOf.get(sources[source][0]) ?? sources[source]
    const template = original.filter((note) => isPlain(note) && note.time >= sourceFrom && note.time < sourceTo)
    // Повтор выравнивает рисунок, но не меняет плотность: заметно более редкий или
    // густой образец значит, что такты всё же разные
    const own = result.filter((note) => isPlain(note) && note.time >= from && note.time < to).length
    const isClose = template.length >= own * REPEAT_MIN_KEEP && template.length <= own / REPEAT_MIN_KEEP
    if (template.length === 0 || !isClose) continue
    const scale = (to - from) / (sourceTo - sourceFrom)
    const use = (uses.get(sourceFrom) ?? 0) + 1
    uses.set(sourceFrom, use)
    rootOf.set(from, [sourceFrom, sourceTo])
    const isMirrored = use % 2 === 1
    const copies = template.map((note) => {
      const frame = Math.round((from + (note.time - sourceFrom) * scale) * analysis.fps)
      // Копия лесенки остаётся лесенкой, копия доли остаётся долей
      const sourceFrame = Math.round(note.time * analysis.fps)
      if (ladderSet.has(sourceFrame)) ladder.push(frame)
      if (rhythmicSet.has(sourceFrame)) rhythmic.push(frame)
      return { ...note, time: frame / analysis.fps, lane: isMirrored ? 2 - note.lane : note.lane }
    })
    const kept = result.filter((note) => !isPlain(note) || note.time < from || note.time >= to)
    result = [...kept, ...copies].sort((a, b) => a.time - b.time)
  }
  return result.map((note, id) => ({ ...note, id }))
}

/**
 * Такты: на коротком шаге ритма два шага, на длинном один, чтобы такт был около
 * двух секунд. offset сдвигает начало счёта на столько шагов.
 */
function findBars(chains: number[][], offset: number): [number, number][] {
  const bars: [number, number][] = []
  for (const chain of chains) {
    if (chain.length < 3) continue
    const per = chain[1] - chain[0] < LONG_STEP_SEC ? 2 : 1
    if (offset > 0 && per === 1) continue
    for (let i = offset; i + per < chain.length; i += per) bars.push([chain[i], chain[i + per]])
  }
  return bars.sort((a, b) => a[0] - b[0])
}

/** Отпечаток такта: сила ударов в шестнадцати долях и средний спектр. */
function barPrint(
  analysis: AudioAnalysis,
  [from, to]: [number, number],
): { hits: Float32Array; timbre: Float32Array; loudness: number } {
  const fps = analysis.fps
  const hits = new Float32Array(REPEAT_SLOTS)
  for (let slot = 0; slot < REPEAT_SLOTS; slot++) {
    const first = Math.round((from + ((to - from) * slot) / REPEAT_SLOTS) * fps)
    const last = Math.min(analysis.frameCount, Math.round((from + ((to - from) * (slot + 1)) / REPEAT_SLOTS) * fps))
    let peak = 0
    let low = 0
    for (let frame = first; frame < last; frame++) {
      peak = Math.max(peak, analysis.onsetStrength[frame])
      if (analysis.lowOnsets[frame] === 1) low = 1
    }
    hits[slot] = peak + 0.5 * low
  }
  const bins = analysis.spectrumBins
  const timbre = new Float32Array(bins)
  for (let frame = Math.round(from * fps); frame < Math.min(analysis.frameCount, Math.round(to * fps)); frame++) {
    for (let bin = 0; bin < bins; bin++) timbre[bin] += analysis.spectrum[frame * bins + bin]
  }
  let loudness = 0
  for (const value of timbre) loudness += value
  return { hits, timbre, loudness: loudness / Math.max(1, (to - from) * fps) }
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let lengthA = 0
  let lengthB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    lengthA += a[i] * a[i]
    lengthB += b[i] * b[i]
  }
  return dot / Math.sqrt(lengthA * lengthB + 1e-9)
}

/**
 * Стрелки ставятся на самые сильные удары: перед концом фразы, а если фраз нет,
 * в каждом отрезке песни. Сколько их, решает музыка: столько, сколько рядом
 * по-настоящему сильных ударов, от одной до предела сложности. Ноты вокруг
 * не убираются, стрелка это просто другой жест на том же ударе.
 */
function placeArrowAccents(
  notes: LaneNote[],
  analysis: AudioAnalysis,
  difficulty: Difficulty,
  phraseEnds: number[],
  sustains: Moment[],
  moments: Moment[],
): LaneNote[] {
  const strengthOf = (note: LaneNote) => hitContrast(analysis, note.time)

  // Где искать: у конца каждой фразы, а если фраз нет, в каждом отрезке песни
  const ranges: { from: number; to: number }[] = []
  if (phraseEnds.length > 0) {
    for (const end of phraseEnds) ranges.push({ from: end - ARROW_SEARCH_SEC, to: end + ARROW_SEARCH_AFTER_SEC })
  } else {
    for (let start = FIRST_NOTE_SEC; start < analysis.duration; start += difficulty.arrowPeriodSec) {
      ranges.push({ from: start, to: start + difficulty.arrowPeriodSec })
    }
  }
  // Стрелки встают вокруг самого заметного удара в этом месте, а не по часам
  const windows: { from: number; to: number; range: { from: number; to: number } }[] = []
  for (const range of ranges) {
    const inside = notes.filter((note) => note.kind === 'tap' && note.time >= range.from && note.time < range.to)
    if (inside.length === 0) continue
    const best = inside.reduce((a, b) => (strengthOf(b) > strengthOf(a) ? b : a))
    windows.push({ from: best.time - ARROW_WINDOW_SEC / 2, to: best.time + ARROW_WINDOW_SEC / 2, range })
  }

  const arrows = new Set<LaneNote>()
  const runs: { from: number; to: number }[] = []
  // Сколько раз уже стрелка шла с каждой дорожки: повторы ставят сильные доли на одни
  // и те же дорожки, и без этого стрелки шли бы всё время в одну сторону
  const usedLanes = [0, 0, 0]
  for (const window of windows) {
    // На протяжке и в паузе стрелка неуместна, в остальном решает сила удара
    const isFitting = (note: LaneNote) => !isNearSustain(note.time, sustains) && isAllowed(note.time, moments)
    const candidates = notes.filter(
      (note) => note.kind === 'tap' && note.time >= window.from && note.time < window.to && isFitting(note),
    )
    if (candidates.length === 0) continue
    const strongest = Math.max(...candidates.map(strengthOf))
    // Из почти равных по силе ударов стрелка достаётся той дорожке, что была реже
    const total = Math.max(1, usedLanes[0] + usedLanes[1] + usedLanes[2])
    const score = (note: LaneNote) => strengthOf(note) / (1 + ARROW_SAME_LANE_PENALTY * (usedLanes[note.lane] / total))
    const strong = candidates.filter((note) => strengthOf(note) >= strongest * ARROW_STRONG_SHARE)
    // Если редкой дорожки рядом нет, её сильный удар ищем во всём месте перед концом фразы
    const rarest = usedLanes.indexOf(Math.min(...usedLanes))
    if (!strong.some((note) => note.lane === rarest)) {
      const { range } = window
      strong.push(
        ...notes.filter(
          (note) =>
            note.kind === 'tap' &&
            note.lane === rarest &&
            note.time >= range.from &&
            note.time < range.to &&
            isFitting(note) &&
            strengthOf(note) >= strongest * ARROW_STRONG_SHARE,
        ),
      )
    }
    strong.sort((a, b) => score(b) - score(a))
    if (strong.length === 0) continue

    // Серия растёт от самого сильного удара соседними нотами подряд, в ту сторону,
    // где удар сильнее. Так внутри серии нет обычных нот и вычищать ничего не надо
    const first = strong[0]
    const chosen: LaneNote[] = [first]
    const canJoin = (note: LaneNote | undefined): note is LaneNote =>
      note !== undefined &&
      note.kind === 'tap' &&
      isFitting(note) &&
      Math.abs(note.time - first.time) <= ARROW_WINDOW_SEC / 2 &&
      strengthOf(note) >= strongest * ARROW_JOIN_SHARE
    let left = notes.indexOf(first) - 1
    let right = notes.indexOf(first) + 1
    while (chosen.length < difficulty.arrowRun) {
      const before = notes[left]
      const after = notes[right]
      const canTakeBefore = canJoin(before) && chosen[0].time - before.time >= ARROW_MIN_SPACING_SEC
      const canTakeAfter = canJoin(after) && after.time - chosen[chosen.length - 1].time >= ARROW_MIN_SPACING_SEC
      if (!canTakeBefore && !canTakeAfter) break
      if (canTakeAfter && (!canTakeBefore || strengthOf(after) >= strengthOf(before))) {
        chosen.push(after)
        right += 1
      } else {
        chosen.unshift(before)
        left -= 1
      }
    }
    for (const note of chosen) {
      arrows.add(note)
      usedLanes[note.lane] += 1
    }
    if (chosen.length > 0) {
      const times = chosen.map((note) => note.time)
      runs.push({ from: Math.min(...times), to: Math.max(...times) })
    }
  }

  // Серия стрелок играется подряд, без обычных нот внутри: «стрелка, нота, стрелка»
  // заставляет менять жест каждые пару десятых секунды. Вокруг серии место, чтобы
  // перейти на стрелки и обратно; после серии дольше, пока последняя ждёт на чаше
  const isNearRun = (time: number) => runs.some((run) => time > run.from - ARROW_BEFORE_SEC && time < run.to + ARROW_AFTER_SEC)
  const result: LaneNote[] = []
  for (const note of notes) {
    if (!arrows.has(note) && isNearRun(note.time)) continue
    result.push(arrows.has(note) ? { ...note, kind: 'swipe', direction: arrowDirection(note.lane) } : note)
  }
  return result
}

/** Насколько удар выделяется на фоне соседних: пик силы удара против среднего вокруг. */
function hitContrast(analysis: AudioAnalysis, time: number): number {
  const frame = Math.round(time * analysis.fps)
  let peak = 0
  for (let i = Math.max(0, frame - 2); i <= Math.min(analysis.frameCount - 1, frame + 2); i++) {
    peak = Math.max(peak, analysis.onsetStrength[i])
  }
  const reach = Math.round(ARROW_CONTRAST_SEC * analysis.fps)
  let sum = 0
  let count = 0
  for (let i = Math.max(0, frame - reach); i <= Math.min(analysis.frameCount - 1, frame + reach); i++) {
    sum += analysis.onsetStrength[i]
    count += 1
  }
  return peak / Math.max(ARROW_CONTRAST_FLOOR, sum / Math.max(1, count))
}

/** Стрелка показывает туда, где стоит: слева влево, справа вправо, по центру вверх. */
function arrowDirection(lane: number): number {
  return lane - 1
}

/**
 * Нота становится нотой с лучом, когда звук сам тянется: на доле он нарастает,
 * а вне ритма держится долгая нота мелодии. На сложной сложности
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
  reading: { start: number; end: number }[],
  softBeats: Set<number>,
): LaneNote[] {
  const result: LaneNote[] = []
  const skipped = new Set<LaneNote>()
  // В быстрой читке держать нечего: каждый слог это отдельное нажатие
  const isInReading = (from: number, to: number) => reading.some((span) => span.start < to && span.end > from)
  // Голос, который читает поверх, тоже раздувает середину звука, но держать тут нечего
  const isTalking = (from: number, to: number) => {
    const spoken = analysis.syllableTimes.filter((time) => time >= from && time < to).length
    return spoken / Math.max(0.1, to - from) >= TALKING_RATE
  }
  let holdCount = 0
  let lastHoldEnd = 0
  const pitchChanges = pitchChangeFrames(analysis)

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i]
    if (skipped.has(note)) continue
    const frame = Math.round(note.time * analysis.fps)
    const isFree = note.kind === 'tap' && !isInRush(note.time, moments) && note.time >= lastHoldEnd
    let duration = 0
    if (isFree && rhythmic.has(frame)) {
      // В ритме луч ставит сам звук: на сильной доле он нарастает и тянется
      // Но на мягком пульсе разгона, если внутри звучат быстрые отдельные звуки, это рифф,
      // и его надо отбивать нотами. В обычном ритме луч на доле остаётся, как в живой игре
      const step = beats.get(frame)
      const length = (step ?? 0) * BEAT_HOLD_SHARE
      const hits = step && softBeats.has(frame) ? hitsInside(analysis, pitchChanges, note.time, note.time + length) : 0
      const isRiff = hits >= BEAT_HOLD_MAX_HITS && hits / Math.max(0.1, length - HOLD_INNER_MARGIN_SEC) >= RIFF_MIN_RATE
      if (step && !isRiff && soundSwells(analysis, frame)) duration = length
    } else if (isFree && !isLadder(note)) {
      // Вне ритма луч ставит долгая нота мелодии: звук держится, а ударов поверх нет
      const held = heldNoteSec(analysis, frame)
      const isBusy = (other: LaneNote) => isLadder(other) || rhythmic.has(Math.round(other.time * analysis.fps))
      const possible = Math.min(held, holdDuration(notes, i, moments, isBusy))
      if (held >= MELODY_HOLD_MIN_SEC && possible >= HOLD_MIN_SEC) duration = possible
    }
    const isSpoken = duration > 0 && (isInReading(note.time, note.time + duration) || isTalking(note.time, note.time + duration))
    if (duration === 0 || isSpoken) {
      result.push(note)
      continue
    }

    holdCount += 1
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

/** Сколько секунд после ноты мелодия держит ту же высоту и не звучит новых ударов. */
function heldNoteSec(analysis: AudioAnalysis, frame: number): number {
  const { pitch } = analysis.melody
  const start = Math.min(frame + PITCH_LOOK_AHEAD_FRAMES, pitch.length - 1)
  const note = pitch[start]
  if (note === 0) return 0
  let end = start
  while (end + 1 < pitch.length && pitch[end + 1] === note && analysis.onsets[end + 1] === 0) end += 1
  return (end - frame) / analysis.fps
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

    // Первые секунды без нот касаются и лучей: игрок ещё не взял руки на клавиши
    let time = Math.max(FIRST_NOTE_SEC, startsEarlier ? previous.time : sustain.start)
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
  const beatShare = difficulty.strengthShare
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

/**
 * Пауза в бите ещё не пауза в песне: в рэпе бит часто выпадает, а голос продолжает
 * читать. Такую «паузу» не считаем, иначе ноты вырезались бы посреди читки.
 */
function withoutSpokenPauses(moments: Moment[], analysis: AudioAnalysis): Moment[] {
  return moments.filter((moment) => {
    if (moment.kind !== 'pause') return true
    const length = Math.max(0.1, moment.end - moment.start)
    const spoken = analysis.syllableTimes.filter((time) => time >= moment.start && time < moment.end).length
    return spoken / length < PAUSE_SPEECH_RATE
  })
}

/**
 * Где уровень идёт за слогами: весь трек по голосу, в авто только быстрая читка,
 * по ритму нигде. Частоту слогов смотрим скользящим окном в две секунды: читка
 * часто ускоряется посреди куплета, и крупные отрезки включали её с опозданием.
 */
function findReadingSpans(
  analysis: AudioAnalysis,
  sustains: Moment[],
  focus: NoteFocus,
): { start: number; end: number }[] {
  if (focus === 'beat') return []
  if (focus === 'voice') return [{ start: 0, end: analysis.duration }]

  const spans: { start: number; end: number }[] = []
  const half = READING_WINDOW_SEC / 2
  for (let center = half; center < analysis.duration - half; center += READING_STEP_SEC) {
    const count = analysis.syllableTimes.filter((time) => time >= center - half && time < center + half).length
    const isHeld = sustains.some((sustain) => sustain.start < center && sustain.end > center)
    if (isHeld || count / READING_WINDOW_SEC < READING_MIN_RATE) continue
    const start = center - READING_STEP_SEC / 2
    const last = spans[spans.length - 1]
    // Короткий провал посреди читки её не прерывает: это вдох, а не конец куплета
    if (last && start - last.end <= READING_JOIN_GAP_SEC) last.end = center + READING_STEP_SEC / 2
    else spans.push({ start, end: center + READING_STEP_SEC / 2 })
  }
  return spans.filter((span) => span.end - span.start >= READING_MIN_SEC)
}

/**
 * Слоги подряд, по времени. Если выбирать сначала самые заметные, каждый выбранный
 * слог выбивает обоих соседей, и поток читки рвётся.
 */
function pickSyllables(
  analysis: AudioAnalysis,
  reading: { start: number; end: number }[],
  difficulty: Difficulty,
): number[] {
  const lastTime = analysis.duration - TAIL_FRAMES / analysis.fps
  const picked: number[] = []
  let previous = -Infinity
  // Внутри быстрой читки слоги ищем чувствительнее: в скороговорке подъёмы между ними малы
  // Обычные слоги плюс найденные чувствительным порогом: дубли отсеет минимальный шаг ниже
  const sensitive = findSyllables(analysis.speech, analysis.fps, READING_RISE_DB).syllableTimes
  const syllableTimes = [...analysis.syllableTimes, ...sensitive].sort((a, b) => a - b)
  for (const time of syllableTimes) {
    const isInside = time >= LEAD_IN_SEC && time <= lastTime && reading.some((span) => time >= span.start && time < span.end)
    if (!isInside || time - previous < difficulty.readingGapSec) continue
    picked.push(Math.round(time * analysis.fps))
    previous = time
  }
  return picked
}

function isPulseInTempo(pulses: number[], parts: SongPart[]): boolean {
  if (pulses.length < 2) return pulses.length === 0
  const chains = splitPulses(pulses).filter((chain) => chain.length > 1)
  return chains.every((chain) => isSongTempo(parts, chainStep(chain)))
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
): { frames: number[]; ladder: number[]; rhythmic: number[]; beats: Map<number, number>; softBeats: Set<number> } {
  // Доли мягкого пульса: там под протяжным звуком может играть рифф
  const softBeats = new Set<number>()
  let frames = [...picked]
  const ladder: number[] = []
  const rhythmic: number[] = []
  const beats = new Map<number, number>()

  for (const chain of [...softChains, ...chains]) {
    if (chain.length < 2) continue
    const isSoft = softChains.includes(chain)
    const steps: Set<number>[] = []
    for (let i = 0; i + 1 < chain.length; i++) {
      const slotCount = slotsInStep(chain[i + 1] - chain[i])
      const slotSec = (chain[i + 1] - chain[i]) / slotCount
      const slots = new Set<number>()
      // В спокойной части отбиваем только заметные удары, иначе она сложнее припева.
      // Уже в средней сетка отбивает всё, что звучит: ровный ритм руке хочется отбивать
      const level = intensityAt(intensity, chain[i], fps)
      for (const frame of level < CALM_LEVEL ? picked : heard) {
        const slot = Math.round((frame / fps - chain[i]) / slotSec)
        if (slot >= 0 && slot < slotCount) slots.add(slot)
      }
      steps.push(slots)
    }

    const first = chain[0] - PULSE_EDGE_SEC
    const last = chain[chain.length - 1]
    frames = frames.filter((frame) => frame / fps < first || frame / fps >= last)

    const canLadder = (step: number) => intensityAt(intensity, chain[step], fps) >= ACTIVE_LEVEL
    const ladderSteps = difficulty.isAdvanced ? chooseLadderSteps(steps, canLadder, difficulty.ladderPhraseSteps) : new Set<number>()
    for (let i = 0; i < steps.length; i++) {
      const slotCount = slotsInStep(chain[i + 1] - chain[i])
      const slotSec = (chain[i + 1] - chain[i]) / slotCount
      const toFrame = (slot: number) => Math.round((chain[i] + slot * slotSec) * fps)
      beats.set(toFrame(0), chain[i + 1] - chain[i])
      if (isSoft) softBeats.add(toFrame(0))
      if (ladderSteps.has(i)) {
        // Средней сложности на длинном шаге лесенка идёт через долю: шестнадцатые для неё быстры
        const stride = slotCount > STEP_SLOTS && difficulty.isEighthsOnly ? 2 : 1
        for (let slot = 0; slot < slotCount; slot += stride) ladder.push(toFrame(slot))
        // Если музыка не кончилась, лесенка тянется ещё на две ноты
        const isLong = difficulty.doubleHolds && i + 1 < steps.length && steps[i + 1].size >= LADDER_MIN_HITS
        if (isLong && !ladderSteps.has(i + 1)) ladder.push(toFrame(slotCount), toFrame(slotCount + stride))
        continue
      }
      const isShort = chain[i + 1] - chain[i] < SHORT_STEP_SEC
      const isCalm = intensityAt(intensity, chain[i], fps) < CALM_LEVEL
      for (const slot of chooseSlots(steps[i], slotCount, difficulty, isSoft, isShort, isCalm)) {
        frames.push(toFrame(slot))
        rhythmic.push(toFrame(slot))
      }
    }
  }

  frames.push(...ladder)
  rhythmic.push(...ladder)
  const unique = [...new Set(frames)]
  unique.sort((a, b) => a - b)
  return { frames: unique, ladder, rhythmic, beats, softBeats }
}

/**
 * На сколько долей делится шаг ритма. Обычно на четыре, но если шаг найден длинным,
 * как в тяжёлой музыке с половинным темпом, четыре доли дали бы восьмые вместо
 * шестнадцатых, и быстрые чаги гитары некуда было бы поставить.
 */
function slotsInStep(step: number): number {
  return step >= LONG_STEP_SEC ? STEP_SLOTS * 2 : STEP_SLOTS
}

function intensityAt(intensity: Float32Array, time: number, fps: number): number {
  return intensity[Math.min(Math.max(0, Math.round(time * fps)), intensity.length - 1)]
}

/** Живая игра отбивает почти все удары на сетке, а не только сильные. */
function allHeardFrames(analysis: AudioAnalysis, picked: number[]): number[] {
  const heard = [...picked]
  for (let frame = 0; frame < analysis.frameCount; frame++) {
    if (analysis.onsets[frame] === 1 || analysis.lowOnsets[frame] === 1) heard.push(frame)
  }
  return heard
}

/** Сколько отдельных звуков внутри отрезка: удары, удары в низах и смены нот. */
function hitsInside(analysis: AudioAnalysis, pitchChanges: number[], from: number, to: number): number {
  const first = Math.round((from + HOLD_INNER_MARGIN_SEC) * analysis.fps)
  const last = Math.min(analysis.frameCount, Math.round(to * analysis.fps))
  let hits = 0
  for (let frame = first; frame < last; frame++) {
    if (analysis.onsets[frame] === 1 || analysis.lowOnsets[frame] === 1) hits += 1
  }
  return hits + pitchChanges.filter((frame) => frame >= first && frame < last).length
}

/**
 * Где мелодия переходит на другую ноту. Новая нота должна продержаться хотя бы
 * PITCH_CHANGE_HOLD_SEC: короткие скачки высоты это сбой слежения, а не нота риффа.
 */
function pitchChangeFrames(analysis: AudioAnalysis): number[] {
  const { pitch } = analysis.melody
  const hold = Math.round(PITCH_CHANGE_HOLD_SEC * analysis.fps)
  const frames: number[] = []
  let current = 0
  let start = 0
  let lastNote = 0
  for (let frame = 0; frame <= pitch.length; frame++) {
    const note = frame < pitch.length ? Math.round(pitch[frame]) : -1
    if (note === current) continue
    // Закончился отрезок одной высоты: если он был нотой и держался, это смена
    if (current > 0 && frame - start >= hold && current !== lastNote) {
      frames.push(start)
      lastNote = current
    }
    current = note
    start = frame
  }
  return frames
}

/** В каждой фразе лесенкой становится шаг, где музыка сама звучит чаще всего. */
function chooseLadderSteps(
  steps: Set<number>[],
  canLadder: (step: number) => boolean,
  phraseSteps: number,
): Set<number> {
  const chosen = new Set<number>()
  for (let start = 0; start < steps.length; start += phraseSteps) {
    let best = -1
    for (let i = start; i < Math.min(start + phraseSteps, steps.length); i++) {
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
  slotCount: number,
  difficulty: Difficulty,
  isSoft: boolean,
  isShort: boolean,
  isCalm: boolean,
): Set<number> {
  // На коротком шаге все доли дали бы пять нажатий в секунду всю песню подряд
  const isCoarse = isShort || isCalm || difficulty.isEighthsOnly
  const coarseStride = slotCount / 2
  const slots = new Set([...real].filter((slot) => !isCoarse || slot % coarseStride === 0))
  // На мягком пульсе ударов почти не слышно, поэтому рисунок «тук, ту-тук» держит сам шаг
  if (isSoft && !difficulty.isEighthsOnly) slots.add(Math.round(slotCount * 0.75))
  // Спокойной части хватает опоры на начало шага: иначе она сложнее припева
  if (isCalm) {
    slots.add(0)
    return slots
  }
  for (const share of difficulty.pulsePattern) slots.add(Math.round(share * slotCount))
  return slots
}

/**
 * Рисунок пальцев. В живой игре одна клавиша подряд почти не встречается, но один
 * и тот же круг быстро надоедает, поэтому рисунки сменяют друг друга: новый берётся
 * после паузы и внутри длинной серии.
 */
function chooseRollLanes(rhythmic: number[], fps: number): Map<number, number> {
  const sorted = [...new Set(rhythmic)].sort((a, b) => a - b)
  const lanes = new Map<number, number>()
  let motif = 0
  let index = 0
  let previous = -1
  for (let i = 0; i < sorted.length; i++) {
    const isNewRun = i > 0 && (sorted[i] - sorted[i - 1]) / fps > ROLL_MAX_GAP_SEC
    const pattern = ROLL_MOTIFS[motif]
    const isLongEnough = index >= ROLL_MOTIF_NOTES && index % pattern.length === 0
    if (isNewRun || isLongEnough) {
      motif = (motif + ROLL_MOTIF_STRIDE) % ROLL_MOTIFS.length
      index = 0
    }
    let lane = ROLL_MOTIFS[motif][index % ROLL_MOTIFS[motif].length]
    // На стыке рисунков не бьём одну клавишу дважды
    if (lane === previous) lane = (lane + 1) % 3
    lanes.set(sorted[i], lane)
    previous = lane
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

/**
 * Пары нот на чётких ударах. В мощной части самые выделяющиеся удары, верхняя
 * часть по силе на фоне соседних, становятся нажатием двумя пальцами. Пара
 * не чаще раза в pairGapSec, и рядом с ней нет нот вплотную: двумя пальцами
 * жмут отдельный удар, а не середину быстрой серии. Дорожки пар чередуются:
 * соседние и крайние, первая и третья.
 */
function addPairs(
  notes: LaneNote[],
  difficulty: Difficulty,
  analysis: AudioAnalysis,
  intensity: Float32Array,
  isLadder: (note: LaneNote) => boolean,
): LaneNote[] {
  if (difficulty.pairGapSec === 0) return notes
  const isCandidate = (note: LaneNote, index: number) => {
    if (note.kind !== 'tap' || isLadder(note)) return false
    if (intensityAt(intensity, note.time, analysis.fps) < INTENSE_LEVEL) return false
    const previous = notes[index - 1]
    const next = notes[index + 1]
    const isClear = (other: LaneNote | undefined) => !other || Math.abs(other.time - note.time) >= PAIR_CLEAR_SEC
    return isClear(previous) && isClear(next)
  }
  const candidates = notes.map((note, index) => ({ note, contrast: hitContrast(analysis, note.time), index }))
    .filter(({ note, index }) => isCandidate(note, index))
  if (candidates.length === 0) return notes
  const threshold = percentileOf(candidates.map(({ contrast }) => contrast), PAIR_TOP_SHARE)

  // Сначала самые чёткие удары: соседние пары ближе pairGapSec уступают им
  const sorted = candidates.filter(({ contrast }) => contrast >= threshold).sort((a, b) => b.contrast - a.contrast)
  const chosen = new Set<LaneNote>()
  const times: number[] = []
  for (const { note } of sorted) {
    if (times.some((time) => Math.abs(time - note.time) < difficulty.pairGapSec)) continue
    chosen.add(note)
    times.push(note.time)
  }

  const result: LaneNote[] = []
  let pairCount = 0
  for (const note of notes) {
    if (!chosen.has(note)) {
      result.push(note)
      continue
    }
    const partner = PAIR_PARTNERS[note.lane][pairCount % 2]
    pairCount += 1
    result.push({ ...note, kind: 'accent' })
    result.push({ ...note, kind: 'accent', lane: partner })
  }
  return result
}

/** Значение, ниже которого лежит доля share всех значений. */
function percentileOf(values: number[], share: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))]
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
  analysis: AudioAnalysis,
  intensity: Float32Array,
  difficulty: Difficulty,
): LaneNote[] {
  const impacts = moments.filter((moment) => moment.kind === 'impact')
  const meanOf = (values: Float32Array, from: number, to: number) => {
    let sum = 0
    let count = 0
    for (let i = Math.max(0, Math.round(from * analysis.fps)); i < Math.min(values.length, Math.round(to * analysis.fps)); i++) {
      sum += values[i]
      count += 1
    }
    return count > 0 ? sum / count : 0
  }

  // Пробел только там, где песня правда меняется: настоящая тишина или резкий подъём.
  // Короткие выпадения баса бывают каждые несколько секунд, на них пробел стал бы шаблоном
  const candidates: number[] = []
  for (const moment of moments) {
    if (moment.kind !== 'pause' || moment.end - moment.start < SPACE_SILENCE_SEC) continue
    const quiet = meanOf(analysis.rms, moment.start, moment.end)
    const before = meanOf(analysis.rms, moment.start - SPACE_LOOK_SEC, moment.start)
    if (quiet < before * SPACE_SILENCE_SHARE) candidates.push(nearestImpact(moment.end, impacts))
  }
  for (let i = 1; i < sections.length; i++) {
    const start = sections[i].start
    // Сила песни сглажена, поэтому сравниваем отрезки чуть в стороне от границы
    const after = meanOf(intensity, start + SPACE_EDGE_SEC, start + SPACE_EDGE_SEC + SPACE_AFTER_SEC)
    const before = meanOf(intensity, start - SPACE_EDGE_SEC - SPACE_LOOK_SEC, start - SPACE_EDGE_SEC)
    const rise = after - before
    if (rise >= SPACE_MIN_RISE) candidates.push(nearestImpact(start, impacts))
  }

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
    // На сложной самый сильный переход берётся сразу тремя пальцами
    const lanes = difficulty.triples ? [0, 1, 2] : [0, 2]
    for (const lane of lanes) result.push({ id: 0, time: impact.start, lane, kind: 'accent', direction: 0 })
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
