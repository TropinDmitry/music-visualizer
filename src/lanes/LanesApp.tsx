import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { AudioAnalysis } from '../audio/analyzer.ts'
import { AudioPlayer } from '../audio/AudioPlayer.ts'
import { createEmptyFeatures, sampleFeatures } from '../audio/frameFeatures.ts'
import { audioBufferToMono, createDemoBuffer, decodeAudioFile } from '../audio/loadAudio.ts'
import { runAnalysisInWorker } from '../audio/runAnalysis.ts'
import { formatTime } from '../formatting.ts'
import { CLIP_LOOKS, LaneScene, type ClipLook } from './LaneScene.ts'
import { DIFFICULTIES, findDifficulty, generateLaneLevel, type DifficultyId } from './level.ts'
import { SoundEffects } from './sounds.ts'
import { findMoments, type Moment } from './structure.ts'
import {
  accuracy,
  createLaneGame,
  MISS_WARNING_STREAK,
  multiplier,
  multiplierProgress,
  playAutopilot,
  pressLane,
  pressSwipe,
  rank,
  releaseLane,
  starRating,
  stepLanes,
  type LaneEvent,
  type LaneGame,
} from './rules.ts'

type Screen = 'menu' | 'playing' | 'paused' | 'results'

interface Settings {
  difficulty: DifficultyId
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
}
const LANE_KEYS: Record<string, number> = { KeyA: 0, KeyS: 1, KeyD: 2, Digit1: 0, Digit2: 1, Digit3: 2 }
const NO_JUDGED = new Set<number>()
const NO_HOLDS = [null, null, null]
/** Если картинка разошлась со звуком на столько секунд, подтягиваем её. */
const VIDEO_MAX_DRIFT_SEC = 0.15
const LOW_ENERGY = 0.3
/** Сдвиг пальца, после которого касание считается смахиванием. */
const SWIPE_MIN_PX = 35
/** На сколько радиан поворачивается оттенок клипа от начала песни до конца. */
const COLOR_DRIFT_RADIANS = 2
const MAX_POPUPS = 6
/** Расстояние между дорожками на линии нажатия, в долях высоты экрана. */
const POPUP_LANE_STEP_VH = 31

const PRAISE: Record<number, string> = {
  10: 'РАЗОГРЕВ',
  25: 'ОТЛИЧНО!',
  50: 'НЕУДЕРЖИМО!',
  75: 'В ПОТОКЕ!',
  100: 'ЛЕГЕНДА!',
  150: 'БЕЗ ЕДИНОЙ ОШИБКИ?',
  200: 'ВЫ МАШИНА!',
  300: 'ЗА ГРАНЬЮ!',
  500: 'АБСОЛЮТ!',
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

function popupText(event: LaneEvent): string {
  if (event.type === 'miss') return 'мимо'
  if (event.type === 'holdBroken') return 'луч оборван'
  return `${event.kind === 'star' ? '★ ' : ''}+${event.points}`
}

function resultTitle(result: GameResult): string {
  if (result.failed) return 'Энергия закончилась'
  if (result.misses === 0) return 'Без единого промаха!'
  if (result.rank === 'S' || result.rank === 'A') return 'Отличная партия'
  return 'Трек пройден'
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
  const lastMultiplierRef = useRef(1)
  /** Активные касания: на телефоне пальцев может быть несколько сразу. */
  const touchesRef = useRef(new Map<number, ActiveTouch>())
  const momentsRef = useRef<Moment[]>([])
  const playedImpactsRef = useRef(new Set<Moment>())
  const eventHandlerRef = useRef<(event: LaneEvent | null) => void>(() => {})

  const [screen, setScreen] = useState<Screen>('menu')
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null)
  const [trackName, setTrackName] = useState('')
  const [clipName, setClipName] = useState('')
  const [clipUrl, setClipUrl] = useState('')
  const [status, setStatus] = useState('')
  const [hud, setHud] = useState<Hud>(EMPTY_HUD)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [popups, setPopups] = useState<Popup[]>([])
  const [result, setResult] = useState<GameResult | null>(null)
  const [settings, setSettings] = useState<Settings>({
    difficulty: 'normal',
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

  // Цикл анимации живёт вне React и читает свежие значения через ref
  const liveRef = useRef({ screen, analysis, settings })
  useEffect(() => {
    liveRef.current = { screen, analysis, settings }
  })

  const getPlayer = (): AudioPlayer => {
    if (!playerRef.current) {
      playerRef.current = new AudioPlayer(new AudioContext())
      soundsRef.current = new SoundEffects(playerRef.current.context)
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

      if (event.milestone) {
        showBanner(PRAISE[event.milestone], `${event.milestone} подряд`, false)
        sounds?.milestone()
      }
      if (event.warning) {
        showBanner('СОБЕРИТЕСЬ!', `${MISS_WARNING_STREAK} промаха подряд`, true)
        sounds?.warning()
      }

      const game = gameRef.current
      if (game) {
        const currentMultiplier = multiplier(game)
        if (currentMultiplier > lastMultiplierRef.current) sounds?.multiplierUp(currentMultiplier)
        lastMultiplierRef.current = currentMultiplier
      }

      nextIdRef.current += 1
      const popup: Popup = {
        id: nextIdRef.current,
        lane: event.lane,
        type: event.type,
        text: popupText(event),
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
        scene.setHueShift(current.colorDrift ? songProgress * COLOR_DRIFT_RADIANS : 0)
        applyMoments(time, clockTime)

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
          })
        }
        if (game.failed || !player.isPlaying) finishRef.current()
      } else if (currentScreen === 'menu') {
        features.time = time
        features.energy = time * 0.3
        features.bass = 0.3 + 0.15 * Math.sin(clockTime * 1.5)
        features.beatPulse = 0
        scene.setHueShift(0)
      }

      if (!isPlaying) scene.setMood(0, 0)
      scene.setClipOptions(current.look, current.clipBrightness, current.laneContrast, current.clipFocus)
      const inMenu = currentScreen === 'menu'
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
    swipe(direction: number) {
      const time = playingTime()
      const game = gameRef.current
      if (time !== null && game) eventHandlerRef.current(pressSwipe(game, time, direction))
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
    const x = (event.clientX - (box.left + box.width / 2)) / (box.height / 2)
    const lane = scene.laneAt(x)
    touchesRef.current.set(event.pointerId, { lane, startX: event.clientX, hasSwiped: false })
    pressedLanesRef.current[lane] = true
    handlersRef.current.lane(lane)
  }

  /** Смахивание в сторону отбивает стрелку: на телефоне нет клавиш ← и →. */
  const handlePointerMove = (event: PointerEvent) => {
    const touch = touchesRef.current.get(event.pointerId)
    if (!touch || touch.hasSwiped) return
    const distance = event.clientX - touch.startX
    if (Math.abs(distance) < SWIPE_MIN_PX) return
    touch.hasSwiped = true
    handlersRef.current.swipe(Math.sign(distance))
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

  const loadBuffer = async (buffer: AudioBuffer, name: string) => {
    getPlayer().load(buffer)
    setAnalysis(null)
    setTrackName(name)
    setStatus('Строим уровень…')
    const analysisResult = await runAnalysisInWorker(audioBufferToMono(buffer), buffer.sampleRate, (fraction) =>
      setStatus(`Строим уровень… ${Math.round(fraction * 100)}%`),
    )
    momentsRef.current = findMoments(analysisResult)
    setAnalysis(analysisResult)
    setStatus('')
  }

  const handleTrackFile = async (file: File) => {
    setStatus('Читаем файл…')
    try {
      await loadBuffer(await decodeAudioFile(file, getPlayer().context), file.name)
      if (file.type.startsWith('video/')) attachClip(file) // клип сразу и звук, и картинка
    } catch (error) {
      console.error(error)
      setStatus('Не удалось прочитать звук из файла. Попробуйте mp3, wav, ogg или mp4.')
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
    player.setVolume(settings.volume)
    player.seek(0)
    if (videoRef.current && clipUrl) videoRef.current.currentTime = 0
    void player.play()
    setScreen('playing')
  }

  const update = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch })
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
        <div className={`hud tier-${hud.multiplier} ${hud.isInDanger ? 'is-danger' : ''}`}>
          <div className="score-bar">
            <strong className="score-value">{hud.score.toLocaleString('ru-RU')}</strong>
            <div className="track-progress">
              <div style={{ width: `${trackProgress * 100}%` }} />
            </div>
            <span className="score-time">
              {formatTime(hud.time)} / {formatTime(duration)}
            </span>
          </div>

          <div className="side-pill side-left">
            {/* key заново запускает анимацию на каждой ноте */}
            <strong className="pill-main" key={`multiplier-${hud.multiplier}`}>
              ×{hud.multiplier}
            </strong>
            <span className="pill-note" key={`combo-${hud.combo}`}>
              {hud.combo} подряд
            </span>
            <div className="multiplier-bar">
              <div style={{ width: `${hud.multiplierFill * 100}%` }} />
            </div>
          </div>

          <div className="side-pill side-right">
            <strong className="pill-main">{hud.accuracyPercent}%</strong>
            <span className="pill-note">энергия</span>
            <div className="multiplier-bar energy-bar">
              <div style={{ width: `${hud.energy * 100}%` }} />
            </div>
          </div>

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

          <div className="hud-hint">A S D или нажатие на дорожку · ← → или смахивание — стрелки · Esc — пауза</div>
        </div>
      )}

      {screen === 'menu' && (
        <main className="menu">
          <header>
            <h1>ТРИАДА</h1>
            <p>Три дорожки, ваша музыка и ваш клип, переработанный на весь экран.</p>
          </header>

          <section className="menu-card">
            <h2>Трек и клип</h2>
            <label className="file-button">
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
              Загрузить песню или клип целиком
            </label>
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
              Добавить отдельный видеофон
            </label>
            <button
              className="text-button"
              onClick={() => void loadBuffer(createDemoBuffer(getPlayer().context), 'Демо-трек')}
            >
              Или взять демо-трек
            </button>
            <p className="track-name" data-testid="track-status">
              {status || trackName || 'Файлы остаются у вас: на сервер ничего не загружается.'}
              {clipName && !status ? ` · клип: ${clipName}` : ''}
            </p>
          </section>

          <section className="menu-card">
            <h2>Настройки</h2>
            <div className="segmented">
              {DIFFICULTIES.map((difficulty) => (
                <button
                  key={difficulty.id}
                  className={difficulty.id === settings.difficulty ? 'is-active' : ''}
                  onClick={() => update({ difficulty: difficulty.id })}
                >
                  {difficulty.label}
                </button>
              ))}
            </div>
            <div className="segmented look-list">
              {CLIP_LOOKS.map((look) => (
                <button
                  key={look.id}
                  className={look.id === settings.look ? 'is-active' : ''}
                  onClick={() => update({ look: look.id })}
                >
                  {look.label}
                </button>
              ))}
            </div>
            <label className="slider">
              <span>
                Яркость клипа <output>{Math.round(settings.clipBrightness * 100)}%</output>
              </span>
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={settings.clipBrightness}
                onChange={(event) => update({ clipBrightness: Number(event.target.value) })}
              />
            </label>
            <label className="slider">
              <span>
                Приглушить клип за дорожками <output>{Math.round(settings.clipFocus * 100)}%</output>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.clipFocus}
                onChange={(event) => update({ clipFocus: Number(event.target.value) })}
              />
            </label>
            <label className="slider">
              <span>
                Контраст дорожек <output>{Math.round(settings.laneContrast * 100)}%</output>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.laneContrast}
                onChange={(event) => update({ laneContrast: Number(event.target.value) })}
              />
            </label>
            <label className="slider">
              <span>
                Скорость нот <output>{settings.approachSec.toFixed(1)} с</output>
              </span>
              <input
                type="range"
                min={0.8}
                max={2.6}
                step={0.1}
                value={settings.approachSec}
                onChange={(event) => update({ approachSec: Number(event.target.value) })}
              />
            </label>
            <label className="slider">
              <span>
                Громкость <output>{Math.round(settings.volume * 100)}%</output>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.volume}
                onChange={(event) => update({ volume: Number(event.target.value) })}
              />
            </label>
            <label className="slider">
              <span>
                Звуковые эффекты <output>{Math.round(settings.effectsVolume * 100)}%</output>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.effectsVolume}
                onChange={(event) => update({ effectsVolume: Number(event.target.value) })}
              />
            </label>
            <label className="slider">
              <span>
                Поправка на задержку <output>{settings.offsetMs} мс</output>
              </span>
              <input
                type="range"
                min={-200}
                max={200}
                step={10}
                value={settings.offsetMs}
                onChange={(event) => update({ offsetMs: Number(event.target.value) })}
              />
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                data-testid="color-drift"
                checked={settings.colorDrift}
                onChange={(event) => update({ colorDrift: event.target.checked })}
              />
              Цвет клипа меняется по ходу песни
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                data-testid="autopilot"
                checked={settings.autopilot}
                onChange={(event) => update({ autopilot: event.target.checked })}
              />
              Автопилот
            </label>
          </section>

          <button className="start-button" disabled={!analysis} onClick={startGame}>
            Старт
          </button>

          <ul className="legend">
            <li>Жёлтый круг: клавиша A, S, D или нажатие на дорожку</li>
            <li>Белый круг со стрелкой: ← или → либо смахивание в ту же сторону</li>
            <li>Розовая звезда: как круг, очки ×2</li>
            <li>Жёлтый круг с лучом: зажмите и держите до конца</li>
            <li>Розовая пара: две клавиши сразу на взрыве песни</li>
          </ul>
        </main>
      )}

      {screen === 'paused' && (
        <div className="overlay">
          <h2>Пауза</h2>
          <button className="start-button" onClick={togglePause}>
            Продолжить
          </button>
          <button className="text-button" onClick={startGame}>
            Начать заново
          </button>
          <button className="text-button" onClick={() => setScreen('menu')}>
            В меню
          </button>
        </div>
      )}

      {screen === 'results' && result && (
        <div className="overlay" data-testid="results">
          <h2>{resultTitle(result)}</h2>
          <div className="stars" aria-label={`Звёзд: ${result.stars} из 3`}>
            <span className={result.stars >= 1 ? 'is-earned' : ''}>★</span>
            <span className={result.stars >= 2 ? 'is-earned' : ''}>★</span>
            <span className={result.stars >= 3 ? 'is-earned' : ''}>★</span>
          </div>
          {result.isNewBest && <div className="new-best">Новый рекорд!</div>}
          <dl className="stats">
            <div>
              <dt>Очки</dt>
              <dd>{result.score.toLocaleString('ru-RU')}</dd>
            </div>
            <div>
              <dt>Рекорд</dt>
              <dd>{result.bestScore.toLocaleString('ru-RU')}</dd>
            </div>
            <div>
              <dt>Точность</dt>
              <dd>{result.accuracyPercent}%</dd>
            </div>
            <div>
              <dt>Лучшее комбо</dt>
              <dd>{result.maxCombo}</dd>
            </div>
            <div>
              <dt>Точно / хорошо</dt>
              <dd>
                {result.perfects} / {result.goods}
              </dd>
            </div>
            <div>
              <dt>Промахи</dt>
              <dd>{result.misses}</dd>
            </div>
          </dl>
          <button className="start-button" onClick={startGame}>
            Ещё раз
          </button>
          <button className="text-button" onClick={() => setScreen('menu')}>
            В меню
          </button>
        </div>
      )}
    </div>
  )
}
