import { synthesizeDemoTrack } from './demoTrack.ts'

/** Декодирует файл (mp3, wav, ogg — что умеет браузер) в AudioBuffer. */
export async function decodeAudioFile(file: Blob, context: AudioContext): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer()
  return context.decodeAudioData(bytes)
}

/** Демо-трек, синтезированный прямо в браузере — чтобы попробовать без своего файла. */
export function createDemoBuffer(context: AudioContext): AudioBuffer {
  const demo = synthesizeDemoTrack(20, context.sampleRate)
  const buffer = context.createBuffer(2, demo.left.length, demo.sampleRate)
  buffer.copyToChannel(demo.left, 0)
  buffer.copyToChannel(demo.right, 1)
  return buffer
}

/** Среднее по каналам: для анализа стерео не нужно. */
export function audioBufferToMono(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length)
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < data.length; i++) mono[i] += data[i] / buffer.numberOfChannels
  }
  return mono
}

/**
 * Пытается угадать исполнителя и название из имени файла вида
 * «Исполнитель - Название.mp3». Если дефиса нет — всё имя считается названием.
 */
export function guessTrackInfo(fileName: string): { artist: string; title: string } {
  const name = fileName.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim()
  const parts = name.split(/\s+[-–—]\s+/)
  if (parts.length >= 2) {
    return { artist: parts[0], title: parts.slice(1).join(' - ') }
  }
  return { artist: '', title: name }
}
