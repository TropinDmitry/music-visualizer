import type * as THREE from 'three'
import type { FrameFeatures } from '../audio/frameFeatures.ts'

/** Описание одного параметра стиля — по нему UI сам строит слайдер или список. */
export type StyleParamDef =
  | { type: 'number'; key: string; label: string; min: number; max: number; step: number; default: number }
  | { type: 'palette'; key: string; label: string; default: string }

/** Текущие значения параметров: { palette: 'neon', intensity: 1.2, ... } */
export type StyleParams = Record<string, number | string>

/**
 * Работающий экземпляр стиля: своя сцена, своя камера.
 * Главное правило — update() зависит только от features и params,
 * а не от времени между вызовами. Тогда один и тот же кадр в превью
 * и в экспорте выглядит одинаково, а перемотка работает «бесплатно».
 */
export interface StyleInstance {
  scene: THREE.Scene
  camera: THREE.Camera
  update(features: FrameFeatures, params: StyleParams): void
  resize(width: number, height: number): void
  dispose(): void
}

/** Регистрационная карточка стиля. */
export interface StyleDefinition {
  id: string
  name: string
  description: string
  params: StyleParamDef[]
  create(): StyleInstance
}

/** Значения параметров по умолчанию. */
export function defaultParams(style: StyleDefinition): StyleParams {
  const params: StyleParams = {}
  for (const p of style.params) params[p.key] = p.default
  return params
}

/** Удобные геттеры: параметр может прийти строкой или числом. */
export function numberParam(params: StyleParams, key: string, fallback: number): number {
  const value = params[key]
  return typeof value === 'number' ? value : fallback
}

export function stringParam(params: StyleParams, key: string, fallback: string): string {
  const value = params[key]
  return typeof value === 'string' ? value : fallback
}
