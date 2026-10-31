import * as THREE from 'three'
import type { FrameFeatures } from '../audio/frameFeatures.ts'
import { FULLSCREEN_VERTEX, NOISE_GLSL } from '../render/glsl.ts'
import type { LaneNote } from './level.ts'

/**
 * Графика игры: клип на весь экран, поверх него веер из трёх дорожек,
 * ноты и эффекты попаданий. Логики здесь нет, сцена только рисует.
 *
 * Дорожки выходят из одной точки вверху и расходятся к низу экрана.
 * Положение на дорожке задаёт число «близость»: 0 — точка вверху,
 * 1 — линия нажатия. Настоящая перспектива здесь не нужна: хватает
 * формулы близость = 1 / (1 + расстояние). Вдали нота движется медленно,
 * у линии нажатия резко ускоряется и растёт, как в трёхмерной сцене.
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
const LANE_KEYS = ['A', 'S', 'D']
/** Цвет дорожек на множителях ×1…×4: игра явно меняется, пока серия растёт. */
const TIER_COLORS = ['#3dff9e', '#2ef2d0', '#ffe14d', '#ff4fd8']

/** Точка схода дорожек и линия нажатия, по вертикали экрана (-1 низ, 1 верх). */
const VANISH_Y = 0.94
const HIT_Y = -0.68
/** Расстояние между центрами дорожек на линии нажатия. */
const LANE_SPREAD = 0.62
/** Во сколько раз нота вдали меньше, чем у линии нажатия. */
const DEPTH = 7
const NOTE_SIZE = 0.46
const MAX_NOTES = 48
const MAX_SPARKS = 160
const SPARK_LIFETIME_SEC = 0.45
const MAX_SHOCKWAVES = 8
const SHOCKWAVE_LIFETIME_SEC = 0.32

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
  uniform float uTrackTime;
  uniform float uEnergy;
  uniform float uDim;
  uniform vec2 uVanish;
  uniform vec3 uTierColor;
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

  // Клипа нет: полёт сквозь космос из той же точки, откуда выходят дорожки
  vec3 spaceFlight() {
    vec2 p = (vUv * 2.0 - 1.0) * vec2(uViewAspect, 1.0) - uVanish;
    float radius = length(p);
    float angle = atan(p.y, p.x);
    float depth = 1.0 / max(radius, 0.02);
    float travel = uTrackTime * 0.5 + uEnergy * 1.2;

    // Звёзды тянутся лучами: случайная яркость по секторам круга, бегущая к зрителю
    float sector = floor(angle * 40.0);
    float seed = fract(sin(sector * 91.7) * 4375.85);
    float streak = smoothstep(0.82, 1.0, seed) * smoothstep(0.75, 1.0, fract(depth * 0.35 + travel * (0.5 + seed)));

    float cloud = valueNoise(vec3(cos(angle) * 1.5, sin(angle) * 1.5, depth * 0.25 + travel * 0.5));
    vec3 color = mix(vec3(0.0, 0.03, 0.05), vec3(0.03, 0.34, 0.26), smoothstep(-0.2, 0.7, cloud));

    // Кольца на басу бегут от центра к краям кадра
    float rings = pow(0.5 + 0.5 * sin(depth * 2.0 + travel * 6.0), 12.0);
    color += uTierColor * rings * (0.05 + 0.3 * uBass) * smoothstep(0.1, 0.5, radius);
    color += vec3(0.7, 1.0, 0.9) * streak;
    return color * smoothstep(0.0, 0.35, radius + 0.15);
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
      color = spaceFlight();
    }
    gl_FragColor = vec4(color * uDim, 1.0);
  }
`

const fanFragment = /* glsl */ `
  uniform float uViewAspect;
  uniform float uVanishY;
  uniform float uHitY;
  uniform float uSpread;
  uniform float uContrast;
  uniform float uTrackTime;
  uniform float uBeat;
  uniform vec3 uTierColor;
  uniform vec3 uLaneColors[3];
  uniform float uLaneGlow[3];
  uniform float uLaneBad[3];
  varying vec2 vUv;

  void main() {
    vec2 p = (vUv * 2.0 - 1.0) * vec2(uViewAspect, 1.0);
    // Близость к игроку: 0 в точке схода, 1 на линии нажатия
    float closeness = (uVanishY - p.y) / (uVanishY - uHitY);
    if (closeness <= 0.0) discard;

    // Делим x на близость, и веер превращается в три ровные полосы
    float laneCoord = p.x / (uSpread * closeness) + 1.5;
    if (laneCoord < 0.0 || laneCoord > 3.0) discard;
    int lane = int(min(floor(laneCoord), 2.0));
    float across = fract(laneCoord);

    // Расстояние до игрока: обратное к близости, как настоящая глубина
    float distanceAway = 1.0 / closeness;

    // Поперечные полосы бегут к игроку, поэтому дорожка кажется движущейся
    float rung = smoothstep(0.86, 1.0, fract(distanceAway * 2.2 + uTrackTime * 1.6));

    vec3 laneColor = mix(uLaneColors[lane], uTierColor, 0.55);
    float edge = smoothstep(0.42, 0.5, abs(across - 0.5));
    float fade = smoothstep(0.02, 0.3, closeness);

    // Тёмная подложка отделяет дорожку от клипа, яркость настраивается в меню
    float backing = uContrast * 0.8 * fade;
    vec3 color = laneColor * (0.1 + 0.14 * uBeat + 0.35 * rung * fade);
    color += laneColor * edge * 1.1;
    color += laneColor * uLaneGlow[lane] * (0.25 + 0.65 * smoothstep(0.2, 1.0, closeness));
    color = mix(color, vec3(1.0, 0.22, 0.3), uLaneBad[lane] * 0.75);

    float alpha = max(backing, max(edge * fade, uLaneGlow[lane] * 0.75 * fade));
    alpha = max(alpha, uLaneBad[lane] * 0.6 * fade);
    gl_FragColor = vec4(color, alpha);
  }
`

/** Текстура ноты рисуется один раз на обычном холсте, цвет подмешивается в игре. */
function createNoteTexture(kind: 'tap' | 'swipe'): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const center = size / 2
    const glow = ctx.createRadialGradient(center, center, 18, center, center, center)
    glow.addColorStop(0, 'rgba(255,255,255,0.9)')
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, size, size)

    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#04201a'
    ctx.lineWidth = 7
    if (kind === 'tap') {
      ctx.beginPath()
      ctx.arc(center, center, 38, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.moveTo(22, 46)
      ctx.lineTo(66, 46)
      ctx.lineTo(66, 22)
      ctx.lineTo(110, 64)
      ctx.lineTo(66, 106)
      ctx.lineTo(66, 82)
      ctx.lineTo(22, 82)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  return texture
}

/** Буква клавиши внутри круга-цели. */
function createKeyTexture(letter: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.font = '700 64px "Segoe UI", system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'
    ctx.fillText(letter, 64, 68)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  return texture
}

function colorVector(hex: string): THREE.Vector3 {
  const value = parseInt(hex.slice(1), 16)
  return new THREE.Vector3(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255)
}

interface Target {
  group: THREE.Group
  /** Текущий масштаб: на нажатии падает и пружинит обратно к 1. */
  squash: number
  /** Сдвиг в сторону на промахе: круг вздрагивает. */
  jolt: number
}

interface Spark {
  x: number
  y: number
  speedX: number
  speedY: number
  bornAt: number
  color: THREE.Color
}

interface Shockwave {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  bornAt: number
}

export class LaneScene {
  private readonly renderer: THREE.WebGLRenderer
  private readonly clipScene = new THREE.Scene()
  private readonly scene = new THREE.Scene()
  private readonly screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1)
  private readonly sharedUniforms = {
    uViewAspect: { value: 1 },
    uTrackTime: { value: 0 },
    uBeat: { value: 0 },
    uTierColor: { value: colorVector(TIER_COLORS[0]) },
  }
  private readonly clipUniforms = {
    ...this.sharedUniforms,
    uVideo: { value: null as THREE.Texture | null },
    uHasVideo: { value: false },
    uLook: { value: 0 },
    uVideoAspect: { value: 1 },
    uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    uBass: { value: 0 },
    uEnergy: { value: 0 },
    uDim: { value: 0.8 },
    uVanish: { value: new THREE.Vector2(0, VANISH_Y) },
  }
  private readonly fanUniforms = {
    ...this.sharedUniforms,
    uVanishY: { value: VANISH_Y },
    uHitY: { value: HIT_Y },
    uSpread: { value: LANE_SPREAD },
    uContrast: { value: 0.75 },
    uLaneColors: { value: LANE_COLORS.map(colorVector) },
    uLaneGlow: { value: [0, 0, 0] },
    uLaneBad: { value: [0, 0, 0] },
  }
  private readonly tapNotes: THREE.InstancedMesh
  private readonly swipeNotes: THREE.InstancedMesh
  private readonly sparkMesh: THREE.InstancedMesh
  private readonly fanGroup = new THREE.Group()
  private readonly hitLine: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private readonly targets: Target[] = []
  private readonly sparks: Spark[] = []
  private readonly shockwaves: Shockwave[] = []
  private readonly helper = new THREE.Object3D()
  private readonly color = new THREE.Color()
  private videoTexture: THREE.VideoTexture | null = null
  private nextSpark = 0
  private nextShockwave = 0
  private spread = LANE_SPREAD
  private lastRenderAt = 0

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    // Шейдеры сразу выдают цвета для экрана, перекодировать их не нужно
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    this.renderer.autoClear = false

    this.clipScene.add(this.createScreenQuad(clipFragment, this.clipUniforms, false))
    const fan = this.createScreenQuad(fanFragment, this.fanUniforms, true)
    this.fanGroup.add(fan)
    this.scene.add(this.fanGroup)

    this.hitLine = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 0.012),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthTest: false }),
    )
    this.hitLine.position.y = HIT_Y
    this.hitLine.renderOrder = 1
    this.scene.add(this.hitLine)

    for (let lane = 0; lane < 3; lane++) this.targets.push(this.createTarget(lane))

    const noteMaterial = (kind: 'tap' | 'swipe') =>
      new THREE.MeshBasicMaterial({ map: createNoteTexture(kind), transparent: true, depthTest: false })
    const notePlane = new THREE.PlaneGeometry(1, 1)
    this.tapNotes = new THREE.InstancedMesh(notePlane, noteMaterial('tap'), MAX_NOTES)
    this.swipeNotes = new THREE.InstancedMesh(notePlane.clone(), noteMaterial('swipe'), MAX_NOTES)
    for (const mesh of [this.tapNotes, this.swipeNotes]) {
      mesh.frustumCulled = false
      mesh.renderOrder = 3
      // Без начального вызова setColorAt буфер цветов появится слишком поздно
      for (let i = 0; i < MAX_NOTES; i++) mesh.setColorAt(i, this.color.set('#ffffff'))
      this.scene.add(mesh)
    }

    this.sparkMesh = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.012, 8),
      new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, blending: THREE.AdditiveBlending }),
      MAX_SPARKS,
    )
    this.sparkMesh.frustumCulled = false
    this.sparkMesh.renderOrder = 5
    this.sparkMesh.count = 0
    for (let i = 0; i < MAX_SPARKS; i++) {
      this.sparkMesh.setColorAt(i, this.color.set('#ffffff'))
      this.sparks.push({ x: 0, y: 0, speedX: 0, speedY: 0, bornAt: -Infinity, color: new THREE.Color() })
    }
    this.scene.add(this.sparkMesh)

    for (let i = 0; i < MAX_SHOCKWAVES; i++) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.88, 1, 48),
        new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, side: THREE.DoubleSide }),
      )
      mesh.visible = false
      mesh.renderOrder = 4
      this.shockwaves.push({ mesh, bornAt: -Infinity })
      this.scene.add(mesh)
    }
  }

  private createScreenQuad(
    fragmentShader: string,
    uniforms: Record<string, THREE.IUniform>,
    transparent: boolean,
  ): THREE.Mesh {
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader,
        transparent,
        depthTest: false,
        depthWrite: false,
      }),
    )
    quad.frustumCulled = false
    return quad
  }

  /** Круг-цель: кольцо дорожки, тёмная сердцевина и буква клавиши. */
  private createTarget(lane: number): Target {
    const group = new THREE.Group()
    group.position.y = HIT_Y
    group.renderOrder = 2

    const core = new THREE.Mesh(
      new THREE.CircleGeometry(0.135, 48),
      new THREE.MeshBasicMaterial({ color: '#04201a', transparent: true, opacity: 0.75, depthTest: false }),
    )
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.135, 0.175, 48),
      new THREE.MeshBasicMaterial({ color: LANE_COLORS[lane], depthTest: false }),
    )
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.17, 0.17),
      new THREE.MeshBasicMaterial({ map: createKeyTexture(LANE_KEYS[lane]), transparent: true, depthTest: false }),
    )
    for (const mesh of [core, ring, label]) {
      mesh.renderOrder = 2
      group.add(mesh)
    }
    this.scene.add(group)
    return { group, squash: 1, jolt: 0 }
  }

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false)
    const aspect = width / height
    this.camera.left = -aspect
    this.camera.right = aspect
    this.camera.updateProjectionMatrix()
    // В узком окне веер сужается, чтобы крайние дорожки не уходили за экран
    this.spread = Math.min(LANE_SPREAD, (aspect * 0.8) / 1.5)
    this.fanUniforms.uSpread.value = this.spread
    this.sharedUniforms.uViewAspect.value = aspect
    this.hitLine.scale.x = this.spread * 3
  }

  /** Подключает клип как текстуру. null убирает его и возвращает полёт сквозь космос. */
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

  setClipOptions(look: ClipLook, brightness: number, laneContrast: number): void {
    this.clipUniforms.uLook.value = LOOK_NUMBERS[look]
    this.clipUniforms.uDim.value = brightness
    this.fanUniforms.uContrast.value = laneContrast
  }

  private laneX(lane: number): number {
    return (lane - 1) * this.spread
  }

  /** Какая дорожка под курсором. x в экранных единицах: 0 — центр, половина высоты — 1. */
  laneAt(x: number): number {
    if (x < -this.spread / 2) return 0
    return x > this.spread / 2 ? 2 : 1
  }

  /** Нажатие клавиши: круг сжимается, дорожка подсвечивается, даже если ноты нет. */
  pressEffect(lane: number): void {
    this.targets[lane].squash = 0.8
    this.fanUniforms.uLaneGlow.value[lane] = Math.max(this.fanUniforms.uLaneGlow.value[lane], 0.45)
  }

  /** Попадание: луч по дорожке, волна и искры. Точное попадание заметно сильнее. */
  hitEffect(lane: number, isPerfect: boolean, clockTime: number): void {
    this.fanUniforms.uLaneGlow.value[lane] = 1
    this.targets[lane].squash = isPerfect ? 1.3 : 1.15
    const color = isPerfect ? '#ffffff' : LANE_COLORS[lane]
    this.addShockwave(lane, color, clockTime)
    if (isPerfect) this.addShockwave(lane, LANE_COLORS[lane], clockTime - 0.08)

    const count = isPerfect ? 26 : 14
    for (let i = 0; i < count; i++) {
      const spark = this.sparks[this.nextSpark]
      this.nextSpark = (this.nextSpark + 1) % MAX_SPARKS
      // Искры летят веером вверх: к дорожке, а не в сторону счёта
      const angle = Math.PI * (0.08 + 0.84 * Math.random())
      const speed = (isPerfect ? 1.5 : 1) * (0.5 + Math.random())
      spark.x = this.laneX(lane)
      spark.y = HIT_Y
      spark.speedX = Math.cos(angle) * speed
      spark.speedY = Math.sin(angle) * speed
      spark.bornAt = clockTime
      spark.color.set(i % 3 === 0 ? '#ffffff' : LANE_COLORS[lane])
    }
  }

  /** Промах: дорожка вспыхивает красным только в своей полосе, круг вздрагивает. */
  missEffect(lane: number): void {
    this.fanUniforms.uLaneBad.value[lane] = 1
    this.targets[lane].jolt = 1
  }

  private addShockwave(lane: number, color: string, bornAt: number): void {
    const wave = this.shockwaves[this.nextShockwave]
    this.nextShockwave = (this.nextShockwave + 1) % MAX_SHOCKWAVES
    wave.bornAt = bornAt
    wave.mesh.position.set(this.laneX(lane), HIT_Y, 0)
    wave.mesh.material.color.set(color)
    wave.mesh.visible = true
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
    multiplier: number,
    showLanes: boolean,
  ): void {
    const seconds = Math.min(clockTime - this.lastRenderAt, 0.1)
    this.lastRenderAt = clockTime

    this.sharedUniforms.uTrackTime.value = features.time
    this.sharedUniforms.uBeat.value = features.beatPulse
    this.sharedUniforms.uTierColor.value.copy(colorVector(TIER_COLORS[multiplier - 1]))
    this.clipUniforms.uBass.value = features.bass
    this.clipUniforms.uEnergy.value = features.energy
    if (video && video.videoWidth > 0) {
      this.clipUniforms.uVideoAspect.value = video.videoWidth / video.videoHeight
      this.clipUniforms.uTexel.value.set(1 / video.videoWidth, 1 / video.videoHeight)
    }

    this.updateLanes(pressedLanes, features.beatPulse, seconds)
    this.updateNotes(features.time, notes, firstNote, judged, approachSec)
    this.updateSparks(clockTime)
    this.updateShockwaves(clockTime)

    this.renderer.clear()
    this.renderer.render(this.clipScene, this.screenCamera)
    if (showLanes) this.renderer.render(this.scene, this.camera)
  }

  private updateLanes(pressedLanes: boolean[], beat: number, seconds: number): void {
    // Плавное затухание, не зависящее от частоты кадров
    const fade = Math.exp(-seconds * 7)
    const spring = 1 - Math.exp(-seconds * 18)

    for (let lane = 0; lane < 3; lane++) {
      const held = pressedLanes[lane] ? 0.35 : 0
      this.fanUniforms.uLaneGlow.value[lane] = Math.max(held, this.fanUniforms.uLaneGlow.value[lane] * fade)
      this.fanUniforms.uLaneBad.value[lane] *= fade

      const target = this.targets[lane]
      const restScale = pressedLanes[lane] ? 0.86 : 1 + 0.07 * beat // цели дышат в такт
      target.squash += (restScale - target.squash) * spring
      target.jolt *= fade
      target.group.position.x = this.laneX(lane) + Math.sin(target.jolt * 18) * 0.03 * target.jolt
      target.group.scale.setScalar(target.squash)
    }
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

      const closeness = 1 / (1 + (remaining / approachSec) * (DEPTH - 1))
      const y = VANISH_Y + (HIT_Y - VANISH_Y) * closeness
      const size = NOTE_SIZE * closeness
      this.helper.position.set(this.laneX(note.lane) * closeness, y, 0)
      this.helper.rotation.set(0, 0, note.direction < 0 ? Math.PI : 0)
      this.helper.scale.set(size, size, 1)
      this.helper.updateMatrix()

      if (note.kind === 'tap' && tapCount < MAX_NOTES) {
        this.tapNotes.setMatrixAt(tapCount, this.helper.matrix)
        this.tapNotes.setColorAt(tapCount, this.color.set(LANE_COLORS[note.lane]))
        tapCount += 1
      } else if (note.kind === 'swipe' && swipeCount < MAX_NOTES) {
        this.swipeNotes.setMatrixAt(swipeCount, this.helper.matrix)
        this.swipeNotes.setColorAt(swipeCount, this.color.set('#ffe14d'))
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

  private updateSparks(clockTime: number): void {
    let count = 0
    for (const spark of this.sparks) {
      const age = clockTime - spark.bornAt
      if (age >= SPARK_LIFETIME_SEC) continue
      const life = 1 - age / SPARK_LIFETIME_SEC
      // Положение считается по возрасту, поэтому не зависит от частоты кадров
      this.helper.position.set(
        spark.x + spark.speedX * age,
        spark.y + spark.speedY * age - 0.8 * age * age,
        0,
      )
      this.helper.rotation.set(0, 0, 0)
      this.helper.scale.setScalar(0.5 + 1.2 * life)
      this.helper.updateMatrix()
      this.sparkMesh.setMatrixAt(count, this.helper.matrix)
      this.sparkMesh.setColorAt(count, this.color.copy(spark.color).multiplyScalar(life))
      count += 1
    }
    this.sparkMesh.count = count
    this.sparkMesh.instanceMatrix.needsUpdate = true
    if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true
  }

  private updateShockwaves(clockTime: number): void {
    for (const wave of this.shockwaves) {
      const age = (clockTime - wave.bornAt) / SHOCKWAVE_LIFETIME_SEC
      if (age >= 1 || age < 0) {
        wave.mesh.visible = age < 0
        wave.mesh.material.opacity = 0
        continue
      }
      wave.mesh.scale.setScalar(0.17 + 0.3 * age)
      wave.mesh.material.opacity = 1 - age
    }
  }

  dispose(): void {
    this.videoTexture?.dispose()
    for (const root of [this.scene, this.clipScene]) {
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          const material = object.material
          if (material.map) material.map.dispose()
          material.dispose()
        }
      })
    }
    this.renderer.dispose()
  }
}
