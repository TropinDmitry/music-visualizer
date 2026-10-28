/**
 * Синтез демо-трека: бочка, хэт, бас и аккорды, 120 BPM.
 * Используется и в приложении (кнопка «Демо-трек»), и скриптом
 * scripts/generate-test-wav.ts, который сохраняет тот же звук в WAV для проверки.
 * Всё детерминировано — никакого Math.random.
 */

export interface DemoTrack {
  sampleRate: number
  left: Float32Array<ArrayBuffer>
  right: Float32Array<ArrayBuffer>
}

export function synthesizeDemoTrack(seconds = 12, sampleRate = 44100): DemoTrack {
  const length = Math.round(seconds * sampleRate)
  const left = new Float32Array(length)
  const right = new Float32Array(length)
  const beat = 0.5 // 120 BPM

  // Псевдослучайный шум для хэта (линейный конгруэнтный генератор)
  let seed = 1
  const noise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 2 ** 31 - 1
  }

  // Басовая линия и аккорды (частоты в Гц), меняются каждые 2 такта
  const bassNotes = [55, 55, 65.41, 49]
  const chords = [
    [220, 261.63, 329.63],
    [220, 261.63, 329.63],
    [261.63, 329.63, 392],
    [196, 246.94, 293.66],
  ]

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate
    const beatIndex = Math.floor(t / beat)
    const tInBeat = t - beatIndex * beat
    const bar = Math.floor(beatIndex / 8) % 4

    // Бочка: синус, частота которого падает со 120 до 45 Гц (это даёт «удар»).
    // Фаза — интеграл частоты 45 + 75·e^(−30t) по времени.
    const kickPhase = 2 * Math.PI * (45 * tInBeat + (75 / 30) * (1 - Math.exp(-tInBeat * 30)))
    const kick = 0.9 * Math.sin(kickPhase) * Math.exp(-tInBeat * 7)

    // Хэт на слабые доли: короткая вспышка шума
    const tHat = (t + beat / 2) % beat
    const hatEnvelope = Math.exp(-tHat * 60)
    const hat = noise() * hatEnvelope * 0.25

    // Бас: пила, слегка «пульсирует» в такт (side-chain от бочки)
    const bassFreq = bassNotes[bar]
    const saw = 2 * ((t * bassFreq) % 1) - 1
    const duck = 1 - 0.7 * Math.exp(-tInBeat * 10)
    const bass = saw * 0.18 * duck

    // Аккорд: три синуса с медленным вибрато
    let pad = 0
    for (const f of chords[bar]) pad += Math.sin(2 * Math.PI * f * t + 0.3 * Math.sin(2 * Math.PI * 0.5 * t))
    pad *= 0.06 * duck

    // Плавное появление и затухание по краям
    const fade = Math.min(1, t / 0.05, (seconds - t) / 0.5)

    const mono = (kick + bass + pad) * fade
    left[i] = mono + hat * fade * 0.8
    right[i] = mono + hat * fade * 1.2
  }

  return { sampleRate, left, right }
}

/** Упаковывает стерео-сигнал в WAV (16 бит PCM). */
export function encodeWav({ sampleRate, left, right }: DemoTrack): Uint8Array {
  const channels = 2
  const bytesPerSample = 2
  const dataSize = left.length * channels * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  writeText(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true) // размер блока fmt
  view.setUint16(20, 1, true) // 1 = PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * bytesPerSample, true)
  view.setUint16(32, channels * bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < left.length; i++) {
    for (const sample of [left[i], right[i]]) {
      const clamped = Math.max(-1, Math.min(1, sample))
      view.setInt16(offset, Math.round(clamped * 32767), true)
      offset += 2
    }
  }
  return new Uint8Array(buffer)
}
