import { SHIELD_HALF_ANGLE, type Difficulty, type Note } from './level.ts'

/**
 * Правила игры без графики и без браузера: только числа.
 * Поэтому их можно проверять обычными тестами.
 */

/** Окна нажатия для кольца, в секундах в обе стороны от точного момента. */
export const PERFECT_WINDOW_SEC = 0.06
export const GOOD_WINDOW_SEC = 0.14

const SPARK_POINTS = 100
const GOOD_POINTS = 150
const PERFECT_POINTS = 300
const SHARD_PENALTY_POINTS = 200
const MAX_MULTIPLIER = 4
const COMBO_PER_MULTIPLIER = 10
const ENERGY_LOSS_MISS = 0.08
const ENERGY_LOSS_SHARD = 0.12
const ENERGY_GAIN_HIT = 0.01

export type GameEventType = 'caught' | 'perfect' | 'good' | 'miss' | 'shardHit' | 'shardAvoided'

export interface GameEvent {
  type: GameEventType
  note: Note
}

export interface GameState {
  notes: Note[]
  difficulty: Difficulty
  /** Индекс первой ноты, которая ещё не разобрана. */
  nextIndex: number
  /** Id колец, уже разобранных нажатием. */
  pressedPulseIds: Set<number>
  score: number
  combo: number
  maxCombo: number
  hits: number
  misses: number
  energy: number
  failed: boolean
}

export function createGameState(notes: Note[], difficulty: Difficulty): GameState {
  return {
    notes,
    difficulty,
    nextIndex: 0,
    pressedPulseIds: new Set(),
    score: 0,
    combo: 0,
    maxCombo: 0,
    hits: 0,
    misses: 0,
    energy: 1,
    failed: false,
  }
}

/** Наименьшая разница двух углов, 0..π. Учитывает, что 350° и 10° рядом. */
export function angleDistance(a: number, b: number): number {
  const fullTurn = Math.PI * 2
  const difference = Math.abs(a - b) % fullTurn
  return difference > Math.PI ? fullTurn - difference : difference
}

/** Разбирает ноты, время которых прошло. Вызывается каждый кадр. */
export function stepGame(state: GameState, time: number, shieldAngle: number): GameEvent[] {
  const events: GameEvent[] = []

  while (state.nextIndex < state.notes.length) {
    const note = state.notes[state.nextIndex]
    // Кольцо ждёт нажатия до конца окна, остальные ноты решаются в момент касания
    const deadline = note.kind === 'pulse' ? note.time + GOOD_WINDOW_SEC : note.time
    if (time < deadline) break
    state.nextIndex += 1

    if (note.kind === 'pulse') {
      if (state.pressedPulseIds.has(note.id)) continue
      registerMiss(state)
      events.push({ type: 'miss', note })
      continue
    }

    const shieldCovers = angleDistance(note.angle, shieldAngle) <= SHIELD_HALF_ANGLE
    if (note.kind === 'spark') {
      if (shieldCovers) {
        registerHit(state, SPARK_POINTS)
        events.push({ type: 'caught', note })
      } else {
        registerMiss(state)
        events.push({ type: 'miss', note })
      }
    } else if (shieldCovers) {
      state.combo = 0
      state.score = Math.max(0, state.score - SHARD_PENALTY_POINTS)
      changeEnergy(state, -ENERGY_LOSS_SHARD)
      events.push({ type: 'shardHit', note })
    } else {
      events.push({ type: 'shardAvoided', note })
    }
  }

  return events
}

/** Нажатие кнопки: ищем ближайшее по времени кольцо в окне. Мимо окна штрафа нет. */
export function pressPulse(state: GameState, time: number): GameEvent | null {
  let nearest: Note | null = null
  let nearestError = Infinity

  for (let i = state.nextIndex; i < state.notes.length; i++) {
    const note = state.notes[i]
    if (note.time - time > GOOD_WINDOW_SEC) break
    if (note.kind !== 'pulse' || state.pressedPulseIds.has(note.id)) continue
    const error = Math.abs(note.time - time)
    if (error <= GOOD_WINDOW_SEC && error < nearestError) {
      nearest = note
      nearestError = error
    }
  }

  if (!nearest) return null
  state.pressedPulseIds.add(nearest.id)
  const isPerfect = nearestError <= PERFECT_WINDOW_SEC
  registerHit(state, isPerfect ? PERFECT_POINTS : GOOD_POINTS)
  return { type: isPerfect ? 'perfect' : 'good', note: nearest }
}

/**
 * Автопилот для демонстрации: разбирает все наступившие ноты точно в их момент.
 * Идёт по времени нот, а не по кадрам, поэтому результат не зависит от частоты кадров.
 */
export function playAutopilot(state: GameState, time: number, shieldAngle: number): GameEvent[] {
  const events: GameEvent[] = []
  let angle = shieldAngle

  while (state.nextIndex < state.notes.length) {
    const note = state.notes[state.nextIndex]
    if (time < note.time) break

    if (note.kind === 'pulse') {
      const event = pressPulse(state, note.time)
      if (event) events.push(event)
      state.nextIndex += 1
      continue
    }
    if (note.kind === 'spark') angle = note.angle
    events.push(...stepGame(state, note.time, angle))
  }

  return events
}

export function currentMultiplier(state: GameState): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(state.combo / COMBO_PER_MULTIPLIER))
}

/** Доля пойманных нот, 0..1. Осколки не считаются: ловить их не надо. */
export function accuracy(state: GameState): number {
  const total = state.hits + state.misses
  return total === 0 ? 0 : state.hits / total
}

export function rank(state: GameState): string {
  const value = accuracy(state)
  if (value >= 0.95) return 'S'
  if (value >= 0.85) return 'A'
  if (value >= 0.7) return 'B'
  return 'C'
}

function registerHit(state: GameState, points: number): void {
  state.score += points * currentMultiplier(state)
  state.combo += 1
  state.maxCombo = Math.max(state.maxCombo, state.combo)
  state.hits += 1
  changeEnergy(state, ENERGY_GAIN_HIT)
}

function registerMiss(state: GameState): void {
  state.combo = 0
  state.misses += 1
  changeEnergy(state, -ENERGY_LOSS_MISS)
}

function changeEnergy(state: GameState, amount: number): void {
  state.energy = Math.min(1, Math.max(0, state.energy + amount))
  if (state.energy === 0 && state.difficulty.canFail) state.failed = true
}
