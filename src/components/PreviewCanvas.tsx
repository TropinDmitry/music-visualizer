import { useEffect, useRef } from 'react'
import type { AudioAnalysis } from '../audio/analyzer.ts'
import { createEmptyFeatures, sampleFeatures, type FrameFeatures } from '../audio/frameFeatures.ts'
import { Visualizer } from '../render/Visualizer.ts'
import type { OverlayText } from '../render/textOverlay.ts'
import type { StyleDefinition, StyleParams } from '../styles/types.ts'

interface PreviewCanvasProps {
  analysis: AudioAnalysis | null
  style: StyleDefinition
  params: StyleParams
  overlay: OverlayText
  /** Размер кадра экспорта — превью повторяет его пропорции. */
  frameWidth: number
  frameHeight: number
  /** Откуда брать текущее время трека (часы плеера). */
  getTime: () => number
}

/** Максимальная длинная сторона превью: дальше нет смысла нагружать видеокарту. */
const MAX_PREVIEW_SIDE = 1920

/**
 * Холст превью. React здесь только создаёт <canvas>; рисование идёт в
 * собственном цикле requestAnimationFrame, мимо React — иначе пришлось бы
 * перерисовывать компонент 60 раз в секунду.
 */
export function PreviewCanvas(props: PreviewCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Цикл анимации читает свежие props через ref, а не через замыкание,
  // поэтому его не нужно перезапускать при каждом изменении параметров
  const propsRef = useRef(props)
  useEffect(() => {
    propsRef.current = props
  })

  useEffect(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    if (!stage || !canvas) return

    const visualizer = new Visualizer(canvas)
    const silence = createEmptyFeatures()
    const features = createEmptyFeatures()
    let frameId = 0

    // Вписываем кадр нужных пропорций в доступное место
    const fitCanvas = () => {
      const { frameWidth, frameHeight } = propsRef.current
      const aspect = frameWidth / frameHeight
      const maxWidth = stage.clientWidth
      const maxHeight = stage.clientHeight
      let cssWidth = maxWidth
      let cssHeight = maxWidth / aspect
      if (cssHeight > maxHeight) {
        cssHeight = maxHeight
        cssWidth = maxHeight * aspect
      }
      canvas.style.width = `${Math.floor(cssWidth)}px`
      canvas.style.height = `${Math.floor(cssHeight)}px`

      // Буфер рисования — в физических пикселях экрана (чётко на Retina)
      const scale = Math.min(window.devicePixelRatio || 1, MAX_PREVIEW_SIDE / Math.max(cssWidth, cssHeight))
      visualizer.setSize(cssWidth * scale, cssHeight * scale)
    }

    const observer = new ResizeObserver(fitCanvas)
    observer.observe(stage)

    let lastAspect = 0
    const drawFrame = () => {
      const current = propsRef.current
      const aspect = current.frameWidth / current.frameHeight
      if (aspect !== lastAspect) {
        lastAspect = aspect
        fitCanvas()
      }
      visualizer.setStyle(current.style)
      visualizer.setOverlay(current.overlay)
      const frameFeatures = current.analysis
        ? sampleFeatures(current.analysis, current.getTime(), features)
        : idleFeatures(silence, performance.now() / 1000)
      visualizer.render(frameFeatures, current.params)
      frameId = requestAnimationFrame(drawFrame)
    }
    frameId = requestAnimationFrame(drawFrame)

    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
      visualizer.dispose()
    }
  }, [])

  return (
    <div className="preview-stage" ref={stageRef}>
      <canvas className="preview-canvas" ref={canvasRef} />
    </div>
  )
}

/** Пока трек не загружен — показываем стиль «в покое» с медленным движением. */
function idleFeatures(features: FrameFeatures, seconds: number): FrameFeatures {
  features.time = seconds
  features.bass = 0.25 + 0.1 * Math.sin(seconds * 1.3)
  features.mid = 0.2
  features.treble = 0.15
  features.rms = 0.2
  features.energy = seconds * 0.2
  features.beatPulse = 0
  for (let i = 0; i < features.spectrum.length; i++) {
    features.spectrum[i] = 0.25 + 0.15 * Math.sin(seconds * 2 + i * 0.3)
  }
  return features
}
