import * as THREE from 'three'
import type { FrameFeatures } from '../audio/frameFeatures.ts'
import { FULLSCREEN_VERTEX, NOISE_GLSL } from '../render/glsl.ts'
import { SHIELD_HALF_ANGLE, type Note } from './level.ts'

/**
 * Вся графика игры: туманность, ядро, щит, ноты и следы попаданий.
 * Логики здесь нет: сцена только рисует то, что ей передали.
 *
 * Ядро реагирует на удары сжатием, а не вспышкой: яркость кадра почти
 * не меняется, поэтому глаза от игры не устают.
 */

export const ORBIT_RADIUS = 0.68
const CORE_RADIUS = 0.34
/** Откуда прилетают ноты. Дальше края кадра, чтобы они появлялись незаметно. */
const SPAWN_RADIUS = 1.75
/** Половина высоты кадра в мировых единицах. */
const VIEW_HALF = 1.3
const MAX_VISIBLE_NOTES = 64
const MAX_PULSE_RINGS = 6
const MAX_TRAILS = 16
const TRAIL_LIFETIME_SEC = 0.35
const SPECTRUM_BARS = 128

const GREEN = '#3dff9e'
const MINT = '#2ef2d0'
const AMBER = '#ffb627'
const RED = '#ff5c6c'

const nebulaFragment = /* glsl */ `
  ${NOISE_GLSL}
  uniform vec2 uHalfSize;
  uniform float uPhase;
  uniform float uEnergy;
  varying vec2 vUv;

  float clouds(vec3 p) {
    float sum = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      sum += valueNoise(p) * amplitude;
      p *= 2.1;
      amplitude *= 0.5;
    }
    return sum;
  }

  void main() {
    vec2 p = (vUv - 0.5) * 2.0 * uHalfSize;
    float cloud = clouds(vec3(p * 0.9, uPhase));
    float density = smoothstep(-0.15, 0.55, cloud);
    vec3 deepSpace = vec3(0.005, 0.03, 0.04);
    vec3 nebula = mix(vec3(0.0, 0.2, 0.2), vec3(0.08, 0.55, 0.32), density);
    vec3 color = mix(deepSpace, nebula, density * (0.4 + 0.2 * uEnergy));

    // Редкие звёзды: у каждой ячейки сетки своя яркость
    vec2 cell = floor(p * 220.0);
    float star = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    color += vec3(0.6, 0.9, 0.8) * step(0.9988, star);

    gl_FragColor = vec4(color, 1.0);
  }
`

const coreVertex = /* glsl */ `
  ${NOISE_GLSL}
  uniform float uPhase;
  uniform float uBass;
  uniform float uBeat;
  varying vec3 vViewPosition;
  varying float vDisplacement;

  void main() {
    float waves = valueNoise(normal * 2.2 + vec3(0.0, 0.0, uPhase));
    vDisplacement = waves * (0.05 + 0.2 * uBass);
    // На ударе ядро сжимается и затем отпружинивает обратно
    float squeeze = 1.0 - 0.24 * uBeat;
    vec3 displaced = position * squeeze * (1.0 + vDisplacement);
    vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);
    vViewPosition = viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`

const coreFragment = /* glsl */ `
  varying vec3 vViewPosition;
  varying float vDisplacement;

  void main() {
    // Нормаль по производным экранных координат: так видна деформация
    vec3 normal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
    float light = max(dot(normal, normalize(vec3(-0.4, 0.7, 0.6))), 0.0);
    float rim = pow(1.0 - max(normal.z, 0.0), 2.0);
    vec3 surface = mix(vec3(0.0, 0.42, 0.34), vec3(0.2, 1.0, 0.6), vDisplacement * 2.5 + 0.5);
    vec3 color = surface * (0.25 + 0.75 * light) + vec3(0.25, 1.0, 0.85) * rim;
    gl_FragColor = vec4(color, 1.0);
  }
`

function ringMaterial(color: string): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthTest: false })
}

interface Trail {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  bornAt: number
}

export class GameScene {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -5, 5)
  private readonly nebulaUniforms = {
    uHalfSize: { value: new THREE.Vector2(1, 1) },
    uPhase: { value: 0 },
    uEnergy: { value: 0 },
  }
  private readonly coreUniforms = { uPhase: { value: 0 }, uBass: { value: 0 }, uBeat: { value: 0 } }
  private readonly core: THREE.Mesh
  private readonly shield: THREE.Mesh
  private readonly sparks: THREE.InstancedMesh
  private readonly shards: THREE.InstancedMesh
  private readonly pulseRings: THREE.Mesh[] = []
  private readonly trails: Trail[] = []
  private readonly spectrumLines: THREE.LineSegments
  private readonly helper = new THREE.Object3D()
  private nextTrail = 0

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    // Цвета шейдеров сразу готовы для экрана, перекодировать их не нужно
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    this.camera.position.z = 3

    const nebula = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: this.nebulaUniforms,
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader: nebulaFragment,
        depthWrite: false,
        depthTest: false,
      }),
    )
    nebula.frustumCulled = false
    nebula.renderOrder = -2
    this.scene.add(nebula)

    this.core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(CORE_RADIUS, 32),
      new THREE.ShaderMaterial({
        uniforms: this.coreUniforms,
        vertexShader: coreVertex,
        fragmentShader: coreFragment,
      }),
    )
    this.scene.add(this.core)

    const orbit = new THREE.Mesh(
      new THREE.RingGeometry(ORBIT_RADIUS - 0.003, ORBIT_RADIUS + 0.003, 128),
      new THREE.MeshBasicMaterial({ color: MINT, transparent: true, opacity: 0.35, depthTest: false }),
    )
    this.scene.add(orbit)

    this.shield = new THREE.Mesh(
      new THREE.RingGeometry(
        ORBIT_RADIUS - 0.03,
        ORBIT_RADIUS + 0.03,
        32,
        1,
        -SHIELD_HALF_ANGLE,
        SHIELD_HALF_ANGLE * 2,
      ),
      new THREE.MeshBasicMaterial({ color: GREEN, side: THREE.DoubleSide, depthTest: false }),
    )
    this.shield.renderOrder = 3
    this.scene.add(this.shield)

    this.sparks = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.04, 20),
      new THREE.MeshBasicMaterial({ color: GREEN, depthTest: false }),
      MAX_VISIBLE_NOTES,
    )
    // Угловатая форма сразу отличает осколок от круглой искры, даже без цвета
    this.shards = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.055, 3),
      new THREE.MeshBasicMaterial({ color: AMBER, depthTest: false }),
      MAX_VISIBLE_NOTES,
    )
    for (const mesh of [this.sparks, this.shards]) {
      mesh.frustumCulled = false
      mesh.renderOrder = 2
      this.scene.add(mesh)
    }

    for (let i = 0; i < MAX_PULSE_RINGS; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.993, 1, 128), ringMaterial(MINT))
      ring.visible = false
      this.pulseRings.push(ring)
      this.scene.add(ring)
    }

    for (let i = 0; i < MAX_TRAILS; i++) {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), ringMaterial(GREEN))
      mesh.visible = false
      this.trails.push({ mesh, bornAt: -Infinity })
      this.scene.add(mesh)
    }

    this.spectrumLines = this.createSpectrumLines()
    this.scene.add(this.spectrumLines)
  }

  /** Столбики спектра вокруг ядра: два конца линии на каждый столбик. */
  private createSpectrumLines(): THREE.LineSegments {
    const geometry = new THREE.BufferGeometry()
    const positions = new THREE.BufferAttribute(new Float32Array(SPECTRUM_BARS * 2 * 3), 3)
    positions.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', positions)
    const material = new THREE.LineBasicMaterial({ color: MINT, transparent: true, opacity: 0.55, depthTest: false })
    const lines = new THREE.LineSegments(geometry, material)
    lines.frustumCulled = false
    return lines
  }

  /** Размер холста в физических пикселях; CSS-размер не трогаем. */
  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false)
    const aspect = width / height
    // В вертикальном экране расширяем обзор, чтобы орбита влезла по ширине
    const halfHeight = VIEW_HALF / Math.min(1, aspect)
    const halfWidth = halfHeight * aspect
    this.camera.left = -halfWidth
    this.camera.right = halfWidth
    this.camera.top = halfHeight
    this.camera.bottom = -halfHeight
    this.camera.updateProjectionMatrix()
    this.nebulaUniforms.uHalfSize.value.set(halfWidth, halfHeight)
  }

  /** След на орбите в месте попадания: маленькое расходящееся кольцо, а не вспышка экрана. */
  addTrail(angle: number, kind: 'hit' | 'bad', clockTime: number): void {
    const trail = this.trails[this.nextTrail]
    this.nextTrail = (this.nextTrail + 1) % MAX_TRAILS
    trail.bornAt = clockTime
    trail.mesh.position.set(Math.cos(angle) * ORBIT_RADIUS, Math.sin(angle) * ORBIT_RADIUS, 0)
    trail.mesh.material.color.set(kind === 'hit' ? GREEN : RED)
    trail.mesh.visible = true
  }

  /**
   * Рисует кадр.
   * @param notes все ноты уровня, разобранные пропускаются через firstNote
   * @param firstNote индекс первой ещё не разобранной ноты
   * @param approachSec за сколько секунд до касания нота появляется
   * @param clockTime обычные часы для следов попаданий
   * @param pressedPulseIds кольца, по которым уже нажали: их не рисуем
   * @param showShield в меню щит скрыт, чтобы не лежал поверх текста
   */
  render(
    features: FrameFeatures,
    shieldAngle: number,
    notes: Note[],
    firstNote: number,
    approachSec: number,
    clockTime: number,
    pressedPulseIds: Set<number>,
    showShield: boolean,
  ): void {
    const phase = features.time * 0.08 + features.energy * 0.12
    this.nebulaUniforms.uPhase.value = phase
    this.nebulaUniforms.uEnergy.value = features.rms
    this.coreUniforms.uPhase.value = phase * 8
    this.coreUniforms.uBass.value = features.bass
    this.coreUniforms.uBeat.value = features.beatPulse
    this.core.rotation.y = phase * 2

    this.shield.rotation.z = shieldAngle
    this.shield.visible = showShield

    this.updateNotes(features.time, notes, firstNote, approachSec, pressedPulseIds)
    this.updateTrails(clockTime)
    this.updateSpectrum(features)

    this.renderer.render(this.scene, this.camera)
  }

  private updateNotes(
    time: number,
    notes: Note[],
    firstNote: number,
    approachSec: number,
    pressedPulseIds: Set<number>,
  ): void {
    let sparkCount = 0
    let shardCount = 0
    let ringCount = 0

    for (let i = firstNote; i < notes.length; i++) {
      const note = notes[i]
      const remaining = note.time - time
      if (remaining > approachSec) break
      const radius = ORBIT_RADIUS + (SPAWN_RADIUS - ORBIT_RADIUS) * (remaining / approachSec)

      if (note.kind === 'pulse') {
        if (ringCount < MAX_PULSE_RINGS && !pressedPulseIds.has(note.id)) {
          const ring = this.pulseRings[ringCount]
          ring.visible = true
          ring.scale.setScalar(radius)
          ringCount += 1
        }
        continue
      }

      this.helper.position.set(Math.cos(note.angle) * radius, Math.sin(note.angle) * radius, 0)
      this.helper.rotation.z = note.angle
      this.helper.updateMatrix()
      if (note.kind === 'spark' && sparkCount < MAX_VISIBLE_NOTES) {
        this.sparks.setMatrixAt(sparkCount, this.helper.matrix)
        sparkCount += 1
      } else if (note.kind === 'shard' && shardCount < MAX_VISIBLE_NOTES) {
        this.shards.setMatrixAt(shardCount, this.helper.matrix)
        shardCount += 1
      }
    }

    this.sparks.count = sparkCount
    this.shards.count = shardCount
    this.sparks.instanceMatrix.needsUpdate = true
    this.shards.instanceMatrix.needsUpdate = true
    for (let i = ringCount; i < MAX_PULSE_RINGS; i++) this.pulseRings[i].visible = false
  }

  private updateTrails(clockTime: number): void {
    for (const trail of this.trails) {
      const age = (clockTime - trail.bornAt) / TRAIL_LIFETIME_SEC
      if (age >= 1) {
        trail.mesh.visible = false
        continue
      }
      trail.mesh.scale.setScalar(0.04 + 0.12 * age)
      trail.mesh.material.opacity = 1 - age
    }
  }

  private updateSpectrum(features: FrameFeatures): void {
    const positions = this.spectrumLines.geometry.getAttribute('position') as THREE.BufferAttribute
    const bins = features.spectrum.length
    const innerRadius = ORBIT_RADIUS + 0.05

    for (let i = 0; i < SPECTRUM_BARS; i++) {
      // Левая половина круга зеркалит правую
      const half = SPECTRUM_BARS / 2
      const bin = Math.floor(((i < half ? i : SPECTRUM_BARS - 1 - i) / half) * bins)
      const angle = (i / SPECTRUM_BARS) * Math.PI * 2 + Math.PI / 2
      const outerRadius = innerRadius + 0.2 * Math.pow(features.spectrum[bin], 2)
      positions.setXYZ(i * 2, Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius, 0)
      positions.setXYZ(i * 2 + 1, Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius, 0)
    }
    positions.needsUpdate = true
  }

  dispose(): void {
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose()
        object.material.dispose()
      }
    })
    this.renderer.dispose()
  }
}
