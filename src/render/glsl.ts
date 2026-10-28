/**
 * Общие куски GLSL, которые вставляются в шейдеры стилей через шаблонные строки.
 */

/** Вершинный шейдер полноэкранного прямоугольника (PlaneGeometry 2×2). */
export const FULLSCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Без матриц камеры: координаты плоскости 2×2 уже совпадают с экраном (-1..1)
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

/** Плавный переход по кругу между тремя цветами палитры: t в 0..1 (повторяется). */
export const PALETTE_GLSL = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;

  vec3 paletteColor(float t) {
    t = fract(t) * 3.0;
    if (t < 1.0) return mix(uColorA, uColorB, smoothstep(0.0, 1.0, t));
    if (t < 2.0) return mix(uColorB, uColorC, smoothstep(0.0, 1.0, t - 1.0));
    return mix(uColorC, uColorA, smoothstep(0.0, 1.0, t - 2.0));
  }
`

/**
 * Трёхмерный value noise: значения в узлах решётки псевдослучайны,
 * между узлами — плавная интерполяция. Проще simplex-шума и для «дыхания»
 * сферы его хватает.
 */
export const NOISE_GLSL = /* glsl */ `
  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float valueNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    vec3 u = f * f * (3.0 - 2.0 * f); // плавная кривая вместо линейной
    return mix(
      mix(mix(hash3(i + vec3(0, 0, 0)), hash3(i + vec3(1, 0, 0)), u.x),
          mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), u.x), u.y),
      mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), u.x),
          mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), u.x), u.y),
      u.z) * 2.0 - 1.0; // -1..1
  }
`
