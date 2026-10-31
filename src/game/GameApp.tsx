import { useEffect, useRef, useState } from 'react'
import type { AudioAnalysis } from '../audio/analyzer.ts'
import { AudioPlayer } from '../audio/AudioPlayer.ts'
import { createEmptyFeatures, sampleFeatures } from '../audio/frameFeatures.ts'
import { audioBufferToMono, createDemoBuffer, decodeAudioFile } from '../audio/loadAudio.ts'
import { runAnalysisInWorker } from '../audio/runAnalysis.ts'
import { formatTime } from '../formatting.ts'
import {
  accuracy,
  createGameState,
  currentMultiplier,
  playAutopilot,
  pressPulse,
  rank,
  stepGame,
  type GameEvent,
  type GameState,
} from './gameState.ts'
import { GameScene } from './GameScene.ts'
import { DIFFICULTIES, findDifficulty, generateLevel, type DifficultyId } from './level.ts'

type Screen = 'menu' | 'playing' | 'paused' | 'results'

interface Settings {
  difficulty: DifficultyId
  /** За сколько секунд нота долетает до орбиты. */
  approachSec: number
  volume: number
  /** Поправка на задержку наушников или колонок, в миллисекундах. */
  offsetMs: number
  autopilot: boolean
}

interface Hud {
  score: number
  combo: number
  multiplier: number
  energy: number
  time: number
  judgement: string
}

/** Итог партии: отдельный снимок, чтобы экран результатов не читал ref во время рендера. */
interface GameResult {
  failed: boolean
  rank: string
  score: number
  bestScore: number
  accuracyPercent: number
  maxCombo: number
}

const EMPTY_HUD: Hud = { score: 0, combo: 0, multiplier: 1, energy: 1, time: 0, judgement: '' }
const KEYBOARD_TURN_SPEED = 6 // рад/с
const AUTOPILOT_TURN_SHARE = 0.25 // какая доля пути до цели проходится за кадр

const NO_PRESSED_PULSES = new Set<number>()

const JUDGEMENT_TEXT: Record<GameEvent['type'], string> = {
  caught: '',
  perfect: 'ТОЧНО',
  good: 'ХОРОШО',
  miss: 'МИМО',
  shardHit: 'ОСКОЛОК',
  shardAvoided: '',
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

export function GameApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const playerRef = useRef<AudioPlayer | null>(null)
  const gameRef = useRef<GameState | null>(null)
  const pressRef = useRef<() => void>(() => {})
  const shieldAngleRef = useRef(Math.PI / 2)
  const pointerAngleRef = useRef<number | null>(null)
  const keysRef = useRef({ left: false, right: false })

  const [screen, setScreen] = useState<Screen>('menu')
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null)
  const [trackName, setTrackName] = useState('')
  const [status, setStatus] = useState('')
  const [settings, setSettings] = useState<Settings>({
    difficulty: 'normal',
    approachSec: 1.4,
    volume: 0.8,
    offsetMs: 0,
    autopilot: false,
  })
  const [hud, setHud] = useState<Hud>(EMPTY_HUD)
  const [result, setResult] = useState<GameResult | null>(null)

  // Цикл анимации живёт вне React и читает свежие значения через ref
  const liveRef = useRef({ screen, analysis, settings })
  useEffect(() => {
    liveRef.current = { screen, analysis, settings }
  })

  const getPlayer = (): AudioPlayer => {
    if (!playerRef.current) playerRef.current = new AudioPlayer(new AudioContext())
    return playerRef.current
  }

  const bestScoreKey = `orbit-best:${trackName}:${settings.difficulty}`

  const finishGame = () => {
    const game = gameRef.current
    if (!game) return
    playerRef.current?.pause()
    const bestScore = Math.max(game.score, loadBestScore(bestScoreKey))
    saveBestScore(bestScoreKey, bestScore)
    setResult({
      failed: game.failed,
      rank: rank(game),
      score: game.score,
      bestScore,
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

    const scene = new GameScene(canvas)
    const features = createEmptyFeatures()
    let frameId = 0
    let lastFrameAt = performance.now()
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

    const handleEvents = (events: GameEvent[], clockTime: number) => {
      for (const event of events) {
        const text = JUDGEMENT_TEXT[event.type]
        if (text) {
          judgement = text
          judgementUntil = clockTime + 0.5
        }
        const angle = event.note.kind === 'pulse' ? shieldAngleRef.current : event.note.angle
        if (event.type === 'miss' || event.type === 'shardHit') scene.addTrail(angle, 'bad', clockTime)
        if (event.type === 'caught' || event.type === 'perfect' || event.type === 'good') {
          scene.addTrail(angle, 'hit', clockTime)
        }
      }
    }

    pressRef.current = () => {
      const game = gameRef.current
      const player = playerRef.current
      if (!game || !player || liveRef.current.screen !== 'playing') return
      const time = player.currentTime + liveRef.current.settings.offsetMs / 1000
      const event = pressPulse(game, time)
      if (event) handleEvents([event], performance.now() / 1000)
    }

    const moveShield = (seconds: number) => {
      if (pointerAngleRef.current !== null) shieldAngleRef.current = pointerAngleRef.current
      if (keysRef.current.left) shieldAngleRef.current += KEYBOARD_TURN_SPEED * seconds
      if (keysRef.current.right) shieldAngleRef.current -= KEYBOARD_TURN_SPEED * seconds
    }

    /** Щит автопилота плавно едет к ближайшей искре: это только для глаз. */
    const moveAutopilotShield = (game: GameState) => {
      for (let i = game.nextIndex; i < game.notes.length; i++) {
        const note = game.notes[i]
        if (note.kind !== 'spark') continue
        shieldAngleRef.current += (note.angle - shieldAngleRef.current) * AUTOPILOT_TURN_SHARE
        return
      }
    }

    const drawFrame = () => {
      const now = performance.now()
      const clockTime = now / 1000
      const seconds = Math.min((now - lastFrameAt) / 1000, 0.1)
      lastFrameAt = now

      const { screen: currentScreen, analysis: currentAnalysis, settings: currentSettings } = liveRef.current
      const game = gameRef.current
      const player = playerRef.current
      const isPlaying = currentScreen === 'playing' && game && player && currentAnalysis
      const time = isPlaying ? player.currentTime + currentSettings.offsetMs / 1000 : clockTime * 0.3

      if (isPlaying) {
        if (currentSettings.autopilot) {
          moveAutopilotShield(game)
          handleEvents(playAutopilot(game, time, shieldAngleRef.current), clockTime)
        } else {
          moveShield(seconds)
          handleEvents(stepGame(game, time, shieldAngleRef.current), clockTime)
        }

        if (now - lastHudAt > 80) {
          lastHudAt = now
          if (clockTime > judgementUntil) judgement = ''
          setHud({
            score: game.score,
            combo: game.combo,
            multiplier: currentMultiplier(game),
            energy: game.energy,
            time,
            judgement,
          })
        }
        if (game.failed || !player.isPlaying) finishRef.current()
      }

      if (isPlaying) {
        sampleFeatures(currentAnalysis, time, features)
      } else if (currentScreen === 'menu' || !currentAnalysis) {
        // В меню ядро спокойно дышит, музыки ещё нет
        features.time = time
        features.energy = time * 0.3
        features.bass = 0.3 + 0.15 * Math.sin(clockTime * 1.5)
        features.beatPulse = 0
        features.spectrum.fill(0.15)
      }

      const inMenu = currentScreen === 'menu'
      scene.render(
        features,
        shieldAngleRef.current,
        game && !inMenu ? game.notes : [],
        game ? game.nextIndex : 0,
        currentSettings.approachSec,
        clockTime,
        game ? game.pressedPulseIds : NO_PRESSED_PULSES,
        !inMenu,
      )
      frameId = requestAnimationFrame(drawFrame)
    }
    frameId = requestAnimationFrame(drawFrame)

    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
      scene.dispose()
    }
  }, [])

  const togglePause = () => {
    const player = playerRef.current
    if (screen === 'playing') {
      player?.pause()
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

  useEffect(() => {
    const setKey = (code: string, pressed: boolean) => {
      if (code === 'KeyA' || code === 'ArrowLeft') keysRef.current.left = pressed
      if (code === 'KeyD' || code === 'ArrowRight') keysRef.current.right = pressed
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') pauseRef.current()
      if (event.code === 'Space' && liveRef.current.screen === 'playing') {
        event.preventDefault()
        if (!event.repeat) pressRef.current()
      }
      if (event.code === 'KeyA' || event.code === 'KeyD' || event.code.startsWith('Arrow')) {
        pointerAngleRef.current = null // клавиатура важнее последнего положения мыши
      }
      setKey(event.code, true)
    }
    const onKeyUp = (event: KeyboardEvent) => setKey(event.code, false)
    // В свёрнутой вкладке кадры почти не рисуются, а музыка идёт дальше: ставим паузу
    const onVisibilityChange = () => {
      if (document.hidden && liveRef.current.screen === 'playing') pauseRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const loadBuffer = async (buffer: AudioBuffer, name: string) => {
    getPlayer().load(buffer)
    setAnalysis(null)
    setTrackName(name)
    setStatus('Строим уровень…')
    const result = await runAnalysisInWorker(audioBufferToMono(buffer), buffer.sampleRate, (fraction) =>
      setStatus(`Строим уровень… ${Math.round(fraction * 100)}%`),
    )
    setAnalysis(result)
    setStatus('')
  }

  const handleFile = async (file: File) => {
    setStatus('Читаем файл…')
    try {
      await loadBuffer(await decodeAudioFile(file, getPlayer().context), file.name)
    } catch (error) {
      console.error(error)
      setStatus('Не удалось прочитать файл. Подойдут mp3, wav и ogg.')
    }
  }

  const startGame = () => {
    const player = playerRef.current
    if (!analysis || !player) return
    const difficulty = findDifficulty(settings.difficulty)
    gameRef.current = createGameState(generateLevel(analysis, difficulty), difficulty)
    shieldAngleRef.current = Math.PI / 2
    setHud(EMPTY_HUD)
    player.setVolume(settings.volume)
    player.seek(0)
    void player.play()
    setScreen('playing')
  }

  const handlePointerMove = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const box = canvas.getBoundingClientRect()
    const x = clientX - (box.left + box.width / 2)
    const y = box.top + box.height / 2 - clientY // на экране ось Y идёт вниз
    pointerAngleRef.current = Math.atan2(y, x)
  }

  const update = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch })
  const duration = analysis?.duration ?? 0

  return (
    <div
      className="game"
      onPointerMove={(event) => handlePointerMove(event.clientX, event.clientY)}
      onPointerDown={(event) => {
        handlePointerMove(event.clientX, event.clientY)
        pressRef.current()
      }}
    >
      <canvas className="game-canvas" ref={canvasRef} />

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
          <div className="judgement">{hud.judgement}</div>
          <div className="hud-hint">Мышь или A/D — щит · Пробел или клик — кольцо · Esc — пауза</div>
        </div>
      )}

      {screen === 'menu' && (
        <main className="menu">
          <header>
            <h1>ОРБИТА</h1>
            <p>Ваша музыка становится уровнем. Держите щит на орбите и не дайте ядру остаться без энергии.</p>
          </header>

          <section className="menu-card">
            <h2>Трек</h2>
            <label className="file-button">
              <input
                type="file"
                accept="audio/*,.mp3,.wav,.ogg"
                data-testid="game-file-input"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void handleFile(file)
                  event.target.value = ''
                }}
              />
              {trackName ? 'Выбрать другой трек' : 'Загрузить трек'}
            </label>
            <button
              className="text-button"
              onClick={() => void loadBuffer(createDemoBuffer(getPlayer().context), 'Демо-трек')}
            >
              Или взять демо-трек
            </button>
            <p className="track-name">{status || trackName || 'Трек остаётся у вас: на сервер он не загружается.'}</p>
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
            <label className="slider">
              <span>
                Скорость нот <output>{settings.approachSec.toFixed(1)} с до орбиты</output>
              </span>
              <input
                type="range"
                min={0.7}
                max={2.2}
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
                Поправка на задержку звука <output>{settings.offsetMs} мс</output>
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
              Автопилот: посмотреть уровень со стороны
            </label>
          </section>

          <button className="start-button" disabled={!analysis} onClick={startGame}>
            Старт
          </button>

          <ul className="legend">
            <li>
              <i className="dot-spark" /> Искра: поймайте щитом
            </li>
            <li>
              <i className="dot-pulse" /> Кольцо: нажмите, когда оно коснётся орбиты
            </li>
            <li>
              <i className="dot-shard" /> Осколок: уведите щит
            </li>
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
