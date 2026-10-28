import { useCallback, useEffect, useRef, useState } from 'react'
import type { AudioAnalysis } from './audio/analyzer.ts'
import { AudioPlayer } from './audio/AudioPlayer.ts'
import { audioBufferToMono, createDemoBuffer, decodeAudioFile, guessTrackInfo } from './audio/loadAudio.ts'
import { runAnalysisInWorker } from './audio/runAnalysis.ts'
import { ExportPanel, type ExportSettings, type ExportStatus } from './components/ExportPanel.tsx'
import { PreviewCanvas } from './components/PreviewCanvas.tsx'
import { StylePanel } from './components/StylePanel.tsx'
import { TrackPanel } from './components/TrackPanel.tsx'
import { Transport } from './components/Transport.tsx'
import { exportRealtime, isRealtimeExportSupported } from './export/exportRealtime.ts'
import { findResolution } from './export/resolutions.ts'
import { ExportCanceledError, type ExportJob, type ExportResult } from './export/types.ts'
import { safeFileName } from './formatting.ts'
import { findStyle, STYLES } from './styles/index.ts'
import { defaultParams, type StyleParams } from './styles/types.ts'

/** Параметры по умолчанию для всех стилей: { 'pulse-sphere': {...}, ... } */
function allDefaultParams(): Record<string, StyleParams> {
  const result: Record<string, StyleParams> = {}
  for (const style of STYLES) result[style.id] = defaultParams(style)
  return result
}

export function App() {
  // --- Трек и анализ ---
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null)
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null)
  const [fileName, setFileName] = useState('')
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [loading, setLoading] = useState<{ message: string; progress: number } | null>(null)
  const [loadError, setLoadError] = useState('')

  // --- Проигрывание ---
  // Плеер — обычный объект, не состояние React: он живёт всё время работы страницы
  const playerRef = useRef<AudioPlayer | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  // --- Стиль ---
  const [styleId, setStyleId] = useState(STYLES[0].id)
  const [paramsByStyle, setParamsByStyle] = useState(allDefaultParams)
  const style = findStyle(styleId)
  const params = paramsByStyle[styleId]

  // --- Экспорт ---
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    resolutionId: '16x9',
    fps: 30,
    length: 0,
    method: 'auto',
    watermark: true,
  })
  const [exportStatus, setExportStatus] = useState<ExportStatus>({ state: 'idle' })
  const exportAbortRef = useRef<AbortController | null>(null)
  const resolution = findResolution(exportSettings.resolutionId)

  const getPlayer = (): AudioPlayer => {
    if (!playerRef.current) {
      playerRef.current = new AudioPlayer(new AudioContext())
      playerRef.current.onEnded = () => setIsPlaying(false)
    }
    return playerRef.current
  }

  // Стабильная функция для превью и шкалы: читает время из плеера
  const getTime = useCallback(() => playerRef.current?.currentTime ?? 0, [])

  /** Общая часть для файла и демо-трека: показать, проанализировать, запомнить. */
  const loadBuffer = async (buffer: AudioBuffer) => {
    const player = getPlayer()
    player.load(buffer)
    setIsPlaying(false)
    setAnalysis(null)
    setAudioBuffer(buffer)

    setLoading({ message: 'Анализ звука…', progress: 0 })
    const result = await runAnalysisInWorker(audioBufferToMono(buffer), buffer.sampleRate, (progress) =>
      setLoading({ message: 'Анализ звука…', progress }),
    )
    setAnalysis(result)
    setLoading(null)
  }

  const handleFile = async (file: File) => {
    setLoadError('')
    setLoading({ message: 'Декодирование…', progress: 0 })
    try {
      const buffer = await decodeAudioFile(file, getPlayer().context)
      const info = guessTrackInfo(file.name)
      setFileName(file.name)
      setArtist(info.artist)
      setTitle(info.title)
      await loadBuffer(buffer)
    } catch (error) {
      console.error(error)
      setLoading(null)
      setLoadError('Не удалось прочитать файл. Поддерживаются mp3, wav и ogg (зависит от браузера).')
    }
  }

  const handleDemo = async () => {
    setLoadError('')
    const buffer = createDemoBuffer(getPlayer().context)
    setFileName('Демо-трек (синтезирован в браузере)')
    setArtist('Music Visualizer')
    setTitle('Демо, 120 BPM')
    await loadBuffer(buffer)
  }

  const togglePlay = useCallback(() => {
    const player = playerRef.current
    if (!player || !player.duration) return
    if (player.isPlaying) {
      player.pause()
      setIsPlaying(false)
    } else {
      void player.play()
      setIsPlaying(true)
    }
  }, [])

  // Пробел — играть/пауза (если фокус не в поле ввода)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (event.code !== 'Space' || target.closest('input, select, textarea, button')) return
      event.preventDefault()
      togglePlay()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [togglePlay])

  const handleParamChange = (key: string, value: number | string) => {
    setParamsByStyle((prev) => ({ ...prev, [styleId]: { ...prev[styleId], [key]: value } }))
  }

  const handleResetParams = () => {
    setParamsByStyle((prev) => ({ ...prev, [styleId]: defaultParams(style) }))
  }

  const overlay = { title, artist, watermark: exportSettings.watermark }

  const handleExport = async () => {
    const player = playerRef.current
    if (!audioBuffer || !analysis || !player) return
    player.pause()
    setIsPlaying(false)

    const startTime = exportSettings.length === 0 ? 0 : player.currentTime
    const duration =
      exportSettings.length === 0
        ? audioBuffer.duration
        : Math.min(exportSettings.length, audioBuffer.duration - startTime)

    const job: ExportJob = {
      audio: audioBuffer,
      analysis,
      style,
      params,
      overlay,
      width: resolution.width,
      height: resolution.height,
      fps: exportSettings.fps,
      startTime,
      duration,
    }

    const controller = new AbortController()
    exportAbortRef.current = controller
    const startedAt = performance.now()
    const onProgress = (progress: number) => setExportStatus({ state: 'running', progress, startedAt })
    onProgress(0)

    try {
      // Модуль экспорта (с библиотекой mediabunny) грузим только когда он нужен —
      // так стартовая страница открывается быстрее
      const { exportMp4, findMp4Codecs } = await import('./export/exportMp4.ts')
      const codecs = exportSettings.method === 'auto' ? await findMp4Codecs(job) : null
      let result: ExportResult
      if (codecs) {
        result = await exportMp4(job, codecs, onProgress, controller.signal)
      } else if (isRealtimeExportSupported()) {
        result = await exportRealtime(job, onProgress, controller.signal)
      } else {
        throw new Error('Браузер не поддерживает ни WebCodecs, ни MediaRecorder')
      }

      const baseName = safeFileName([artist, title].filter(Boolean).join(' - ') || 'visualizer')
      const fileName = `${baseName} (${resolution.width}x${resolution.height}).${result.fileExtension}`
      const url = URL.createObjectURL(result.blob)
      setExportStatus((prev) => {
        if (prev.state === 'done') URL.revokeObjectURL(prev.url) // освобождаем прошлый файл
        return {
          state: 'done',
          url,
          fileName,
          size: result.blob.size,
          description: result.description,
          seconds: (performance.now() - startedAt) / 1000,
        }
      })
    } catch (error) {
      if (error instanceof ExportCanceledError) {
        setExportStatus({ state: 'canceled' })
      } else {
        console.error(error)
        setExportStatus({ state: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    } finally {
      exportAbortRef.current = null
    }
  }

  const isReady = audioBuffer !== null && analysis !== null

  return (
    <div className="app">
      <header className="app-header">
        <h1>Music Visualizer</h1>
        <p>Загрузите трек, выберите стиль — получите видео для YouTube, Shorts и ВК. Всё считается в браузере.</p>
      </header>

      <main className="workspace">
        <div className="preview-column">
          <PreviewCanvas
            analysis={analysis}
            style={style}
            params={params}
            overlay={overlay}
            frameWidth={resolution.width}
            frameHeight={resolution.height}
            getTime={getTime}
          />
          <Transport
            analysis={analysis}
            duration={audioBuffer?.duration ?? 0}
            isPlaying={isPlaying}
            disabled={!isReady}
            getTime={getTime}
            onTogglePlay={togglePlay}
            onSeek={(time) => playerRef.current?.seek(time)}
          />
        </div>

        <aside className="sidebar">
          <TrackPanel
            fileName={fileName}
            duration={audioBuffer?.duration ?? 0}
            onsetCount={analysis?.onsetTimes.length ?? 0}
            loading={loading}
            error={loadError}
            title={title}
            artist={artist}
            onFile={handleFile}
            onDemo={handleDemo}
            onTitleChange={setTitle}
            onArtistChange={setArtist}
          />
          <StylePanel
            style={style}
            params={params}
            onStyleChange={setStyleId}
            onParamChange={handleParamChange}
            onReset={handleResetParams}
          />
          <ExportPanel
            settings={exportSettings}
            status={exportStatus}
            canExport={isReady && exportStatus.state !== 'running'}
            onChange={setExportSettings}
            onExport={handleExport}
            onCancel={() => exportAbortRef.current?.abort()}
          />
        </aside>
      </main>
    </div>
  )
}

