/**
 * Звуковые эффекты игры. Они не лежат в файлах, а синтезируются Web Audio API
 * в момент события, поэтому прав на сэмплы не нужно.
 *
 * Звук намеренно мягкий: только синус с быстрым затуханием, как у калимбы или
 * деревянного ксилофона, и всё проходит через фильтр, срезающий верха.
 * Пила и меандр звучат «электронно» и режут слух, поэтому их здесь нет.
 * Обычные круги беззвучны: иначе за щелчками не слышно песню.
 */
export class SoundEffects {
  private readonly context: BaseAudioContext
  private readonly output: GainNode
  private readonly noise: AudioBuffer

  constructor(context: BaseAudioContext) {
    this.context = context
    this.noise = createNoiseBuffer(context)

    const softener = context.createBiquadFilter()
    softener.type = 'lowpass'
    softener.frequency.value = 3200

    this.output = context.createGain()
    this.output.connect(softener)
    softener.connect(context.destination)
  }

  setVolume(volume: number): void {
    this.output.gain.value = volume
  }

  /** Стрелка: только шорох воздуха, который уходит в сторону полёта. */
  arrow(direction: number): void {
    const now = this.context.currentTime
    const source = this.context.createBufferSource()
    source.buffer = this.noise

    const filter = this.context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 0.8
    filter.frequency.setValueAtTime(350, now)
    filter.frequency.exponentialRampToValueAtTime(1600, now + 0.2)

    const gain = this.context.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.9, now + 0.06)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3)

    const panner = this.context.createStereoPanner()
    panner.pan.setValueAtTime(0, now)
    panner.pan.linearRampToValueAtTime(direction * 0.8, now + 0.28)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(panner)
    panner.connect(this.output)
    source.start(now)
    source.stop(now + 0.32)
  }

  /** Звезда: две мягкие ноты вверх. */
  star(): void {
    const now = this.context.currentTime
    this.pluck(now, 659.3, 0.45, 0.16)
    this.pluck(now + 0.07, 880, 0.55, 0.16)
  }

  /** Новый множитель: одна нота, чем множитель выше, тем она выше. */
  multiplierUp(multiplier: number): void {
    this.pluck(this.context.currentTime, 330 * Math.pow(2, (multiplier - 2) / 6), 0.5, 0.14)
  }

  /** Круглое комбо: мягкий аккорд, ноты вступают чуть врозь, как перебор. */
  milestone(): void {
    const now = this.context.currentTime
    const notes = [261.6, 329.6, 392, 523.3]
    for (let i = 0; i < notes.length; i++) this.pluck(now + i * 0.04, notes[i], 0.7, 0.1)
  }

  /** Промах: еле слышный глухой стук. */
  miss(): void {
    this.pluck(this.context.currentTime, 110, 0.12, 0.08)
  }

  /** Предупреждение: две низкие ноты вниз. */
  warning(): void {
    const now = this.context.currentTime
    this.pluck(now, 196, 0.35, 0.16)
    this.pluck(now + 0.18, 164.8, 0.4, 0.16)
  }

  /** Щипок струны: мягкий вход и плавное затухание, чистый синус без обертонов. */
  private pluck(startAt: number, frequency: number, seconds: number, volume: number): void {
    const oscillator = this.context.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency

    const gain = this.context.createGain()
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + seconds)

    oscillator.connect(gain)
    gain.connect(this.output)
    oscillator.start(startAt)
    oscillator.stop(startAt + seconds + 0.02)
  }
}

/** Секунда белого шума: из неё фильтр вырезает шорох. */
function createNoiseBuffer(context: BaseAudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
  return buffer
}
