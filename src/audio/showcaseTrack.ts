import type { DemoTrack } from './demoTrack.ts'

/**
 * Демо-трек для игры: полноценная короткая электронная песня, синтезированная
 * прямо в браузере, поэтому прав на неё не нужно и хранить файл негде.
 * 128 ударов в минуту, ля минор, аккорды Am–F–C–G, около 75 секунд.
 *
 * Части как в настоящей песне, чтобы генератору было что показать:
 * вступление, куплет, разгон с дробью и нарастающим шумом, дроп с риффом,
 * затишье, второй разгон, второй дроп ярче первого и концовка.
 * Всё детерминировано: шум берётся из генератора с постоянным зерном.
 */

const BPM = 128
const BEAT = 60 / BPM
const STEP = BEAT / 4
const BAR = BEAT * 4

/** Части песни в тактах: [первый такт, последний такт + 1). */
const PARTS = {
  intro: [0, 4],
  verse: [4, 12],
  build: [12, 16],
  drop: [16, 24],
  breakdown: [24, 28],
  build2: [28, 30],
  drop2: [30, 38],
  outro: [38, 40],
} as const
const TOTAL_BARS = 40

type Part = keyof typeof PARTS

/** Бас, аккорд и рифф для каждого из четырёх тактов круга Am–F–C–G. */
const BASS = [55, 43.65, 65.41, 49]
const CHORDS = [
  [220, 261.63, 329.63],
  [174.61, 220, 261.63],
  [261.63, 329.63, 392],
  [196, 246.94, 293.66],
]
/** Рифф шестнадцатыми, номера нот MIDI, -1 — пауза. Пентатоника ля минор. */
const RIFF = [
  [76, -1, 74, 72, -1, 69, -1, 72, 74, -1, 76, -1, 79, -1, 76, 74],
  [72, -1, 74, 72, -1, 69, -1, 69, 72, -1, 74, -1, 76, -1, 74, 72],
  [76, -1, 79, 76, -1, 72, -1, 76, 79, -1, 81, -1, 79, -1, 76, 74],
  [74, -1, 76, 74, -1, 71, -1, 74, 76, -1, 79, -1, 76, 74, 72, 71],
]

const TABLE_SIZE = 2048

export function synthesizeShowcaseTrack(sampleRate = 44100): DemoTrack {
  const length = Math.round((TOTAL_BARS * BAR + 1.5) * sampleRate)
  const left = new Float32Array(length)
  const right = new Float32Array(length)
  const synth = new Synth(left, right, sampleRate)

  const partOf = (bar: number): Part => {
    for (const [name, [from, to]] of Object.entries(PARTS)) {
      if (bar >= from && bar < to) return name as Part
    }
    return 'outro'
  }

  for (let bar = 0; bar < TOTAL_BARS; bar++) {
    const part = partOf(bar)
    const start = bar * BAR
    const chord = bar % 4
    const isDrop = part === 'drop' || part === 'drop2'
    const isBuild = part === 'build' || part === 'build2'
    const kicks = isDrop || part === 'verse' || (part === 'build' && bar < 14)

    // Аккорд тянется весь такт; в дропе он приседает под бочку
    const padGain = part === 'intro' ? 0.05 + 0.025 * bar : isDrop ? 0.07 : 0.09
    for (let voice = 0; voice < 3; voice++) {
      const pan = (voice - 1) * 0.5
      synth.tone(start, BAR, CHORDS[chord][voice], synth.saw, padGain, 0.25, 0.4, pan, kicks ? 0.75 : 0)
      synth.tone(start, BAR, CHORDS[chord][voice] * 1.006, synth.saw, padGain * 0.6, 0.25, 0.4, -pan, kicks ? 0.75 : 0)
    }

    // Перебор: во вступлении, куплете, затишье и концовке
    if (part === 'intro' || part === 'verse' || part === 'breakdown' || part === 'outro') {
      const notes = [...CHORDS[chord], CHORDS[chord][1] * 2]
      for (let step = 0; step < 8; step++) {
        const frequency = notes[step % notes.length] * 2
        synth.tone(start + step * BEAT * 0.5, BEAT * 0.45, frequency, synth.sine, 0.06, 0.005, 9, step % 2 ? 0.4 : -0.4)
      }
    }

    // Бочка на каждую долю
    if (kicks) for (let beat = 0; beat < 4; beat++) synth.kick(start + beat * BEAT, 0.95)
    if (part === 'outro' && bar === 38) synth.kick(start, 1)

    // Хлопок на вторую и четвёртую долю
    if (isDrop || (part === 'verse' && bar >= 8)) {
      synth.clap(start + BEAT, 0.5)
      synth.clap(start + BEAT * 3, 0.5)
    }

    // Хэт на слабые доли, в дропе открытый
    if (part !== 'intro' || bar >= 2) {
      if (!isBuild && part !== 'outro') {
        for (let beat = 0; beat < 4; beat++) synth.hat(start + beat * BEAT + BEAT / 2, isDrop ? 0.22 : 0.12, isDrop ? 0.14 : 0.04)
      }
    }

    // Бас: в куплете восьмые на основном тоне, в дропе на слабые восьмые октавой выше
    if (part === 'verse' || (part === 'build' && bar < 15)) {
      for (let step = 0; step < 8; step++) synth.tone(start + step * BEAT * 0.5, BEAT * 0.4, BASS[chord], synth.saw, 0.22, 0.004, 6, 0)
    }
    if (isDrop) {
      for (let beat = 0; beat < 4; beat++) {
        synth.tone(start + beat * BEAT, BEAT * 0.3, BASS[chord], synth.sine, 0.35, 0.004, 5, 0)
        synth.tone(start + beat * BEAT + BEAT / 2, BEAT * 0.45, BASS[chord] * 2, synth.saw, 0.26, 0.004, 4, 0)
      }
    }

    // Рифф: в дропе ярко, в затишье мягко, во втором дропе с октавой сверху
    if (isDrop || part === 'breakdown') {
      const gain = part === 'breakdown' ? 0.06 : 0.11
      const table = part === 'breakdown' ? synth.sine : synth.square
      RIFF[chord].forEach((note, step) => {
        if (note < 0) return
        const frequency = 440 * 2 ** ((note - 69) / 12)
        const at = start + step * STEP
        synth.tone(at, STEP * 1.6, frequency, table, gain, 0.003, 7, step % 2 ? 0.25 : -0.25)
        if (part === 'drop2') synth.tone(at, STEP * 1.4, frequency * 2, synth.sine, gain * 0.45, 0.003, 9, 0)
      })
    }

    // Разгон: дробь всё чаще и громче, шум взлетает, последняя доля тишины
    if (isBuild) {
      const [from, to] = PARTS[part]
      const progress = (bar - from) / (to - from)
      const division = progress < 0.25 ? 2 : progress < 0.5 ? 4 : 8
      for (let hit = 0; hit < 4 * division; hit++) {
        const at = start + hit * (BEAT / division)
        if (bar === to - 1 && at >= start + BEAT * 3) break
        const local = (bar - from + hit / (4 * division)) / (to - from)
        synth.snare(at, 0.15 + 0.4 * local)
      }
      if (bar === from) synth.riser(start, (to - from) * BAR - BEAT, 0.35)
    }

    // Тарелка на начале каждого дропа
    if ((part === 'drop' && bar === PARTS.drop[0]) || (part === 'drop2' && bar === PARTS.drop2[0])) synth.crash(start, 0.5)
  }

  synth.finish()
  return { sampleRate, left, right }
}

/** Простой синтезатор, пишущий звуки прямо в стереобуфер. */
class Synth {
  readonly sine = makeTable((phase) => Math.sin(phase))
  readonly saw = makeTable((phase) => {
    let value = 0
    for (let harmonic = 1; harmonic <= 10; harmonic++) value += Math.sin(phase * harmonic) / harmonic
    return value * 0.55
  })
  readonly square = makeTable((phase) => {
    let value = 0
    for (let harmonic = 1; harmonic <= 9; harmonic += 2) value += Math.sin(phase * harmonic) / harmonic
    return value * 0.9
  })
  private readonly left: Float32Array
  private readonly right: Float32Array
  private readonly rate: number
  /** Приседание под бочку на протяжении одной доли: считается один раз. */
  private readonly duckCurve: Float32Array
  private seed = 7

  constructor(left: Float32Array, right: Float32Array, rate: number) {
    this.left = left
    this.right = right
    this.rate = rate
    this.duckCurve = new Float32Array(Math.round(BEAT * rate))
    for (let i = 0; i < this.duckCurve.length; i++) this.duckCurve[i] = Math.exp(-(i / rate) * 9)
  }

  /**
   * Нота: вход за attack секунд, затухание с силой decay в секунду, панорама pan.
   * duck приседает звук под каждую долю, как сайдчейн от бочки.
   */
  tone(start: number, seconds: number, frequency: number, table: Float32Array, gain: number, attack: number, decay: number, pan: number, duck = 0): void {
    const first = Math.round(start * this.rate)
    const count = Math.round(seconds * this.rate)
    const step = (frequency / this.rate) * TABLE_SIZE
    const release = Math.min(count, Math.round(0.01 * this.rate))
    const leftGain = gain * Math.min(1, 1 - pan)
    const rightGain = gain * Math.min(1, 1 + pan)
    const attackSamples = Math.max(1, attack * this.rate)
    // Затухание умножением на каждом отсчёте: экспонента на каждый отсчёт слишком медленна
    const fade = Math.exp(-decay / this.rate)
    const beatSamples = this.duckCurve.length
    let falloff = 1
    let phase = 0
    for (let i = 0; i < count && first + i < this.left.length; i++) {
      let envelope = Math.min(1, i / attackSamples) * falloff
      falloff *= fade
      if (i > count - release) envelope *= (count - i) / release
      if (duck > 0) envelope *= 1 - duck * this.duckCurve[(first + i) % beatSamples]
      const sample = table[phase | 0] * envelope
      this.left[first + i] += sample * leftGain
      this.right[first + i] += sample * rightGain
      phase = (phase + step) % TABLE_SIZE
    }
  }

  /** Бочка: синус, частота которого падает со 150 до 45 Гц. */
  kick(start: number, gain: number): void {
    const first = Math.round(start * this.rate)
    const count = Math.round(0.35 * this.rate)
    for (let i = 0; i < count && first + i < this.left.length; i++) {
      const t = i / this.rate
      const phase = 2 * Math.PI * (45 * t + (105 / 28) * (1 - Math.exp(-t * 28)))
      const sample = Math.sin(phase) * Math.exp(-t * 9) * gain
      this.left[first + i] += sample
      this.right[first + i] += sample
    }
  }

  /** Хэт: шум без низов, короткий или открытый. */
  hat(start: number, gain: number, seconds: number): void {
    this.noise(start, seconds + 0.02, gain, 1 / seconds, 0.9, 0.2)
  }

  /** Хлопок: три быстрые вспышки шума в середине частот. */
  clap(start: number, gain: number): void {
    for (let flam = 0; flam < 3; flam++) this.noise(start + flam * 0.011, 0.18, gain * (flam === 2 ? 1 : 0.6), 18, 0.55, -0.1)
  }

  /** Малый барабан для дроби: шум и короткий тон. */
  snare(start: number, gain: number): void {
    this.noise(start, 0.14, gain, 22, 0.6, 0)
    this.tone(start, 0.08, 190, this.sine, gain * 0.5, 0.001, 30, 0)
  }

  /** Тарелка: долгий светлый шум. */
  crash(start: number, gain: number): void {
    this.noise(start, 2, gain, 1.6, 0.92, 0.3)
    this.noise(start, 2, gain * 0.8, 1.8, 0.92, -0.3)
  }

  /** Нарастающий шум перед дропом: громче и светлее к концу. */
  riser(start: number, seconds: number, gain: number): void {
    const first = Math.round(start * this.rate)
    const count = Math.round(seconds * this.rate)
    let low = 0
    for (let i = 0; i < count && first + i < this.left.length; i++) {
      const progress = i / count
      const white = this.random()
      // Сглаживание тем слабее, чем ближе дроп: звук светлеет
      const smoothing = 0.02 + 0.5 * progress * progress
      low += (white - low) * smoothing
      const sample = low * gain * progress * progress
      this.left[first + i] += sample
      this.right[first + i] += sample
    }
  }

  /** Сглаживает пики и выводит громкость на постоянный уровень. */
  finish(): void {
    let peak = 0
    for (let i = 0; i < this.left.length; i++) peak = Math.max(peak, Math.abs(this.left[i]), Math.abs(this.right[i]))
    const scale = peak > 0 ? 1.4 / peak : 1
    for (let i = 0; i < this.left.length; i++) {
      this.left[i] = Math.tanh(this.left[i] * scale) * 0.95
      this.right[i] = Math.tanh(this.right[i] * scale) * 0.95
    }
  }

  /**
   * Вспышка шума. brightness от 0 до 1: чем выше, тем меньше низов.
   * decay — сила затухания в секунду.
   */
  private noise(start: number, seconds: number, gain: number, decay: number, brightness: number, pan: number): void {
    const first = Math.round(start * this.rate)
    const count = Math.round(seconds * this.rate)
    let low = 0
    for (let i = 0; i < count && first + i < this.left.length; i++) {
      const t = i / this.rate
      const white = this.random()
      low += (white - low) * (1 - brightness)
      const sample = (white - low) * gain * Math.exp(-t * decay)
      this.left[first + i] += sample * Math.min(1, 1 - pan)
      this.right[first + i] += sample * Math.min(1, 1 + pan)
    }
  }

  /** Шум из линейного конгруэнтного генератора: каждый раз один и тот же. */
  private random(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0
    return this.seed / 2 ** 31 - 1
  }
}

/** Один период волны: дальше нота читает его по кругу. */
function makeTable(wave: (phase: number) => number): Float32Array {
  const table = new Float32Array(TABLE_SIZE)
  for (let i = 0; i < TABLE_SIZE; i++) table[i] = wave((i / TABLE_SIZE) * 2 * Math.PI)
  return table
}
