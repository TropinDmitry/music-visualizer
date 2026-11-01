import { describe, expect, it } from 'vitest'
import { analyzeAudio, mixToMono } from '../audio/analyzer.ts'
import { synthesizeDemoTrack } from '../audio/demoTrack.ts'
import { compareTake } from './compareTake.ts'
import { findMoments, findSections, findSoftPulses, withoutPulses,
  findSustains, songIntensity, type Moment } from './structure.ts'
import { DIFFICULTIES, findDifficulty, generateLaneLevel, type LaneNote } from './level.ts'
import {
  accuracy,
  createLaneGame,
  GOOD_WINDOW_SEC,
  MISS_WARNING_STREAK,
  multiplierProgress,
  playAutopilot,
  isOverdrive,
  pressLane,
  pressSpace,
  pressSwipe,
  rank,
  releaseLane,
  starRating,
  stepLanes,
  streakProgress,
  streakTier,
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
        const three = [notes[i - 2], notes[i - 1], notes[i]]
        // Парная нота и пауза после луча разрывают серию, поэтому здесь их не считаем
        const hasBreak = three.some((note) => note.kind === 'accent' || note.kind === 'space' || note.kind === 'hold' || note.kind === 'swipe')
        const isContinuous = notes[i].time - notes[i - 2].time < 0.9
        const sameLane = three.every((note) => note.lane === notes[i].lane)
        // Под двойным лучом свободна одна дорожка, и ноты идут только по ней
        const time = notes[i].time
        const isUnderBeam = notes.some((note) => note.kind === 'hold' && note.time <= time && note.time + (note.duration ?? 0) > time)
        expect(!hasBreak && !isUnderBeam && isContinuous && sameLane).toBe(false)
      }
    }
  })

  it('стрелки приходят в любой части, и в потоке нот вокруг них есть место', () => {
    const track = new Float32Array(44100 * 60)
    for (let time = 2; time < 58; time += 0.3) {
      const volume = time < 30 ? 0.2 : 0.95
      const start = Math.round(time * 44100)
      for (let i = 0; i < 0.25 * 44100; i++) {
        const t = i / 44100
        track[start + i] += volume * Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t * 20)
      }
    }
    const notes = generateLaneLevel(analyzeAudio(track, 44100), hard)
    const arrows = notes.filter((note) => note.kind === 'swipe')
    expect(arrows.some((note) => note.time < 28)).toBe(true)
    expect(arrows.some((note) => note.time > 32)).toBe(true)
    for (let i = 1; i < notes.length; i++) {
      if (notes[i].kind === 'swipe') {
        const min = notes[i - 1].kind === 'swipe' ? 0.26 : 0.27
        expect(notes[i].time - notes[i - 1].time).toBeGreaterThanOrEqual(min)
      }
    }
  })

  it('есть стрелки во все три стороны', () => {
    const relaxed = new Float32Array(44100 * 40)
    for (let time = 2; time < 38; time += 0.9) {
      const volume = time < 26 ? 0.2 : 0.9
      const start = Math.round(time * 44100)
      for (let i = 0; i < 0.4 * 44100; i++) {
        const t = i / 44100
        relaxed[start + i] += volume * Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t * 12)
      }
    }
    const swipes = generateLaneLevel(analyzeAudio(relaxed, 44100), hard).filter((note) => note.kind === 'swipe')
    expect(new Set(swipes.map((note) => note.direction))).toEqual(new Set([-1, 0, 1]))
  })

  it('звёзды редкие и не занимают место стрелок', () => {
    const notes = generateLaneLevel(analysis, hard)
    const stars = notes.filter((note) => note.kind === 'star')
    expect(stars.length).toBeGreaterThan(0)
    expect(stars.length).toBeLessThan(notes.length / 10)
  })

  it('лучи стоят только там, где после ноты свободно', () => {
    for (const difficulty of DIFFICULTIES) {
      const notes = generateLaneLevel(analysis, difficulty)
      for (const hold of notes.filter((note) => note.kind === 'hold')) {
        const end = hold.time + (hold.duration ?? 0)
        for (const note of notes) {
          // На дорожке луча нет ничего другого, а пробел не пересекает лучи вообще
          const isUnderBeam = note.time > hold.time && note.time < end
          expect(isUnderBeam && note.kind !== 'hold' && note.lane === hold.lane).toBe(false)
          expect(isUnderBeam && note.kind === 'space').toBe(false)
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

  it('части песни находятся, а выпадения внутри бита нет', () => {
    const intensity = songIntensity(dramatic)
    const sections = findSections(dramatic, intensity)
    expect(sections.length).toBeGreaterThanOrEqual(2)
    expect(sections.length).toBeLessThanOrEqual(4)
    expect(sections[sections.length - 1].level).toBeGreaterThan(sections[0].level)

    // Ровный бит с коротким выпадением каждые 6,4 секунды
    const steady = new Float32Array(SAMPLE_RATE * 60)
    for (let start = 2; start < 58; start += 6.4) addKicks(steady, start, start + 5.6, 0.4, () => 0.8)
    const steadyTrack = analyzeAudio(steady, SAMPLE_RATE)
    expect(findSections(steadyTrack, songIntensity(steadyTrack)).length).toBeLessThanOrEqual(3)
  })

  it('короткие выпадения не вырезают ноты, а пробелы не идут кучей', () => {
    const notes = generateLaneLevel(dramatic, hard)
    const spaces = notes.filter((note) => note.kind === 'space')
    for (let i = 1; i < spaces.length; i++) {
      expect(spaces[i].time - spaces[i - 1].time).toBeGreaterThanOrEqual(8)
    }

    // Редкий бит с короткими затишьями: ноты должны оставаться на каждом ударе
    const sparse = new Float32Array(SAMPLE_RATE * 30)
    addKicks(sparse, 2, 28, 0.8, () => 0.8)
    const sparseNotes = generateLaneLevel(analyzeAudio(sparse, SAMPLE_RATE), hard)
    expect(sparseNotes.length).toBeGreaterThan(20)
  })

  it('протяжный взлёт находится и играется лучами, на сложной парными', () => {
    // Сначала бит, потом тон, ползущий вверх, потом снова бит
    const samples = new Float32Array(SAMPLE_RATE * 40)
    addKicks(samples, 2, 16, 0.4, () => 0.8)
    let phase = 0
    for (let i = 16 * SAMPLE_RATE; i < 24 * SAMPLE_RATE; i++) {
      const progress = (i / SAMPLE_RATE - 16) / 8
      phase += (2 * Math.PI * (300 + 2700 * progress)) / SAMPLE_RATE
      samples[i] += 0.5 * Math.sin(phase)
    }
    addKicks(samples, 24, 38, 0.4, () => 0.8)

    const track = analyzeAudio(samples, SAMPLE_RATE)
    const sustains = findSustains(track)
    expect(sustains.some((moment) => moment.start < 22 && moment.end > 18)).toBe(true)

    const notes = generateLaneLevel(track, hard)
    const holds = notes.filter((note) => note.kind === 'hold' && note.time >= 15 && note.time < 24)
    expect(holds.some((note) => (note.duration ?? 0) >= 3)).toBe(true)
    expect(holds.some((note, i) => i > 0 && note.time === holds[i - 1].time)).toBe(true)

    // Луч начинается вместе со звуком, а не через секунду после него
    expect(Math.abs(holds[0].time - 16)).toBeLessThan(0.45)

    // И вместо него рядом не приходит пробел
    const spaces = notes.filter((note) => note.kind === 'space')
    expect(spaces.some((note) => note.time > 14.5 && note.time < 24)).toBe(false)
  })

  it('в паузе нот нет, а после неё приходит нота SPACE', () => {
    const notes = generateLaneLevel(dramatic, hard)
    const pause = moments.find((moment) => moment.kind === 'pause')
    for (const note of notes) {
      expect(note.time > (pause?.start ?? 0) && note.time < (pause?.end ?? 0)).toBe(false)
    }
    const spaces = notes.filter((note) => note.kind === 'space')
    expect(spaces.some((note) => Math.abs(note.time - 21) < 0.3)).toBe(true)
  })

  it('частоту нот задаёт рисунок ударов, а не сила части', () => {
    // Куплет: частые тихие щелчки без баса. Припев: редкие мощные удары.
    const samples = new Float32Array(SAMPLE_RATE * 40)
    for (let time = 2; time < 20; time += 0.15) {
      const start = Math.round(time * SAMPLE_RATE)
      for (let i = 0; i < 0.06 * SAMPLE_RATE; i++) {
        const t = i / SAMPLE_RATE
        samples[start + i] += 0.25 * Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 80)
      }
    }
    addKicks(samples, 20, 38, 0.7, () => 0.95)
    // Припев заполняет весь спектр: добавляем плотный гул на нескольких частотах
    for (let i = 20 * SAMPLE_RATE; i < 38 * SAMPLE_RATE; i++) {
      const t = i / SAMPLE_RATE
      samples[i] += 0.1 * (Math.sin(2 * Math.PI * 900 * t) + Math.sin(2 * Math.PI * 2400 * t) + Math.sin(2 * Math.PI * 6500 * t))
    }

    const track = analyzeAudio(samples, SAMPLE_RATE)
    const intensity = songIntensity(track)
    expect(intensity[Math.round(30 * track.fps)]).toBeGreaterThan(intensity[Math.round(10 * track.fps)])

    const notes = generateLaneLevel(track, hard)
    const verse = notes.filter((note) => note.time >= 4 && note.time < 18).length
    const chorus = notes.filter((note) => note.time >= 22 && note.time < 36).length
    expect(verse).toBeGreaterThan(chorus)
  })

  it('тяжёлый бас без заполненного спектра не считается мощной частью', () => {
    // Вступление: только бас. Дальше: бас ровнее, зато есть середина и верх
    const samples = new Float32Array(SAMPLE_RATE * 40)
    for (let i = 0; i < samples.length; i++) {
      const t = i / SAMPLE_RATE
      if (t < 12) {
        samples[i] = 0.8 * Math.sin(2 * Math.PI * 70 * t)
      } else {
        samples[i] =
          0.3 * Math.sin(2 * Math.PI * 70 * t) +
          0.15 * (Math.sin(2 * Math.PI * 1000 * t) + Math.sin(2 * Math.PI * 7000 * t))
      }
    }
    const track = analyzeAudio(samples, SAMPLE_RATE)
    const intensity = songIntensity(track)
    expect(intensity[Math.round(25 * track.fps)]).toBeGreaterThan(intensity[Math.round(5 * track.fps)])
  })

  it('мягкий ровный пульс внутри протяжного звука играется нотами, а не лучом', () => {
    // Сначала частый бит, потом ровный аккорд, один голос которого мягко вступает раз в 0,85 секунды
    const samples = new Float32Array(SAMPLE_RATE * 50)
    addKicks(samples, 2, 24, 0.25, () => 0.8)
    for (let i = 24 * SAMPLE_RATE; i < 48 * SAMPLE_RATE; i++) {
      const t = i / SAMPLE_RATE
      const swell = Math.exp(-((t % 0.85) / 0.25))
      const chord = Math.sin(2 * Math.PI * 500 * t) + Math.sin(2 * Math.PI * 750 * t) + Math.sin(2 * Math.PI * 1000 * t)
      samples[i] = 0.2 * chord + 0.2 * swell * Math.sin(2 * Math.PI * 2100 * t)
    }
    const track = analyzeAudio(samples, SAMPLE_RATE)
    const sustain: Moment = { kind: 'sustain', start: 24, end: 48 }
    const pulses = findSoftPulses(track, [sustain])
    // Шаг настоящий: придуманных ударов на половине шага нет
    expect(pulses.length).toBeGreaterThan(10)
    expect(pulses.length).toBeLessThan(35)

    // Там, где идёт пульс, луча больше нет
    expect(withoutPulses([sustain], pulses).some((part) => part.start < 36 && part.end > 36)).toBe(false)
  })

  it('рисунок нот повторяет рисунок ударов: мелкие интервалы и широкие', () => {
    const samples = new Float32Array(SAMPLE_RATE * 24)
    const hits: number[] = []
    for (let time = 2; time < 8; time += 0.2) hits.push(time)
    for (let time = 9; time < 22; time += 0.8) hits.push(time)
    for (const time of hits) addKicks(samples, time, time + 0.01, 1, () => 0.9)

    const notes = generateLaneLevel(analyzeAudio(samples, SAMPLE_RATE), hard)
    const starts = [...new Set(notes.map((note) => note.time))]
    const fast = starts.filter((time) => time >= 2.5 && time < 7.5).length
    const slow = starts.filter((time) => time >= 10 && time < 15).length
    expect(fast).toBeGreaterThan(slow * 1.5)
  })

  it('стрелки стоят на чётких ударах, а не по таймеру', () => {
    const samples = new Float32Array(SAMPLE_RATE * 30)
    // Шумная россыпь, потом три чётких удара
    for (let time = 2; time < 12; time += 0.13 + (time % 0.17)) addKicks(samples, time, time + 0.01, 1, () => 0.6)
    // Первый удар после тишины может забрать пробел, поэтому ударов четыре
    const hits = [14, 14.5, 15, 15.5]
    for (const time of hits) addKicks(samples, time, time + 0.01, 1, () => 1)

    const arrows = generateLaneLevel(analyzeAudio(samples, SAMPLE_RATE), hard).filter((note) => note.kind === 'swipe')
    expect(arrows.length).toBeGreaterThanOrEqual(3)
    const onHits = hits.filter((hit) => arrows.some((arrow) => Math.abs(arrow.time - hit) < 0.05))
    expect(onHits.length).toBeGreaterThanOrEqual(3)
  })

  it('режим «По голосу» ставит ноту на слог, даже если он вне ритма', () => {
    const track = analyzeAudio(new Float32Array(44100 * 10), 44100)
    track.syllableTimes = [4]
    track.syllableStrengths = [3]
    expect(generateLaneLevel(track, easy, 'voice').some((note) => Math.abs(note.time - 4) < 0.02)).toBe(true)
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
    expect(after).toBeGreaterThan(before * 0.7)
  })
})

describe('режимы', () => {
  /** Ровный бит и быстрая читка поверх него: 8 слогов в секунду на всём треке. */
  function rapTrack() {
    const track = analyzeAudio(new Float32Array(44100 * 30), 44100)
    const times: number[] = []
    for (let time = 2; time < 28; time += 0.125) times.push(time)
    track.syllableTimes = times
    track.syllableStrengths = times.map(() => 3)
    return track
  }

  it('на быстрой читке уровень идёт за каждым слогом и авто это понимает само', () => {
    const track = rapTrack()
    const voice = generateLaneLevel(track, hard, 'voice').filter((note) => note.time >= 10 && note.time < 20)
    const auto = generateLaneLevel(track, hard, 'auto').filter((note) => note.time >= 10 && note.time < 20)
    expect(voice.length).toBeGreaterThanOrEqual(70)
    expect(auto.length).toBeGreaterThanOrEqual(70)
  })

  it('по ритму слоги не учитываются', () => {
    const notes = generateLaneLevel(rapTrack(), hard, 'beat')
    expect(notes.length).toBeLessThan(20)
  })
})

describe('плотность по силе песни', () => {
  it('тихое вступление легче мощной части, даже если ударов в нём столько же', () => {
    const rate = 44100
    const samples = new Float32Array(rate * 60)
    for (let time = 2; time < 58; time += 0.2) {
      const volume = time < 22 ? 0.08 : 0.9
      const start = Math.round(time * rate)
      for (let i = 0; i < 0.15 * rate; i++) {
        samples[start + i] += volume * Math.sin(2 * Math.PI * 70 * (i / rate)) * Math.exp((-i / rate) * 20)
      }
    }
    for (let i = 22 * rate; i < 58 * rate; i++) {
      const t = i / rate
      samples[i] += 0.12 * (Math.sin(2 * Math.PI * 900 * t) + Math.sin(2 * Math.PI * 2400 * t) + Math.sin(2 * Math.PI * 6500 * t))
    }
    const notes = generateLaneLevel(analyzeAudio(samples, rate), hard)
    const starts = [...new Set(notes.map((note) => note.time))]
    const calm = starts.filter((time) => time >= 5 && time < 20).length
    const loud = starts.filter((time) => time >= 30 && time < 45).length
    expect(loud).toBeGreaterThan(calm * 1.3)
  })
})

describe('стрелки', () => {
  it('стрелка показывает туда, где стоит, и отбивается в ту же сторону', () => {
    const notes = generateLaneLevel(analysis, hard).filter((note) => note.kind === 'swipe')
    for (const note of notes) expect(note.direction).toBe(note.lane - 1)

    const up: LaneNote = { id: 0, time: 1, lane: 1, kind: 'swipe', direction: 0 }
    const game = createLaneGame([up], easy)
    expect(pressSwipe(game, 1, 1)).toBeNull()
    expect(pressSwipe(game, 1, 0)?.type).toBe('perfect')
  })
})

describe('сравнение записи', () => {
  it('находит опоздание руки и считает совпадения с нотами', () => {
    const track = analysis
    const notes = generateLaneLevel(track, hard).filter((note) => note.time < 20)
    const lag = 0.12
    const presses = notes.map((note) => ({ time: note.time + lag, key: 'a', duration: 0.05 }))
    const report = compareTake(presses, notes, track)
    expect(Math.abs(report.lagSec - lag)).toBeLessThan(0.06)
    expect(report.pressesOnNotes).toBeGreaterThan(0.9)
    expect(report.notesWithPresses).toBeGreaterThan(0.9)
  })

  it('пустая запись не ломает сравнение', () => {
    expect(compareTake([], [], analysis).presses).toBe(0)
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

  it('нота SPACE нажимается только пробелом', () => {
    const notes: LaneNote[] = [{ id: 0, time: 1, lane: 1, kind: 'space', direction: 0 }]
    const game = createLaneGame(notes, easy)
    expect(pressLane(game, 1, 1)).toBeNull()
    expect(pressSpace(game, 1)?.points).toBe(500)
  })

  it('три звезды включают суперрежим с удвоенными очками', () => {
    const notes: LaneNote[] = [
      { id: 0, time: 1, lane: 0, kind: 'star', direction: 0 },
      { id: 1, time: 2, lane: 0, kind: 'star', direction: 0 },
      { id: 2, time: 3, lane: 0, kind: 'star', direction: 0 },
      { id: 3, time: 4, lane: 0, kind: 'tap', direction: 0 },
      { id: 4, time: 20, lane: 0, kind: 'tap', direction: 0 },
    ]
    const game = createLaneGame(notes, easy)
    pressLane(game, 1, 0)
    expect(pressLane(game, 2, 0)?.startedOverdrive).toBe(false)
    expect(pressLane(game, 3, 0)?.startedOverdrive).toBe(true)
    expect(isOverdrive(game, 4)).toBe(true)
    expect(pressLane(game, 4, 0)?.points).toBe(500)
    expect(isOverdrive(game, 20)).toBe(false)
    expect(pressLane(game, 20, 0)?.points).toBe(250)
  })

  it('уровни серии растут с комбо', () => {
    expect(streakTier(5)).toBe(0)
    expect(streakTier(30)).toBe(2)
    expect(streakTier(500)).toBe(4)
    expect(streakProgress(17)).toBeCloseTo(7 / 15)
    expect(streakProgress(500)).toBe(1)
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
