import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import type { AudioAnalysis } from '../audio/analyzer.ts'
import { AudioPlayer } from '../audio/AudioPlayer.ts'
import { createEmptyFeatures, sampleFeatures } from '../audio/frameFeatures.ts'
import { MAX_MEDIA_SEC, audioBufferToMono, createDemoBuffer, decodeAudioFile, readMediaDuration } from '../audio/loadAudio.ts'
import { runAnalysisInWorker } from '../audio/runAnalysis.ts'
import { formatTime } from '../formatting.ts'
import { CLIP_LOOKS, LaneScene, type ClipLook } from './LaneScene.ts'
import {
  DIFFICULTIES,
  findDifficulty,
  generateLaneLevel,
  type DifficultyId,
} from './level.ts'
import { guessPalette, PALETTE_CHOICES, PALETTES, type Palette, type PaletteChoice, type PaletteId } from './palettes.ts'
import { detectLang, saveLang, TEXTS, type Lang } from './i18n.ts'
import { Logo } from './Logo.tsx'
import { MenuMusic } from './menuMusic.ts'
import { ResultStars } from './ResultStars.tsx'
import { SoundEffects } from './sounds.ts'
import { findMoments, findSections, songIntensity, type Moment, type Section } from './structure.ts'
import {
  accuracy,
  createLaneGame,
  isOverdrive,
  isSpaceDue,
  MISS_WARNING_STREAK,
  multiplier,
  OVERDRIVE_SEC,
  multiplierProgress,
  playAutopilot,
  pressLane,
  pressSpace,
  pressSwipe,
  rank,
  releaseLane,
  STARS_FOR_OVERDRIVE,
  STREAK_TIERS,
  starRating,
  stepLanes,
  streakProgress,
  streakTier,
  type LaneEvent,
  type LaneGame,
} from './rules.ts'

type Screen = 'splash' | 'menu' | 'playing' | 'paused' | 'results'

interface Settings {
  difficulty: DifficultyId
  palette: PaletteChoice
  approachSec: number
  volume: number
  effectsVolume: number
  colorDrift: boolean
  offsetMs: number
  look: ClipLook
  clipBrightness: number
  clipFocus: number
  laneContrast: number
  autopilot: boolean
}

interface Hud {
  score: number
  combo: number
  multiplier: number
  multiplierFill: number
  energy: number
  time: number
  accuracyPercent: number
  isInDanger: boolean
  streakTier: number
  streakFill: number
  starCharge: number
  isOverdrive: boolean
  /** Сколько секунд Fever осталось. */
  feverLeft: number
}

/** Большая надпись по центру: похвала или предупреждение. */
interface Banner {
  id: number
  text: string
  detail: string
  isWarning: boolean
}

/** Всплывающее число очков над дорожкой. */
interface Popup {
  id: number
  lane: number
  text: string
  type: LaneEvent['type']
}

interface GameResult {
  failed: boolean
  rank: string
  stars: number
  score: number
  bestScore: number
  isNewBest: boolean
  accuracyPercent: number
  maxCombo: number
  perfects: number
  goods: number
  misses: number
}

/** Палец или кнопка мыши на экране. */
interface ActiveTouch {
  lane: number
  startX: number
  startY: number
  /** Игровое время касания: на него засчитывается смахивание. */
  startTime: number | null
  hasSwiped: boolean
}

const EMPTY_HUD: Hud = {
  score: 0,
  combo: 0,
  multiplier: 1,
  multiplierFill: 0,
  energy: 1,
  time: 0,
  accuracyPercent: 100,
  isInDanger: false,
  streakTier: 0,
  streakFill: 0,
  starCharge: 0,
  isOverdrive: false,
  feverLeft: 0,
}
/** Сколько секунд держится подсказка про звёзды после первой звезды. */
const STAR_HINT_MS = 3500
const LANE_KEYS: Record<string, number> = { KeyA: 0, KeyS: 1, KeyD: 2, Digit1: 0, Digit2: 1, Digit3: 2 }
const NO_JUDGED = new Set<number>()
const NO_HOLDS = [null, null, null]
/** Если картинка разошлась со звуком на столько секунд, подтягиваем её. */
const VIDEO_MAX_DRIFT_SEC = 0.15
const LOW_ENERGY = 0.3
/** Цвет дорожек по силе части песни: тихое холоднее, мощное теплее. */
/** Сдвиг пальца, после которого касание считается смахиванием. */
const SWIPE_MIN_PX = 18
/** На сколько радиан поворачивается оттенок клипа от начала песни до конца. */
const COLOR_DRIFT_RADIANS = 2
const MAX_POPUPS = 6
/** Расстояние между дорожками на линии нажатия, в долях высоты экрана. */
const POPUP_LANE_STEP_VH = 31

const MUSIC_KEY = 'tyt-music-muted'

function loadMusicMuted(): boolean {
  try {
    return localStorage.getItem(MUSIC_KEY) === '1'
  } catch {
    return false
  }
}

function sectionColor(sections: Section[], time: number, palette: Palette): string {
  let strongCount = 0
  for (const section of sections) {
    const isStrong = section.level >= 0.7
    const isNow = time >= section.start && time < section.end
    if (isNow) {
      if (isStrong) return palette.strong[strongCount % palette.strong.length]
      return section.level < 0.35 ? palette.calm : palette.normal
    }
    if (isStrong) strongCount += 1
  }
  return palette.normal
}

function cssColor([red, green, blue]: [number, number, number]): string {
  return `rgb(${Math.round(red * 255)}, ${Math.round(green * 255)}, ${Math.round(blue * 255)})`
}

/** Палитра, которая сейчас в игре: выбранная игроком или угаданная по треку. */
function resolvePalette(choice: PaletteChoice, guessed: PaletteId | null): Palette {
  if (choice !== 'auto') return PALETTES[choice]
  return PALETTES[guessed ?? 'neon']
}

function loadBestScore(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0
  } catch {
    return 0 // в приватном режиме хранилище может быть недоступно
  }
}

function saveBestScore(key: string, score: number): void {
  try {
    localStorage.setItem(key, String(score))
  } catch {
    // рекорд просто не сохранится, игре это не мешает
  }
}

function popupText(event: LaneEvent, lang: Lang): string {
  if (event.type === 'miss') return TEXTS[lang].miss
  if (event.type === 'holdBroken') return TEXTS[lang].holdBroken
  if (event.kind === 'space') return `SPACE! +${event.points}`
  return `${event.kind === 'star' ? '★ ' : ''}+${event.points}`
}

function resultTitle(result: GameResult, lang: Lang): string {
  const text = TEXTS[lang]
  if (result.failed) return text.failed
  if (result.misses === 0) return text.fullCombo
  if (result.rank === 'S' || result.rank === 'A') return text.great
  return text.cleared
}

/** Партия без единого промаха и на все три звезды: за неё звенит последняя звезда и салют. */
function isFlawless(result: GameResult): boolean {
  return !result.failed && result.misses === 0 && result.stars === 3
}

/** Ползунок настройки с подписью и текущим значением справа. */
function Slider({
  label,
  value,
  min,
  max,
  step,
  shown,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  shown: string
  onChange: (value: number) => void
}) {
  return (
    <label className="slider">
      <span>
        {label} <output>{shown}</output>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

export function LanesApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const sceneRef = useRef<LaneScene | null>(null)
  const playerRef = useRef<AudioPlayer | null>(null)
  const gameRef = useRef<LaneGame | null>(null)
  const pressedLanesRef = useRef([false, false, false])
  const nextIdRef = useRef(1)
  const soundsRef = useRef<SoundEffects | null>(null)
  const musicRef = useRef<MenuMusic | null>(null)
  const lastMultiplierRef = useRef(1)
  /** Активные касания: на телефоне пальцев может быть несколько сразу. */
  const touchesRef = useRef(new Map<number, ActiveTouch>())
  const momentsRef = useRef<Moment[]>([])
  const sectionsRef = useRef<Section[]>([])
  const playedImpactsRef = useRef(new Set<Moment>())
  const eventHandlerRef = useRef<(event: LaneEvent | null) => void>(() => {})

  const [screen, setScreen] = useState<Screen>('splash')
  const [lang, setLang] = useState<Lang>(detectLang)
  const [isMusicMuted, setMusicMuted] = useState(loadMusicMuted)
  const [isSplashReady, setSplashReady] = useState(false)
  /** Меню разбито на страницы: на главной только то, что нужно перед каждой партией. */
  const [menuPage, setMenuPage] = useState<'main' | 'settings' | 'help'>('main')
  const [settingsTab, setSettingsTab] = useState<'look' | 'game'>('look')
  const text = TEXTS[lang]
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null)
  const [trackName, setTrackName] = useState('')
  const [clipName, setClipName] = useState('')
  const [clipUrl, setClipUrl] = useState('')
  const [status, setStatus] = useState('')
  const [hud, setHud] = useState<Hud>(EMPTY_HUD)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [popups, setPopups] = useState<Popup[]>([])
  const [lostMultiplier, setLostMultiplier] = useState<{ id: number; from: number } | null>(null)
  /** Подсказка про звёзды: показывается один раз за партию, на первой звезде. */
  const [isStarHintShown, setIsStarHintShown] = useState(false)
  const hasStarHintRef = useRef(false)
  const [feverBoost, setFeverBoost] = useState<{ id: number; seconds: number } | null>(null)
  /** Вспышки по центру, которые улетают в панель: начало Fever и новый множитель. */
  const [feverBurst, setFeverBurst] = useState<number | null>(null)
  const [multiplierBurst, setMultiplierBurst] = useState<{ id: number; value: number } | null>(null)
  const wasFeverRef = useRef(false)
  const [result, setResult] = useState<GameResult | null>(null)
  const [settings, setSettings] = useState<Settings>({
    difficulty: 'normal',
    palette: 'auto',
    approachSec: 1.6,
    volume: 0.8,
    effectsVolume: 0.5,
    colorDrift: true,
    offsetMs: 0,
    look: 'outline',
    clipBrightness: 0.55,
    clipFocus: 0.85,
    laneContrast: 0.75,
    autopilot: false,
  })
  // Угадывание палитры читает весь трек, поэтому считается один раз на трек
  const guessedPalette = useMemo(() => (analysis ? guessPalette(analysis) : null), [analysis])
  const guessedPaletteRef = useRef<PaletteId | null>(null)
  useEffect(() => {
    guessedPaletteRef.current = guessedPalette
  }, [guessedPalette])
  const activePalette = resolvePalette(settings.palette, guessedPalette)

  // Цикл анимации живёт вне React и читает свежие значения через ref
  const liveRef = useRef({ screen, analysis, settings, lang })
  useEffect(() => {
    liveRef.current = { screen, analysis, settings, lang }
  })

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  // Логотип успевает нарисоваться, и только потом появляется приглашение нажать
  useEffect(() => {
    const timer = window.setTimeout(() => setSplashReady(true), 1400)
    return () => window.clearTimeout(timer)
  }, [])

  // Музыка звучит только в меню: в игре своя песня, а в итогах звенят звёзды
  useEffect(() => {
    const music = musicRef.current
    if (!music) return
    if (screen === 'menu' && !isMusicMuted) music.start()
    else music.stop()
  }, [screen, isMusicMuted])

  const getPlayer = (): AudioPlayer => {
    if (!playerRef.current) {
      playerRef.current = new AudioPlayer(new AudioContext())
      soundsRef.current = new SoundEffects(playerRef.current.context)
      musicRef.current = new MenuMusic(playerRef.current.context)
    }
    return playerRef.current
  }

  const bestScoreKey = `triada-best:${trackName}:${settings.difficulty}`

  const finishGame = () => {
    const game = gameRef.current
    if (!game) return
    playerRef.current?.pause()
    videoRef.current?.pause()
    const previousBest = loadBestScore(bestScoreKey)
    const isNewBest = game.score > previousBest
    if (isNewBest) saveBestScore(bestScoreKey, game.score)
    setResult({
      failed: game.failed,
      rank: rank(game),
      stars: starRating(game),
      score: game.score,
      bestScore: Math.max(previousBest, game.score),
      isNewBest,
      accuracyPercent: Math.round(accuracy(game) * 100),
      maxCombo: game.maxCombo,
      perfects: game.perfects,
      goods: game.goods,
      misses: game.misses,
    })
    setScreen('results')
  }
  const finishRef = useRef(finishGame)
  useEffect(() => {
    finishRef.current = finishGame
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const scene = new LaneScene(canvas)
    sceneRef.current = scene
    const features = createEmptyFeatures()
    let frameId = 0
    let lastHudAt = 0

    const resize = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = canvas.clientWidth * scale
      canvas.height = canvas.clientHeight * scale
      scene.setSize(canvas.width, canvas.height)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    const showBanner = (text: string, detail: string, isWarning: boolean) => {
      nextIdRef.current += 1
      setBanner({ id: nextIdRef.current, text, detail, isWarning })
    }

    const handleEvent = (event: LaneEvent | null) => {
      if (!event) return
      const clockTime = performance.now() / 1000
      const sounds = soundsRef.current
      if (event.type === 'miss' || event.type === 'holdBroken') {
        scene.missEffect(event.lane)
        sounds?.miss()
      } else {
        scene.hitEffect(event.lane, event.type === 'perfect' || event.type === 'holdDone', clockTime)
        if (event.kind === 'space') {
          scene.spaceHitEffect(clockTime)
          sounds?.space()
        }
        if (event.type === 'holdDone') sounds?.holdDone()
        if (event.kind === 'swipe') {
          scene.launchArrow(event.lane, event.direction, clockTime)
          sounds?.arrow(event.direction)
        }
        if (event.kind === 'star') {
          scene.hitEffect(event.lane, true, clockTime) // второй залп искр делает звезду заметнее
          sounds?.star()
        }
      }

      const words = TEXTS[liveRef.current.lang]
      if (event.milestone) {
        showBanner(words.comboBanner(event.milestone), '', false)
        sounds?.milestone()
      }
      if (event.startedOverdrive) {
        nextIdRef.current += 1
        setFeverBurst(nextIdRef.current)
        sounds?.feverStart()
      }
      if (event.extendedOverdrive) {
        nextIdRef.current += 1
        setFeverBoost({ id: nextIdRef.current, seconds: Math.round((OVERDRIVE_SEC / STARS_FOR_OVERDRIVE) * 10) / 10 })
      }
      if (event.kind === 'star' && event.type !== 'miss' && !hasStarHintRef.current) {
        hasStarHintRef.current = true
        setIsStarHintShown(true)
        window.setTimeout(() => setIsStarHintShown(false), STAR_HINT_MS)
      }
      if (event.warning) {
        showBanner(words.warning, words.warningDetail(MISS_WARNING_STREAK), true)
        sounds?.warning()
      }

      const game = gameRef.current
      if (game) {
        const currentMultiplier = multiplier(game)
        if (currentMultiplier > lastMultiplierRef.current) {
          sounds?.multiplierUp(currentMultiplier)
          nextIdRef.current += 1
          setMultiplierBurst({ id: nextIdRef.current, value: currentMultiplier })
        }
        // Множитель сбит: игрок должен заметить потерю, иначе ошибка проходит незаметно
        if (currentMultiplier < lastMultiplierRef.current && lastMultiplierRef.current >= 2) {
          setLostMultiplier({ id: nextIdRef.current + 1, from: lastMultiplierRef.current })
        }
        lastMultiplierRef.current = currentMultiplier
      }

      nextIdRef.current += 1
      const popup: Popup = {
        id: nextIdRef.current,
        lane: event.lane,
        type: event.type,
        text: popupText(event, liveRef.current.lang),
      }
      setPopups((previous) => [...previous, popup].slice(-MAX_POPUPS))
    }
    eventHandlerRef.current = handleEvent

    /** Разгон, пауза и взрыв песни меняют сцену, даже если игрок ничего не нажимает. */
    const applyMoments = (time: number, clockTime: number) => {
      let tension = 0
      let stillness = 0
      for (const moment of momentsRef.current) {
        const isNow = time >= moment.start && time < moment.end
        if (moment.kind === 'buildup' && isNow) {
          tension = (time - moment.start) / (moment.end - moment.start)
        }
        if (moment.kind === 'pause' && isNow) stillness = 1
        if (moment.kind === 'impact' && time >= moment.start && !playedImpactsRef.current.has(moment)) {
          playedImpactsRef.current.add(moment)
          scene.impactEffect(clockTime)
          soundsRef.current?.impact()
        }
      }
      scene.setMood(tension, stillness)
    }

    const syncVideo = (time: number) => {
      const video = videoRef.current
      if (!video || !video.src) return
      // play() обрывается, если сразу поставить паузу: это нормально, игра не страдает
      if (video.paused) video.play().catch(() => {})
      if (Math.abs(video.currentTime - time) > VIDEO_MAX_DRIFT_SEC) video.currentTime = time
    }

    const drawFrame = () => {
      const clockTime = performance.now() / 1000
      const { screen: currentScreen, analysis: currentAnalysis, settings: current } = liveRef.current
      const game = gameRef.current
      const player = playerRef.current
      const isPlaying = currentScreen === 'playing' && game !== null && player !== null && currentAnalysis !== null
      let time = clockTime * 0.3

      if (isPlaying) {
        time = player.currentTime + current.offsetMs / 1000
        syncVideo(player.currentTime)
        if (current.autopilot) playAutopilot(game, time).forEach(handleEvent)
        stepLanes(game, time).forEach(handleEvent)
        sampleFeatures(currentAnalysis, time, features)
        soundsRef.current?.setVolume(current.effectsVolume)
        const songProgress = Math.min(1, time / currentAnalysis.duration)
        const palette = resolvePalette(current.palette, guessedPaletteRef.current)
        scene.setPalette(palette)
        const canDrift = current.colorDrift && palette.allowsDrift
        scene.setHueShift(canDrift ? songProgress * COLOR_DRIFT_RADIANS : 0)
        applyMoments(time, clockTime)
        scene.setTrackColor(sectionColor(sectionsRef.current, time, palette))
        // Конец Fever слышен: иначе бонус пропадает незаметно
        const isFever = isOverdrive(game, time)
        if (wasFeverRef.current && !isFever) soundsRef.current?.feverEnd()
        wasFeverRef.current = isFever
        // Сила серии растёт с уровнем, а не с каждой нотой: так шаги заметны
        const tierCount = STREAK_TIERS.length - 1
        scene.setStreak((streakTier(game.combo) + streakProgress(game.combo) * 0.5) / tierCount, isOverdrive(game, time))

        const now = performance.now()
        if (now - lastHudAt > 80) {
          lastHudAt = now
          const hasJudgedNotes = game.perfects + game.goods + game.misses > 0
          setHud({
            score: game.score,
            combo: game.combo,
            multiplier: multiplier(game),
            multiplierFill: multiplierProgress(game),
            energy: game.energy,
            time,
            accuracyPercent: hasJudgedNotes ? Math.round(accuracy(game) * 100) : 100,
            isInDanger: game.energy < LOW_ENERGY || game.missStreak >= MISS_WARNING_STREAK,
            streakTier: streakTier(game.combo),
            streakFill: streakProgress(game.combo),
            starCharge: game.starCharge,
            isOverdrive: isOverdrive(game, time),
            feverLeft: Math.max(0, game.overdriveUntil - time),
          })
        }
        if (game.failed || !player.isPlaying) finishRef.current()
      } else if (currentScreen === 'menu' || currentScreen === 'splash') {
        // Фон меню качается в такт его музыке, а без музыки просто дышит
        const pulse = musicRef.current?.pulse() ?? 0
        features.time = time
        features.energy = time * 0.3
        features.bass = 0.3 + 0.15 * Math.sin(clockTime * 1.5) + pulse * 0.35
        features.beatPulse = pulse
        scene.setHueShift(0)
      }

      if (!isPlaying) {
        const palette = resolvePalette(current.palette, guessedPaletteRef.current)
        scene.setPalette(palette)
        scene.setTrackColor(palette.normal)
        scene.setMood(0, 0)
        scene.setStreak(0, false)
      }
      scene.setClipOptions(current.look, current.clipBrightness, current.laneContrast, current.clipFocus)
      const inMenu = currentScreen === 'menu' || currentScreen === 'splash'
      scene.render(
        features,
        videoRef.current,
        game && !inMenu ? game.notes : [],
        game ? game.firstNote : 0,
        game ? game.judged : NO_JUDGED,
        pressedLanesRef.current,
        current.approachSec,
        clockTime,
        game ? multiplier(game) : 1,
        !inMenu,
        game && !inMenu ? game.holds.map((hold) => (hold ? hold.note : null)) : NO_HOLDS,
      )
      frameId = requestAnimationFrame(drawFrame)
    }
    frameId = requestAnimationFrame(drawFrame)

    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
      scene.dispose()
      sceneRef.current = null
    }
  }, [])

  const togglePause = () => {
    const player = playerRef.current
    if (screen === 'playing') {
      player?.pause()
      videoRef.current?.pause()
      setScreen('paused')
    } else if (screen === 'paused') {
      void player?.play()
      setScreen('playing')
    }
  }
  const pauseRef = useRef(togglePause)
  useEffect(() => {
    pauseRef.current = togglePause
  })

  /** Текущее игровое время, если сейчас идёт партия. */
  const playingTime = (): number | null => {
    const player = playerRef.current
    const { screen: currentScreen, settings: current } = liveRef.current
    if (!player || !gameRef.current || currentScreen !== 'playing') return null
    return player.currentTime + current.offsetMs / 1000
  }

  const handlersRef = useRef({
    lane(lane: number) {
      const time = playingTime()
      const game = gameRef.current
      sceneRef.current?.pressEffect(lane)
      if (time !== null && game) eventHandlerRef.current(pressLane(game, time, lane))
    },
    /** at — игровое время, на которое засчитать смахивание, если оно известно заранее. */
    swipe(direction: number | null, at?: number) {
      const time = at ?? playingTime()
      const game = gameRef.current
      if (time !== null && game) eventHandlerRef.current(pressSwipe(game, time, direction))
    },
    space() {
      const time = playingTime()
      const game = gameRef.current
      sceneRef.current?.spacePressEffect()
      if (time !== null && game) eventHandlerRef.current(pressSpace(game, time))
    },
    release(lane: number) {
      const time = playingTime()
      const game = gameRef.current
      if (time !== null && game) eventHandlerRef.current(releaseLane(game, time, lane))
    },
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') pauseRef.current()
      if (liveRef.current.screen !== 'playing' || event.repeat) return

      const lane = LANE_KEYS[event.code]
      if (lane !== undefined) {
        pressedLanesRef.current[lane] = true
        handlersRef.current.lane(lane)
      }
      if (event.code === 'ArrowLeft') handlersRef.current.swipe(-1)
      if (event.code === 'ArrowRight') handlersRef.current.swipe(1)
      if (event.code === 'ArrowUp') {
        event.preventDefault() // иначе страница прокрутится
        handlersRef.current.swipe(0)
      }
      if (event.code === 'Space') {
        event.preventDefault() // иначе пробел нажмёт кнопку, на которой фокус
        handlersRef.current.space()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      const lane = LANE_KEYS[event.code]
      if (lane !== undefined) {
        pressedLanesRef.current[lane] = false
        handlersRef.current.release(lane)
      }
    }
    const onVisibilityChange = () => {
      if (document.hidden && liveRef.current.screen === 'playing') pauseRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  /** Клик или касание нажимает дорожку под пальцем. */
  const handlePointerDown = (event: PointerEvent) => {
    const canvas = canvasRef.current
    const scene = sceneRef.current
    if (!canvas || !scene || screen !== 'playing') return
    const box = canvas.getBoundingClientRect()
    // На телефоне нет пробела: пока плашка SPACE подлетает к чашам или ждёт на них,
    // её берёт касание в любом месте экрана. Генератор не ставит обычных нот рядом
    // с пробелом, поэтому касание не спутать с нотой на дорожке
    const time = playingTime()
    const isSpaceNow = time !== null && gameRef.current !== null && isSpaceDue(gameRef.current, time)
    if (event.pointerType === 'touch' && isSpaceNow) {
      handlersRef.current.space()
      return
    }
    const x = (event.clientX - (box.left + box.width / 2)) / (box.height / 2)
    const lane = scene.laneAt(x)
    touchesRef.current.set(event.pointerId, {
      lane,
      startX: event.clientX,
      startY: event.clientY,
      startTime: time,
      hasSwiped: false,
    })
    pressedLanesRef.current[lane] = true
    handlersRef.current.lane(lane)
  }

  /**
   * Смахивание отбивает стрелку: на телефоне нет клавиш ← ↑ →. Пальцем смахивают
   * в любую сторону, а засчитывается оно на момент касания: сам жест занимает
   * десятую долю секунды, и без этого стрелка всегда шла бы с опозданием.
   */
  const handlePointerMove = (event: PointerEvent) => {
    const touch = touchesRef.current.get(event.pointerId)
    if (!touch || touch.hasSwiped) return
    const sideways = event.clientX - touch.startX
    const vertical = touch.startY - event.clientY
    if (Math.hypot(sideways, vertical) < SWIPE_MIN_PX) return
    touch.hasSwiped = true
    if (event.pointerType === 'touch') {
      handlersRef.current.swipe(null, touch.startTime ?? undefined)
      return
    }
    handlersRef.current.swipe(vertical > Math.abs(sideways) ? 0 : Math.sign(sideways))
  }

  const handlePointerUp = (event: PointerEvent) => {
    const touch = touchesRef.current.get(event.pointerId)
    if (!touch) return
    touchesRef.current.delete(event.pointerId)

    // Дорожка остаётся нажатой, пока на ней есть другой палец
    let isStillHeld = false
    for (const other of touchesRef.current.values()) {
      if (other.lane === touch.lane) isStillHeld = true
    }
    if (isStillHeld) return
    pressedLanesRef.current[touch.lane] = false
    handlersRef.current.release(touch.lane)
  }

  const attachClip = (file: File) => {
    void readMediaDuration(file).then((duration) => {
      if (duration !== null && duration > MAX_MEDIA_SEC) {
        setStatus(text.tooLong)
        return
      }
      showClip(file)
    })
  }

  const showClip = (file: File) => {
    if (clipUrl) URL.revokeObjectURL(clipUrl)
    setClipUrl(URL.createObjectURL(file))
    setClipName(file.name)
  }

  // Новый адрес клипа становится текстурой, когда браузер загрузил первый кадр
  useEffect(() => {
    const video = videoRef.current
    if (!video || !clipUrl) return
    const connect = () => sceneRef.current?.setVideo(video)
    video.addEventListener('loadeddata', connect)
    return () => video.removeEventListener('loadeddata', connect)
  }, [clipUrl])

  /** Новый трек начинается без фона: иначе песня играла бы на прошлом клипе. */
  const clearClip = () => {
    if (clipUrl) URL.revokeObjectURL(clipUrl)
    setClipUrl('')
    setClipName('')
    sceneRef.current?.setVideo(null)
    const video = videoRef.current
    if (video) {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }

  const loadBuffer = async (buffer: AudioBuffer, name: string) => {
    getPlayer().load(buffer)
    setAnalysis(null)
    setTrackName(name)
    setStatus(text.building)
    const analysisResult = await runAnalysisInWorker(audioBufferToMono(buffer), buffer.sampleRate, (fraction) =>
      setStatus(`${text.building} ${Math.round(fraction * 100)}%`),
    )
    momentsRef.current = findMoments(analysisResult)
    sectionsRef.current = findSections(analysisResult, songIntensity(analysisResult))
    setAnalysis(analysisResult)
    setStatus('')
  }

  const handleTrackFile = async (file: File) => {
    setStatus(text.reading)
    try {
      // Длину проверяем до декодирования: распаковка часового файла сама заняла бы минуты
      const declared = await readMediaDuration(file)
      if (declared !== null && declared > MAX_MEDIA_SEC) {
        setStatus(text.tooLong)
        return
      }
      const buffer = await decodeAudioFile(file, getPlayer().context)
      if (buffer.duration > MAX_MEDIA_SEC) {
        setStatus(text.tooLong)
        return
      }
      clearClip()
      await loadBuffer(buffer, file.name)
      if (file.type.startsWith('video/')) showClip(file) // клип сразу и звук, и картинка
    } catch (error) {
      console.error(error)
      setStatus(text.readError)
    }
  }

  const startGame = () => {
    const player = playerRef.current
    if (!analysis || !player) return
    const difficulty = findDifficulty(settings.difficulty)
    gameRef.current = createLaneGame(generateLaneLevel(analysis, difficulty), difficulty)
    lastMultiplierRef.current = 1
    playedImpactsRef.current = new Set()
    setHud(EMPTY_HUD)
    setBanner(null)
    setPopups([])
    setFeverBoost(null)
    setFeverBurst(null)
    setMultiplierBurst(null)
    wasFeverRef.current = false
    setIsStarHintShown(false)
    hasStarHintRef.current = false
    player.setVolume(settings.volume)
    player.seek(0)
    if (videoRef.current && clipUrl) videoRef.current.currentTime = 0
    void player.play()
    setScreen('playing')
  }

  const update = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch })

  /** Первое касание: браузер разрешает звук только после него, поэтому музыка стартует здесь. */
  const leaveSplash = () => {
    if (!isSplashReady) return
    const player = getPlayer()
    void player.context.resume()
    if (!isMusicMuted) musicRef.current?.start()
    setScreen('menu')
  }

  const switchLang = (next: Lang) => {
    setLang(next)
    saveLang(next)
  }

  const toggleMusic = () => {
    const next = !isMusicMuted
    setMusicMuted(next)
    try {
      localStorage.setItem(MUSIC_KEY, next ? '1' : '0')
    } catch {
      // выбор просто не запомнится
    }
  }

  const corner = (
    <div className="corner-controls" onPointerDown={(event) => event.stopPropagation()}>
      <div className="lang-switch" role="group" aria-label="Language">
        {(['ru', 'en'] as const).map((code) => (
          <button key={code} className={code === lang ? 'is-active' : ''} onClick={() => switchLang(code)}>
            {code.toUpperCase()}
          </button>
        ))}
      </div>
      {screen === 'menu' && (
        <button
          className={`music-toggle ${isMusicMuted ? 'is-muted' : ''}`}
          onClick={toggleMusic}
          aria-label={isMusicMuted ? text.musicOff : text.musicOn}
          title={isMusicMuted ? text.musicOff : text.musicOn}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
            {isMusicMuted ? (
              <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
            )}
          </svg>
        </button>
      )}
    </div>
  )
  const duration = analysis?.duration ?? 0
  const trackProgress = duration > 0 ? Math.min(1, hud.time / duration) : 0

  return (
    <div
      className="game"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <canvas className="game-canvas" ref={canvasRef} />
      {/* Звук идёт через Web Audio, а видео только даёт кадры, поэтому оно без звука */}
      <video ref={videoRef} src={clipUrl || undefined} muted playsInline preload="auto" hidden />

      {(screen === 'playing' || screen === 'paused') && (
        <div
          className={`hud tier-${hud.multiplier} streak-${hud.streakTier} ${hud.isInDanger ? 'is-danger' : ''} ${
            hud.isOverdrive ? 'is-overdrive' : ''
          }`}
          style={
            {
              '--tier': activePalette.tiers[hud.multiplier - 1],
              '--level': hud.multiplier,
              '--overdrive': cssColor(activePalette.overdrive),
              '--special': activePalette.special,
              '--accent': activePalette.tap,
              '--energy': activePalette.normal,
            } as CSSProperties
          }
        >
          <div className="score-bar">
            <strong className="score-value">{hud.score.toLocaleString(text.locale)}</strong>
            <div className="track-progress">
              <div style={{ width: `${trackProgress * 100}%` }} />
            </div>
            <span className="score-time">
              {formatTime(hud.time)} / {formatTime(duration)}
            </span>
            {/* Пока идёт Fever, у счёта видно, почему очки растут быстрее */}
            {hud.isOverdrive && <span className="fever-badge">×2 {text.fever}</span>}
            {hud.streakTier > 0 && (
              <div className="streak-meter" key={hud.streakTier}>
                <strong>{text.streak(STREAK_TIERS[hud.streakTier].from)}</strong>
                <div className="streak-bar">
                  <div style={{ width: `${hud.streakFill * 100}%` }} />
                </div>
              </div>
            )}
          </div>

          <div className="side-pill side-left">
            {lostMultiplier && (
              <span className="multiplier-lost" key={lostMultiplier.id}>
                −×{lostMultiplier.from}
              </span>
            )}
            {/* key заново запускает анимацию на каждой ноте */}
            <strong className="pill-main" key={`multiplier-${hud.multiplier}`}>
              ×{hud.multiplier}
            </strong>
            <span className="pill-note" key={`combo-${hud.combo}`}>
              {hud.combo} {text.combo}
            </span>
            <div className="multiplier-bar">
              <div style={{ width: `${hud.multiplierFill * 100}%` }} />
            </div>
            {/* Три деления звёзд; полная шкала становится таймером Fever и убывает */}
            {hud.isOverdrive ? (
              <div className="star-meter is-fever" aria-label={text.fever}>
                <div className="fever-fill" style={{ width: `${Math.min(1, hud.feverLeft / OVERDRIVE_SEC) * 100}%` }} />
                <span>
                  {text.fever} {Math.ceil(hud.feverLeft)}
                  {text.seconds}
                </span>
              </div>
            ) : (
              <div className="star-meter" aria-label={text.starsToFever(hud.starCharge, STARS_FOR_OVERDRIVE)}>
                {Array.from({ length: STARS_FOR_OVERDRIVE }, (_, index) => (
                  <span key={index} className={index < hud.starCharge ? 'is-earned' : ''}>
                    ★
                  </span>
                ))}
              </div>
            )}
            {feverBoost && (
              <span className="fever-boost" key={feverBoost.id} onAnimationEnd={() => setFeverBoost(null)}>
                {text.feverExtended(feverBoost.seconds)}
              </span>
            )}
            {isStarHintShown && <div className="star-hint">{text.starHint}</div>}
          </div>

          <div className="side-pill side-right">
            <strong className="pill-main">{hud.accuracyPercent}%</strong>
            <span className="pill-note">{text.energy}</span>
            <div className="multiplier-bar energy-bar">
              <div style={{ width: `${hud.energy * 100}%` }} />
            </div>
          </div>

          {feverBurst !== null && (
            <div
              className="fever-burst"
              key={feverBurst}
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) setFeverBurst(null)
              }}
            >
              <div className="fever-flash" />
              <div className="fever-stars">
                {[-1, 0, 1].map((side) => (
                  <span key={side} style={{ '--side': side } as CSSProperties}>
                    ★
                  </span>
                ))}
              </div>
              <strong>{text.fever}</strong>
              <small>{text.feverDetail}</small>
            </div>
          )}

          {multiplierBurst && (
            <div
              className="multiplier-burst"
              key={multiplierBurst.id}
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) setMultiplierBurst(null)
              }}
            >
              ×{multiplierBurst.value}
            </div>
          )}

          {banner && (
            <div className={`banner ${banner.isWarning ? 'is-warning' : ''}`} key={banner.id}>
              <strong>{banner.text}</strong>
              <span>{banner.detail}</span>
            </div>
          )}

          {popups.map((popup) => (
            <span
              key={popup.id}
              className={`score-popup is-${popup.type}`}
              style={{ left: `calc(50% + ${(popup.lane - 1) * POPUP_LANE_STEP_VH}vh)` }}
              onAnimationEnd={() => setPopups((previous) => previous.filter((item) => item.id !== popup.id))}
            >
              {popup.text}
            </span>
          ))}

          <div className="hud-hint">{text.hint}</div>
        </div>
      )}

      {(screen === 'splash' || screen === 'menu') && corner}

      {screen === 'splash' && (
        <div className="splash" onClick={leaveSplash} data-testid="splash">
          <Logo className="splash-logo" />
          <h1 className="wordmark">TAP YOUR TRACK</h1>
          <p className={`splash-hint ${isSplashReady ? 'is-ready' : ''}`}>{isSplashReady ? text.tapToStart : text.loading}</p>
        </div>
      )}

      {screen === 'menu' && menuPage === 'main' && (
        <main className="menu menu-main">
          <header>
            <Logo className="menu-logo" />
            <h1 className="wordmark">TAP YOUR TRACK</h1>
            <p>{text.tagline}</p>
          </header>

          <label className="big-button file-button">
            <input
              type="file"
              accept="audio/*,video/*,.mp3,.wav,.ogg,.mp4,.webm"
              data-testid="track-input"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void handleTrackFile(file)
                event.target.value = ''
              }}
            />
            <strong>{trackName ? text.changeTrack : text.loadTrackShort}</strong>
            <small>{text.loadTrackHint}</small>
          </label>
          <p className="track-name" data-testid="track-status">
            {status || trackName || text.privacy}
            {clipName && !status ? ` · ${text.clip}: ${clipName}` : ''}
          </p>
          {!trackName && !status && (
            <button
              className="text-button"
              onClick={() => {
                clearClip()
                // Синтез демо занимает около секунды: сначала показываем, что идёт работа
                setStatus(text.building)
                window.setTimeout(() => void loadBuffer(createDemoBuffer(getPlayer().context), text.demoName), 30)
              }}
            >
              {text.demoTrack}
            </button>
          )}

          <div className="segmented difficulty-list" role="group" aria-label={text.difficulty}>
            {DIFFICULTIES.map((difficulty) => (
              <button
                key={difficulty.id}
                className={difficulty.id === settings.difficulty ? 'is-active' : ''}
                onClick={() => update({ difficulty: difficulty.id })}
              >
                {text.difficulties[difficulty.id]}
              </button>
            ))}
          </div>

          <button className="start-button" disabled={!analysis} onClick={startGame}>
            {text.start}
          </button>

          <nav className="menu-links">
            <button className="nav-button" onClick={() => setMenuPage('settings')}>
              {text.settings}
            </button>
            <button className="nav-button" onClick={() => setMenuPage('help')}>
              {text.howToPlay}
            </button>
          </nav>
        </main>
      )}

      {screen === 'menu' && menuPage === 'settings' && (
        <main className="menu menu-page">
          <div className="page-head">
            <button className="back-button" onClick={() => setMenuPage('main')}>
              ← {text.back}
            </button>
            <h2>{text.settings}</h2>
          </div>

          <div className="tabs" role="tablist">
            {(['look', 'game'] as const).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={settingsTab === tab}
                className={settingsTab === tab ? 'is-active' : ''}
                onClick={() => setSettingsTab(tab)}
              >
                {tab === 'look' ? text.tabLook : text.tabGame}
              </button>
            ))}
          </div>

          {settingsTab === 'look' && (
            <section className="menu-card">
              <h3>{text.paletteLabel}</h3>
              <div className="segmented palette-list" aria-label={text.paletteLabel}>
                {PALETTE_CHOICES.map((choice) => (
                  <button
                    key={choice.id}
                    className={choice.id === settings.palette ? 'is-active' : ''}
                    onClick={() => update({ palette: choice.id })}
                  >
                    {choice.id !== 'auto' && <i className="swatch" style={{ background: PALETTES[choice.id].normal }} />}
                    {text.palettes[choice.id]}
                  </button>
                ))}
              </div>
              <p className="focus-hint">
                {settings.palette === 'auto'
                  ? guessedPalette
                    ? text.paletteGuessed(text.palettes[guessedPalette])
                    : text.paletteWaiting
                  : text.paletteManual}
              </p>

              <h3>{text.clipLook}</h3>
              <div className="segmented look-list">
                {CLIP_LOOKS.map((look) => (
                  <button
                    key={look.id}
                    className={look.id === settings.look ? 'is-active' : ''}
                    onClick={() => update({ look: look.id })}
                  >
                    {text.looks[look.id]}
                  </button>
                ))}
              </div>
              <label className="file-button is-secondary">
                <input
                  type="file"
                  accept="video/*,.mp4,.webm"
                  data-testid="clip-input"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) attachClip(file)
                    event.target.value = ''
                  }}
                />
                {text.addClip}
              </label>
              <Slider
                label={text.clipBrightness}
                value={settings.clipBrightness}
                min={0.2}
                max={1}
                step={0.05}
                shown={`${Math.round(settings.clipBrightness * 100)}%`}
                onChange={(clipBrightness) => update({ clipBrightness })}
              />
              <Slider
                label={text.clipFocus}
                value={settings.clipFocus}
                min={0}
                max={1}
                step={0.05}
                shown={`${Math.round(settings.clipFocus * 100)}%`}
                onChange={(clipFocus) => update({ clipFocus })}
              />
              <Slider
                label={text.laneContrast}
                value={settings.laneContrast}
                min={0}
                max={1}
                step={0.05}
                shown={`${Math.round(settings.laneContrast * 100)}%`}
                onChange={(laneContrast) => update({ laneContrast })}
              />
              <label className="toggle">
                <input
                  type="checkbox"
                  data-testid="color-drift"
                  checked={settings.colorDrift}
                  onChange={(event) => update({ colorDrift: event.target.checked })}
                />
                {text.colorDrift}
              </label>
            </section>
          )}

          {settingsTab === 'game' && (
            <section className="menu-card">
              <Slider
                label={text.noteSpeed}
                value={settings.approachSec}
                min={0.8}
                max={2.6}
                step={0.1}
                shown={`${settings.approachSec.toFixed(1)} ${text.seconds}`}
                onChange={(approachSec) => update({ approachSec })}
              />
              <Slider
                label={text.volume}
                value={settings.volume}
                min={0}
                max={1}
                step={0.05}
                shown={`${Math.round(settings.volume * 100)}%`}
                onChange={(volume) => update({ volume })}
              />
              <Slider
                label={text.effects}
                value={settings.effectsVolume}
                min={0}
                max={1}
                step={0.05}
                shown={`${Math.round(settings.effectsVolume * 100)}%`}
                onChange={(effectsVolume) => update({ effectsVolume })}
              />
              <Slider
                label={text.offset}
                value={settings.offsetMs}
                min={-200}
                max={200}
                step={10}
                shown={`${settings.offsetMs} ${text.ms}`}
                onChange={(offsetMs) => update({ offsetMs })}
              />
              <label className="toggle">
                <input
                  type="checkbox"
                  data-testid="autopilot"
                  checked={settings.autopilot}
                  onChange={(event) => update({ autopilot: event.target.checked })}
                />
                {text.autopilot}
              </label>
            </section>
          )}
        </main>
      )}

      {screen === 'menu' && menuPage === 'help' && (
        <main className="menu menu-page">
          <div className="page-head">
            <button className="back-button" onClick={() => setMenuPage('main')}>
              ← {text.back}
            </button>
            <h2>{text.howToPlay}</h2>
          </div>
          <ul className="menu-card legend">
            {text.legend.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </main>
      )}

      {screen === 'paused' && (
        <div className="overlay">
          <h2>{text.pause}</h2>
          <button className="start-button" onClick={togglePause}>
            {text.resume}
          </button>
          <button className="text-button" onClick={startGame}>
            {text.restart}
          </button>
          <button className="text-button" onClick={() => setScreen('menu')}>
            {text.toMenu}
          </button>
        </div>
      )}

      {screen === 'results' && result && (
        <div className="overlay" data-testid="results">
          <h2>{resultTitle(result, lang)}</h2>
          <ResultStars
            stars={result.stars}
            isFlawless={isFlawless(result)}
            sounds={soundsRef}
            label={text.starsOf(result.stars)}
          />
          {result.isNewBest && <div className="new-best">{text.newBest}</div>}
          <dl className="stats">
            <div>
              <dt>{text.score}</dt>
              <dd>{result.score.toLocaleString(text.locale)}</dd>
            </div>
            <div>
              <dt>{text.best}</dt>
              <dd>{result.bestScore.toLocaleString(text.locale)}</dd>
            </div>
            <div>
              <dt>{text.accuracyTitle}</dt>
              <dd>{result.accuracyPercent}%</dd>
            </div>
            <div>
              <dt>{text.maxCombo}</dt>
              <dd>{result.maxCombo}</dd>
            </div>
            <div>
              <dt>{text.perfectGood}</dt>
              <dd>
                {result.perfects} / {result.goods}
              </dd>
            </div>
            <div>
              <dt>{text.misses}</dt>
              <dd>{result.misses}</dd>
            </div>
          </dl>
          <button className="start-button" onClick={startGame}>
            {text.again}
          </button>
          <button className="text-button" onClick={() => setScreen('menu')}>
            {text.toMenu}
          </button>
        </div>
      )}
    </div>
  )
}
