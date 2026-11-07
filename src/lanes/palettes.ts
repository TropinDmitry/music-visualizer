import type { AudioAnalysis } from '../audio/analyzer.ts'

/**
 * Палитры игры: цвета дорожек по частям песни, нот, ступеней множителя, тонировка
 * клипа и фон без клипа. Игрок выбирает палитру сам или оставляет «Авто», и тогда
 * игра угадывает её по звуку.
 */

export type PaletteId = 'neon' | 'fire' | 'dark' | 'pink'
export type PaletteChoice = PaletteId | 'auto'
export type HitStyle = 'sparks' | 'embers' | 'petals'

export interface Palette {
  id: PaletteId
  label: string
  /** Цвет дорожек в тихой, обычной и мощных частях песни. */
  calm: string
  normal: string
  strong: string[]
  /** Цвет обычных нот, вспышек и искр. */
  tap: string
  /** Перелив на поверхности нот: между этими двумя цветами. */
  shimmer: [[number, number, number], [number, number, number]]
  /** Цвет ступеней множителя ×1…×8: на верхних ярче. */
  tiers: string[]
  /** Во что окрашивается клип и насколько сильно, 0 — без окраски. */
  tint: [number, number, number]
  tintAmount: number
  /** Общая яркость фона: тёмной палитре нужен почти чёрный клип. */
  backgroundLight: number
  /** Фон без клипа: тёмный и светлый цвет облаков. */
  cloudLow: [number, number, number]
  cloudHigh: [number, number, number]
  /** Яркость фона без клипа, не ниже этой. 0 — как настроил игрок. */
  spaceLight: number
  /** Яркие пятна поверх облаков: языки пламени, блики. Чёрный — без них. */
  cloudAccent: [number, number, number]
  /** Цвет летящих звёзд-лучей в фоне без клипа. */
  streakColor: [number, number, number]
  /** Цвет суперрежима и короны света над дорожками. */
  overdrive: [number, number, number]
  crown: [number, number, number]
  /** Цвет лучей удержания. В Огне луч горит языками пламени. */
  beam: [number, number, number]
  isFlameBeam: boolean
  /** Чем рассыпается нота при попадании: искры, тлеющие угольки или лепестки. */
  hitStyle: HitStyle
  /** Цвет звёзд-нот. */
  special: string
  /** Каждая какая обычная нота белая, как центр чашки. 0 — белых нет. */
  whiteNoteEvery: number
  /** Можно ли плавно поворачивать оттенок клипа по ходу песни. Своей палитре это мешает. */
  allowsDrift: boolean
}

export const PALETTES: Record<PaletteId, Palette> = {
  neon: {
    id: 'neon',
    label: 'Неон',
    calm: '#5aa7ff',
    normal: '#2fd8cf',
    strong: ['#ff8f5a', '#ffd24f'],
    tap: '#b84dff',
    shimmer: [[0.5, 0.2, 1], [1, 0.32, 0.9]],
    tiers: ['#3dff9e', '#2ef2d0', '#5fe8ff', '#8fd4ff', '#9dffc4', '#c4ffe0', '#d9fff0', '#f2fff9'],
    tint: [1, 1, 1],
    tintAmount: 0,
    backgroundLight: 1,
    cloudLow: [0, 0.03, 0.05],
    cloudHigh: [0.03, 0.34, 0.26],
    spaceLight: 0,
    cloudAccent: [0, 0, 0],
    streakColor: [0.7, 1, 0.9],
    overdrive: [1, 0.78, 0.25],
    crown: [0.62, 0.28, 1],
    beam: [0.72, 0.3, 1],
    isFlameBeam: false,
    hitStyle: 'sparks',
    special: '#ffc933',
    whiteNoteEvery: 0,
    allowsDrift: true,
  },
  fire: {
    id: 'fire',
    label: 'Огонь',
    calm: '#a5321c',
    normal: '#ff7a1a',
    strong: ['#ffae1a', '#ffe14a'],
    tap: '#e0182d',
    shimmer: [[0.8, 0.05, 0.08], [1, 0.5, 0.1]],
    tiers: ['#ff5a1f', '#ff6a1f', '#ff7d1f', '#ff9020', '#ffa628', '#ffbd3a', '#ffd45a', '#fff0b0'],
    tint: [1, 0.42, 0.25],
    tintAmount: 0.55,
    backgroundLight: 0.9,
    cloudLow: [0.09, 0.005, 0],
    cloudHigh: [0.8, 0.17, 0.03],
    spaceLight: 0.95,
    cloudAccent: [1, 0.5, 0.08],
    streakColor: [1, 0.65, 0.25],
    overdrive: [1, 0.9, 0.45],
    crown: [1, 0.3, 0.08],
    beam: [1, 0.4, 0.05],
    isFlameBeam: true,
    hitStyle: 'embers',
    special: '#ffc933',
    whiteNoteEvery: 0,
    allowsDrift: false,
  },
  dark: {
    id: 'dark',
    label: 'Тьма',
    calm: '#3c4048',
    normal: '#7d8590',
    strong: ['#c9d0d8', '#f2f4f7'],
    tap: '#7a3bd0',
    shimmer: [[0.32, 0.14, 0.55], [0.62, 0.42, 0.9]],
    tiers: ['#5c636d', '#6f7782', '#848c97', '#9aa2ac', '#b1b8c1', '#c8ced5', '#e0e4e9', '#ffffff'],
    tint: [0.85, 0.9, 1],
    tintAmount: 0.85,
    backgroundLight: 0.6,
    cloudLow: [0, 0, 0],
    cloudHigh: [0.06, 0.06, 0.08],
    spaceLight: 0,
    cloudAccent: [0, 0, 0],
    streakColor: [0.55, 0.57, 0.62],
    overdrive: [0.82, 0.85, 0.92],
    crown: [0.4, 0.4, 0.5],
    beam: [0.82, 0.84, 0.92],
    isFlameBeam: false,
    hitStyle: 'sparks',
    special: '#e8ecf2',
    whiteNoteEvery: 3,
    allowsDrift: false,
  },
  pink: {
    id: 'pink',
    label: 'Розовая',
    calm: '#c08bff',
    normal: '#ff6fb5',
    strong: ['#ff9bd3', '#ffd1ea'],
    tap: '#9b4dff',
    shimmer: [[0.7, 0.3, 1], [1, 0.45, 0.75]],
    tiers: ['#ff6fb5', '#ff7cbd', '#ff8ac6', '#ff99cf', '#ffa9d8', '#ffbae1', '#ffcdea', '#ffe6f4'],
    tint: [1, 0.55, 0.85],
    tintAmount: 0.45,
    backgroundLight: 1,
    cloudLow: [0.09, 0.01, 0.08],
    cloudHigh: [0.78, 0.22, 0.6],
    spaceLight: 0.95,
    cloudAccent: [0.62, 0.35, 1],
    streakColor: [1, 0.8, 0.95],
    overdrive: [1, 0.85, 0.95],
    crown: [1, 0.4, 0.8],
    beam: [1, 0.45, 0.8],
    isFlameBeam: false,
    hitStyle: 'petals',
    special: '#ffc933',
    whiteNoteEvery: 0,
    allowsDrift: false,
  },
}

export const PALETTE_CHOICES: { id: PaletteChoice; label: string }[] = [
  { id: 'auto', label: 'Авто' },
  { id: 'neon', label: 'Неон' },
  { id: 'fire', label: 'Огонь' },
  { id: 'dark', label: 'Тьма' },
  { id: 'pink', label: 'Розовая' },
]

/**
 * Пороги подобраны на 13 треках: тяжёлые гитары, электроника, рэп, классика и песни
 * с женским голосом. На других жанрах угадывание может ошибаться, поэтому выбор
 * всегда остаётся за игроком.
 */
/** Середина спектра ровная и плотная: так звучат перегруженные гитары и жёсткий шум. */
const HEAVY_MID_ROUGHNESS = 0.25
/** Ясная мелодия звучит меньше этой доли громкой части трека. */
const HEAVY_MELODY_SHARE = 0.6
/** Тьма: мелодии почти нет, а бит плотный и частый. Тяжёлые гитары с мелодией остаются Огнём. */
const DARK_MELODY_SHARE = 0.35
const DARK_MIN_ONSET_RATE = 3.5
/** Розовая: ведущий голос высокий, но не так высоко, как синтезатор. Мужской голос ниже. */
const PINK_MIN_PITCH = 61.5
const PINK_MAX_PITCH = 65
const MID_BINS_FROM = 20
const MID_BINS_TO = 44
/** Громкая половина трека: всё, что громче медианы. */
const LOUD_PART_SHARE = 0.5

/**
 * Угадывает палитру по звуку. Это подсказка, а не распознавание жанра: настроения
 * в звуке напрямую нет, есть только тембр, высота и плотность. Если признаков мало,
 * остаётся «Неон».
 */
export function guessPalette(analysis: AudioAnalysis): PaletteId {
  const features = soundFeatures(analysis)
  // Высокий голос важнее тяжёлого звука: женский рок всё равно розовый
  const isHighVoice = features.medianPitch >= PINK_MIN_PITCH && features.medianPitch <= PINK_MAX_PITCH
  if (isHighVoice) return 'pink'
  const isHeavy = features.roughness < HEAVY_MID_ROUGHNESS && features.melodyShare < HEAVY_MELODY_SHARE
  if (!isHeavy) return 'neon'
  const isDark = features.melodyShare < DARK_MELODY_SHARE && features.onsetRate >= DARK_MIN_ONSET_RATE
  return isDark ? 'dark' : 'fire'
}

/** Признаки звука для выбора палитры. Отдельно, чтобы их можно было смотреть в замерах. */
export interface SoundFeatures {
  roughness: number
  melodyShare: number
  medianPitch: number
  bassShare: number
  onsetRate: number
}

/**
 * Считаем только по громкой половине трека: тихое вступление или концовка не должны
 * решать за всю песню. В тихих кадрах нет ни мелодии, ни гитары, они только сбивают.
 */
export function soundFeatures(analysis: AudioAnalysis): SoundFeatures {
  const bins = analysis.spectrumBins
  const loudness = [...analysis.rms].sort((a, b) => a - b)
  const threshold = loudness[Math.floor(loudness.length * LOUD_PART_SHARE)]

  let frames = 0
  let roughness = 0
  let melodyFrames = 0
  const pitches: number[] = []
  let bass = 0
  let middle = 0
  for (let frame = 0; frame < analysis.frameCount; frame++) {
    if (analysis.rms[frame] < threshold) continue
    frames += 1
    let mean = 0
    let squares = 0
    for (let bin = MID_BINS_FROM; bin < MID_BINS_TO; bin++) {
      const value = analysis.spectrum[frame * bins + bin]
      mean += value
      squares += value * value
    }
    const count = MID_BINS_TO - MID_BINS_FROM
    mean /= count
    const spread = Math.sqrt(Math.max(0, squares / count - mean * mean))
    roughness += mean > 0.05 ? spread / mean : 1
    const pitch = analysis.melody.pitch[frame]
    if (pitch > 0) {
      melodyFrames += 1
      pitches.push(pitch)
    }
    bass += analysis.raw.bass[frame]
    middle += analysis.raw.mid[frame]
  }
  pitches.sort((a, b) => a - b)
  return {
    roughness: roughness / Math.max(1, frames),
    melodyShare: melodyFrames / Math.max(1, frames),
    medianPitch: pitches.length > 0 ? pitches[Math.floor(pitches.length / 2)] : 0,
    bassShare: bass / Math.max(1e-6, middle),
    onsetRate: analysis.onsetTimes.length / analysis.duration,
  }
}
