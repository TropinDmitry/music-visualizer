/**
 * Быстрое преобразование Фурье (radix-2, Cooley–Tukey) для вещественного сигнала.
 *
 * Своя реализация вместо AnalyserNode: AnalyserNode работает только в реальном
 * времени и его результат зависит от момента опроса, а нам нужен
 * детерминированный офлайн-анализ (одинаковый в превью и при экспорте).
 */
export class FFT {
  readonly size: number
  private readonly cos: Float32Array
  private readonly sin: Float32Array
  private readonly bitReversed: Uint32Array
  private readonly re: Float32Array
  private readonly im: Float32Array

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) {
      throw new Error(`Размер FFT должен быть степенью двойки, получено ${size}`)
    }
    this.size = size
    this.re = new Float32Array(size)
    this.im = new Float32Array(size)

    // Таблицы синусов/косинусов считаем один раз
    this.cos = new Float32Array(size / 2)
    this.sin = new Float32Array(size / 2)
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / size)
      this.sin[i] = -Math.sin((2 * Math.PI * i) / size)
    }

    // Перестановка индексов с обратным порядком бит
    const bits = Math.log2(size)
    this.bitReversed = new Uint32Array(size)
    for (let i = 0; i < size; i++) {
      let r = 0
      for (let b = 0; b < bits; b++) r = (r << 1) | ((i >> b) & 1)
      this.bitReversed[i] = r
    }
  }

  /**
   * Считает модули спектра |X[k]| для k = 0..size/2.
   * @param input вещественный сигнал длиной size (уже умноженный на окно)
   * @param out массив длиной size/2 + 1
   */
  magnitudes(input: Float32Array, out: Float32Array): void {
    const { size, re, im, bitReversed, cos, sin } = this
    for (let i = 0; i < size; i++) {
      re[bitReversed[i]] = input[i]
      im[i] = 0
    }

    for (let len = 2; len <= size; len <<= 1) {
      const half = len >> 1
      const step = size / len
      for (let start = 0; start < size; start += len) {
        for (let k = 0; k < half; k++) {
          const wr = cos[k * step]
          const wi = sin[k * step]
          const a = start + k
          const b = a + half
          const tr = re[b] * wr - im[b] * wi
          const ti = re[b] * wi + im[b] * wr
          re[b] = re[a] - tr
          im[b] = im[a] - ti
          re[a] += tr
          im[a] += ti
        }
      }
    }

    for (let k = 0; k <= size / 2; k++) {
      out[k] = Math.hypot(re[k], im[k])
    }
  }
}

/** Окно Ханна: уменьшает «растекание» спектра на краях кадра. */
export function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1))
  }
  return w
}
