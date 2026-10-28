import * as THREE from 'three'
import type { FrameFeatures } from '../audio/frameFeatures.ts'
import type { StyleDefinition, StyleInstance, StyleParams } from '../styles/types.ts'
import { TextOverlay, type OverlayText } from './textOverlay.ts'

/**
 * Обёртка над WebGLRenderer: держит текущий стиль и оверлей с текстом,
 * рисует один кадр по признакам звука.
 *
 * Один и тот же класс используется в превью (canvas на странице) и при
 * экспорте (отдельный canvas фиксированного размера) — поэтому кадры совпадают.
 */
export class Visualizer {
  private readonly renderer: THREE.WebGLRenderer
  private readonly overlay = new TextOverlay()
  private style: StyleInstance | null = null
  private styleId = ''
  private width = 1
  private height = 1

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, options: { preserveDrawingBuffer?: boolean } = {}) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      // Для экспорта: содержимое холста не очищается после показа,
      // и кодировщик гарантированно читает именно отрисованный кадр
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
    })
    // Цветовое пространство: палитры заданы в sRGB и передаются в шейдеры
    // как есть, поэтому на выходе ничего не перекодируем — «что написали
    // в шейдере, то и видим». Для процедурной графики так проще всего.
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    this.renderer.setPixelRatio(1) // размер задаём сразу в физических пикселях
  }

  setStyle(definition: StyleDefinition): void {
    if (definition.id === this.styleId) return
    this.style?.dispose()
    this.style = definition.create()
    this.styleId = definition.id
    this.style.resize(this.width, this.height)
  }

  /** Размер буфера рисования в пикселях. CSS-размер холста не трогаем. */
  setSize(width: number, height: number): void {
    width = Math.max(1, Math.round(width))
    height = Math.max(1, Math.round(height))
    if (width === this.width && height === this.height) return
    this.width = width
    this.height = height
    this.renderer.setSize(width, height, false)
    this.style?.resize(width, height)
    this.overlay.setSize(width, height)
  }

  setOverlay(text: OverlayText): void {
    this.overlay.setText(text)
  }

  render(features: FrameFeatures, params: StyleParams): void {
    if (!this.style) return
    this.style.update(features, params)
    this.renderer.autoClear = true
    this.renderer.render(this.style.scene, this.style.camera)

    if (!this.overlay.isEmpty) {
      // Второй проход без очистки: текст ложится поверх сцены
      this.renderer.autoClear = false
      this.renderer.render(this.overlay.scene, this.overlay.camera)
    }
  }

  dispose(): void {
    this.style?.dispose()
    this.overlay.dispose()
    this.renderer.dispose()
  }
}
