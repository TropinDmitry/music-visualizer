import * as THREE from 'three'

export interface OverlayText {
  title: string
  artist: string
  watermark: boolean
}

export const WATERMARK_TEXT = '♫ Music Visualizer'

/**
 * Подпись трека и водяной знак поверх визуализации.
 *
 * Текст рисуем обычным Canvas 2D (так проще всего получить красивый шрифт),
 * затем кладём этот холст текстурой на прямоугольник во весь кадр и рисуем
 * его вторым проходом поверх сцены. Так текст попадает и в превью, и в видео.
 */
export class TextOverlay {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly canvas: HTMLCanvasElement
  private readonly texture: THREE.CanvasTexture
  private readonly material: THREE.MeshBasicMaterial
  private readonly quad: THREE.Mesh
  private text: OverlayText = { title: '', artist: '', watermark: false }
  private width = 1
  private height = 1

  constructor() {
    this.canvas = document.createElement('canvas')
    this.texture = new THREE.CanvasTexture(this.canvas)
    // Цвета холста — уже готовые sRGB, перекодировать их не нужно
    this.texture.colorSpace = THREE.NoColorSpace
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    this.scene.add(this.quad)
  }

  /** Есть ли что рисовать — если нет, второй проход пропускаем. */
  get isEmpty(): boolean {
    return !this.text.title && !this.text.artist && !this.text.watermark
  }

  setText(text: OverlayText): void {
    const same =
      text.title === this.text.title && text.artist === this.text.artist && text.watermark === this.text.watermark
    if (same) return
    this.text = { ...text }
    this.redraw()
  }

  setSize(width: number, height: number): void {
    if (width === this.width && height === this.height) return
    this.width = width
    this.height = height
    this.redraw()
  }

  private redraw(): void {
    const { canvas, width, height, text } = this
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)

    // Все размеры — от короткой стороны кадра, чтобы в 9:16 текст не был мелким
    const unit = Math.min(width, height)
    const margin = unit * 0.06
    const fontFamily = '"Segoe UI", Inter, system-ui, -apple-system, sans-serif'

    ctx.textBaseline = 'alphabetic'
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
    ctx.shadowBlur = unit * 0.012

    let y = height - margin
    if (text.title) {
      ctx.font = `700 ${Math.round(unit * 0.05)}px ${fontFamily}`
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'left'
      ctx.fillText(text.title, margin, y, width - margin * 2)
      y -= unit * 0.065
    }
    if (text.artist) {
      ctx.font = `500 ${Math.round(unit * 0.032)}px ${fontFamily}`
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
      ctx.textAlign = 'left'
      ctx.fillText(text.artist.toUpperCase(), margin, y, width - margin * 2)
    }

    if (text.watermark) {
      ctx.font = `600 ${Math.round(unit * 0.03)}px ${fontFamily}`
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
      ctx.textAlign = 'right'
      ctx.fillText(WATERMARK_TEXT, width - margin, margin + unit * 0.03)
    }

    this.texture.needsUpdate = true
  }

  dispose(): void {
    this.texture.dispose()
    this.material.dispose()
    this.quad.geometry.dispose()
  }
}
