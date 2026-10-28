import type { AudioAnalysis } from './analyzer.ts'

/**
 * Всё, что стиль визуализации знает о звуке в конкретный момент времени.
 * Значения 0..1, кроме time и energy.
 */
export interface FrameFeatures {
  /** Время от начала трека, в секундах. */
  time: number
  bass: number
  mid: number
  treble: number
  rms: number
  /** 1 в момент удара, плавно затухает к 0. */
  beatPulse: number
  /** Накопленная энергия (растёт со временем быстрее на громких местах). */
  energy: number
  /** Спектр 0..1, analysis.spectrumBins значений. */
  spectrum: Float32Array
}

export function createEmptyFeatures(spectrumBins = 64): FrameFeatures {
  return {
    time: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    rms: 0,
    beatPulse: 0,
    energy: 0,
    spectrum: new Float32Array(spectrumBins),
  }
}

/**
 * Достаёт признаки для момента time с линейной интерполяцией между кадрами
 * анализа. Если FPS экспорта совпадает с FPS анализа (или делит его нацело,
 * как 30 и 60), время попадает точно в кадры и интерполяция ничего не меняет.
 *
 * Результат пишется в переданный объект out, чтобы не создавать мусор
 * 60 раз в секунду.
 */
export function sampleFeatures(analysis: AudioAnalysis, time: number, out: FrameFeatures): FrameFeatures {
  const position = Math.min(Math.max(time * analysis.fps, 0), analysis.frameCount - 1)
  const i0 = Math.floor(position)
  const i1 = Math.min(i0 + 1, analysis.frameCount - 1)
  const k = position - i0
  const mix = (arr: Float32Array) => arr[i0] + (arr[i1] - arr[i0]) * k

  out.time = time
  out.bass = mix(analysis.bass)
  out.mid = mix(analysis.mid)
  out.treble = mix(analysis.treble)
  out.rms = mix(analysis.rms)
  // Импульс удара не интерполируем: иначе вспышка начиналась бы за кадр до удара
  out.beatPulse = analysis.beatPulse[i0]
  out.energy = mix(analysis.energyIntegral)

  const bins = analysis.spectrumBins
  if (out.spectrum.length !== bins) out.spectrum = new Float32Array(bins)
  for (let b = 0; b < bins; b++) {
    const a = analysis.spectrum[i0 * bins + b]
    const c = analysis.spectrum[i1 * bins + b]
    out.spectrum[b] = a + (c - a) * k
  }
  return out
}
