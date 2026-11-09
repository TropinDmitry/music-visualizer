import type { ClipLook } from './LaneScene.ts'
import type { DifficultyId } from './level.ts'
import type { PaletteChoice } from './palettes.ts'

/**
 * Тексты игры на русском и английском. Слова нейтральные, как в известных
 * ритм-играх: комбо, Fever, Full Combo, без выкриков вроде «вы машина».
 */

export type Lang = 'ru' | 'en'

const LANG_KEY = 'tyt-lang'
/** Языки, носителям которых игра сразу показывает русский. */
const RUSSIAN_FIRST = ['ru', 'be', 'kk', 'ky']

/**
 * Язык при первом запуске: выбор игрока, если он уже переключал, иначе главный
 * язык браузера. Браузер ставит его из настроек системы, так что это надёжнее
 * угадывания по стране: русскоязычный в Германии всё равно увидит русский.
 */
export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'ru' || saved === 'en') return saved
  } catch {
    // в приватном режиме хранилища может не быть, тогда решает браузер
  }
  const primary = (navigator.languages?.[0] ?? navigator.language ?? 'en').toLowerCase()
  return RUSSIAN_FIRST.some((code) => primary === code || primary.startsWith(`${code}-`)) ? 'ru' : 'en'
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, lang)
  } catch {
    // выбор просто не запомнится
  }
}

const RU = {
  locale: 'ru-RU',
  tagline: 'Ритм-игра из вашей музыки: три дорожки и ваш клип на весь экран',
  tapToStart: 'Нажмите, чтобы начать',
  loading: 'Загрузка…',
  musicOn: 'Выключить музыку',
  musicOff: 'Включить музыку',
  addClip: 'Добавить отдельный видеофон',
  demoTrack: 'Или взять демо-трек',
  demoName: 'Демо-трек',
  privacy: 'Файлы остаются у вас: на сервер ничего не загружается.',
  clip: 'клип',
  reading: 'Читаем файл…',
  building: 'Строим уровень…',
  readError: 'Не удалось прочитать звук из файла. Попробуйте mp3, wav, ogg или mp4.',
  tooLong: 'Файл длиннее 10 минут: такие не загружаются.',
  settings: 'Настройки',
  howToPlay: 'Как играть',
  back: 'Назад',
  tabLook: 'Вид',
  tabGame: 'Игра и звук',
  difficulty: 'Сложность',
  clipLook: 'Обработка клипа',
  loadTrackShort: 'Загрузить трек',
  changeTrack: 'Сменить трек',
  loadTrackHint: 'песня или клип целиком',
  paletteLabel: 'Палитра',
  paletteGuessed: (name: string) => `Подобрана по звуку: ${name}`,
  paletteWaiting: 'Палитра подберётся по звуку трека',
  paletteManual: 'Палитра выбрана вручную',
  clipBrightness: 'Яркость клипа',
  clipFocus: 'Приглушить клип за дорожками',
  laneContrast: 'Контраст дорожек',
  noteSpeed: 'Скорость нот',
  seconds: 'с',
  volume: 'Громкость',
  effects: 'Звуковые эффекты',
  offset: 'Поправка на задержку',
  ms: 'мс',
  colorDrift: 'Цвет клипа меняется по ходу песни',
  autopilot: 'Автопилот',
  start: 'Старт',
  legend: [
    'Круг: клавиша A, S, D или нажатие на дорожку',
    'Круг со стрелкой: ← ↑ → или смахивание в ту же сторону, когда стрелка легла на чашу',
    'Звезда: три звезды включают Fever, очки ×2 на 8 секунд; звезда во время Fever продлевает его',
    'Круг с лучом: зажмите и держите до конца',
    'Парная нота: две клавиши сразу',
    'Плашка SPACE: пробел, на телефоне касание экрана, когда она на линии',
  ],
  hint: 'A S D — круги · ← ↑ → — стрелки · пробел — SPACE · Esc — пауза',
  combo: 'комбо',
  comboBanner: (count: number) => `${count} КОМБО`,
  streak: (from: number) => `Комбо ${from}+`,
  fever: 'FEVER',
  feverDetail: 'очки ×2 на 8 секунд',
  starsToFever: (count: number, total: number) => `Звёзд до Fever: ${count} из ${total}`,
  starHint: 'Собери 3 звезды — FEVER: очки ×2',
  feverExtended: (seconds: number) => `+${seconds} с`,
  warning: 'ОСТОРОЖНО',
  warningDetail: (count: number) => `${count} промаха подряд`,
  energy: 'энергия',
  miss: 'мимо',
  holdBroken: 'обрыв',
  pause: 'Пауза',
  resume: 'Продолжить',
  restart: 'Начать заново',
  toMenu: 'В меню',
  again: 'Ещё раз',
  failed: 'Уровень не пройден',
  fullCombo: 'Full Combo',
  great: 'Отлично',
  cleared: 'Трек пройден',
  starsOf: (count: number) => `Звёзд: ${count} из 3`,
  newBest: 'Новый рекорд',
  score: 'Очки',
  best: 'Рекорд',
  accuracyTitle: 'Точность',
  maxCombo: 'Лучшее комбо',
  perfectGood: 'Точно / хорошо',
  misses: 'Промахи',
  difficulties: { easy: 'Лёгкая', normal: 'Средняя', hard: 'Сложная' } as Record<DifficultyId, string>,
  palettes: { auto: 'Авто', neon: 'Неон', fire: 'Огонь', dark: 'Тьма', pink: 'Розовая', luxe: 'Люкс' } as Record<PaletteChoice, string>,
  looks: { outline: 'Неоновый контур', duotone: 'Дуотон', comic: 'Комикс', original: 'Оригинал' } as Record<ClipLook, string>,
}

export type Texts = typeof RU

const EN: Texts = {
  locale: 'en-US',
  tagline: 'A rhythm game built from your music: three lanes and your video full screen',
  tapToStart: 'Tap to start',
  loading: 'Loading…',
  musicOn: 'Mute music',
  musicOff: 'Play music',
  addClip: 'Add a separate background video',
  demoTrack: 'Or play the demo track',
  demoName: 'Demo track',
  privacy: 'Your files stay on your device: nothing is uploaded.',
  clip: 'video',
  reading: 'Reading the file…',
  building: 'Building the level…',
  readError: 'Could not read audio from this file. Try mp3, wav, ogg or mp4.',
  tooLong: 'Files longer than 10 minutes are not supported.',
  settings: 'Settings',
  howToPlay: 'How to play',
  back: 'Back',
  tabLook: 'Look',
  tabGame: 'Game & sound',
  difficulty: 'Difficulty',
  clipLook: 'Video style',
  loadTrackShort: 'Load a track',
  changeTrack: 'Change track',
  loadTrackHint: 'a song or a whole music video',
  paletteLabel: 'Palette',
  paletteGuessed: (name: string) => `Picked from the sound: ${name}`,
  paletteWaiting: 'The palette will match the sound of the track',
  paletteManual: 'Palette chosen manually',
  clipBrightness: 'Video brightness',
  clipFocus: 'Dim the video behind the lanes',
  laneContrast: 'Lane contrast',
  noteSpeed: 'Note speed',
  seconds: 's',
  volume: 'Volume',
  effects: 'Sound effects',
  offset: 'Audio offset',
  ms: 'ms',
  colorDrift: 'Video colour shifts during the song',
  autopilot: 'Autoplay',
  start: 'Start',
  legend: [
    'Circle: A, S, D or tap the lane',
    'Arrow circle: ← ↑ → or swipe the same way once it lands on the bowl',
    'Star: three stars start Fever, ×2 score for 8 seconds; a star during Fever extends it',
    'Circle with a beam: press and hold to the end',
    'Double note: two keys at once',
    'SPACE bar: press space, on a phone tap the screen when it reaches the line',
  ],
  hint: 'A S D — circles · ← ↑ → — arrows · space — SPACE · Esc — pause',
  combo: 'combo',
  comboBanner: (count: number) => `${count} COMBO`,
  streak: (from: number) => `Combo ${from}+`,
  fever: 'FEVER',
  feverDetail: '×2 score for 8 seconds',
  starsToFever: (count: number, total: number) => `Stars to Fever: ${count} of ${total}`,
  starHint: 'Collect 3 stars for FEVER: ×2 score',
  feverExtended: (seconds: number) => `+${seconds}s`,
  warning: 'CAREFUL',
  warningDetail: (count: number) => `${count} misses in a row`,
  energy: 'energy',
  miss: 'miss',
  holdBroken: 'broken',
  pause: 'Paused',
  resume: 'Resume',
  restart: 'Restart',
  toMenu: 'Menu',
  again: 'Play again',
  failed: 'Level failed',
  fullCombo: 'Full Combo',
  great: 'Great',
  cleared: 'Track cleared',
  starsOf: (count: number) => `Stars: ${count} of 3`,
  newBest: 'New best',
  score: 'Score',
  best: 'Best',
  accuracyTitle: 'Accuracy',
  maxCombo: 'Max combo',
  perfectGood: 'Perfect / good',
  misses: 'Misses',
  difficulties: { easy: 'Easy', normal: 'Normal', hard: 'Hard' },
  palettes: { auto: 'Auto', neon: 'Neon', fire: 'Fire', dark: 'Dark', pink: 'Pink', luxe: 'Luxe' },
  looks: { outline: 'Neon outline', duotone: 'Duotone', comic: 'Comic', original: 'Original' },
}

export const TEXTS: Record<Lang, Texts> = { ru: RU, en: EN }
