import * as THREE from 'three'

/**
 * Палитры стилей. Цвета передаются в шейдеры «как есть» (sRGB) — см. комментарий
 * про цветовое пространство в Visualizer.ts.
 */
export interface Palette {
  id: string
  name: string
  /** Три основных цвета, между которыми шейдеры делают переходы. */
  colors: [string, string, string]
  background: string
}

export const PALETTES: Palette[] = [
  { id: 'neon', name: 'Неон', colors: ['#ff2bd6', '#2bd2ff', '#7a5cff'], background: '#07020f' },
  { id: 'sunset', name: 'Закат', colors: ['#ff6b35', '#f7c548', '#d81b60'], background: '#120408' },
  { id: 'ocean', name: 'Океан', colors: ['#00e5ff', '#1de9b6', '#2962ff'], background: '#010a14' },
  { id: 'acid', name: 'Кислота', colors: ['#b6ff00', '#00ff9d', '#faff00'], background: '#040800' },
  { id: 'mono', name: 'Монохром', colors: ['#ffffff', '#8a8a8a', '#d0d0d0'], background: '#050505' },
]

export function findPalette(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]
}

/** '#ff8800' → Vector3(1, 0.53, 0) без преобразования цветового пространства. */
export function hexToVec3(hex: string): THREE.Vector3 {
  const value = parseInt(hex.slice(1), 16)
  return new THREE.Vector3(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255)
}

/** Записывает палитру в uniform-ы uColorA/B/C и uBackground шейдера. */
export function applyPalette(uniforms: Record<string, THREE.IUniform>, paletteId: string): void {
  const palette = findPalette(paletteId)
  uniforms.uColorA.value.copy(hexToVec3(palette.colors[0]))
  uniforms.uColorB.value.copy(hexToVec3(palette.colors[1]))
  uniforms.uColorC.value.copy(hexToVec3(palette.colors[2]))
  if (uniforms.uBackground) uniforms.uBackground.value.copy(hexToVec3(palette.background))
}

/** Набор uniform-ов палитры для нового материала. */
export function paletteUniforms(): Record<string, THREE.IUniform> {
  return {
    uColorA: { value: new THREE.Vector3() },
    uColorB: { value: new THREE.Vector3() },
    uColorC: { value: new THREE.Vector3() },
    uBackground: { value: new THREE.Vector3() },
  }
}
