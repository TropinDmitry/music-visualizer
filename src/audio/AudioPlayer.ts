/**
 * Проигрывание трека через Web Audio API с перемоткой.
 *
 * AudioBufferSourceNode одноразовый: после stop() его нельзя запустить снова.
 * Поэтому «пауза» и «перемотка» — это остановить старый узел и создать новый
 * с нужного места. Текущую позицию считаем по часам audioContext.currentTime —
 * это точные часы звуковой карты, по ним и синхронизируется картинка.
 */
export class AudioPlayer {
  readonly context: AudioContext
  private readonly gain: GainNode
  private buffer: AudioBuffer | null = null
  private source: AudioBufferSourceNode | null = null
  /** Позиция в треке (с), с которой начато текущее проигрывание или где стоим на паузе. */
  private offset = 0
  /** Значение context.currentTime в момент запуска. */
  private startedAt = 0
  private playing = false
  onEnded: (() => void) | null = null

  constructor(context: AudioContext) {
    this.context = context
    this.gain = context.createGain()
    this.gain.connect(context.destination)
  }

  get isPlaying(): boolean {
    return this.playing
  }

  get duration(): number {
    return this.buffer?.duration ?? 0
  }

  /**
   * Текущая позиция в секундах — то, что слышно прямо сейчас.
   * outputLatency — задержка от планирования звука до динамиков; без её учёта
   * картинка чуть опережала бы звук. 🔎 Свойство поддерживается не везде,
   * поэтому при отсутствии считаем задержку нулевой.
   */
  get currentTime(): number {
    if (!this.playing) return this.offset
    const latency = this.context.outputLatency || 0
    const position = this.offset + (this.context.currentTime - this.startedAt) - latency
    return Math.min(Math.max(position, 0), this.duration)
  }

  load(buffer: AudioBuffer): void {
    this.stopSource()
    this.buffer = buffer
    this.offset = 0
    this.playing = false
  }

  async play(): Promise<void> {
    if (!this.buffer || this.playing) return
    // Браузеры создают AudioContext «спящим» до жеста пользователя
    if (this.context.state === 'suspended') await this.context.resume()
    if (this.offset >= this.duration) this.offset = 0

    const source = this.context.createBufferSource()
    source.buffer = this.buffer
    source.connect(this.gain)
    source.onended = () => {
      // onended срабатывает и при ручном stop() — реагируем только на свой узел
      if (this.source !== source) return
      this.source = null
      this.playing = false
      this.offset = this.duration
      this.onEnded?.()
    }
    source.start(0, this.offset)
    this.source = source
    this.startedAt = this.context.currentTime
    this.playing = true
  }

  pause(): void {
    if (!this.playing) return
    this.offset = this.currentTime
    this.stopSource()
    this.playing = false
  }

  seek(time: number): void {
    const wasPlaying = this.playing
    this.stopSource()
    this.playing = false
    this.offset = Math.min(Math.max(time, 0), this.duration)
    if (wasPlaying) void this.play()
  }

  setVolume(volume: number): void {
    this.gain.gain.value = volume
  }

  private stopSource(): void {
    if (!this.source) return
    const source = this.source
    this.source = null // сначала отвязываем, чтобы onended не сбросил позицию
    source.stop()
    source.disconnect()
  }
}
