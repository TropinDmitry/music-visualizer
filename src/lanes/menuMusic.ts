/**
 * Фоновая музыка меню: спокойный неоновый синтвейв, который собирается Web Audio
 * прямо в браузере. Файла нет, поэтому нет и прав на запись, а страница не тяжелеет.
 *
 * Четыре такта по кругу: Am, F, C, G. Мягкий пэд на аккорд, переливы арпеджио
 * с эхом, бас восьмыми и глухая бочка. Ноты планируются чуть вперёд по часам
 * AudioContext, как в любом веб-секвенсоре: таймер JS неточен, а часы звука точны.
 */

const BPM = 96
const BEAT_SEC = 60 / BPM
const STEP_SEC = BEAT_SEC / 4
const STEPS_PER_BAR = 16
/** Аккорды по тактам, в полутонах от ля малой октавы. */
const CHORDS = [
  [0, 3, 7], // Am
  [-4, 0, 3], // F
  [3, 7, 10], // C
  [-2, 2, 5], // G
]
/** Корень каждого аккорда для баса. */
const ROOTS = [0, -4, 3, -2]
/** Какие ноты аккорда играет арпеджио на каждой шестнадцатой. */
const ARP_PATTERN = [0, 1, 2, 1, 0, 2, 1, 2]
const A3 = 220
const LOOKAHEAD_SEC = 0.15
const TICK_MS = 30
const FADE_SEC = 1.2
const VOLUME = 0.5

export class MenuMusic {
  private readonly context: AudioContext
  private readonly output: GainNode
  private readonly echo: DelayNode
  private readonly noise: AudioBuffer
  private timer = 0
  private nextStepAt = 0
  private step = 0
  private kicks: number[] = []
  private isRunning = false

  constructor(context: AudioContext) {
    this.context = context
    this.noise = createNoiseBuffer(context)

    this.output = context.createGain()
    this.output.gain.value = 0
    this.output.connect(context.destination)

    // Эхо в такт на три шестнадцатых: на нём держится «неоновое» звучание арпеджио
    this.echo = context.createDelay(1)
    this.echo.delayTime.value = STEP_SEC * 3
    const feedback = context.createGain()
    feedback.gain.value = 0.38
    const echoTone = context.createBiquadFilter()
    echoTone.type = 'lowpass'
    echoTone.frequency.value = 2200
    this.echo.connect(echoTone)
    echoTone.connect(feedback)
    feedback.connect(this.echo)
    echoTone.connect(this.output)
  }

  get playing(): boolean {
    return this.isRunning
  }

  start(): void {
    if (this.isRunning) return
    this.isRunning = true
    const now = this.context.currentTime
    this.output.gain.cancelScheduledValues(now)
    this.output.gain.setValueAtTime(this.output.gain.value, now)
    this.output.gain.linearRampToValueAtTime(VOLUME, now + FADE_SEC)
    this.nextStepAt = now + 0.05
    this.step = 0
    this.timer = window.setInterval(() => this.schedule(), TICK_MS)
    this.schedule()
  }

  /** Плавно гасит музыку: резкий обрыв в меню звучит как ошибка. */
  stop(): void {
    if (!this.isRunning) return
    this.isRunning = false
    window.clearInterval(this.timer)
    const now = this.context.currentTime
    this.output.gain.cancelScheduledValues(now)
    this.output.gain.setValueAtTime(this.output.gain.value, now)
    this.output.gain.linearRampToValueAtTime(0, now + FADE_SEC / 2)
  }

  /** Сила последнего удара бочки, 0..1: по ней фон меню качается в такт. */
  pulse(): number {
    if (!this.isRunning) return 0
    const now = this.context.currentTime
    let last = -Infinity
    for (const time of this.kicks) if (time <= now) last = time
    this.kicks = this.kicks.filter((time) => time > now - 1)
    return Math.exp(-(now - last) * 5)
  }

  private schedule(): void {
    while (this.nextStepAt < this.context.currentTime + LOOKAHEAD_SEC) {
      this.playStep(this.step, this.nextStepAt)
      this.nextStepAt += STEP_SEC
      this.step = (this.step + 1) % (STEPS_PER_BAR * CHORDS.length)
    }
  }

  private playStep(step: number, at: number): void {
    const bar = Math.floor(step / STEPS_PER_BAR)
    const inBar = step % STEPS_PER_BAR
    const chord = CHORDS[bar]
    if (inBar === 0) this.pad(chord, at)
    if (inBar % 4 === 0) {
      this.kick(at)
      this.kicks.push(at)
    }
    if (inBar % 4 === 2) this.hat(at)
    if (inBar % 2 === 0) this.bass(ROOTS[bar], at, inBar % 8 === 0 ? 0.22 : 0.14)
    // Арпеджио на две октавы выше, второй круг четырёх тактов звучит на октаву выше
    const lift = step >= STEPS_PER_BAR * 2 ? 12 : 0
    const tone = chord[ARP_PATTERN[inBar % ARP_PATTERN.length]] + 12 + lift
    this.pluck(semitone(tone), at, inBar % 4 === 0 ? 0.09 : 0.055)
  }

  /** Пэд: два чуть расстроенных треугольника на каждую ноту, мягкий вход на весь такт. */
  private pad(chord: number[], at: number): void {
    const length = BEAT_SEC * 4
    const filter = this.context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 1100
    const gain = this.context.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.linearRampToValueAtTime(0.05, at + 0.5)
    gain.gain.setValueAtTime(0.05, at + length - 0.4)
    gain.gain.linearRampToValueAtTime(0.0001, at + length + 0.2)
    filter.connect(gain)
    gain.connect(this.output)
    for (const note of chord) {
      for (const detune of [-8, 8]) {
        const oscillator = this.context.createOscillator()
        oscillator.type = 'triangle'
        oscillator.frequency.value = semitone(note)
        oscillator.detune.value = detune
        oscillator.connect(filter)
        oscillator.start(at)
        oscillator.stop(at + length + 0.25)
      }
    }
  }

  private pluck(frequency: number, at: number, volume: number): void {
    const oscillator = this.context.createOscillator()
    oscillator.type = 'triangle'
    oscillator.frequency.value = frequency
    const gain = this.context.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28)
    oscillator.connect(gain)
    gain.connect(this.output)
    gain.connect(this.echo)
    oscillator.start(at)
    oscillator.stop(at + 0.3)
  }

  private bass(root: number, at: number, volume: number): void {
    const oscillator = this.context.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.value = semitone(root - 12)
    const gain = this.context.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + STEP_SEC * 1.8)
    oscillator.connect(gain)
    gain.connect(this.output)
    oscillator.start(at)
    oscillator.stop(at + STEP_SEC * 2)
  }

  /** Глухая бочка: синус, который быстро падает по высоте. */
  private kick(at: number): void {
    const oscillator = this.context.createOscillator()
    oscillator.frequency.setValueAtTime(110, at)
    oscillator.frequency.exponentialRampToValueAtTime(42, at + 0.14)
    const gain = this.context.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(0.35, at + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3)
    oscillator.connect(gain)
    gain.connect(this.output)
    oscillator.start(at)
    oscillator.stop(at + 0.32)
  }

  private hat(at: number): void {
    const source = this.context.createBufferSource()
    source.buffer = this.noise
    const filter = this.context.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 7000
    const gain = this.context.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(0.03, at + 0.003)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.06)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.output)
    source.start(at)
    source.stop(at + 0.08)
  }
}

function semitone(offset: number): number {
  return A3 * Math.pow(2, offset / 12)
}

function createNoiseBuffer(context: BaseAudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate / 4, context.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
  return buffer
}
