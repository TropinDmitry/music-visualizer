import { analyzeAudio } from './analyzer.ts'

/**
 * Веб-воркер: анализ длинного трека занимает секунды, и в отдельном потоке
 * он не «замораживает» интерфейс.
 */

export interface AnalysisRequest {
  samples: Float32Array
  sampleRate: number
  fps: number
}

// В tsconfig подключены типы DOM, а не воркера, поэтому описываем
// глобальный объект воркера вручную — нам нужны только эти два поля.
const workerScope = self as unknown as {
  onmessage: (event: MessageEvent<AnalysisRequest>) => void
  postMessage: (message: unknown) => void
}

workerScope.onmessage = (event) => {
  const { samples, sampleRate, fps } = event.data
  const analysis = analyzeAudio(samples, sampleRate, { fps }, (fraction) => {
    workerScope.postMessage({ type: 'progress', fraction })
  })
  workerScope.postMessage({ type: 'done', analysis })
}
