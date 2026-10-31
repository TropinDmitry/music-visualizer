import * as THREE from 'three'
import type { FrameFeatures } from '../audio/frameFeatures.ts'
import { FULLSCREEN_VERTEX, NOISE_GLSL } from '../render/glsl.ts'
import type { LaneNote } from './level.ts'

/**
 * Графика игры: клип на весь экран, а поверх него три дорожки в перспективе.
 * Логики здесь нет: сцена рисует только то, что ей передали.
 */

export type ClipLook = 'outline' | 'duotone' | 'comic' | 'original'

export const CLIP_LOOKS: { id: ClipLook; label: string }[] = [
  { id: 'outline', label: 'Неоновый контур' },
  { id: 'duotone', label: 'Зелёный дуотон' },
  { id: 'comic', label: 'Комикс' },
  { id: 'original', label: 'Оригинал' },
]

const LOOK_NUMBERS: Record<ClipLook, number> = { outline: 0, duotone: 1, comic: 2, original: 3 }
const LANE_COLORS = ['#3dff9e', '#2ef2d0', '#c6ff3a']
const SWIPE_COLOR = '#ffffff'
const LANE_WIDTH = 1
/** Длина дорожки: откуда прилетают ноты, если линия нажатия стоит в z = 0. */
const TRACK_LENGTH = 16
const MAX_NOTES = 48
const MAX_TRAILS = 12
const TRAIL_LIFETIME_SEC = 0.3

const clipFragment = /* glsl */ `
  ${NOISE_GLSL}
  uniform sampler2D uVideo;
  uniform bool uHasVideo;
  uniform int uLook;
  uniform float uViewAspect;
  uniform float uVideoAspect;
  uniform vec2 uTexel;
  uniform float uBass;
  uniform float uBeat;
  uniform float uTime;
  uniform float uDim;
  varying vec2 vUv;

  float luma(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
  }

  // Кадр заполняет экран без искажений: лишнее обрезается, как у object-fit: cover
  vec2 coverUv(vec2 uv) {
    vec2 scale = uViewAspect > uVideoAspect
      ? vec2(1.0, uVideoAspect / uViewAspect)
      : vec2(uViewAspect / uVideoAspect, 1.0);
    return (uv - 0.5) * scale + 0.5;
  }

  // Оператор Собеля: где яркость резко меняется, там контур предмета
  float edges(vec2 uv) {
    vec2 t = uTexel * 1.5;
    float topLeft = luma(texture2D(uVideo, uv + vec2(-t.x, t.y)).rgb);
    float top = luma(texture2D(uVideo, uv + vec2(0.0, t.y)).rgb);
    float topRight = luma(texture2D(uVideo, uv + vec2(t.x, t.y)).rgb);
    float left = luma(texture2D(uVideo, uv + vec2(-t.x, 0.0)).rgb);
    float right = luma(texture2D(uVideo, uv + vec2(t.x, 0.0)).rgb);
    float bottomLeft = luma(texture2D(uVideo, uv + vec2(-t.x, -t.y)).rgb);
    float bottom = luma(texture2D(uVideo, uv + vec2(0.0, -t.y)).rgb);
    float bottomRight = luma(texture2D(uVideo, uv + vec2(t.x, -t.y)).rgb);
    float gx = topRight + 2.0 * right + bottomRight - topLeft - 2.0 * left - bottomLeft;
    float gy = topLeft + 2.0 * top + topRight - bottomLeft - 2.0 * bottom - bottomRight;
    return length(vec2(gx, gy));
  }

  vec3 styledClip(vec2 uv) {
    vec3 source = texture2D(uVideo, uv).rgb;
    float brightness = luma(source);

    if (uLook == 0) {
      vec3 base = vec3(0.0, 0.06, 0.06) + source * 0.12;
      return base + vec3(0.2, 1.0, 0.65) * smoothstep(0.12, 0.6, edges(uv));
    }
    if (uLook == 1) {
      float steps = floor(brightness * 5.0) / 5.0;
      return mix(vec3(0.0, 0.08, 0.09), vec3(0.45, 1.0, 0.65), steps);
    }
    if (uLook == 2) {
      // Точечный растр, как в печатном комиксе, плюс чёрные контуры
      vec3 flat3 = floor(source * 4.0) / 4.0;
      vec2 grid = fract(gl_FragCoord.xy / 6.0) - 0.5;
      float dots = smoothstep(0.34, 0.3, length(grid)) * (1.0 - brightness);
      return (flat3 * (1.0 - 0.45 * dots)) * (1.0 - smoothstep(0.2, 0.55, edges(uv)));
    }
    return source;
  }

  void main() {
    // Лёгкий наезд камеры на басу и сдвиг каналов на ударе вместо вспышек
    vec2 uv = coverUv(vUv);
    uv = (uv - 0.5) / (1.0 + 0.035 * uBass) + 0.5;

    vec3 color;
    if (uHasVideo) {
      float shift = 0.004 * uBeat;
      color = vec3(
        styledClip(uv + vec2(shift, 0.0)).r,
        styledClip(uv).g,
        styledClip(uv - vec2(shift, 0.0)).b
      );
    } else {
      // Клипа нет: спокойная туманность, чтобы игра работала и с обычным mp3
      float cloud = valueNoise(vec3(vUv * vec2(uViewAspect, 1.0) * 2.5, uTime * 0.08));
      color = mix(vec3(0.0, 0.05, 0.06), vec3(0.03, 0.4, 0.28), smoothstep(-0.3, 0.7, cloud));
    }

    // Затемнение к низу кадра: дорожки и ноты читаются поверх любого клипа
    float bottomShade = mix(0.55, 1.0, smoothstep(0.0, 0.7, vUv.y));
    gl_FragColor = vec4(color * uDim * bottomShade, 1.0);
  }
`

function createSwipeGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(-0.34, -0.14)
  shape.lineTo(0.06, -0.14)
  shape.lineTo(0.06, -0.3)
  shape.lineTo(0.38, 0)
  shape.lineTo(0.06, 0.3)
  shape.lineTo(0.06, 0.14)
  shape.lineTo(-0.34, 0.14)
  shape.closePath()
  return new THREE.ShapeGeometry(shape)
}

interface Trail {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  bornAt: number
}

export class LaneScene {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 60)
  private readonly clipScene = new THREE.Scene()
  private readonly clipCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly clipUniforms = {
    uVideo: { value: null as THREE.Texture | null },
    uHasVideo: { value: false },
    uLook: { value: 0 },
    uViewAspect: { value: 1 },
    uVideoAspect: { value: 1 },
    uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    uBass: { value: 0 },
    uBeat: { value: 0 },
    uTime: { value: 0 },
    uDim: { value: 0.8 },
  }
  private readonly laneMaterials: THREE.MeshBasicMaterial[] = []
  private readonly tapNotes: THREE.InstancedMesh
  private readonly swipeNotes: THREE.InstancedMesh
  private readonly trails: Trail[] = []
  private readonly helper = new THREE.Object3D()
  private readonly color = new THREE.Color()
  private videoTexture: THREE.VideoTexture | null = null
  private nextTrail = 0

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    // Шейдер сразу выдаёт цвета для экрана, перекодировать их не нужно
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    this.renderer.autoClear = false

    const clipQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: this.clipUniforms,
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader: clipFragment,
        depthTest: false,
        depthWrite: false,
      }),
    )
    clipQuad.frustumCulled = false
    this.clipScene.add(clipQuad)

    for (let lane = 0; lane < 3; lane++) {
      const material = new THREE.MeshBasicMaterial({
        color: LANE_COLORS[lane],
        transparent: true,
        opacity: 0.1,
        depthTest: false,
      })
      this.laneMaterials.push(material)

      const strip = new THREE.Mesh(new THREE.PlaneGeometry(LANE_WIDTH * 0.94, TRACK_LENGTH), material)
      strip.rotation.x = -Math.PI / 2
      strip.position.set(laneX(lane), 0, -TRACK_LENGTH / 2)
      this.scene.add(strip)

      // Круг-цель на линии нажатия
      const target = new THREE.Mesh(
        new THREE.RingGeometry(0.3, 0.38, 48),
        new THREE.MeshBasicMaterial({ color: LANE_COLORS[lane], side: THREE.DoubleSide, depthTest: false }),
      )
      target.rotation.x = -Math.PI / 2
      target.position.set(laneX(lane), 0.01, 0)
      target.renderOrder = 1
      this.scene.add(target)
    }

    const noteMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, depthTest: false })
    this.tapNotes = new THREE.InstancedMesh(new THREE.CircleGeometry(0.3, 32), noteMaterial, MAX_NOTES)
    this.swipeNotes = new THREE.InstancedMesh(createSwipeGeometry(), noteMaterial, MAX_NOTES)
    for (const mesh of [this.tapNotes, this.swipeNotes]) {
      mesh.frustumCulled = false
      mesh.renderOrder = 2
      this.scene.add(mesh)
    }

    for (let i = 0; i < MAX_TRAILS; i++) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1, 40),
        new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthTest: false }),
      )
      mesh.rotation.x = -Math.PI / 2
      mesh.visible = false
      mesh.renderOrder = 3
      this.trails.push({ mesh, bornAt: -Infinity })
      this.scene.add(mesh)
    }

    this.camera.position.set(0, 3.4, 3.6)
    this.camera.lookAt(0, 0, -4)
  }

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.clipUniforms.uViewAspect.value = width / height
  }

  /** Подключает клип как текстуру. null убирает его и возвращает туманность. */
  setVideo(video: HTMLVideoElement | null): void {
    this.videoTexture?.dispose()
    this.videoTexture = null
    if (video) {
      this.videoTexture = new THREE.VideoTexture(video)
      this.videoTexture.colorSpace = THREE.NoColorSpace
    }
    this.clipUniforms.uVideo.value = this.videoTexture
    this.clipUniforms.uHasVideo.value = video !== null
  }

  setClipOptions(look: ClipLook, brightness: number): void {
    this.clipUniforms.uLook.value = LOOK_NUMBERS[look]
    this.clipUniforms.uDim.value = brightness
  }

  /** След попадания у линии нажатия. Дорожка -1 — по центру, для встряски. */
  addTrail(lane: number, isHit: boolean, clockTime: number): void {
    const trail = this.trails[this.nextTrail]
    this.nextTrail = (this.nextTrail + 1) % MAX_TRAILS
    trail.bornAt = clockTime
    trail.mesh.position.set(lane < 0 ? 0 : laneX(lane), 0.02, 0)
    trail.mesh.material.color.set(isHit ? (LANE_COLORS[lane] ?? SWIPE_COLOR) : '#ff5c6c')
    trail.mesh.visible = true
  }

  render(
    features: FrameFeatures,
    video: HTMLVideoElement | null,
    notes: LaneNote[],
    firstNote: number,
    judged: Set<number>,
    pressedLanes: boolean[],
    approachSec: number,
    clockTime: number,
    showLanes: boolean,
  ): void {
    this.clipUniforms.uBass.value = features.bass
    this.clipUniforms.uBeat.value = features.beatPulse
    this.clipUniforms.uTime.value = clockTime
    if (video && video.videoWidth > 0) {
      this.clipUniforms.uVideoAspect.value = video.videoWidth / video.videoHeight
      this.clipUniforms.uTexel.value.set(1 / video.videoWidth, 1 / video.videoHeight)
    }

    for (let lane = 0; lane < 3; lane++) {
      this.laneMaterials[lane].opacity = pressedLanes[lane] ? 0.32 : 0.1
    }
    this.updateNotes(features.time, notes, firstNote, judged, approachSec)
    this.updateTrails(clockTime)

    // Сначала клип на весь экран, затем дорожки поверх него
    this.renderer.clear()
    this.renderer.render(this.clipScene, this.clipCamera)
    if (showLanes) this.renderer.render(this.scene, this.camera)
  }

  private updateNotes(
    time: number,
    notes: LaneNote[],
    firstNote: number,
    judged: Set<number>,
    approachSec: number,
  ): void {
    let tapCount = 0
    let swipeCount = 0

    for (let i = firstNote; i < notes.length; i++) {
      const note = notes[i]
      const remaining = note.time - time
      if (remaining > approachSec) break
      if (judged.has(note.id)) continue

      this.helper.position.set(laneX(note.lane), 0.03, (-remaining / approachSec) * TRACK_LENGTH)
      this.helper.rotation.set(-Math.PI / 2, 0, note.direction < 0 ? Math.PI : 0)
      this.helper.updateMatrix()

      if (note.kind === 'tap' && tapCount < MAX_NOTES) {
        this.tapNotes.setMatrixAt(tapCount, this.helper.matrix)
        this.tapNotes.setColorAt(tapCount, this.color.set(LANE_COLORS[note.lane]))
        tapCount += 1
      } else if (note.kind === 'swipe' && swipeCount < MAX_NOTES) {
        this.swipeNotes.setMatrixAt(swipeCount, this.helper.matrix)
        this.swipeNotes.setColorAt(swipeCount, this.color.set(SWIPE_COLOR))
        swipeCount += 1
      }
    }

    this.tapNotes.count = tapCount
    this.swipeNotes.count = swipeCount
    for (const mesh of [this.tapNotes, this.swipeNotes]) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }

  private updateTrails(clockTime: number): void {
    for (const trail of this.trails) {
      const age = (clockTime - trail.bornAt) / TRAIL_LIFETIME_SEC
      if (age >= 1) {
        trail.mesh.visible = false
        continue
      }
      trail.mesh.scale.setScalar(0.35 + 0.35 * age)
      trail.mesh.material.opacity = 1 - age
    }
  }

  dispose(): void {
    this.videoTexture?.dispose()
    for (const root of [this.scene, this.clipScene]) {
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          object.material.dispose()
        }
      })
    }
    this.renderer.dispose()
  }
}

function laneX(lane: number): number {
  return (lane - 1) * LANE_WIDTH
}
