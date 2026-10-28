import { useEffect, useRef, useState } from 'react'
import type { AudioAnalysis } from '../audio/analyzer.ts'
import { formatTime } from '../formatting.ts'

interface TransportProps {
  analysis: AudioAnalysis | null
  duration: number
  isPlaying: boolean
  disabled: boolean
  getTime: () => number
  onTogglePlay: () => void
  onSeek: (time: number) => void
}

/** Кнопка Play/Pause, шкала перемотки с «рельефом» громкости и время. */
export function Transport({ analysis, duration, isPlaying, disabled, getTime, onTogglePlay, onSeek }: TransportProps) {
  const [time, setTime] = useState(0)

  // Время на шкале обновляем по кадрам анимации, пока трек играет
  useEffect(() => {
    let frameId = 0
    const tick = () => {
      setTime(getTime())
      frameId = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frameId)
  }, [getTime])

  const progress = duration > 0 ? (time / duration) * 100 : 0

  return (
    <div className="transport">
      <button
        className="play-button"
        onClick={onTogglePlay}
        disabled={disabled}
        aria-label={isPlaying ? 'Пауза' : 'Играть'}
        title="Пробел — играть/пауза"
      >
        {isPlaying ? '❚❚' : '▶'}
      </button>

      <div className="timeline">
        <LoudnessStrip analysis={analysis} />
        <div className="timeline-progress" style={{ width: `${progress}%` }} />
        <input
          type="range"
          className="timeline-input"
          min={0}
          max={duration || 1}
          step={0.01}
          value={time}
          disabled={disabled}
          onChange={(event) => onSeek(Number(event.target.value))}
          aria-label="Позиция в треке"
        />
      </div>

      <span className="time">
        {formatTime(time)} / {formatTime(duration)}
      </span>
    </div>
  )
}

/** Полоса громкости трека под шкалой — видно, где куплет, где припев. */
function LoudnessStrip({ analysis }: { analysis: AudioAnalysis | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const width = (canvas.width = 600)
    const height = (canvas.height = 40)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)
    if (!analysis) return

    const framesPerColumn = analysis.frameCount / width
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)'
    for (let x = 0; x < width; x++) {
      // Максимум громкости среди кадров, попавших в этот столбец
      let peak = 0
      const from = Math.floor(x * framesPerColumn)
      const to = Math.max(from + 1, Math.floor((x + 1) * framesPerColumn))
      for (let f = from; f < to && f < analysis.frameCount; f++) peak = Math.max(peak, analysis.rms[f])
      const barHeight = Math.max(1, peak * height)
      ctx.fillRect(x, (height - barHeight) / 2, 1, barHeight)
    }
  }, [analysis])

  return <canvas className="loudness-strip" ref={canvasRef} />
}
