import { describe, expect, it } from 'vitest'
import { analyzeAudio, logSpacedBinEdges, mixToMono } from './analyzer.ts'
import { synthesizeDemoTrack } from './demoTrack.ts'
import { trackMelody } from './melody.ts'

const SAMPLE_RATE = 44100

/** Синус заданной частоты и амплитуды. */
function sine(freqHz: number, seconds: number, amplitude = 0.5): Float32Array {
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE))
  for (let i = 0; i < out.length; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * freqHz * i) / SAMPLE_RATE)
  }
  return out
}

/** Короткие щелчки (затухающий шум 3 мс) с заданным интервалом. */
function clicks(intervalSec: number, seconds: number, firstAt = 0.25): { signal: Float32Array; times: number[] } {
  const signal = new Float32Array(Math.round(seconds * SAMPLE_RATE))
  const times: number[] = []
  const clickLength = Math.round(0.003 * SAMPLE_RATE)
  // Детерминированный «шум»: простой линейный конгруэнтный генератор
  let seed = 12345
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 2 ** 32 - 0.5
  }
  for (let t = firstAt; t < seconds - 0.1; t += intervalSec) {
    times.push(t)
    const start = Math.round(t * SAMPLE_RATE)
    for (let i = 0; i < clickLength; i++) {
      signal[start + i] += 1.6 * random() * (1 - i / clickLength)
    }
  }
  return { signal, times }
}

function average(values: Float32Array, from = 0, to = values.length): number {
  let sum = 0
  for (let i = from; i < to; i++) sum += values[i]
  return sum / (to - from)
}

describe('analyzeAudio: полосы частот', () => {
  it('синус 60 Гц попадает в бас', () => {
    const a = analyzeAudio(sine(60, 2), SAMPLE_RATE)
    // Пропускаем первые и последние кадры, где окно выходит за края сигнала
    const from = 10
    const to = a.frameCount - 10
    expect(average(a.raw.bass, from, to)).toBeGreaterThan(0.4) // ≈ амплитуда 0.5
    expect(average(a.raw.mid, from, to)).toBeLessThan(0.01)
    expect(average(a.raw.treble, from, to)).toBeLessThan(0.01)
    expect(average(a.bass, from, to)).toBeGreaterThan(0.9)
    expect(average(a.treble, from, to)).toBeLessThan(0.05)
  })

  it('синус 5 кГц попадает в верх', () => {
    const a = analyzeAudio(sine(5000, 2), SAMPLE_RATE)
    const from = 10
    const to = a.frameCount - 10
    expect(average(a.raw.treble, from, to)).toBeGreaterThan(0.4)
    expect(average(a.raw.bass, from, to)).toBeLessThan(0.01)
    expect(average(a.raw.mid, from, to)).toBeLessThan(0.01)
    expect(average(a.treble, from, to)).toBeGreaterThan(0.9)
    expect(average(a.bass, from, to)).toBeLessThan(0.05)
  })

  it('синус 1 кГц попадает в середину', () => {
    const a = analyzeAudio(sine(1000, 2), SAMPLE_RATE)
    expect(average(a.raw.mid, 10, a.frameCount - 10)).toBeGreaterThan(0.4)
    expect(average(a.raw.bass, 10, a.frameCount - 10)).toBeLessThan(0.01)
  })

  it('RMS синуса ≈ амплитуда / √2', () => {
    const a = analyzeAudio(sine(440, 1, 0.5), SAMPLE_RATE)
    expect(average(a.raw.rms, 10, a.frameCount - 10)).toBeCloseTo(0.5 / Math.SQRT2, 2)
  })

  it('пик спектра 60 Гц — в левой части, 5 кГц — в правой', () => {
    const peakBin = (signal: Float32Array) => {
      const a = analyzeAudio(signal, SAMPLE_RATE)
      const frame = Math.floor(a.frameCount / 2)
      const row = a.spectrum.subarray(frame * a.spectrumBins, (frame + 1) * a.spectrumBins)
      return row.indexOf(Math.max(...row))
    }
    expect(peakBin(sine(60, 1))).toBeLessThan(16)
    expect(peakBin(sine(5000, 1))).toBeGreaterThan(40)
  })
})

describe('analyzeAudio: детектор ударов', () => {
  it('находит щелчки раз в 0,5 с', () => {
    const { signal, times } = clicks(0.5, 6)
    const a = analyzeAudio(signal, SAMPLE_RATE)

    expect(a.onsetTimes.length).toBe(times.length)
    for (const expected of times) {
      let smallestError = Infinity
      for (const found of a.onsetTimes) {
        smallestError = Math.min(smallestError, Math.abs(found - expected))
      }
      // Допуск — 2 кадра анализа (≈ 33 мс при 60 FPS)
      expect(smallestError).toBeLessThan(2 / a.fps)
    }
  })

  it('работает и при 30 FPS', () => {
    const { signal, times } = clicks(0.5, 4)
    const a = analyzeAudio(signal, SAMPLE_RATE, { fps: 30 })
    expect(a.onsetTimes.length).toBe(times.length)
  })

  it('не находит ударов в ровном синусе', () => {
    const a = analyzeAudio(sine(220, 3), SAMPLE_RATE)
    // Края не считаем: появление звука из тишины и его обрыв в конце
    // честно выглядят для детектора как удары
    const inside = a.onsetTimes.filter((t) => t > 0.1 && t < a.duration - 0.1)
    expect(inside).toEqual([])
  })

  it('импульс удара равен 1 в момент удара и затухает', () => {
    const { signal } = clicks(0.5, 3)
    const a = analyzeAudio(signal, SAMPLE_RATE)
    const first = Math.round(a.onsetTimes[0] * a.fps)
    expect(a.beatPulse[first]).toBe(1)
    expect(a.beatPulse[first + 10]).toBeLessThan(0.6)
    expect(a.beatPulse[first + 10]).toBeGreaterThan(0)
  })
})

describe('analyzeAudio: тишина', () => {
  it('тишина даёт нули', () => {
    const a = analyzeAudio(new Float32Array(SAMPLE_RATE * 2), SAMPLE_RATE)
    for (const arr of [a.bass, a.mid, a.treble, a.rms, a.beatPulse, a.onsetStrength, a.spectrum, a.energyIntegral]) {
      expect(Math.max(...arr)).toBe(0)
    }
    expect(a.onsetTimes).toEqual([])
  })
})

describe('analyzeAudio: общее', () => {
  it('число кадров = длительность × fps', () => {
    expect(analyzeAudio(new Float32Array(SAMPLE_RATE * 3), SAMPLE_RATE, { fps: 30 }).frameCount).toBe(90)
    expect(analyzeAudio(new Float32Array(SAMPLE_RATE * 3), SAMPLE_RATE, { fps: 60 }).frameCount).toBe(180)
  })

  it('детерминирован: два прогона дают одинаковый результат', () => {
    const { signal } = clicks(0.37, 3)
    const a = analyzeAudio(signal, SAMPLE_RATE)
    const b = analyzeAudio(signal, SAMPLE_RATE)
    expect(Array.from(a.bass)).toEqual(Array.from(b.bass))
    expect(a.onsetTimes).toEqual(b.onsetTimes)
  })

  it('накопленная энергия не убывает', () => {
    const a = analyzeAudio(sine(100, 2), SAMPLE_RATE)
    for (let i = 1; i < a.frameCount; i++) {
      expect(a.energyIntegral[i]).toBeGreaterThanOrEqual(a.energyIntegral[i - 1])
    }
  })

  it('границы спектра строго возрастают', () => {
    const edges = logSpacedBinEdges(64, 30, 16000, SAMPLE_RATE / 2048, 1024)
    for (let i = 1; i < edges.length; i++) expect(edges[i]).toBeGreaterThan(edges[i - 1])
  })
})

describe('analyzeAudio: голос', () => {
  /** Слог: тон с формантами на 600 и 1800 Гц, нарастает и спадает, как гласная. */
  function addSyllable(signal: Float32Array, time: number): void {
    const start = Math.round(time * SAMPLE_RATE)
    const length = Math.round(0.14 * SAMPLE_RATE)
    for (let i = 0; i < length; i++) {
      const t = i / SAMPLE_RATE
      const envelope = Math.sin((Math.PI * i) / length)
      signal[start + i] +=
        envelope * (0.3 * Math.sin(2 * Math.PI * 600 * t) + 0.15 * Math.sin(2 * Math.PI * 1800 * t))
    }
  }

  /** Бочка: низкий тон с резким началом. */
  function addKick(signal: Float32Array, time: number): void {
    const start = Math.round(time * SAMPLE_RATE)
    const length = Math.round(0.3 * SAMPLE_RATE)
    for (let i = 0; i < length; i++) {
      const t = i / SAMPLE_RATE
      signal[start + i] += 0.9 * Math.sin(2 * Math.PI * 60 * t) * Math.exp(-t * 14)
    }
  }

  it('слоги находятся, а бочка нет', () => {
    const signal = new Float32Array(SAMPLE_RATE * 8)
    const syllables = [1.1, 1.6, 2.1, 2.6, 3.1, 3.6, 4.1, 4.6, 5.1, 5.6, 6.1]
    for (const time of syllables) addSyllable(signal, time)
    for (let time = 1; time < 7; time += 1) addKick(signal, time + 0.25)

    const a = analyzeAudio(signal, SAMPLE_RATE)
    const found: number[] = []
    for (let frame = 0; frame < a.frameCount; frame++) {
      if (a.vocalOnsets[frame]) found.push(frame / a.fps)
    }

    for (const syllable of syllables) {
      let error = Infinity
      for (const time of found) error = Math.min(error, Math.abs(time - syllable))
      expect(error).toBeLessThan(0.1)
    }
    let notesOnKicks = 0
    for (const time of found) {
      if (Math.abs(((time - 0.25) % 1) - 0) < 0.03) notesOnKicks += 1
    }
    expect(notesOnKicks).toBeLessThanOrEqual(1)
  })

  it('в тишине голоса нет', () => {
    const a = analyzeAudio(new Float32Array(SAMPLE_RATE), SAMPLE_RATE)
    expect(Math.max(...a.vocalOnsets)).toBe(0)
  })
})

describe('демо-трек', () => {
  it('удары бочки (каждые 0,5 с) находятся детектором', () => {
    const { left, right, sampleRate } = synthesizeDemoTrack(6)
    const a = analyzeAudio(mixToMono([left, right]), sampleRate)
    for (let beat = 0.5; beat < 5.5; beat += 0.5) {
      let smallestError = Infinity
      for (const found of a.onsetTimes) {
        smallestError = Math.min(smallestError, Math.abs(found - beat))
      }
      expect(smallestError).toBeLessThan(0.04)
    }
  })
})

describe('мелодия', () => {
  const sampleRate = 44100

  /** Плавный тон с гармониками: высота меняется без всякого удара. */
  function glideFreeMelody(notes: number[], noteSec: number): Float32Array {
    const samples = new Float32Array(Math.round(notes.length * noteSec * sampleRate))
    let phase = 0
    for (let i = 0; i < samples.length; i++) {
      const note = notes[Math.floor(i / sampleRate / noteSec)]
      phase += (2 * Math.PI * 440 * 2 ** ((note - 69) / 12)) / sampleRate
      samples[i] = 0.4 * Math.sin(phase) + 0.15 * Math.sin(2 * phase)
    }
    return samples
  }

  it('находит высоту и начало каждой ноты без ударов', () => {
    const notes = [60, 64, 67, 72, 67, 64, 60, 62]
    const melody = trackMelody(glideFreeMelody(notes, 0.4), sampleRate, 60, 192)
    expect(melody.notePitches).toEqual(notes)
    melody.noteTimes.forEach((time, i) => expect(Math.abs(time - i * 0.4)).toBeLessThan(0.08))
  })

  it('в шуме ведущего звука нет', () => {
    const noise = new Float32Array(sampleRate * 2)
    let seed = 1
    for (let i = 0; i < noise.length; i++) {
      seed = (seed * 16807) % 2147483647
      noise[i] = seed / 2147483647 - 0.5
    }
    expect(trackMelody(noise, sampleRate, 60, 120).noteTimes.length).toBeLessThan(3)
  })
})
