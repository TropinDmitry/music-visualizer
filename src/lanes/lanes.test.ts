import { describe, expect, it } from 'vitest'
import { analyzeAudio, mixToMono } from '../audio/analyzer.ts'
import { synthesizeDemoTrack } from '../audio/demoTrack.ts'
import { findMoments } from './structure.ts'
import { DIFFICULTIES, findDifficulty, generateLaneLevel, type LaneNote } from './level.ts'
import {
  accuracy,
  createLaneGame,
  GOOD_WINDOW_SEC,
  MISS_WARNING_STREAK,
  multiplierProgress,
  playAutopilot,
  pressLane,
  pressSwipe,
  rank,
  releaseLane,
  starRating,
  stepLanes,
} from './rules.ts'

const demo = synthesizeDemoTrack(40)
const analysis = analyzeAudio(mixToMono([demo.left, demo.right]), demo.sampleRate)
const hard = findDifficulty('hard')
const easy = findDifficulty('easy')

/** Ряд обычных нот на первой дорожке: по одной в секунду. */
function tapRow(count: number): LaneNote[] {
  const notes: LaneNote[] = []
  for (let i = 0; i < count; i++) notes.push({ id: i, time: i + 1, lane: 0, kind: 'tap', direction: 0 })
  return notes
}

describe('generateLaneLevel', () => {
  it('один трек всегда даёт один уровень', () => {
    expect(generateLaneLevel(analysis, hard)).toEqual(generateLaneLevel(analysis, hard))
  })

  it('используются все три дорожки и нет трёх нот подряд на одной', () => {
    for (const difficulty of DIFFICULTIES) {
      const notes = generateLaneLevel(analysis, difficulty)
      expect(new Set(notes.map((note) => note.lane)).size).toBe(3)
      for (let i = 2; i < notes.length; i++) {
        // Длинная пауза после луча разрывает серию, поэтому здесь её не считаем
        const isContinuous = notes[i].time - notes[i - 2].time < 0.9
        const sameThree = notes[i].lane === notes[i - 1].lane && notes[i].lane === notes[i - 2].lane
        expect(isContinuous && sameThree).toBe(false)
      }
    }
  })

  it('есть свайпы в обе стороны', () => {
    const swipes = generateLaneLevel(analysis, hard).filter((note) => note.kind === 'swipe')
    expect(new Set(swipes.map((note) => note.direction))).toEqual(new Set([-1, 1]))
  })

  it('звёзды редкие и не занимают место стрелок', () => {
    const notes = generateLaneLevel(analysis, hard)
    const stars = notes.filter((note) => note.kind === 'star')
    expect(stars.length).toBeGreaterThan(0)
    expect(stars.length).toBeLessThan(notes.length / 10)
  })

  it('лучи есть на всех сложностях, и под лучом на его дорожке нет нот', () => {
    for (const difficulty of DIFFICULTIES) {
      const notes = generateLaneLevel(analysis, difficulty)
      const holds = notes.filter((note) => note.kind === 'hold')
      expect(holds.length).toBeGreaterThan(0)
      for (const hold of holds) {
        const end = hold.time + (hold.duration ?? 0)
        expect(hold.duration).toBeGreaterThan(0.7)
        for (const note of notes) {
          const isUnderBeam = note.time > hold.time && note.time < end
          expect(isUnderBeam && note.lane === hold.lane).toBe(false)
        }
      }
    }
  })

  it('в тишине нот нет', () => {
    const silence = analyzeAudio(new Float32Array(44100 * 4), 44100)
    expect(generateLaneLevel(silence, hard)).toEqual([])
  })
})

describe('драматургия песни', () => {
  const SAMPLE_RATE = 44100

  /** Бочка с заданной громкостью от и до. */
  function addKicks(samples: Float32Array, from: number, to: number, step: number, volume: (t: number) => number) {
    for (let time = from; time < to; time += step) {
      const start = Math.round(time * SAMPLE_RATE)
      const length = Math.round(0.45 * SAMPLE_RATE) // до полного затухания: обрыв сам звучал бы как удар
      for (let i = 0; i < length && start + i < samples.length; i++) {
        const t = i / SAMPLE_RATE
        samples[start + i] += volume(time) * Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t * 12)
      }
    }
  }

  /** Тихий куплет, разгон к секунде 20, пауза до 21, громкий припев. */
  function dramaticTrack(): Float32Array {
    const samples = new Float32Array(SAMPLE_RATE * 36)
    addKicks(samples, 2, 12, 0.5, () => 0.2)
    addKicks(samples, 12, 20, 0.5, (t) => 0.2 + ((t - 12) / 8) * 0.6)
    addKicks(samples, 21, 34, 0.5, () => 0.9)
    return samples
  }

  const dramatic = analyzeAudio(dramaticTrack(), SAMPLE_RATE)
  const moments = findMoments(dramatic)

  it('находит паузу и взрыв после неё', () => {
    const pause = moments.find((moment) => moment.kind === 'pause')
    expect(pause?.start).toBeGreaterThan(19.5)
    expect(pause?.end).toBeLessThan(21.3)
    const impacts = moments.filter((moment) => moment.kind === 'impact')
    expect(impacts.some((impact) => Math.abs(impact.start - 21) < 0.3)).toBe(true)
  })

  it('находит разгон перед паузой', () => {
    const buildup = moments.find((moment) => moment.kind === 'buildup')
    expect(buildup).toBeDefined()
    expect(buildup?.start).toBeLessThan(17)
  })

  it('в паузе нот нет, а на взрыве две ноты сразу', () => {
    const notes = generateLaneLevel(dramatic, hard)
    const pause = moments.find((moment) => moment.kind === 'pause')
    for (const note of notes) {
      expect(note.time > (pause?.start ?? 0) && note.time < (pause?.end ?? 0)).toBe(false)
    }
    const accents = notes.filter((note) => note.kind === 'accent')
    expect(accents.length).toBeGreaterThanOrEqual(2)
    expect(accents[0].time).toBe(accents[1].time)
    expect(accents[0].lane).not.toBe(accents[1].lane)
  })

  it('автопилот проходит уровень с акцентами без промахов', () => {
    const game = createLaneGame(generateLaneLevel(dramatic, hard), hard)
    for (let time = 0; time <= dramatic.duration + 1; time += 0.5) {
      playAutopilot(game, time)
      stepLanes(game, time)
    }
    expect(game.misses).toBe(0)
  })

  it('ровный трек не содержит ложных пауз и взрывов', () => {
    const steady = new Float32Array(SAMPLE_RATE * 30)
    addKicks(steady, 1, 29, 0.5, () => 0.7)
    const found = findMoments(analyzeAudio(steady, SAMPLE_RATE))
    expect(found.filter((moment) => moment.kind !== 'buildup')).toEqual([])
  })

  it('редкие удары не считаются паузами', () => {
    const sparse = new Float32Array(SAMPLE_RATE * 30)
    addKicks(sparse, 1, 29, 0.8, () => 0.8)
    const found = findMoments(analyzeAudio(sparse, SAMPLE_RATE))
    expect(found.filter((moment) => moment.kind === 'pause')).toEqual([])
  })
})

describe('смена бита посреди трека', () => {
  /** Бочка раз в 0,8 с в первой половине и раз в 0,4 с во второй. */
  function beatSwitchTrack(): Float32Array {
    const sampleRate = 44100
    const samples = new Float32Array(sampleRate * 40)
    const addKick = (time: number) => {
      const start = Math.round(time * sampleRate)
      const length = Math.round(0.35 * sampleRate) // до полного затухания: обрыв сам звучал бы как удар
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
    const notes = generateLaneLevel(analyzeAudio(beatSwitchTrack(), 44100), findDifficulty('normal'))
    const before = notes.filter((note) => note.time >= 5 && note.time < 18).length
    const after = notes.filter((note) => note.time >= 22 && note.time < 35).length
    expect(after).toBeGreaterThan(before * 1.5)
  })
})

describe('правила', () => {
  const level: LaneNote[] = [
    { id: 0, time: 1, lane: 0, kind: 'tap', direction: 0 },
    { id: 1, time: 2, lane: 1, kind: 'swipe', direction: 1 },
    { id: 2, time: 3, lane: 2, kind: 'tap', direction: 0 },
  ]

  it('нажатие на нужной дорожке засчитывается, на чужой нет', () => {
    const game = createLaneGame(level, easy)
    expect(pressLane(game, 1.01, 1)).toBeNull()
    expect(pressLane(game, 1.01, 0)?.type).toBe('perfect')
    expect(pressLane(game, 1.01, 0)).toBeNull()
  })

  it('звезда нажимается как круг и даёт вдвое больше очков', () => {
    const game = createLaneGame([{ id: 0, time: 1, lane: 2, kind: 'star', direction: 0 }], easy)
    const event = pressLane(game, 1, 2)
    expect(event?.kind).toBe('star')
    expect(event?.points).toBe(500)
  })

  it('луч, удержанный до конца, приносит очки и продлевает серию', () => {
    const notes: LaneNote[] = [{ id: 0, time: 1, lane: 1, kind: 'hold', direction: 0, duration: 1 }]
    const game = createLaneGame(notes, easy)
    pressLane(game, 1, 1)
    expect(game.holds[1]).not.toBeNull()
    stepLanes(game, 1.5)
    const scoreInMiddle = game.score
    expect(scoreInMiddle).toBeGreaterThan(250)
    const events = stepLanes(game, 2)
    expect(events.map((event) => event.type)).toEqual(['holdDone'])
    expect(game.holds[1]).toBeNull()
    expect(game.combo).toBe(2)
    expect(game.score).toBeGreaterThan(scoreInMiddle)
  })

  it('отпущенный раньше времени луч обрывает серию', () => {
    const notes: LaneNote[] = [{ id: 0, time: 1, lane: 0, kind: 'hold', direction: 0, duration: 2 }]
    const game = createLaneGame(notes, easy)
    pressLane(game, 1, 0)
    expect(releaseLane(game, 1.5, 0)?.type).toBe('holdBroken')
    expect(game.combo).toBe(0)
    expect(releaseLane(game, 1.6, 0)).toBeNull()
  })

  it('отпустить чуть раньше конца луча можно без штрафа', () => {
    const notes: LaneNote[] = [{ id: 0, time: 1, lane: 0, kind: 'hold', direction: 0, duration: 1 }]
    const game = createLaneGame(notes, easy)
    pressLane(game, 1, 0)
    expect(releaseLane(game, 1.9, 0)?.type).toBe('holdDone')
  })

  it('звёзды за партию зависят от точности', () => {
    const game = createLaneGame(tapRow(10), easy)
    for (let i = 0; i < 8; i++) pressLane(game, i + 1, 0)
    stepLanes(game, 100)
    expect(starRating(game)).toBe(1)
  })

  it('событие стрелки сообщает направление для отлёта', () => {
    const game = createLaneGame(level, easy)
    const event = pressSwipe(game, 2, 1)
    expect(event?.kind).toBe('swipe')
    expect(event?.direction).toBe(1)
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

  it('круглое значение комбо отмечается один раз', () => {
    const notes = tapRow(11)
    const game = createLaneGame(notes, easy)
    const milestones: number[] = []
    for (const note of notes) {
      const event = pressLane(game, note.time, 0)
      if (event && event.milestone) milestones.push(event.milestone)
    }
    expect(milestones).toEqual([10])
    expect(multiplierProgress(game)).toBeCloseTo(0.1)
  })

  it('предупреждение срабатывает один раз за серию промахов и сбрасывается попаданием', () => {
    const game = createLaneGame(tapRow(6), easy)
    const events = stepLanes(game, 5.5)
    expect(events.filter((event) => event.warning).length).toBe(1)
    expect(game.missStreak).toBeGreaterThanOrEqual(MISS_WARNING_STREAK)
    pressLane(game, 6, 0)
    expect(game.missStreak).toBe(0)
  })

  it('автопилот проходит сложный уровень без промахов даже при редких кадрах', () => {
    const game = createLaneGame(generateLaneLevel(analysis, hard), hard)
    for (let time = 0; time <= analysis.duration + 1; time += 0.5) {
      playAutopilot(game, time)
      stepLanes(game, time)
    }
    expect(game.misses).toBe(0)
    expect(accuracy(game)).toBe(1)
    expect(rank(game)).toBe('S')
  })

  it('на лёгкой проиграть нельзя, на сложной можно', () => {
    const safe = createLaneGame(tapRow(20), easy)
    stepLanes(safe, 100)
    expect(safe.failed).toBe(false)
    const risky = createLaneGame(tapRow(20), hard)
    stepLanes(risky, 100)
    expect(risky.failed).toBe(true)
  })
})
