import type { Difficulty, LaneNote, NoteKind } from './level.ts'

/** Правила игры: только числа, без графики и браузера. */

export const PERFECT_WINDOW_SEC = 0.05
export const GOOD_WINDOW_SEC = 0.12
/**
 * Стрелку нельзя отбить, пока она не коснулась чаши: раньше засчитывался взмах
 * по стрелке, которая ещё летела. Зато она задерживается на чаше: смахивание на
 * телефоне занимает время, и палец не должен гнаться за пролетающей нотой.
 */
export const SWIPE_EARLY_SEC = 0.04
export const SWIPE_LATE_SEC = 0.3
const SWIPE_PERFECT_LATE_SEC = 0.12
/**
 * Пробел тоже ждёт на чашах, как стрелка: на телефоне его берут касанием, и
 * палец не должен гнаться за пролетающей плашкой. Нажать раньше можно, как обычную ноту.
 */
export const SPACE_LATE_SEC = SWIPE_LATE_SEC
/** Со скольких промахов подряд игрока предупреждают. */
export const MISS_WARNING_STREAK = 3

const GOOD_POINTS = 100
const PERFECT_POINTS = 250
/** Стрелка требует сменить жест, поэтому она дороже обычной ноты. */
const ARROW_BONUS = 1.5
const STAR_BONUS = 2
/** Сколько звёзд нужно собрать для суперрежима. */
export const STARS_FOR_OVERDRIVE = 3
export const OVERDRIVE_SEC = 8
/** Звезда во время суперрежима не копится, а продлевает его на треть. */
const OVERDRIVE_EXTEND_SEC = OVERDRIVE_SEC / STARS_FOR_OVERDRIVE
const OVERDRIVE_BONUS = 2
/** Пока луч зажат, очки капают маленькими порциями. */
const HOLD_TICK_SEC = 0.1
const HOLD_TICK_POINTS = 15
const HOLD_DONE_POINTS = 200
/** Отпустить можно чуть раньше конца луча: точность до кадра здесь не нужна. */
const HOLD_RELEASE_GRACE_SEC = 0.15
const ENERGY_LOSS_HOLD_BROKEN = 0.05
/**
 * Ступени множителя: ×2, ×4, ×6, ×8. Каждая следующая дороже прошлой на 20 попаданий
 * подряд: до ×2 нужно 20, до ×4 ещё 40, до ×6 ещё 60, до ×8 ещё 80. Высокий
 * множитель это награда за долгую чистую игру, а не за пару удачных тактов.
 */
export const MULTIPLIER_STEPS = [
  { value: 1, combo: 0 },
  { value: 2, combo: 20 },
  { value: 4, combo: 60 },
  { value: 6, combo: 120 },
  { value: 8, combo: 200 },
]
const ENERGY_LOSS_MISS = 0.07
const ENERGY_GAIN_HIT = 0.012
/** На этих значениях комбо игра хвалит игрока. */
const COMBO_MILESTONES = [10, 25, 50, 75, 100, 150, 200, 300, 500]

/** Уровни серии: чем дольше без промаха, тем сильнее меняется экран. */
export const STREAK_TIERS = [{ from: 0 }, { from: 10 }, { from: 25 }, { from: 50 }, { from: 100 }]

export type LaneEventType = 'perfect' | 'good' | 'miss' | 'holdDone' | 'holdBroken'

export interface LaneEvent {
  type: LaneEventType
  lane: number
  /** Какая нота: по ней сцена и звук выбирают эффект. */
  kind: NoteKind
  direction: number
  /** Сколько очков принесла нота. */
  points: number
  /** Значение комбо, если на этой ноте взята круглая отметка, иначе 0. */
  milestone: number
  /** true на промахе, с которого начинается предупреждение. */
  warning: boolean
  noteTime: number
  /** На этой ноте включился суперрежим. */
  startedOverdrive?: boolean
  /** Звезда продлила уже идущий суперрежим. */
  extendedOverdrive?: boolean
}

/** Луч, который игрок сейчас держит. */
export interface ActiveHold {
  note: LaneNote
  /** До какого момента за этот луч уже начислены очки. */
  scoredUntil: number
}

export interface LaneGame {
  notes: LaneNote[]
  difficulty: Difficulty
  /** Первая нота, которая может быть ещё не разобрана. */
  firstNote: number
  judged: Set<number>
  /** Какие лучи зажаты сейчас, по дорожкам. */
  holds: (ActiveHold | null)[]
  score: number
  combo: number
  maxCombo: number
  perfects: number
  goods: number
  misses: number
  missStreak: number
  energy: number
  failed: boolean
  /** Собранные звёзды: когда их достаточно, включается суперрежим. */
  starCharge: number
  overdriveUntil: number
}

export function createLaneGame(notes: LaneNote[], difficulty: Difficulty): LaneGame {
  return {
    notes,
    difficulty,
    firstNote: 0,
    judged: new Set(),
    holds: [null, null, null],
    score: 0,
    combo: 0,
    maxCombo: 0,
    perfects: 0,
    goods: 0,
    misses: 0,
    missStreak: 0,
    energy: 1,
    failed: false,
    starCharge: 0,
    overdriveUntil: -Infinity,
  }
}

/** Насколько раньше своего времени ноту можно нажать. */
function earlyWindow(note: LaneNote): number {
  return note.kind === 'swipe' ? SWIPE_EARLY_SEC : GOOD_WINDOW_SEC
}

/** Насколько позже своего времени нота ещё ждёт нажатия. */
export function lateWindow(note: LaneNote): number {
  if (note.kind === 'swipe') return SWIPE_LATE_SEC
  return note.kind === 'space' ? SPACE_LATE_SEC : GOOD_WINDOW_SEC
}

/** Есть ли сейчас пробел, который можно нажать. На телефоне тогда любое касание идёт в пробел. */
export function isSpaceDue(game: LaneGame, time: number): boolean {
  for (let i = game.firstNote; i < game.notes.length; i++) {
    const note = game.notes[i]
    if (note.time - time > GOOD_WINDOW_SEC) break
    const late = time - note.time
    const isOpen = late >= -earlyWindow(note) && late <= lateWindow(note)
    if (note.kind === 'space' && !game.judged.has(note.id) && isOpen) return true
  }
  return false
}

/** Отмечает пропущенные ноты. Вызывается каждый кадр. */
export function stepLanes(game: LaneGame, time: number): LaneEvent[] {
  const events: LaneEvent[] = []

  // Стрелка ждёт дольше других нот, поэтому идём дальше неё, а не останавливаемся на ней
  for (let i = game.firstNote; i < game.notes.length; i++) {
    const note = game.notes[i]
    if (note.time + GOOD_WINDOW_SEC >= time) break
    if (!game.judged.has(note.id)) {
      if (time <= note.time + lateWindow(note)) continue
      game.judged.add(note.id)
      game.combo = 0
      game.misses += 1
      game.missStreak += 1
      changeEnergy(game, -ENERGY_LOSS_MISS)
      events.push({
        type: 'miss',
        lane: note.lane,
        kind: note.kind,
        direction: note.direction,
        points: 0,
        milestone: 0,
        warning: game.missStreak === MISS_WARNING_STREAK,
        noteTime: note.time,
      })
    }
  }
  while (game.firstNote < game.notes.length && game.judged.has(game.notes[game.firstNote].id)) game.firstNote += 1

  for (let lane = 0; lane < game.holds.length; lane++) {
    const hold = game.holds[lane]
    if (!hold) continue
    scoreHold(game, hold, time)
    if (time >= holdEnd(hold)) events.push(finishHold(game, lane, hold))
  }

  return events
}

function holdEnd(hold: ActiveHold): number {
  return hold.note.time + (hold.note.duration ?? 0)
}

/** Начисляет очки за прошедшее время удержания. */
function scoreHold(game: LaneGame, hold: ActiveHold, time: number): void {
  const until = Math.min(time, holdEnd(hold))
  const ticks = Math.floor((until - hold.scoredUntil) / HOLD_TICK_SEC)
  if (ticks <= 0) return
  game.score += ticks * HOLD_TICK_POINTS * multiplier(game)
  hold.scoredUntil += ticks * HOLD_TICK_SEC
}

function finishHold(game: LaneGame, lane: number, hold: ActiveHold): LaneEvent {
  game.holds[lane] = null
  const points = HOLD_DONE_POINTS * multiplier(game)
  game.score += points
  game.combo += 1
  game.maxCombo = Math.max(game.maxCombo, game.combo)
  return {
    type: 'holdDone',
    lane,
    kind: 'hold',
    direction: 0,
    points,
    milestone: COMBO_MILESTONES.includes(game.combo) ? game.combo : 0,
    warning: false,
    noteTime: hold.note.time,
  }
}

/** Клавишу отпустили. Если луч ещё идёт, серия обрывается. */
export function releaseLane(game: LaneGame, time: number, lane: number): LaneEvent | null {
  const hold = game.holds[lane]
  if (!hold) return null
  scoreHold(game, hold, time)
  if (time >= holdEnd(hold) - HOLD_RELEASE_GRACE_SEC) return finishHold(game, lane, hold)

  game.holds[lane] = null
  game.combo = 0
  changeEnergy(game, -ENERGY_LOSS_HOLD_BROKEN)
  return {
    type: 'holdBroken',
    lane,
    kind: 'hold',
    direction: 0,
    points: 0,
    milestone: 0,
    warning: false,
    noteTime: hold.note.time,
  }
}

/** Нажатие на дорожку: ищем ближайшую обычную ноту в окне. Лишнее нажатие не штрафуется. */
export function pressLane(game: LaneGame, time: number, lane: number): LaneEvent | null {
  return judgeNearest(game, time, (note) => note.kind !== 'swipe' && note.kind !== 'space' && note.lane === lane)
}

/** Пробел: длинная нота на все дорожки. */
export function pressSpace(game: LaneGame, time: number): LaneEvent | null {
  return judgeNearest(game, time, (note) => note.kind === 'space')
}

/**
 * Стрелка: важно только направление, -1 влево, 1 вправо, 0 вверх. null — любое:
 * на телефоне направление и так задано дорожкой стрелки, смахнуть можно куда удобно.
 */
export function pressSwipe(game: LaneGame, time: number, direction: number | null): LaneEvent | null {
  return judgeNearest(game, time, (note) => note.kind === 'swipe' && (direction === null || note.direction === direction))
}

function judgeNearest(game: LaneGame, time: number, fits: (note: LaneNote) => boolean): LaneEvent | null {
  let nearest: LaneNote | null = null
  let nearestError = Infinity

  for (let i = game.firstNote; i < game.notes.length; i++) {
    const note = game.notes[i]
    if (note.time - time > GOOD_WINDOW_SEC) break
    if (game.judged.has(note.id) || !fits(note)) continue
    const late = time - note.time
    if (late < -earlyWindow(note) || late > lateWindow(note)) continue
    const error = Math.abs(late)
    if (error < nearestError) {
      nearest = note
      nearestError = error
    }
  }

  if (!nearest) return null
  game.judged.add(nearest.id)
  if (nearest.kind === 'hold') game.holds[nearest.lane] = { note: nearest, scoredUntil: nearest.time }
  // У стрелки точное попадание с момента касания чаши и пока она на ней тормозит
  const late = time - nearest.time
  // Пробел ждёт на чашах, как стрелка: точно и в начале этого ожидания
  const isPerfect =
    nearest.kind === 'swipe'
      ? late <= SWIPE_PERFECT_LATE_SEC
      : nearestError <= PERFECT_WINDOW_SEC || (nearest.kind === 'space' && late >= 0 && late <= SWIPE_PERFECT_LATE_SEC)
  const isSpecial = nearest.kind === 'star' || nearest.kind === 'accent' || nearest.kind === 'space'
  const overdriveBonus = isOverdrive(game, nearest.time) ? OVERDRIVE_BONUS : 1
  const bonus = isSpecial ? STAR_BONUS : nearest.kind === 'swipe' ? ARROW_BONUS : 1
  const points = (isPerfect ? PERFECT_POINTS : GOOD_POINTS) * multiplier(game) * bonus * overdriveBonus

  let startedOverdrive = false
  let extendedOverdrive = false
  if (nearest.kind === 'star' && isOverdrive(game, nearest.time)) {
    game.overdriveUntil += OVERDRIVE_EXTEND_SEC
    extendedOverdrive = true
  } else if (nearest.kind === 'star') {
    game.starCharge += 1
    if (game.starCharge >= STARS_FOR_OVERDRIVE) {
      game.starCharge = 0
      game.overdriveUntil = nearest.time + OVERDRIVE_SEC
      startedOverdrive = true
    }
  }
  game.score += points
  game.combo += 1
  game.maxCombo = Math.max(game.maxCombo, game.combo)
  game.missStreak = 0
  if (isPerfect) game.perfects += 1
  else game.goods += 1
  changeEnergy(game, ENERGY_GAIN_HIT)
  return {
    type: isPerfect ? 'perfect' : 'good',
    lane: nearest.lane,
    kind: nearest.kind,
    direction: nearest.direction,
    points,
    milestone: COMBO_MILESTONES.includes(game.combo) ? game.combo : 0,
    warning: false,
    noteTime: nearest.time,
    startedOverdrive,
    extendedOverdrive,
  }
}

export function isOverdrive(game: LaneGame, time: number): boolean {
  return time < game.overdriveUntil
}

/** Номер уровня серии: индекс в STREAK_TIERS. */
export function streakTier(combo: number): number {
  let tier = 0
  for (let i = 0; i < STREAK_TIERS.length; i++) {
    if (combo >= STREAK_TIERS[i].from) tier = i
  }
  return tier
}

/** Заполнение шкалы до следующего уровня серии, 0..1. */
export function streakProgress(combo: number): number {
  const tier = streakTier(combo)
  if (tier === STREAK_TIERS.length - 1) return 1
  const from = STREAK_TIERS[tier].from
  return (combo - from) / (STREAK_TIERS[tier + 1].from - from)
}

/** Автопилот для демонстрации: разбирает ноты точно в их момент, независимо от кадров. */
export function playAutopilot(game: LaneGame, time: number): LaneEvent[] {
  const events: LaneEvent[] = []
  for (let i = game.firstNote; i < game.notes.length; i++) {
    const note = game.notes[i]
    if (note.time > time) break
    if (game.judged.has(note.id)) continue
    const event =
      note.kind === 'swipe'
        ? pressSwipe(game, note.time, note.direction)
        : note.kind === 'space'
          ? pressSpace(game, note.time)
          : pressLane(game, note.time, note.lane)
    if (event) events.push(event)
  }
  return events
}

/** Номер текущей ступени множителя в MULTIPLIER_STEPS. */
function multiplierStep(game: LaneGame): number {
  let step = 0
  while (step + 1 < MULTIPLIER_STEPS.length && game.combo >= MULTIPLIER_STEPS[step + 1].combo) step += 1
  return step
}

export function multiplier(game: LaneGame): number {
  return MULTIPLIER_STEPS[multiplierStep(game)].value
}

/** Заполнение шкалы до следующего множителя, 0..1. На максимуме шкала полная. */
export function multiplierProgress(game: LaneGame): number {
  const step = multiplierStep(game)
  if (step + 1 >= MULTIPLIER_STEPS.length) return 1
  const from = MULTIPLIER_STEPS[step].combo
  return (game.combo - from) / (MULTIPLIER_STEPS[step + 1].combo - from)
}

export function accuracy(game: LaneGame): number {
  const hits = game.perfects + game.goods
  const total = hits + game.misses
  return total === 0 ? 0 : hits / total
}

/** Звёзды за партию, от 0 до 3. */
export function starRating(game: LaneGame): number {
  const value = accuracy(game)
  if (value >= 0.95) return 3
  if (value >= 0.85) return 2
  return value >= 0.7 ? 1 : 0
}

export function rank(game: LaneGame): string {
  const value = accuracy(game)
  if (value >= 0.95) return 'S'
  if (value >= 0.85) return 'A'
  if (value >= 0.7) return 'B'
  return 'C'
}

function changeEnergy(game: LaneGame, amount: number): void {
  game.energy = Math.min(1, Math.max(0, game.energy + amount))
  if (game.energy === 0 && game.difficulty.canFail) game.failed = true
}
