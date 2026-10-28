import * as THREE from 'three'
import { FULLSCREEN_VERTEX, PALETTE_GLSL } from '../render/glsl.ts'
import { applyPalette, paletteUniforms } from '../render/palettes.ts'
import { numberParam, stringParam, type StyleDefinition, type StyleInstance } from './types.ts'

/**
 * Стиль «Плазменный туннель»: весь кадр рисует один фрагментный шейдер.
 * Каждый пиксель переводится в полярные координаты (угол, радиус), а
 * «глубина» туннеля = 1 / радиус — классический демосценовый приём.
 * На стенках — плазма (сумма синусов), бас раскачивает яркость и форму,
 * верхние частоты зажигают кольца, удар даёт вспышку.
 */

const tunnelFragment = /* glsl */ `
  ${PALETTE_GLSL}
  uniform float uAspect;
  uniform float uTravel;
  uniform float uTwist;
  uniform float uDistortion;
  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform float uBeat;
  uniform float uIntensity;
  uniform float uFlash;
  uniform float uHue;
  varying vec2 vUv;

  void main() {
    // Координаты с центром в середине кадра; по короткой стороне -1..1
    vec2 p = (vUv - 0.5) * 2.0 * vec2(uAspect, 1.0) / min(uAspect, 1.0);
    float angle = atan(p.y, p.x);
    float radius = length(p);

    // Искажение формы: стенки «дышат» волнами по окружности (середина частот)
    radius *= 1.0 + uDistortion * 0.18 * sin(angle * 3.0 + uTravel * 2.0) * (0.3 + uMid);

    float depth = 0.4 / max(radius, 0.001);
    float v = depth + uTravel; // координата вдоль туннеля — по ней мы «летим»

    // Плазма: сумма синусов. У угла только целые множители, чтобы на шве
    // atan (угол ±π) не было разрыва.
    float plasma = sin(angle * 3.0 + v * 2.0 + depth * uTwist)
                 + sin(v * 5.0 - uTravel)
                 + sin(angle * 5.0 - v * 3.0 + depth * uTwist * 0.5)
                 + sin(v * 1.5 + angle * 2.0);
    plasma *= 0.25; // примерно -1..1

    vec3 color = paletteColor(uHue + plasma * 0.5 + v * 0.03);

    // Светящиеся кольца поперёк туннеля — от верхних частот
    float rings = pow(abs(sin(v * 3.14159)), 40.0);
    color += paletteColor(uHue + 0.5) * rings * (0.2 + 1.5 * uTreble) * uIntensity;

    // Глубина: центр (дальний конец) тёмный, на басу туннель ярче
    float fog = smoothstep(0.0, 0.7, radius);
    color *= fog * (0.45 + 0.9 * uBass * uIntensity);

    // Виньетка по краям кадра
    color *= 1.0 - 0.5 * smoothstep(1.0, 2.0, radius);

    // Вспышка на ударе
    color += paletteColor(uHue + 0.2) * uBeat * uFlash * 0.3;

    gl_FragColor = vec4(color, 1.0);
  }
`

function createInstance(): StyleInstance {
  const scene = new THREE.Scene()
  // Камера формально нужна рендереру, но шейдер её не использует
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  const uniforms = {
    ...paletteUniforms(),
    uAspect: { value: 1 },
    uTravel: { value: 0 },
    uTwist: { value: 1 },
    uDistortion: { value: 1 },
    uBass: { value: 0 },
    uMid: { value: 0 },
    uTreble: { value: 0 },
    uBeat: { value: 0 },
    uIntensity: { value: 1 },
    uFlash: { value: 1 },
    uHue: { value: 0 },
  }

  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: tunnelFragment,
      depthWrite: false,
      depthTest: false,
    }),
  )
  quad.frustumCulled = false
  scene.add(quad)

  return {
    scene,
    camera,

    update(features, params) {
      applyPalette(uniforms, stringParam(params, 'palette', 'sunset'))
      const speed = numberParam(params, 'speed', 1)
      const travel = (features.time * 0.35 + features.energy * 1.4) * speed
      uniforms.uTravel.value = travel
      uniforms.uTwist.value = numberParam(params, 'twist', 1)
      uniforms.uDistortion.value = numberParam(params, 'distortion', 1)
      uniforms.uBass.value = features.bass
      uniforms.uMid.value = features.mid
      uniforms.uTreble.value = features.treble
      uniforms.uBeat.value = features.beatPulse
      uniforms.uIntensity.value = numberParam(params, 'intensity', 1)
      uniforms.uFlash.value = numberParam(params, 'flash', 1)
      uniforms.uHue.value = travel * 0.02
    },

    resize(width, height) {
      uniforms.uAspect.value = width / height
    },

    dispose() {
      quad.geometry.dispose()
      quad.material.dispose()
    },
  }
}

export const plasmaTunnel: StyleDefinition = {
  id: 'plasma-tunnel',
  name: 'Плазменный туннель',
  description: 'Полёт по плазменному туннелю: скорость от энергии трека, кольца от верхов.',
  params: [
    { type: 'palette', key: 'palette', label: 'Палитра', default: 'sunset' },
    { type: 'number', key: 'intensity', label: 'Интенсивность', min: 0, max: 2, step: 0.05, default: 1 },
    { type: 'number', key: 'speed', label: 'Скорость', min: 0, max: 3, step: 0.05, default: 1 },
    { type: 'number', key: 'twist', label: 'Закрутка', min: -4, max: 4, step: 0.1, default: 1 },
    { type: 'number', key: 'distortion', label: 'Искажение', min: 0, max: 2, step: 0.05, default: 1 },
    { type: 'number', key: 'flash', label: 'Вспышки на ударах', min: 0, max: 2, step: 0.05, default: 1 },
  ],
  create: createInstance,
}
