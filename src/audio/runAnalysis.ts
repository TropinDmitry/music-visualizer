import type { AudioAnalysis } from './analyzer.ts'

/** Частота кадров анализа. 60 делится на 30 нацело, поэтому подходит для обоих вариантов экспорта. */
export const ANALYSIS_FPS = 60

/**
 * Запускает анализ в веб-воркере и возвращает результат промисом.
 * Синтаксис `new Worker(new URL(...), { type: 'module' })` Vite понимает
 * и сам собирает воркер в отдельный файл.
 */
export function runAnalysisInWorker(
  samples: Float32Array,
  sampleRate: number,
  onProgress: (fraction: number) => void,
): Promise<AudioAnalysis> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' })

    worker.onmessage = (event) => {
      if (event.data.type === 'progress') {
        onProgress(event.data.fraction)
      } else if (event.data.type === 'done') {
        resolve(event.data.analysis as AudioAnalysis)
        worker.terminate()
      }
    }
    worker.onerror = (event) => {
      reject(new Error(event.message || 'Ошибка в воркере анализа'))
      worker.terminate()
    }

    // Передаём копию сэмплов как transferable: без копирования между потоками
    const copy = samples.slice()
    worker.postMessage({ samples: copy, sampleRate, fps: ANALYSIS_FPS }, [copy.buffer])
  })
}
