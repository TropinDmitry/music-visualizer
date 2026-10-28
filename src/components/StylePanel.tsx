import { PALETTES } from '../render/palettes.ts'
import { STYLES } from '../styles/index.ts'
import type { StyleDefinition, StyleParams } from '../styles/types.ts'

interface StylePanelProps {
  style: StyleDefinition
  params: StyleParams
  onStyleChange: (styleId: string) => void
  onParamChange: (key: string, value: number | string) => void
  onReset: () => void
}

/** Выбор стиля и его параметры. Контролы строятся по описанию params из стиля. */
export function StylePanel({ style, params, onStyleChange, onParamChange, onReset }: StylePanelProps) {
  return (
    <section className="panel">
      <h2>Стиль</h2>
      <div className="style-list">
        {STYLES.map((s) => (
          <button
            key={s.id}
            className={`style-card ${s.id === style.id ? 'is-active' : ''}`}
            onClick={() => onStyleChange(s.id)}
          >
            <strong>{s.name}</strong>
            <span>{s.description}</span>
          </button>
        ))}
      </div>

      <div className="params">
        {style.params.map((param) => {
          if (param.type === 'palette') {
            return (
              <div className="field" key={param.key}>
                <span className="field-label">{param.label}</span>
                <div className="palette-list">
                  {PALETTES.map((palette) => (
                    <button
                      key={palette.id}
                      className={`palette-swatch ${params[param.key] === palette.id ? 'is-active' : ''}`}
                      style={{
                        background: `linear-gradient(135deg, ${palette.colors[0]}, ${palette.colors[1]}, ${palette.colors[2]})`,
                      }}
                      title={palette.name}
                      aria-label={palette.name}
                      onClick={() => onParamChange(param.key, palette.id)}
                    />
                  ))}
                </div>
              </div>
            )
          }

          const value = Number(params[param.key] ?? param.default)
          return (
            <label className="field" key={param.key}>
              <span className="field-label">
                {param.label}
                <output>{value.toFixed(2)}</output>
              </span>
              <input
                type="range"
                min={param.min}
                max={param.max}
                step={param.step}
                value={value}
                onChange={(event) => onParamChange(param.key, Number(event.target.value))}
              />
            </label>
          )
        })}
      </div>
      <button className="link-button" onClick={onReset}>
        Сбросить параметры
      </button>
    </section>
  )
}
