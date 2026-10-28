import * as THREE from 'three'
import { FULLSCREEN_VERTEX, NOISE_GLSL, PALETTE_GLSL } from '../render/glsl.ts'
import { applyPalette, paletteUniforms } from '../render/palettes.ts'
import { numberParam, stringParam, type StyleDefinition, type StyleInstance } from './types.ts'

/**
 * Стиль «Дышащая сфера»: сфера деформируется шумом, амплитуда которого
 * зависит от баса; на ударах — толчок и вспышка; вокруг — облако частиц,
 * которые разлетаются на ударах и мерцают от верхних частот.
 */

const PARTICLE_COUNT = 2500

const backgroundFragment = /* glsl */ `
  ${PALETTE_GLSL}
  uniform vec3 uBackground;
  uniform float uAspect;
  uniform float uBass;
  uniform float uBeat;
  uniform float uFlash;
  varying vec2 vUv;

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    float glow = exp(-dot(p, p) * 3.0); // мягкое пятно света в центре
    vec3 color = uBackground + paletteColor(0.66) * glow * (0.12 + 0.25 * uBass);
    color += paletteColor(0.0) * uBeat * uFlash * 0.12;
    gl_FragColor = vec4(color, 1.0);
  }
`

const sphereVertex = /* glsl */ `
  ${NOISE_GLSL}
  uniform float uPhase;
  uniform float uBass;
  uniform float uMid;
  uniform float uBeat;
  uniform float uIntensity;
  varying vec3 vViewPosition;
  varying float vDisplacement;

  void main() {
    // Крупные «волны» от баса + мелкая рябь от середины + толчок на ударе
    float big = valueNoise(normal * 1.6 + vec3(0.0, 0.0, uPhase));
    float small = valueNoise(normal * 4.5 - vec3(uPhase * 1.3));
    float displacement = big * (0.06 + 0.42 * uBass * uIntensity)
                       + small * 0.1 * uMid * uIntensity
                       + 0.15 * uBeat * uIntensity;
    vDisplacement = displacement;

    vec3 displaced = position * (1.0 + displacement);
    vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);
    vViewPosition = viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`

const sphereFragment = /* glsl */ `
  ${PALETTE_GLSL}
  uniform float uBeat;
  uniform float uFlash;
  uniform float uHue;
  varying vec3 vViewPosition;
  varying float vDisplacement;

  void main() {
    // Нормаль считаем по производным позиции в экранном пространстве (dFdx/dFdy):
    // так освещение учитывает деформацию, и получается «гранёный» вид.
    vec3 normal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
    vec3 viewDir = normalize(-vViewPosition);
    float light = max(dot(normal, normalize(vec3(0.4, 0.8, 0.6))), 0.0);
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.0); // свечение по краю

    vec3 base = paletteColor(uHue + vDisplacement * 1.5);
    vec3 color = base * (0.2 + 0.8 * light) + paletteColor(uHue + 0.33) * fresnel * 1.3;
    color += vec3(1.0) * uBeat * uFlash * 0.35;
    gl_FragColor = vec4(color, 1.0);
  }
`

const particlesVertex = /* glsl */ `
  attribute float aSeed;
  uniform float uPhase;
  uniform float uBass;
  uniform float uTreble;
  uniform float uBeat;
  uniform float uIntensity;
  uniform float uPointScale;
  varying float vSeed;
  varying float vSparkle;

  void main() {
    vSeed = aSeed;
    // Каждая частица вращается вокруг оси Y со своей скоростью
    float angle = uPhase * (0.2 + 0.4 * aSeed);
    float c = cos(angle);
    float s = sin(angle);
    vec3 p = vec3(c * position.x + s * position.z, position.y, -s * position.x + c * position.z);
    // Разлёт на басу и ударах
    p *= 1.0 + 0.25 * uBass * uIntensity + 0.35 * uBeat * uIntensity;

    // Мерцание от верхних частот: у каждой частицы своя фаза
    vSparkle = 0.5 + 0.5 * sin(uPhase * 20.0 + aSeed * 60.0);
    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    float size = 3.0 + 6.0 * uTreble * vSparkle;
    gl_PointSize = size * uPointScale * (6.0 / -viewPosition.z); // дальние — меньше
    gl_Position = projectionMatrix * viewPosition;
  }
`

const particlesFragment = /* glsl */ `
  ${PALETTE_GLSL}
  uniform float uOpacity;
  uniform float uTreble;
  varying float vSeed;
  varying float vSparkle;

  void main() {
    // Круглая мягкая точка вместо квадрата
    float d = length(gl_PointCoord - 0.5);
    float alpha = smoothstep(0.5, 0.0, d);
    vec3 color = paletteColor(vSeed);
    gl_FragColor = vec4(color, alpha * uOpacity * (0.5 + 0.5 * uTreble * vSparkle));
  }
`

/** Детерминированный «случайный» генератор, чтобы облако частиц было одинаковым всегда. */
function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

function createParticles(): THREE.BufferGeometry {
  const random = seededRandom(7)
  const positions = new Float32Array(PARTICLE_COUNT * 3)
  const seeds = new Float32Array(PARTICLE_COUNT)
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Равномерное направление на сфере + случайный радиус 1.6..3.4
    const z = random() * 2 - 1
    const angle = random() * Math.PI * 2
    const r = Math.sqrt(1 - z * z)
    const radius = 1.6 + random() * 1.8
    positions[i * 3] = r * Math.cos(angle) * radius
    positions[i * 3 + 1] = z * radius
    positions[i * 3 + 2] = r * Math.sin(angle) * radius
    seeds[i] = random()
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  return geometry
}

function createInstance(): StyleInstance {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)

  // Общие uniform-ы: один объект на все материалы, обновляем в одном месте
  const shared = {
    ...paletteUniforms(),
    uPhase: { value: 0 },
    uBass: { value: 0 },
    uMid: { value: 0 },
    uTreble: { value: 0 },
    uBeat: { value: 0 },
    uIntensity: { value: 1 },
    uFlash: { value: 1 },
    uHue: { value: 0 },
    uAspect: { value: 1 },
    uPointScale: { value: 1 },
    uOpacity: { value: 1 },
  }

  const background = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: shared,
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: backgroundFragment,
      depthWrite: false,
      depthTest: false,
    }),
  )
  background.frustumCulled = false // плоскость не в координатах камеры — не даём её «отсечь»
  background.renderOrder = -1
  scene.add(background)

  const sphere = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 40),
    new THREE.ShaderMaterial({ uniforms: shared, vertexShader: sphereVertex, fragmentShader: sphereFragment }),
  )
  scene.add(sphere)

  const particles = new THREE.Points(
    createParticles(),
    new THREE.ShaderMaterial({
      uniforms: shared,
      vertexShader: particlesVertex,
      fragmentShader: particlesFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // частицы «складывают» свет — выглядит как свечение
    }),
  )
  scene.add(particles)

  return {
    scene,
    camera,

    update(features, params) {
      const speed = numberParam(params, 'speed', 1)
      applyPalette(shared, stringParam(params, 'palette', 'neon'))
      // «Фаза» движения: равномерное время + накопленная энергия (на громких местах быстрее)
      const phase = (features.time * 0.25 + features.energy * 0.9) * speed
      shared.uPhase.value = phase
      shared.uBass.value = features.bass
      shared.uMid.value = features.mid
      shared.uTreble.value = features.treble
      shared.uBeat.value = features.beatPulse
      shared.uIntensity.value = numberParam(params, 'intensity', 1)
      shared.uFlash.value = numberParam(params, 'flash', 1)
      shared.uOpacity.value = numberParam(params, 'particles', 1)
      shared.uHue.value = phase * 0.03

      sphere.rotation.y = phase * 0.3
      sphere.rotation.x = Math.sin(phase * 0.2) * 0.3
    },

    resize(width, height) {
      const aspect = width / height
      camera.aspect = aspect
      // Отодвигаем камеру так, чтобы сцена радиусом ~3 влезала и в вертикальный кадр
      const halfFov = THREE.MathUtils.degToRad(camera.fov / 2)
      camera.position.set(0, 0, 3.1 / (Math.tan(halfFov) * Math.min(1, aspect)))
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()
      shared.uAspect.value = aspect
      shared.uPointScale.value = height / 1080
    },

    dispose() {
      for (const object of [background, sphere, particles]) {
        object.geometry.dispose()
        object.material.dispose()
      }
    },
  }
}

export const pulseSphere: StyleDefinition = {
  id: 'pulse-sphere',
  name: 'Дышащая сфера',
  description: 'Сфера «дышит» басом, вспыхивает на ударах, вокруг — облако частиц.',
  params: [
    { type: 'palette', key: 'palette', label: 'Палитра', default: 'neon' },
    { type: 'number', key: 'intensity', label: 'Интенсивность', min: 0, max: 2, step: 0.05, default: 1 },
    { type: 'number', key: 'speed', label: 'Скорость', min: 0, max: 3, step: 0.05, default: 1 },
    { type: 'number', key: 'flash', label: 'Вспышки на ударах', min: 0, max: 2, step: 0.05, default: 1 },
    { type: 'number', key: 'particles', label: 'Частицы', min: 0, max: 2, step: 0.05, default: 1 },
  ],
  create: createInstance,
}
