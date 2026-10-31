/**
 * Звуковые эффекты игры. Они не лежат в файлах, а синтезируются Web Audio API
 * в момент события. Поэтому проект ничего не весит лишнего, а прав на сэмплы не нужно.
 *
 * Обычные круги беззвучны: звук получают только особые события, иначе за
 * щелчками не слышно песню.
 */
export class SoundEffects {
  private readonly context: BaseAudioContext
  private readonly output: GainNode
  private readonly noise: AudioBuffer

  constructor(context: BaseAudioContext) {
    this.context = context
    this.output = context.createGain()
    this.output.connect(context.destination)
    this.noise = createNoiseBuffer(context)
  }

  setVolume(volume: number): void {
    this.output.gain.value = volume
  }

  /** Свист улетающей стрелки: шум, полоса которого уходит вверх, и панорама в сторону полёта. */
  arrow(direction: number): void {
    const now = this.context.currentTime
    const source = this.context.createBufferSource()
    source.buffer = this.noise

    const filter = this.context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 1.2
    filter.frequency.setValueAtTime(500, now)
    filter.frequency.exponentialRampToValueAtTime(5000, now + 0.22)

    const gain = this.context.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(2.2, now + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3)

    const panner = this.context.createStereoPanner()
    panner.pan.setValueAtTime(0, now)
    panner.pan.linearRampToValueAtTime(direction * 0.9, now + 0.28)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(panner)
    panner.connect(this.output)
    source.start(now)
    source.stop(now + 0.32)

    // Короткий восходящий тон даёт свисту «щелчок» попадания
    this.tone(now, 520, 1040, 0.14, 0.22, 'triangle')
  }

  /** Перелив золотой ноты: три быстрых колокольчика. */
  star(): void {
    const now = this.context.currentTime
    const notes = [1046.5, 1318.5, 1760]
    for (let i = 0; i < notes.length; i++) {
      this.tone(now + i * 0.06, notes[i], notes[i], 0.35, 0.28, 'sine')
    }
  }

  /** Новый множитель: чем он выше, тем выше звук. */
  multiplierUp(multiplier: number): void {
    const now = this.context.currentTime
    const base = 330 * Math.pow(2, (multiplier - 2) / 3)
    this.tone(now, base, base, 0.12, 0.25, 'square')
    this.tone(now + 0.09, base * 1.5, base * 1.5, 0.22, 0.25, 'square')
  }

  /** Круглое комбо: аккорд с быстрым взлётом. */
  milestone(): void {
    const now = this.context.currentTime
    for (const frequency of [523.3, 659.3, 784, 1046.5]) {
      this.tone(now, frequency * 0.5, frequency, 0.6, 0.16, 'sawtooth')
    }
  }

  /** Промах: глухой короткий удар, нарочно тихий, чтобы не раздражать. */
  miss(): void {
    const now = this.context.currentTime
    this.tone(now, 150, 70, 0.12, 0.2, 'sine')
  }

  /** Предупреждение: два низких сигнала. */
  warning(): void {
    const now = this.context.currentTime
    this.tone(now, 196, 196, 0.13, 0.28, 'square')
    this.tone(now + 0.17, 164.8, 164.8, 0.2, 0.28, 'square')
  }

  /** Один тон с плавным скольжением частоты и затуханием. */
  private tone(
    startAt: number,
    fromHz: number,
    toHz: number,
    seconds: number,
    volume: number,
    type: OscillatorType,
  ): void {
    const oscillator = this.context.createOscillator()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(fromHz, startAt)
    oscillator.frequency.exponentialRampToValueAtTime(toHz, startAt + seconds)

    const gain = this.context.createGain()
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + seconds)

    oscillator.connect(gain)
    gain.connect(this.output)
    oscillator.start(startAt)
    oscillator.stop(startAt + seconds + 0.02)
  }
}

/** Секунда белого шума. Зерно фиксировано, но для звука это неважно. */
function createNoiseBuffer(context: BaseAudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
  return buffer
}
