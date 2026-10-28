/** 75.4 → «1:15» */
export function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

/** 5_400_000 → «5,1 МБ» */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`
}

/** Убирает из имени файла символы, запрещённые в Windows/macOS. */
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'visualizer'
}
