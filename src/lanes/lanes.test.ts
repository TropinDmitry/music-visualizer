import { describe, expect, it } from 'vitest'
import { analyzeAudio, mixToMono } from '../audio/analyzer.ts'
import { synthesizeDemoTrack } from '../audio/demoTrack.ts'
import { DIFFICULTIES, findDifficulty, generateLaneLevel, type LaneLevel } from './level.ts'
import {
  accuracy,
  createLaneGame,
  GOOD_WINDOW_SEC,
  playAutopilot,
  pressLane,
  pressSwipe,
  rank,
  registerShake,
  stepLanes,
} from './rules.ts'

const demo = synthesizeDemoTrack(40)
const analysis = analyzeAudio(mixToMono([demo.left, demo.right]), demo.sampleRate)
const hard = findDifficulty('hard')
const easy = findDifficulty('easy')

describe('generateLaneLevel', () => {
  it('один трек всегда даёт один уровень', () => {
    expect(generateLaneLevel(analysis, hard)).toEqual(generateLaneLevel(analysis, hard))
  })

  it('используются все три дорожки и нет трёх нот подряд на одной', () => {
    for (const difficulty of DIFFICULTIES) {
      const { notes } = generateLaneLevel(analysis, difficulty)
      expect(new Set(notes.map((note) => note.lane)).size).toBe(3)
      for (let i = 2; i < notes.length; i++) {
        const sameThree = notes[i].lane === notes[i - 1].lane && notes[i].lane === notes[i - 2].lane
        expect(sameThree).toBe(false)
      }
    }
  })

  it('есть свайпы в обе стороны', () => {
    const swipes = generateLaneLevel(analysis, hard).notes.filter((note) => note.kind === 'swipe')
    expect(new Set(swipes.map((note) => note.direction))).toEqual(new Set([-1, 1]))
  })

  it('внутри зоны встряски нот нет', () => {
    const level = generateLaneLevel(analysis, hard)
    expect(level.shakeZones.length).toBeGreaterThan(0)
    for (const zone of level.shakeZones) {
      for (const note of level.notes) {
        expect(note.time < zone.start || note.time > zone.end).toBe(true)
      }
    }
  })

  it('в коротком треке встряски нет, в тишине нет ничего', () => {
    const short = synthesizeDemoTrack(12)
    const shortAnalysis = analyzeAudio(mixToMono([short.left, short.right]), short.sampleRate)
    expect(generateLaneLevel(shortAnalysis, hard).shakeZones).toEqual([])

    const silence = analyzeAudio(new Float32Array(44100 * 4), 44100)
    expect(generateLaneLevel(silence, hard)).toEqual({ notes: [], shakeZones: [] })
  })
})

describe('смена бита посреди трека', () => {
  /** Бочка раз в 0,8 с в первой половине и раз в 0,4 с во второй. */
  function beatSwitchTrack(): Float32Array {
    const sampleRate = 44100
    const samples = new Float32Array(sampleRate * 40)
    const addKick = (time: number) => {
      const start = Math.round(time * sampleRate)
      const length = Math.round(0.2 * sampleRate)
      for (let i = 0; i < length && start + i < samples.length; i++) {
        const t = i / sampleRate
        samples[start + i] += 0.9 * Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t * 18)
      }
    }
    for (let time = 2; time < 20; time += 0.8) addKick(time)
    for (let time = 20; time < 39; time += 0.4) addKick(time)
    return samples
  }

  it('после смены бита нот становится больше', () => {
    const switched = analyzeAudio(beatSwitchTrack(), 44100)
    const { notes } = generateLaneLevel(switched, findDifficulty('normal'))

    const before = notes.filter((note) => note.time >= 5 && note.time < 18).length
    const after = notes.filter((note) => note.time >= 22 && note.time < 35).length
    expect(after).toBeGreaterThan(before * 1.5)
  })
})

describe('правила', () => {
  const level: LaneLevel = {
    notes: [
      { id: 0, time: 1, lane: 0, kind: 'tap', direction: 0 },
      { id: 1, time: 2, lane: 1, kind: 'swipe', direction: 1 },
      { id: 2, time: 3, lane: 2, kind: 'tap', direction: 0 },
    ],
    shakeZones: [{ id: 0, start: 4, end: 7, target: 3 }],
  }

  it('нажатие на нужной дорожке засчитывается, на чужой нет', () => {
    const game = createLaneGame(level, easy)
    expect(pressLane(game, 1.01, 1)).toBeNull()
    expect(pressLane(game, 1.01, 0)?.type).toBe('perfect')
    expect(pressLane(game, 1.01, 0)).toBeNull()
  })

  it('свайп проверяет направление', () => {
    const game = createLaneGame(level, easy)
    expect(pressSwipe(game, 2, -1)).toBeNull()
    expect(pressSwipe(game, 2 + GOOD_WINDOW_SEC - 0.01, 1)?.type).toBe('good')
  })

  it('пропущенная нота — промах и сброс комбо', () => {
    const game = createLaneGame(level, easy)
    pressLane(game, 1, 0)
    expect(game.combo).toBe(1)
    const events = stepLanes(game, 2 + GOOD_WINDOW_SEC + 0.01)
    expect(events.map((event) => event.type)).toEqual(['miss'])
    expect(game.combo).toBe(0)
  })

  it('встряска приносит бонус только при достаточном числе движений', () => {
    const done = createLaneGame({ notes: [], shakeZones: level.shakeZones }, easy)
    registerShake(done, 3) // вне зоны не считается
    for (let i = 0; i < 3; i++) registerShake(done, 5)
    expect(stepLanes(done, 7)[0].type).toBe('shakeDone')
    expect(done.score).toBe(1000)
    expect(stepLanes(done, 8)).toEqual([])

    const lazy = createLaneGame({ notes: [], shakeZones: level.shakeZones }, easy)
    registerShake(lazy, 5)
    expect(stepLanes(lazy, 7)).toEqual([])
    expect(lazy.score).toBe(0)
  })

  it('автопилот проходит сложный уровень без промахов даже при редких кадрах', () => {
    const generated = generateLaneLevel(analysis, hard)
    const game = createLaneGame(generated, hard)
    for (let time = 0; time <= analysis.duration + 1; time += 0.5) {
      playAutopilot(game, time)
      stepLanes(game, time)
    }
    expect(game.misses).toBe(0)
    expect(accuracy(game)).toBe(1)
    expect(rank(game)).toBe('S')
    expect(game.finishedZones.size).toBe(generated.shakeZones.length)
  })

  it('на лёгкой проиграть нельзя, на сложной можно', () => {
    const notes = []
    for (let i = 0; i < 20; i++) notes.push({ id: i, time: i, lane: 0, kind: 'tap' as const, direction: 0 })
    const safe = createLaneGame({ notes, shakeZones: [] }, easy)
    stepLanes(safe, 100)
    expect(safe.failed).toBe(false)
    const risky = createLaneGame({ notes, shakeZones: [] }, hard)
    stepLanes(risky, 100)
    expect(risky.failed).toBe(true)
  })
})
