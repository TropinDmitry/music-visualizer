import { RESOLUTIONS } from '../export/resolutions.ts'
import { formatBytes } from '../formatting.ts'

export type ExportMethod = 'auto' | 'realtime'
/** 0 — весь трек, иначе длина фрагмента в секундах. */
export type ExportLength = 0 | 15 | 30 | 60

export interface ExportSettings {
  resolutionId: string
  fps: 30 | 60
  length: ExportLength
  method: ExportMethod
  watermark: boolean
}

export type ExportStatus =
  | { state: 'idle' }
  | { state: 'running'; progress: number; startedAt: number }
  | { state: 'done'; url: string; fileName: string; size: number; description: string; seconds: number }
  | { state: 'canceled' }
  | { state: 'error'; message: string }

interface ExportPanelProps {
  settings: ExportSettings
  status: ExportStatus
  canExport: boolean
  onChange: (settings: ExportSettings) => void
  onExport: () => void
  onCancel: () => void
}

export function ExportPanel({ settings, status, canExport, onChange, onExport, onCancel }: ExportPanelProps) {
  const running = status.state === 'running'
  const update = (patch: Partial<ExportSettings>) => onChange({ ...settings, ...patch })

  return (
    <section className="panel">
      <h2>Экспорт видео</h2>

      <label className="field">
        <span className="field-label">Разрешение</span>
        <select
          value={settings.resolutionId}
          disabled={running}
          onChange={(e) => update({ resolutionId: e.target.value })}
        >
          {RESOLUTIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <div className="field-row">
        <label className="field">
          <span className="field-label">Кадров/с</span>
          <select
            value={settings.fps}
            disabled={running}
            onChange={(e) => update({ fps: Number(e.target.value) === 60 ? 60 : 30 })}
          >
            <option value={30}>30</option>
            <option value={60}>60</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Длина</span>
          <select
            value={settings.length}
            disabled={running}
            onChange={(e) => update({ length: Number(e.target.value) as ExportLength })}
          >
            <option value={0}>Весь трек</option>
            <option value={15}>15 с от позиции</option>
            <option value={30}>30 с от позиции</option>
            <option value={60}>60 с от позиции</option>
          </select>
        </label>
      </div>

      <label className="field">
        <span className="field-label">Способ кодирования</span>
        <select
          value={settings.method}
          disabled={running}
          onChange={(e) => update({ method: e.target.value === 'realtime' ? 'realtime' : 'auto' })}
        >
          <option value="auto">MP4 через WebCodecs (быстро)</option>
          <option value="realtime">MediaRecorder (в реальном времени)</option>
        </select>
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={settings.watermark}
          disabled={running}
          onChange={(e) => update({ watermark: e.target.checked })}
        />
        Водяной знак
      </label>

      {running ? (
        <div className="export-running">
          <div className="progress" role="status">
            <div className="progress-label">Рендер… {Math.round(status.progress * 100)}%</div>
            <div className="progress-bar">
              <div style={{ width: `${Math.round(status.progress * 100)}%` }} />
            </div>
          </div>
          <button className="secondary-button" onClick={onCancel}>
            Отменить
          </button>
        </div>
      ) : (
        <button className="primary-button" onClick={onExport} disabled={!canExport}>
          Экспортировать
        </button>
      )}

      {status.state === 'done' && (
        <p className="export-result" data-testid="export-result" data-size={status.size}>
          Готово за {status.seconds.toFixed(1)} с: {formatBytes(status.size)}
          <br />
          <small>{status.description}</small>
          <br />
          <a className="primary-button download-button" href={status.url} download={status.fileName}>
            Скачать «{status.fileName}»
          </a>
        </p>
      )}
      {status.state === 'canceled' && <p className="muted">Экспорт отменён.</p>}
      {status.state === 'error' && <p className="error">Ошибка экспорта: {status.message}</p>}
    </section>
  )
}
