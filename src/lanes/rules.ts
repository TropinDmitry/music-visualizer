import type { Difficulty, LaneLevel, LaneNote, ShakeZone } from './level.ts'

/** Правила игры: только числа, без графики и браузера. */

export const PERFECT_WINDOW_SEC = 0.05
export const GOOD_WINDOW_SEC = 0.12

const GOOD_POINTS = 100
const PERFECT_POINTS = 250
const SHAKE_BONUS_POINTS = 1000
const MAX_MULTIPLIER = 4
const COMBO_PER_MULTIPLIER = 10
const ENERGY_LOSS_MISS = 0.07
const ENERGY_GAIN_HIT = 0.012

export type LaneEventType = 'perfect' | 'good' | 'miss' | 'shakeDone'

export interface LaneEvent {
  type: LaneEventType
  /** Дорожка для следа попадания; у встряски -1. */
  lane: number
}

export interface LaneGame {
  level: LaneLevel
  difficulty: Difficulty
  /** Первая нота, которая может быть ещё не разобрана. */
  firstNote: number
  judged: Set<number>
  /** Сколько встрясок засчитано в каждой зоне. */
  shakeCounts: number[]
  finishedZones: Set<number>
  score: number
  combo: number
  maxCombo: number
  hits: number
  misses: number
  energy: number
  failed: boolean
}

export function createLaneGame(level: LaneLevel, difficulty: Difficulty): LaneGame {
  return {
    level,
    difficulty,
    firstNote: 0,
    judged: new Set(),
    shakeCounts: level.shakeZones.map(() => 0),
    finishedZones: new Set(),
    score: 0,
    combo: 0,
    maxCombo: 0,
    hits: 0,
    misses: 0,
    energy: 1,
    failed: false,
  }
}

/** Отмечает пропущенные ноты и завершает зоны встряски. Вызывается каждый кадр. */
export function stepLanes(game: LaneGame, time: number): LaneEvent[] {
  const events: LaneEvent[] = []
  const notes = game.level.notes

  while (game.firstNote < notes.length) {
    const note = notes[game.firstNote]
    if (!game.judged.has(note.id)) {
      if (time <= note.time + GOOD_WINDOW_SEC) break
      game.judged.add(note.id)
      game.combo = 0
      game.misses += 1
      changeEnergy(game, -ENERGY_LOSS_MISS)
      events.push({ type: 'miss', lane: note.lane })
    }
    game.firstNote += 1
  }

  for (const zone of game.level.shakeZones) {
    if (time < zone.end || game.finishedZones.has(zone.id)) continue
    game.finishedZones.add(zone.id)
    if (game.shakeCounts[zone.id] >= zone.target) {
      game.score += SHAKE_BONUS_POINTS * multiplier(game)
      events.push({ type: 'shakeDone', lane: -1 })
    }
  }

  return events
}

/** Нажатие на дорожку: ищем ближайшую обычную ноту в окне. Лишнее нажатие не штрафуется. */
export function pressLane(game: LaneGame, time: number, lane: number): LaneEvent | null {
  return judgeNearest(game, time, (note) => note.kind === 'tap' && note.lane === lane)
}

/** Свайп стрелкой: подходит любая дорожка, важно только направление. */
export function pressSwipe(game: LaneGame, time: number, direction: number): LaneEvent | null {
  return judgeNearest(game, time, (note) => note.kind === 'swipe' && note.direction === direction)
}

function judgeNearest(game: LaneGame, time: number, fits: (note: LaneNote) => boolean): LaneEvent | null {
  const notes = game.level.notes
  let nearest: LaneNote | null = null
  let nearestError = Infinity

  for (let i = game.firstNote; i < notes.length; i++) {
    const note = notes[i]
    if (note.time - time > GOOD_WINDOW_SEC) break
    if (game.judged.has(note.id) || !fits(note)) continue
    const error = Math.abs(note.time - time)
    if (error <= GOOD_WINDOW_SEC && error < nearestError) {
      nearest = note
      nearestError = error
    }
  }

  if (!nearest) return null
  game.judged.add(nearest.id)
  const isPerfect = nearestError <= PERFECT_WINDOW_SEC
  game.score += (isPerfect ? PERFECT_POINTS : GOOD_POINTS) * multiplier(game)
  game.combo += 1
  game.maxCombo = Math.max(game.maxCombo, game.combo)
  game.hits += 1
  changeEnergy(game, ENERGY_GAIN_HIT)
  return { type: isPerfect ? 'perfect' : 'good', lane: nearest.lane }
}

export function activeShakeZone(game: LaneGame, time: number): ShakeZone | null {
  for (const zone of game.level.shakeZones) {
    if (time >= zone.start && time < zone.end) return zone
  }
  return null
}

/** Одна встряска. Вне зоны ничего не делает. */
export function registerShake(game: LaneGame, time: number): void {
  const zone = activeShakeZone(game, time)
  if (zone) game.shakeCounts[zone.id] += 1
}

/** Автопилот для демонстрации: разбирает ноты точно в их момент, независимо от кадров. */
export function playAutopilot(game: LaneGame, time: number): LaneEvent[] {
  const events: LaneEvent[] = []
  for (let i = game.firstNote; i < game.level.notes.length; i++) {
    const note = game.level.notes[i]
    if (note.time > time) break
    if (game.judged.has(note.id)) continue
    const event =
      note.kind === 'tap' ? pressLane(game, note.time, note.lane) : pressSwipe(game, note.time, note.direction)
    if (event) events.push(event)
  }
  // Цикл идёт по зонам, а не по текущему времени: редкий кадр не должен её пропустить
  for (const zone of game.level.shakeZones) {
    if (time >= zone.start) game.shakeCounts[zone.id] = Math.max(game.shakeCounts[zone.id], zone.target)
  }
  return events
}

export function multiplier(game: LaneGame): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(game.combo / COMBO_PER_MULTIPLIER))
}

export function accuracy(game: LaneGame): number {
  const total = game.hits + game.misses
  return total === 0 ? 0 : game.hits / total
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
