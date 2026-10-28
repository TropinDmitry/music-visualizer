import { plasmaTunnel } from './plasmaTunnel.ts'
import { pulseSphere } from './pulseSphere.ts'
import { spectrumRing } from './spectrumRing.ts'
import type { StyleDefinition } from './types.ts'

/** Список всех стилей. Чтобы добавить новый — создайте файл по образцу и допишите его сюда. */
export const STYLES: StyleDefinition[] = [pulseSphere, spectrumRing, plasmaTunnel]

export function findStyle(id: string): StyleDefinition {
  return STYLES.find((s) => s.id === id) ?? STYLES[0]
}
