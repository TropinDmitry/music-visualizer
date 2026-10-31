import { describe, expect, it } from 'vitest'
import { analyzeAudio, mixToMono } from '../audio/analyzer.ts'
import { synthesizeDemoTrack } from '../audio/demoTrack.ts'
import {
  accuracy,
  angleDistance,
  createGameState,
  GOOD_WINDOW_SEC,
  playAutopilot,
  pressPulse,
  rank,
  stepGame,
} from './gameState.ts'
import { DIFFICULTIES, findDifficulty, generateLevel, SHIELD_HALF_ANGLE, type Note } from './level.ts'

const demo = synthesizeDemoTrack(12)
const analysis = analyzeAudio(mixToMono([demo.left, demo.right]), demo.sampleRate)
const easy = findDifficulty('easy')
const hard = findDifficulty('hard')

/** Идеальная игра: щит всегда на искре, кольца нажаты точно вовремя. */
function playPerfectly(notes: Note[], difficultyId: 'easy' | 'normal' | 'hard') {
  const state = createGameState(notes, findDifficulty(difficultyId))
  let shieldAngle = Math.PI / 2
  for (const note of notes) {
    if (note.kind === 'spark') shieldAngle = note.angle
    if (note.kind === 'pulse') pressPulse(state, note.time)
    stepGame(state, note.time, shieldAngle)
  }
  stepGame(state, 1000, shieldAngle)
  return state
}

describe('generateLevel', () => {
  it('один и тот же трек даёт один и тот же уровень', () => {
    expect(generateLevel(analysis, hard)).toEqual(generateLevel(analysis, hard))
  })

  it('ноты идут по времени и лежат внутри трека', () => {
    for (const difficulty of DIFFICULTIES) {
      const notes = generateLevel(analysis, difficulty)
      expect(notes.length).toBeGreaterThan(0)
      for (let i = 0; i < notes.length; i++) {
        expect(notes[i].time).toBeGreaterThanOrEqual(1.5)
        expect(notes[i].time).toBeLessThan(analysis.duration)
        if (i > 0) expect(notes[i].time).toBeGreaterThanOrEqual(notes[i - 1].time)
      }
    }
  })

  it('чем выше сложность, тем больше нот', () => {
    expect(generateLevel(analysis, hard).length).toBeGreaterThan(generateLevel(analysis, easy).length)
  })

  it('на кольца попадают сильные доли бочки', () => {
    const pulses = generateLevel(analysis, easy).filter((note) => note.kind === 'pulse')
    expect(pulses.length).toBeGreaterThan(5)
    for (const pulse of pulses) {
      const offBeat = Math.abs(pulse.time / 0.5 - Math.round(pulse.time / 0.5)) * 0.5
      expect(offBeat).toBeLessThan(0.04)
    }
  })

  it('до следующей искры щит всегда успевает доехать', () => {
    for (const difficulty of DIFFICULTIES) {
      let lastAngle = Math.PI / 2
      let lastTime = 1.5
      for (const note of generateLevel(analysis, difficulty)) {
        if (note.kind !== 'spark') continue
        const allowedTurn = difficulty.maxTurnPerSec * (note.time - lastTime)
        expect(Math.abs(note.angle - lastAngle)).toBeLessThanOrEqual(allowedTurn + 1e-6)
        lastAngle = note.angle
        lastTime = note.time
      }
    }
  })

  it('в тишине нот нет', () => {
    const silence = analyzeAudio(new Float32Array(44100 * 4), 44100)
    expect(generateLevel(silence, hard)).toEqual([])
  })
})

describe('правила игры', () => {
  it('идеальная игра даёт 100 % и ранг S', () => {
    for (const id of ['easy', 'normal', 'hard'] as const) {
      const notes = generateLevel(analysis, findDifficulty(id))
      const state = playPerfectly(notes, id)
      expect(state.misses).toBe(0)
      expect(accuracy(state)).toBe(1)
      expect(rank(state)).toBe('S')
    }
  })

  it('автопилот проходит уровень без промахов даже при редких кадрах', () => {
    const notes = generateLevel(analysis, hard)
    const state = createGameState(notes, hard)
    for (let time = 0; time <= analysis.duration + 1; time += 1) playAutopilot(state, time, 0)
    expect(state.nextIndex).toBe(notes.length)
    expect(state.misses).toBe(0)
    expect(state.energy).toBe(1)
  })

  it('искра вне щита — промах и сброс комбо', () => {
    const notes: Note[] = [
      { id: 0, time: 1, angle: 0, kind: 'spark' },
      { id: 1, time: 2, angle: 0, kind: 'spark' },
    ]
    const state = createGameState(notes, easy)
    expect(stepGame(state, 1, 0)[0].type).toBe('caught')
    expect(state.combo).toBe(1)
    expect(stepGame(state, 2, Math.PI)[0].type).toBe('miss')
    expect(state.combo).toBe(0)
  })

  it('щит ловит искру через границу 0/2π', () => {
    expect(angleDistance(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(0.2)
    const notes: Note[] = [{ id: 0, time: 1, angle: 0.1, kind: 'spark' }]
    const state = createGameState(notes, easy)
    expect(stepGame(state, 1, -0.1)[0].type).toBe('caught')
  })

  it('осколок отнимает энергию, только если задет щитом', () => {
    const notes: Note[] = [
      { id: 0, time: 1, angle: 0, kind: 'shard' },
      { id: 1, time: 2, angle: 0, kind: 'shard' },
    ]
    const state = createGameState(notes, hard)
    expect(stepGame(state, 1, Math.PI)[0].type).toBe('shardAvoided')
    expect(state.energy).toBe(1)
    expect(stepGame(state, 2, SHIELD_HALF_ANGLE / 2)[0].type).toBe('shardHit')
    expect(state.energy).toBeLessThan(1)
  })

  it('кольцо: точное нажатие, позднее нажатие и промах', () => {
    const pulse = (id: number, time: number): Note => ({ id, time, angle: 0, kind: 'pulse' })
    const state = createGameState([pulse(0, 1), pulse(1, 2), pulse(2, 3)], easy)

    expect(pressPulse(state, 1.02)?.type).toBe('perfect')
    expect(pressPulse(state, 1.5)).toBeNull()
    expect(pressPulse(state, 2 + GOOD_WINDOW_SEC - 0.01)?.type).toBe('good')

    const events = stepGame(state, 3 + GOOD_WINDOW_SEC, 0)
    expect(events.map((event) => event.type)).toEqual(['miss'])
    expect(state.hits).toBe(2)
    expect(state.misses).toBe(1)
  })

  it('на лёгкой сложности проиграть нельзя, на сложной можно', () => {
    const misses: Note[] = []
    for (let i = 0; i < 20; i++) misses.push({ id: i, time: i, angle: 0, kind: 'spark' })

    const easyState = createGameState(misses, easy)
    stepGame(easyState, 100, Math.PI)
    expect(easyState.failed).toBe(false)

    const hardState = createGameState(misses, hard)
    stepGame(hardState, 100, Math.PI)
    expect(hardState.failed).toBe(true)
  })
})
