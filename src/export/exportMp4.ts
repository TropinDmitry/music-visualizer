import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  type AudioCodec,
  type VideoCodec,
} from 'mediabunny'
import { createEmptyFeatures, sampleFeatures } from '../audio/frameFeatures.ts'
import { Visualizer } from '../render/Visualizer.ts'
import { ExportCanceledError, type ExportJob, type ExportProgress, type ExportResult } from './types.ts'

/**
 * Быстрый экспорт в MP4 через WebCodecs.
 *
 * Как это работает:
 *  1. Рисуем кадр в отдельный холст фиксированного размера (1920×1080 и т. п.).
 *  2. CanvasSource из mediabunny делает из холста VideoFrame и отдаёт его
 *     VideoEncoder (WebCodecs) — аппаратное кодирование в H.264, если есть.
 *  3. Звук из AudioBuffer кодируется AudioEncoder-ом (AAC).
 *  4. mediabunny раскладывает закодированные кусочки по дорожкам MP4-файла
 *     (это и есть «мультиплексирование»).
 *
 * Кадры рисуются не по часам, а по номеру: время кадра = i / fps. Поэтому
 * экспорт идёт так быстро, как успевает видеокарта, — часто быстрее реального
 * времени, — и результат не зависит от «подвисаний» браузера.
 */

export interface Mp4Codecs {
  video: VideoCodec
  audio: AudioCodec
}

/**
 * Проверяет, может ли браузер кодировать MP4 с такими параметрами.
 * Возвращает подходящие кодеки или null, если WebCodecs недоступен.
 */
export async function findMp4Codecs(job: Pick<ExportJob, 'width' | 'height' | 'fps' | 'audio'>): Promise<Mp4Codecs | null> {
  if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') return null

  const supported = new Mp4OutputFormat().getSupportedCodecs()
  // H.264 — самый совместимый вариант для соцсетей; остальные — запасные
  const videoCandidates = (['avc', 'hevc', 'vp9', 'av1'] as VideoCodec[]).filter((c) => supported.includes(c))
  const audioCandidates = (['aac', 'opus'] as AudioCodec[]).filter((c) => supported.includes(c))

  const video = await getFirstEncodableVideoCodec(videoCandidates, {
    width: job.width,
    height: job.height,
    frameRate: job.fps,
    quality: QUALITY_HIGH,
  })
  const audio = await getFirstEncodableAudioCodec(audioCandidates, {
    numberOfChannels: job.audio.numberOfChannels,
    sampleRate: job.audio.sampleRate,
    quality: QUALITY_HIGH,
  })
  if (!video || !audio) return null
  return { video, audio }
}

export async function exportMp4(
  job: ExportJob,
  codecs: Mp4Codecs,
  onProgress: ExportProgress,
  signal: AbortSignal,
): Promise<ExportResult> {
  const { width, height, fps, analysis, style, params } = job

  // Холст, который не показывается на странице. OffscreenCanvas есть не во
  // всех браузерах (🔎 Safari — с 16.4), поэтому есть запасной вариант.
  const canvas =
    typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : document.createElement('canvas')
  const visualizer = new Visualizer(canvas, { preserveDrawingBuffer: true })
  visualizer.setSize(width, height)
  visualizer.setStyle(style)
  visualizer.setOverlay(job.overlay)

  const output = new Output({
    // 'in-memory': индекс (moov) пишется в начало файла — видео начинает
    // играть до полной загрузки, это любят YouTube и плееры
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  })
  const videoSource = new CanvasSource(canvas, {
    codec: codecs.video,
    quality: QUALITY_HIGH,
    keyFrameInterval: 2,
  })
  const audioSource = new AudioBufferSource({ codec: codecs.audio, quality: QUALITY_HIGH })
  output.addVideoTrack(videoSource, { frameRate: fps })
  output.addAudioTrack(audioSource)

  const features = createEmptyFeatures(analysis.spectrumBins)
  const totalFrames = Math.max(1, Math.round(job.duration * fps))
  const AUDIO_CHUNK_SEC = 1
  let audioAddedSec = 0

  try {
    await output.start()

    for (let frame = 0; frame < totalFrames; frame++) {
      if (signal.aborted) throw new ExportCanceledError()

      const time = frame / fps
      // Звук подаём кусками по секунде чуть впереди видео: так муксер
      // перемежает дорожки и не копит всё в памяти
      while (audioAddedSec < Math.min(time + AUDIO_CHUNK_SEC, job.duration)) {
        const chunkSec = Math.min(AUDIO_CHUNK_SEC, job.duration - audioAddedSec)
        await audioSource.add(sliceAudioBuffer(job.audio, job.startTime + audioAddedSec, chunkSec))
        audioAddedSec += chunkSec
      }

      sampleFeatures(analysis, job.startTime + time, features)
      visualizer.render(features, params)
      // add() ждёт, если кодировщик не успевает (backpressure)
      await videoSource.add(time, 1 / fps)

      if (frame % 10 === 0) {
        onProgress(frame / totalFrames)
        // Отдаём управление браузеру, чтобы интерфейс успел обновиться
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    }

    videoSource.close()
    audioSource.close()
    await output.finalize()
  } catch (error) {
    if (output.state !== 'finalized' && output.state !== 'canceled') await output.cancel()
    throw error
  } finally {
    visualizer.dispose()
  }

  onProgress(1)
  const buffer = output.target.buffer
  if (!buffer) throw new Error('Мультиплексор не вернул данные')
  return {
    blob: new Blob([buffer], { type: output.format.mimeType }),
    fileExtension: 'mp4',
    description: `MP4 · ${codecs.video.toUpperCase()} + ${codecs.audio.toUpperCase()} · WebCodecs`,
  }
}

/** Вырезает кусок AudioBuffer: [startSec, startSec + durationSec). */
function sliceAudioBuffer(source: AudioBuffer, startSec: number, durationSec: number): AudioBuffer {
  const from = Math.round(startSec * source.sampleRate)
  const length = Math.max(1, Math.round(durationSec * source.sampleRate))
  const chunk = new AudioBuffer({
    length,
    numberOfChannels: source.numberOfChannels,
    sampleRate: source.sampleRate,
  })
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    const data = source.getChannelData(ch).subarray(from, Math.min(from + length, source.length))
    chunk.copyToChannel(data, ch)
  }
  return chunk
}
