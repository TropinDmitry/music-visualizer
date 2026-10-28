import type { AudioAnalysis } from '../audio/analyzer.ts'
import type { OverlayText } from '../render/textOverlay.ts'
import type { StyleDefinition, StyleParams } from '../styles/types.ts'

/** Всё, что нужно для экспорта одного ролика. */
export interface ExportJob {
  audio: AudioBuffer
  analysis: AudioAnalysis
  style: StyleDefinition
  params: StyleParams
  overlay: OverlayText
  width: number
  height: number
  fps: number
  /** С какой секунды трека начинать. */
  startTime: number
  /** Длительность ролика в секундах. */
  duration: number
}

export interface ExportResult {
  blob: Blob
  fileExtension: string
  /** Чем кодировали — показываем пользователю. */
  description: string
}

/** Прогресс 0..1. */
export type ExportProgress = (fraction: number) => void

/** Ошибка «пользователь нажал Отмена» — её не показываем как сбой. */
export class ExportCanceledError extends Error {
  constructor() {
    super('Экспорт отменён')
    this.name = 'ExportCanceledError'
  }
}
