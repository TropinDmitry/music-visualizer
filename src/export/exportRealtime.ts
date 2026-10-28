import { createEmptyFeatures, sampleFeatures } from '../audio/frameFeatures.ts'
import { Visualizer } from '../render/Visualizer.ts'
import { ExportCanceledError, type ExportJob, type ExportProgress, type ExportResult } from './types.ts'

/**
 * Запасной экспорт через MediaRecorder — для браузеров без WebCodecs.
 *
 * Отличия от MP4-экспорта:
 *  - идёт строго в реальном времени (минутный трек = минута записи);
 *  - формат обычно WebM (какой именно — решает браузер, 🔎 Safari пишет MP4);
 *  - вкладку нельзя сворачивать: в фоне браузер замедляет
 *    requestAnimationFrame и кадры будут пропущены.
 *
 * Картинку берём с холста через captureStream(), звук — через
 * MediaStreamAudioDestinationNode, и записываем их вместе.
 */

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
]

export function isRealtimeExportSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype
}

export async function exportRealtime(
  job: ExportJob,
  onProgress: ExportProgress,
  signal: AbortSignal,
): Promise<ExportResult> {
  const mimeType = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type))
  if (!mimeType) throw new Error('MediaRecorder не поддерживает ни один из видеоформатов')

  const canvas = document.createElement('canvas')
  canvas.width = job.width
  canvas.height = job.height
  const visualizer = new Visualizer(canvas, { preserveDrawingBuffer: true })
  visualizer.setSize(job.width, job.height)
  visualizer.setStyle(job.style)
  visualizer.setOverlay(job.overlay)

  const audioContext = new AudioContext({ sampleRate: job.audio.sampleRate })
  const audioDestination = audioContext.createMediaStreamDestination()
  const source = audioContext.createBufferSource()
  source.buffer = job.audio
  source.connect(audioDestination)

  const videoStream = canvas.captureStream(job.fps)
  const stream = new MediaStream([...videoStream.getVideoTracks(), ...audioDestination.stream.getAudioTracks()])
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })

  const features = createEmptyFeatures(job.analysis.spectrumBins)
  let canceled = false
  let sourceStarted = false

  try {
    await audioContext.resume()
    recorder.start(1000) // отдавать данные кусками раз в секунду
    const startAt = audioContext.currentTime + 0.05
    source.start(startAt, job.startTime, job.duration)
    sourceStarted = true

    // Цикл отрисовки по часам аудио, пока не кончится фрагмент
    await new Promise<void>((resolve) => {
      const drawFrame = () => {
        if (signal.aborted) {
          canceled = true
          resolve()
          return
        }
        const elapsed = Math.max(0, audioContext.currentTime - startAt)
        sampleFeatures(job.analysis, job.startTime + elapsed, features)
        visualizer.render(features, job.params)
        onProgress(Math.min(1, elapsed / job.duration))
        if (elapsed >= job.duration) resolve()
        else requestAnimationFrame(drawFrame)
      }
      requestAnimationFrame(drawFrame)
    })

    recorder.stop()
    await stopped
  } finally {
    // stop() у незапущенного узла бросает исключение
    if (sourceStarted) source.stop()
    for (const track of stream.getTracks()) track.stop()
    await audioContext.close()
    visualizer.dispose()
  }

  if (canceled) throw new ExportCanceledError()
  onProgress(1)
  const blob = new Blob(chunks, { type: mimeType })
  return {
    blob,
    fileExtension: mimeType.startsWith('video/mp4') ? 'mp4' : 'webm',
    description: `${mimeType} · MediaRecorder (в реальном времени)`,
  }
}
