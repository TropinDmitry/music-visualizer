import * as THREE from 'three'
import { FULLSCREEN_VERTEX, PALETTE_GLSL } from '../render/glsl.ts'
import { applyPalette, paletteUniforms } from '../render/palettes.ts'
import { numberParam, stringParam, type StyleDefinition, type StyleInstance } from './types.ts'

/**
 * Стиль «Кольцевой спектр»: столбики спектра по кругу (низкие частоты сверху,
 * высокие снизу, левая половина — зеркало правой), в центре диск, пульсирующий
 * от баса, и расходящееся кольцо на каждом ударе.
 *
 * Столбики рисуются одной командой отрисовки через инстансинг: геометрия одного
 * прямоугольника + массивы «угол» и «уровень» на каждый экземпляр.
 */

const BINS = 64
const BAR_COUNT = BINS * 2
/** Половина высоты кадра в мировых единицах для горизонтального кадра. */
const VIEW_HALF = 1.3

const barsVertex = /* glsl */ `
  attribute float aAngle;
  attribute float aLevel;
  attribute float aBin;
  uniform float uRadius;
  uniform float uLength;
  uniform float uWidth;
  uniform float uRotation;
  varying float vAlong;
  varying float vBin;
  varying float vLevel;

  void main() {
    // position — вершина прямоугольника: x в -0.5..0.5, y в 0..1
    float barLength = 0.015 + aLevel * uLength;
    float r = uRadius + position.y * barLength;
    float angle = aAngle + uRotation;
    vec2 outward = vec2(sin(angle), cos(angle));
    vec2 sideways = vec2(cos(angle), -sin(angle));
    vec2 p = outward * r + sideways * position.x * uWidth;

    vAlong = position.y;
    vBin = aBin;
    vLevel = aLevel;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
  }
`

const barsFragment = /* glsl */ `
  ${PALETTE_GLSL}
  uniform float uHue;
  varying float vAlong;
  varying float vBin;
  varying float vLevel;

  void main() {
    vec3 color = paletteColor(uHue + vBin / 64.0 * 0.8);
    // К кончику столбик светлее, громкие столбики ярче
    color *= 0.55 + 0.6 * vAlong + 0.4 * vLevel;
    gl_FragColor = vec4(color, 1.0);
  }
`

const backgroundFragment = /* glsl */ `
  ${PALETTE_GLSL}
  uniform vec3 uBackground;
  uniform vec2 uHalfSize;
  uniform float uRadius;
  uniform float uBass;
  uniform float uBeat;
  uniform float uGlow;
  uniform float uHue;
  uniform float uRotation;
  varying vec2 vUv;

  void main() {
    // Те же мировые координаты, что видит ортографическая камера
    vec2 p = (vUv - 0.5) * 2.0 * uHalfSize;
    float d = length(p);
    float angle = atan(p.x, p.y);
    vec3 color = uBackground;

    // Мягкие лучи, медленно вращающиеся вместе с кольцом
    float rays = 0.5 + 0.5 * sin(angle * 12.0 + uRotation * 2.0);
    color += paletteColor(uHue + 0.5) * rays * exp(-d * 1.8) * 0.06 * uGlow;

    // Свечение вокруг кольца — сильнее на басу
    float ringGlow = exp(-pow((d - uRadius) * 6.0, 2.0));
    color += paletteColor(uHue) * ringGlow * (0.15 + 0.5 * uBass) * uGlow;

    // Диск в центре
    float disc = smoothstep(uRadius * 0.92, uRadius * 0.9, d);
    vec3 discColor = mix(uBackground, paletteColor(uHue + 0.33), 0.15 + 0.35 * uBass);
    discColor *= 1.0 - 0.5 * d / uRadius; // к краю диск темнее — видна «глубина»
    color = mix(color, discColor, disc);

    // Кольцо-волна: на ударе рождается у края диска и расходится наружу
    float waveRadius = uRadius + (1.0 - uBeat) * 0.9;
    float wave = exp(-pow((d - waveRadius) * 40.0, 2.0)) * uBeat;
    color += paletteColor(uHue + 0.66) * wave * uGlow;

    gl_FragColor = vec4(color, 1.0);
  }
`

function createBarsGeometry(): THREE.InstancedBufferGeometry {
  // Прямоугольник 1×1, сдвинутый так, чтобы основание было на y = 0
  const base = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0)
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.index = base.index
  geometry.setAttribute('position', base.getAttribute('position'))

  const angles = new Float32Array(BAR_COUNT)
  const bins = new Float32Array(BAR_COUNT)
  for (let i = 0; i < BAR_COUNT; i++) {
    // Правая половина: бины 0..63 сверху вниз по часовой; левая — зеркально
    const isRight = i < BINS
    const bin = isRight ? i : BAR_COUNT - 1 - i
    const angleOnHalf = ((bin + 0.5) / BINS) * Math.PI
    angles[i] = isRight ? angleOnHalf : -angleOnHalf
    bins[i] = bin
  }
  geometry.setAttribute('aAngle', new THREE.InstancedBufferAttribute(angles, 1))
  geometry.setAttribute('aBin', new THREE.InstancedBufferAttribute(bins, 1))
  const levels = new THREE.InstancedBufferAttribute(new Float32Array(BAR_COUNT), 1)
  levels.setUsage(THREE.DynamicDrawUsage) // обновляется каждый кадр
  geometry.setAttribute('aLevel', levels)
  geometry.instanceCount = BAR_COUNT
  return geometry
}

function createInstance(): StyleInstance {
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1)

  const shared = {
    ...paletteUniforms(),
    uHalfSize: { value: new THREE.Vector2(1, 1) },
    uRadius: { value: 0.5 },
    uLength: { value: 0.5 },
    uWidth: { value: 0.02 },
    uRotation: { value: 0 },
    uBass: { value: 0 },
    uBeat: { value: 0 },
    uGlow: { value: 1 },
    uHue: { value: 0 },
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
  background.frustumCulled = false
  background.renderOrder = -1
  scene.add(background)

  const barsGeometry = createBarsGeometry()
  const bars = new THREE.Mesh(
    barsGeometry,
    new THREE.ShaderMaterial({ uniforms: shared, vertexShader: barsVertex, fragmentShader: barsFragment }),
  )
  bars.frustumCulled = false // вершины двигает шейдер — границы геометрии ничего не значат
  scene.add(bars)

  const levels = barsGeometry.getAttribute('aLevel') as THREE.InstancedBufferAttribute

  return {
    scene,
    camera,

    update(features, params) {
      const intensity = numberParam(params, 'intensity', 1)
      applyPalette(shared, stringParam(params, 'palette', 'ocean'))

      for (let i = 0; i < BAR_COUNT; i++) {
        const bin = i < BINS ? i : BAR_COUNT - 1 - i
        // Возведение в степень делает тихие частоты ещё тише — картинка контрастнее
        levels.array[i] = Math.pow(features.spectrum[bin] ?? 0, 1.6)
      }
      levels.needsUpdate = true

      const rotationSpeed = numberParam(params, 'rotation', 0.5)
      const rotation = (features.time * 0.15 + features.energy * 0.4) * rotationSpeed
      shared.uRotation.value = rotation
      shared.uRadius.value = 0.5 + 0.07 * features.bass * intensity + 0.03 * features.beatPulse
      shared.uLength.value = 0.55 * intensity
      // Ширина столбика — доля от расстояния между соседними
      shared.uWidth.value = ((2 * Math.PI * 0.5) / BAR_COUNT) * numberParam(params, 'barWidth', 0.6)
      shared.uBass.value = features.bass
      shared.uBeat.value = features.beatPulse
      shared.uGlow.value = numberParam(params, 'glow', 1)
      shared.uHue.value = rotation * 0.05
    },

    resize(width, height) {
      const aspect = width / height
      // В вертикальном кадре расширяем область обзора, чтобы кольцо влезло по ширине
      const halfHeight = VIEW_HALF / Math.min(1, aspect)
      const halfWidth = halfHeight * aspect
      camera.left = -halfWidth
      camera.right = halfWidth
      camera.top = halfHeight
      camera.bottom = -halfHeight
      camera.updateProjectionMatrix()
      shared.uHalfSize.value.set(halfWidth, halfHeight)
    },

    dispose() {
      for (const object of [background, bars]) {
        object.geometry.dispose()
        object.material.dispose()
      }
    },
  }
}

export const spectrumRing: StyleDefinition = {
  id: 'spectrum-ring',
  name: 'Кольцевой спектр',
  description: 'Спектр по кругу, пульсирующий диск в центре и волна на каждом ударе.',
  params: [
    { type: 'palette', key: 'palette', label: 'Палитра', default: 'ocean' },
    { type: 'number', key: 'intensity', label: 'Интенсивность', min: 0, max: 2, step: 0.05, default: 1 },
    { type: 'number', key: 'rotation', label: 'Скорость вращения', min: 0, max: 3, step: 0.05, default: 0.5 },
    { type: 'number', key: 'barWidth', label: 'Ширина столбиков', min: 0.15, max: 1, step: 0.05, default: 0.6 },
    { type: 'number', key: 'glow', label: 'Свечение', min: 0, max: 2, step: 0.05, default: 1 },
  ],
  create: createInstance,
}
