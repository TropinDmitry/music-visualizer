/**
 * Звуковые эффекты игры. Они не лежат в файлах, а синтезируются Web Audio API
 * в момент события, поэтому прав на сэмплы не нужно.
 *
 * Звук намеренно мягкий: только синус с быстрым затуханием, как у калимбы или
 * деревянного ксилофона, и всё проходит через фильтр, срезающий верха. Кроме
 * праздничных моментов, Fever, трёх звёзд и салюта: они звенят в полную яркость.
 * Пила и меандр звучат «электронно» и режут слух, поэтому их здесь нет.
 * Обычные круги беззвучны: иначе за щелчками не слышно песню.
 */
export class SoundEffects {
  private readonly context: BaseAudioContext
  private readonly output: GainNode
  /** Праздничные звуки идут мимо мягкого фильтра: салют и Fever должны звенеть. */
  private readonly bright: GainNode
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
    this.bright = context.createGain()
    this.bright.connect(context.destination)
  }

  setVolume(volume: number): void {
    this.output.gain.value = volume
    this.bright.gain.value = volume
  }

  /**
   * Включился Fever: шорох взлетает вверх, и на вершине звенит яркий аккорд.
   * Самый праздничный звук партии, его нельзя не заметить.
   */
  feverStart(): void {
    const now = this.context.currentTime
    this.sweep(now, 300, 5200, 0.55, 0.7)
    const chord = [523.3, 659.3, 784, 1046.5]
    for (let i = 0; i < chord.length; i++) this.bell(now + 0.45 + i * 0.05, chord[i], 1.6, 0.16, this.bright)
    this.pluck(now + 0.45, 130.8, 0.8, 0.25)
  }

  /** Fever кончился: две ноты вниз, тише старта. */
  feverEnd(): void {
    const now = this.context.currentTime
    this.pluck(now, 784, 0.4, 0.12)
    this.pluck(now + 0.14, 523.3, 0.6, 0.12)
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

  /** Пробел: воздух и низкая нота вместе, самый весомый звук игры. */
  space(): void {
    const now = this.context.currentTime
    this.arrow(0)
    this.pluck(now, 130.8, 0.6, 0.2)
    this.pluck(now, 392, 0.45, 0.1)
  }

  /** Звезда: две мягкие ноты вверх. */
  star(): void {
    const now = this.context.currentTime
    this.pluck(now, 659.3, 0.45, 0.16)
    this.pluck(now + 0.07, 880, 0.55, 0.16)
  }

  /** Луч удержан до конца: одна тёплая нота. */
  holdDone(): void {
    this.pluck(this.context.currentTime, 523.3, 0.5, 0.14)
  }

  /** Взрыв песни: низкий мягкий удар, чтобы подчеркнуть момент. */
  impact(): void {
    const now = this.context.currentTime
    this.pluck(now, 98, 0.5, 0.2)
    this.pluck(now, 146.8, 0.4, 0.12)
  }

  /** Новый множитель: нота и звон сверху, чем множитель выше, тем они выше. */
  multiplierUp(multiplier: number): void {
    const now = this.context.currentTime
    const frequency = 330 * Math.pow(2, (multiplier - 2) / 6)
    this.pluck(now, frequency, 0.5, 0.16)
    this.bell(now + 0.05, frequency * 2, 0.9, 0.1, this.bright)
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

  /**
   * Звезда в итогах: каждая следующая выше и громче, так растёт ощущение награды.
   * Последняя звезда за партию без промахов звенит колокольчиком и аккордом сверху.
   */
  resultStar(index: number, isBright: boolean): void {
    const now = this.context.currentTime
    const notes = [523.3, 659.3, 784]
    this.pluck(now, notes[index], 0.6, 0.12 + index * 0.06)
    this.pluck(now, notes[index] / 2, 0.5, 0.08 + index * 0.04)
    this.bell(now + 0.02, notes[index] * 2, 0.9, 0.06 + index * 0.03, this.bright)
    if (!isBright) return
    // Все три звезды: громкий звонкий аккорд и низкий удар под ним
    this.pluck(now, 130.8, 1, 0.3)
    this.bell(now + 0.06, 1046.5, 2.2, 0.26, this.bright)
    this.bell(now + 0.12, 1318.5, 2, 0.18, this.bright)
    this.bell(now + 0.18, 1568, 1.8, 0.14, this.bright)
    this.bell(now + 0.24, 2093, 1.6, 0.1, this.bright)
  }

  /** Хлопок салюта: резкий удар, вспышка шума и россыпь треска после. */
  firework(): void {
    const now = this.context.currentTime
    this.pluck(now, 70, 0.35, 0.45)
    this.burst(now, 1200 + Math.random() * 900, 0.5, 1)
    // Треск: мелкие искры звенят высоко и вразнобой
    for (let i = 0; i < 6; i++) this.burst(now + 0.12 + Math.random() * 0.45, 4000 + Math.random() * 3000, 0.06, 0.35)
  }

  /** Короткий всплеск шума в полосе около frequency. */
  private burst(startAt: number, frequency: number, seconds: number, volume: number): void {
    const source = this.context.createBufferSource()
    source.buffer = this.noise
    source.playbackRate.value = 0.6 + Math.random() * 0.5

    const filter = this.context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = frequency
    filter.Q.value = 0.9

    const gain = this.context.createGain()
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + seconds)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.bright)
    source.start(startAt, Math.random() * 0.4)
    source.stop(startAt + seconds + 0.05)
  }

  /** Шорох, который взлетает по высоте: разгон перед праздничным аккордом. */
  private sweep(startAt: number, from: number, to: number, seconds: number, volume: number): void {
    const source = this.context.createBufferSource()
    source.buffer = this.noise
    const filter = this.context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 1.2
    filter.frequency.setValueAtTime(from, startAt)
    filter.frequency.exponentialRampToValueAtTime(to, startAt + seconds)
    const gain = this.context.createGain()
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(volume, startAt + seconds * 0.85)
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + seconds + 0.15)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.bright)
    source.start(startAt)
    source.stop(startAt + seconds + 0.2)
  }

  /** Колокольчик: синус и два негармоничных обертона, звенят дольше щипка. */
  private bell(startAt: number, frequency: number, seconds: number, volume: number, output = this.output): void {
    const partials = [
      [1, 1],
      [2.76, 0.35],
      [5.4, 0.12],
    ]
    for (const [ratio, share] of partials) this.pluck(startAt, frequency * ratio, seconds / ratio ** 0.5, volume * share, output)
  }

  /** Щипок струны: мягкий вход и плавное затухание, чистый синус без обертонов. */
  private pluck(startAt: number, frequency: number, seconds: number, volume: number, output = this.output): void {
    const oscillator = this.context.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency

    const gain = this.context.createGain()
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + seconds)

    oscillator.connect(gain)
    gain.connect(output)
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
