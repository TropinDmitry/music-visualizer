import { useState, type DragEvent } from 'react'
import { formatTime } from '../formatting.ts'

interface TrackPanelProps {
  fileName: string
  duration: number
  onsetCount: number
  loading: { message: string; progress: number } | null
  error: string
  title: string
  artist: string
  onFile: (file: File) => void
  onDemo: () => void
  onTitleChange: (value: string) => void
  onArtistChange: (value: string) => void
}

/** Загрузка трека (кнопка или перетаскивание), прогресс анализа, подпись. */
export function TrackPanel(props: TrackPanelProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const busy = props.loading !== null

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    setIsDragOver(false)
    const file = event.dataTransfer.files[0]
    if (file && !busy) props.onFile(file)
  }

  return (
    <section className="panel">
      <h2>Трек</h2>
      <label
        className={`drop-zone ${isDragOver ? 'is-over' : ''} ${busy ? 'is-busy' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept="audio/*,.mp3,.wav,.ogg"
          disabled={busy}
          data-testid="audio-file-input"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) props.onFile(file)
            event.target.value = '' // чтобы можно было выбрать тот же файл ещё раз
          }}
        />
        {props.fileName ? (
          <>
            <strong className="file-name">{props.fileName}</strong>
            <span>
              {formatTime(props.duration)} · ударов найдено: {props.onsetCount}
            </span>
          </>
        ) : (
          <>
            <strong>Перетащите аудиофайл сюда</strong>
            <span>или нажмите, чтобы выбрать (mp3, wav, ogg)</span>
          </>
        )}
      </label>

      {props.loading && (
        <div className="progress" role="status">
          <div className="progress-label">{props.loading.message}</div>
          <div className="progress-bar">
            <div style={{ width: `${Math.round(props.loading.progress * 100)}%` }} />
          </div>
        </div>
      )}
      {props.error && <p className="error">{props.error}</p>}

      <button className="link-button" onClick={props.onDemo} disabled={busy}>
        Нет файла под рукой? Включить демо-трек
      </button>

      <label className="field">
        <span className="field-label">Исполнитель</span>
        <input type="text" value={props.artist} onChange={(e) => props.onArtistChange(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Название</span>
        <input type="text" value={props.title} onChange={(e) => props.onTitleChange(e.target.value)} />
      </label>
    </section>
  )
}
