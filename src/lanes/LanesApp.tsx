import { useEffect, useRef, useState } from 'react'
import type { AudioAnalysis } from '../audio/analyzer.ts'
import { AudioPlayer } from '../audio/AudioPlayer.ts'
import { createEmptyFeatures, sampleFeatures } from '../audio/frameFeatures.ts'
import { audioBufferToMono, createDemoBuffer, decodeAudioFile } from '../audio/loadAudio.ts'
import { runAnalysisInWorker } from '../audio/runAnalysis.ts'
import { formatTime } from '../formatting.ts'
import { CLIP_LOOKS, LaneScene, type ClipLook } from './LaneScene.ts'
import { DIFFICULTIES, findDifficulty, generateLaneLevel, type DifficultyId } from './level.ts'
import {
  accuracy,
  activeShakeZone,
  createLaneGame,
  multiplier,
  playAutopilot,
  pressLane,
  pressSwipe,
  rank,
  registerShake,
  stepLanes,
  type LaneEvent,
  type LaneGame,
} from './rules.ts'

type Screen = 'menu' | 'playing' | 'paused' | 'results'

interface Settings {
  difficulty: DifficultyId
  approachSec: number
  volume: number
  offsetMs: number
  look: ClipLook
  clipBrightness: number
  autopilot: boolean
}

interface Hud {
  score: number
  combo: number
  multiplier: number
  energy: number
  time: number
  judgement: string
  /** Заполнение встряски 0..1, или null, если сейчас её нет. */
  shake: number | null
}

interface GameResult {
  failed: boolean
  rank: string
  score: number
  accuracyPercent: number
  maxCombo: number
}

const EMPTY_HUD: Hud = { score: 0, combo: 0, multiplier: 1, energy: 1, time: 0, judgement: '', shake: null }
const LANE_KEYS: Record<string, number> = { KeyA: 0, KeyS: 1, KeyD: 2, Digit1: 0, Digit2: 1, Digit3: 2 }
const NO_JUDGED = new Set<number>()
/** Если картинка разошлась со звуком на столько секунд, подтягиваем её. */
const VIDEO_MAX_DRIFT_SEC = 0.15
/** Рывок мыши короче этого не считается встряской: так не срабатывает случайное дрожание руки. */
const SHAKE_MIN_MOVE_PX = 12

const JUDGEMENT_TEXT: Record<LaneEvent['type'], string> = {
  perfect: 'ТОЧНО',
  good: 'ХОРОШО',
  miss: 'МИМО',
  shakeDone: 'ВСТРЯСКА!',
}

export function LanesApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const sceneRef = useRef<LaneScene | null>(null)
  const playerRef = useRef<AudioPlayer | null>(null)
  const gameRef = useRef<LaneGame | null>(null)
  const pressedLanesRef = useRef([false, false, false])
  const lastMouseDirectionRef = useRef(0)
  const eventHandlerRef = useRef<(event: LaneEvent | null) => void>(() => {})

  const [screen, setScreen] = useState<Screen>('menu')
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null)
  const [trackName, setTrackName] = useState('')
  const [clipName, setClipName] = useState('')
  const [clipUrl, setClipUrl] = useState('')
  const [status, setStatus] = useState('')
  const [hud, setHud] = useState<Hud>(EMPTY_HUD)
  const [result, setResult] = useState<GameResult | null>(null)
  const [settings, setSettings] = useState<Settings>({
    difficulty: 'normal',
    approachSec: 1.6,
    volume: 0.8,
    offsetMs: 0,
    look: 'outline',
    clipBrightness: 0.8,
    autopilot: false,
  })

  // Цикл анимации живёт вне React и читает свежие значения через ref
  const liveRef = useRef({ screen, analysis, settings })
  useEffect(() => {
    liveRef.current = { screen, analysis, settings }
  })

  const getPlayer = (): AudioPlayer => {
    if (!playerRef.current) playerRef.current = new AudioPlayer(new AudioContext())
    return playerRef.current
  }

  const finishGame = () => {
    const game = gameRef.current
    if (!game) return
    playerRef.current?.pause()
    videoRef.current?.pause()
    setResult({
      failed: game.failed,
      rank: rank(game),
      score: game.score,
      accuracyPercent: Math.round(accuracy(game) * 100),
      maxCombo: game.maxCombo,
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
    let judgement = ''
    let judgementUntil = 0

    const resize = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = canvas.clientWidth * scale
      canvas.height = canvas.clientHeight * scale
      scene.setSize(canvas.width, canvas.height)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    const handleEvent = (event: LaneEvent | null) => {
      if (!event) return
      const clockTime = performance.now() / 1000
      judgement = JUDGEMENT_TEXT[event.type]
      judgementUntil = clockTime + 0.45
      scene.addTrail(event.lane, event.type !== 'miss', clockTime)
    }
    eventHandlerRef.current = handleEvent

    const syncVideo = (time: number) => {
      const video = videoRef.current
      if (!video || !video.src) return
      if (video.paused) void video.play()
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

        const now = performance.now()
        if (now - lastHudAt > 80) {
          lastHudAt = now
          if (clockTime > judgementUntil) judgement = ''
          const zone = activeShakeZone(game, time)
          setHud({
            score: game.score,
            combo: game.combo,
            multiplier: multiplier(game),
            energy: game.energy,
            time,
            judgement,
            shake: zone ? Math.min(1, game.shakeCounts[zone.id] / zone.target) : null,
          })
        }
        if (game.failed || !player.isPlaying) finishRef.current()
      } else if (currentScreen === 'menu') {
        features.time = time
        features.bass = 0.2
        features.beatPulse = 0
      }

      scene.setClipOptions(current.look, current.clipBrightness)
      const inMenu = currentScreen === 'menu'
      scene.render(
        features,
        videoRef.current,
        game && !inMenu ? game.level.notes : [],
        game ? game.firstNote : 0,
        game ? game.judged : NO_JUDGED,
        pressedLanesRef.current,
        current.approachSec,
        clockTime,
        !inMenu,
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
      if (time !== null && game) eventHandlerRef.current(pressLane(game, time, lane))
    },
    swipe(direction: number) {
      const time = playingTime()
      const game = gameRef.current
      if (time !== null && game) eventHandlerRef.current(pressSwipe(game, time, direction))
    },
    shake() {
      const time = playingTime()
      const game = gameRef.current
      if (time !== null && game) registerShake(game, time)
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
      if (event.code === 'Space') {
        event.preventDefault()
        handlersRef.current.shake()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      const lane = LANE_KEYS[event.code]
      if (lane !== undefined) pressedLanesRef.current[lane] = false
    }
    // Тряска мышью: считаем каждую смену направления движения влево-вправо
    const onMouseMove = (event: MouseEvent) => {
      if (Math.abs(event.movementX) < SHAKE_MIN_MOVE_PX) return
      const direction = Math.sign(event.movementX)
      if (direction !== lastMouseDirectionRef.current) handlersRef.current.shake()
      lastMouseDirectionRef.current = direction
    }
    const onVisibilityChange = () => {
      if (document.hidden && liveRef.current.screen === 'playing') pauseRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousemove', onMouseMove)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

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
    setHud(EMPTY_HUD)
    player.setVolume(settings.volume)
    player.seek(0)
    if (videoRef.current && clipUrl) videoRef.current.currentTime = 0
    void player.play()
    setScreen('playing')
  }

  const update = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch })
  const duration = analysis?.duration ?? 0

  return (
    <div className="game">
      <canvas className="game-canvas" ref={canvasRef} />
      {/* Звук идёт через Web Audio, а видео только даёт кадры, поэтому оно без звука */}
      <video ref={videoRef} src={clipUrl || undefined} muted playsInline preload="auto" hidden />

      {(screen === 'playing' || screen === 'paused') && (
        <div className="hud">
          <div className="hud-top">
            <div className="hud-block">
              <span className="hud-label">Очки</span>
              <strong className="hud-score">{hud.score.toLocaleString('ru-RU')}</strong>
            </div>
            <div className="hud-block hud-center">
              <span className="hud-label">Энергия</span>
              <div className="energy">
                <div style={{ width: `${hud.energy * 100}%` }} />
              </div>
              <span className="hud-time">
                {formatTime(hud.time)} / {formatTime(duration)}
              </span>
            </div>
            <div className="hud-block hud-right">
              <span className="hud-label">Комбо</span>
              <strong className="hud-score">
                {hud.combo} <small>×{hud.multiplier}</small>
              </strong>
            </div>
          </div>

          {hud.shake !== null ? (
            <div className="shake-prompt">
              <strong>ВСТРЯСКА</strong>
              <span>Трясите мышь влево-вправо или часто жмите пробел</span>
              <div className="energy">
                <div style={{ width: `${hud.shake * 100}%` }} />
              </div>
            </div>
          ) : (
            <div className="judgement">{hud.judgement}</div>
          )}

          <div className="hud-hint">A S D — дорожки · ← → — стрелки · Esc — пауза</div>
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
            <li>Круг: клавиша дорожки A, S или D</li>
            <li>Стрелка: ← или → в ту же сторону</li>
            <li>Встряска: тряска мышью или пробел</li>
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
          <h2>{result.failed ? 'Энергия закончилась' : 'Трек пройден'}</h2>
          <div className="rank">{result.rank}</div>
          <dl className="stats">
            <div>
              <dt>Очки</dt>
              <dd>{result.score.toLocaleString('ru-RU')}</dd>
            </div>
            <div>
              <dt>Точность</dt>
              <dd>{result.accuracyPercent}%</dd>
            </div>
            <div>
              <dt>Лучшее комбо</dt>
              <dd>{result.maxCombo}</dd>
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
