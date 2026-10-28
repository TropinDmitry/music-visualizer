export interface Resolution {
  id: string
  label: string
  width: number
  height: number
}

export const RESOLUTIONS: Resolution[] = [
  { id: '16x9', label: '1920×1080 — YouTube (16:9)', width: 1920, height: 1080 },
  { id: '9x16', label: '1080×1920 — Shorts, Reels, клипы ВК (9:16)', width: 1080, height: 1920 },
  { id: '1x1', label: '1080×1080 — квадрат (1:1)', width: 1080, height: 1080 },
]

export function findResolution(id: string): Resolution {
  return RESOLUTIONS.find((r) => r.id === id) ?? RESOLUTIONS[0]
}
