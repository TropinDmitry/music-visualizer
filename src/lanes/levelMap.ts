import type { AudioAnalysis } from '../audio/analyzer.ts'
import { audioBufferToMono, decodeAudioFile } from '../audio/loadAudio.ts'
import { runAnalysisInWorker } from '../audio/runAnalysis.ts'
import { compareTake, type Press } from './compareTake.ts'
import type { SongPart } from './structure.ts'
import { DIFFICULTIES, generateLaneLevel, type LaneNote, type LevelTrace } from './level.ts'

/**
 * Страница для разбора уровня: показывает, что услышал детектор, какой удар
 * стал нотой, а какой отсеялся и на каком шаге. Работает на настоящем генераторе.
 * В сайт не входит, открывается на dev-сервере как /levelmap.html.
 */

type Fate = 'note' | 'weak' | 'crowded' | 'uneven' | 'cleared' | 'limit'

const FATES: { id: Fate; label: string; color: string }[] = [
  { id: 'note', label: 'стал нотой', color: '#b84dff' },
  { id: 'weak', label: 'слабый: не набрал порог', color: '#566568' },
  { id: 'crowded', label: 'слишком близко к соседу', color: '#e0a030' },
  { id: 'uneven', label: 'быстрый, но неровный', color: '#e06a30' },
  { id: 'cleared', label: 'убран лучом, стрелкой или пробелом', color: '#3a8fd0' },
  { id: 'limit', label: 'срезан пределом нот в секунду', color: '#ff3b5c' },
]

const KIND_COLORS: Record<string, string> = {
  tap: '#b84dff',
  star: '#ffc83d',
  accent: '#e05cff',
  swipe: '#ffffff',
  hold: '#5ee6b8',
  space: '#e8f4ff',
}

const ROW_SPECTRUM = 0.34
const ROW_STRENGTH = 0.2
const ROW_FATES = 0.12

interface OnsetInfo {
  time: number
  strength: number
  fate: Fate
}

interface MapState {
  analysis: AudioAnalysis
  notes: LaneNote[]
  onsets: OnsetInfo[]
  /** Ноты мелодии. */
  changes: number[]
  parts: SongPart[]
}

const fileInput = document.querySelector<HTMLInputElement>('#file')!
const difficultySelect = document.querySelector<HTMLSelectElement>('#difficulty')!
const playButton = document.querySelector<HTMLButtonElement>('#play')!
const spanSelect = document.querySelector<HTMLSelectElement>('#span')!
const statusLabel = document.querySelector<HTMLElement>('#status')!
const funnel = document.querySelector<HTMLElement>('#funnel')!
const legend = document.querySelector<HTMLElement>('#legend')!
const overview = document.querySelector<HTMLCanvasElement>('#overview')!
const detail = document.querySelector<HTMLCanvasElement>('#detail')!
const recordButton = document.querySelector<HTMLButtonElement>('#record')!
const saveButton = document.querySelector<HTMLButtonElement>('#save')!
const rateSelect = document.querySelector<HTMLSelectElement>('#rate')!
const report = document.querySelector<HTMLElement>('#report')!
const audio = new Audio()

/** Какая дорожка рентгена у какой клавиши. Стрелки и пробел рисуем отдельной строкой. */
const KEY_ROWS: Record<string, number> = { a: 0, s: 1, d: 2, left: 3, right: 3, up: 3, space: 3 }
const KEY_NAMES: Record<string, string> = {
  KeyA: 'a',
  KeyS: 's',
  KeyD: 'd',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  Space: 'space',
}

let state: MapState | null = null
let viewStart = 0
let trackName = ''
let presses: Press[] = []
let isRecording = false
let recordingFrom = 0
let pressesBefore = 0
const heldKeys = new Map<string, Press>()

for (const difficulty of DIFFICULTIES) {
  difficultySelect.add(new Option(difficulty.label, difficulty.id))
}
difficultySelect.value = 'hard'
legend.innerHTML =
  FATES.map((fate) => `<span><i style="background:${fate.color}"></i>${fate.label}</span>`).join('') +
  '<span><i style="background:#5ee6b8"></i>нота мелодии (метка над рядом судьбы), белая линия на спектрограмме это найденная высота</span>' +
  '<span>полоса над дорожками: зелёная за ритмом, оранжевая за яркими звуками</span>'

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) void loadTrack(file)
})
difficultySelect.addEventListener('change', () => {
  if (state) buildLevel(state.analysis)
})
spanSelect.addEventListener('change', drawAll)
playButton.addEventListener('click', () => {
  if (audio.paused) void audio.play()
  else audio.pause()
})
audio.addEventListener('play', () => {
  playButton.textContent = 'Пауза'
  requestAnimationFrame(followPlayback)
})
audio.addEventListener('pause', () => {
  playButton.textContent = 'Играть'
})
overview.addEventListener('click', (event) => {
  if (!state) return
  const share = event.offsetX / overview.clientWidth
  audio.currentTime = share * state.analysis.duration
  viewStart = Math.max(0, audio.currentTime - 1)
  drawAll()
})
window.addEventListener('resize', drawAll)
rateSelect.addEventListener('change', () => {
  audio.playbackRate = Number(rateSelect.value)
})
recordButton.addEventListener('click', () => {
  recordButton.blur()
  if (isRecording) stopRecording()
  else startRecording()
})
saveButton.addEventListener('click', saveTake)
audio.addEventListener('ended', () => {
  if (isRecording) stopRecording()
})
window.addEventListener('keydown', (event) => {
  const key = KEY_NAMES[event.code]
  if (!isRecording || !key) return
  // Иначе пробел нажмёт кнопку, а стрелки переключат список
  event.preventDefault()
  if (event.repeat || heldKeys.has(key)) return
  const press: Press = { time: audio.currentTime, key, duration: 0 }
  heldKeys.set(key, press)
  presses.push(press)
})
window.addEventListener('keyup', (event) => {
  const key = KEY_NAMES[event.code]
  const press = key ? heldKeys.get(key) : undefined
  if (!press) return
  press.duration = audio.currentTime - press.time
  heldKeys.delete(key)
})

function startRecording(): void {
  recordingFrom = audio.currentTime
  // Переигранный отрезок заменяем при остановке: новые нажатия идут в конце списка
  pressesBefore = presses.length
  isRecording = true
  recordButton.textContent = 'Остановить запись'
  recordButton.classList.add('is-on')
  void audio.play()
}

function stopRecording(): void {
  const to = audio.currentTime
  isRecording = false
  audio.pause()
  recordButton.textContent = 'Записать нажатия'
  recordButton.classList.remove('is-on')
  const isOldTake = (press: Press) => press.time < recordingFrom || press.time > to
  const fresh = presses.slice(pressesBefore)
  presses = [...presses.slice(0, pressesBefore).filter(isOldTake), ...fresh]
  presses.sort((a, b) => a.time - b.time)
  storeTake()
  showReport()
  drawAll()
}

function storeTake(): void {
  try {
    localStorage.setItem(`take:${trackName}`, JSON.stringify(presses))
  } catch {
    // Без хранилища запись остаётся на странице, её можно скачать
  }
}

function restoreTake(): void {
  presses = []
  try {
    const saved = localStorage.getItem(`take:${trackName}`)
    if (saved) presses = JSON.parse(saved) as Press[]
  } catch {
    presses = []
  }
}

function saveTake(): void {
  const link = document.createElement('a')
  const take = { track: trackName, difficulty: difficultySelect.value, presses }
  link.href = URL.createObjectURL(new Blob([JSON.stringify(take)], { type: 'application/json' }))
  link.download = `запись ${trackName}.json`
  link.click()
  URL.revokeObjectURL(link.href)
}

function showReport(): void {
  if (!state || presses.length === 0) {
    report.textContent = ''
    return
  }
  const result = compareTake(presses, state.notes, state.analysis)
  const percent = (share: number) => `${Math.round(share * 100)}%`
  const blocks = result.blocks.map((block) => `${block.start}с ${block.presses}/${block.notes}`).join('  ')
  report.textContent = [
    `Нажатий ${result.presses}, нот в этом отрезке ${result.notes}, опоздание руки ${Math.round(result.lagSec * 1000)} мс`,
    `Нажатий попало в ноту ${percent(result.pressesOnNotes)}, нот получило нажатие ${percent(result.notesWithPresses)}`,
    `Нажатия на удары ${percent(result.pressesOnOnsets)}, на ноты мелодии ${percent(result.pressesOnMelody)}, на слоги ${percent(result.pressesOnSyllables)}`,
    `Долгих нажатий ${result.longPresses}, лучей в уровне ${result.holds}`,
    `За 10 секунд, нажатия/ноты: ${blocks}`,
  ].join('\n')
}

async function loadTrack(file: File): Promise<void> {
  statusLabel.textContent = 'Декодируем…'
  audio.src = URL.createObjectURL(file)
  const context = new AudioContext()
  const buffer = await decodeAudioFile(file, context)
  void context.close()
  const analysis = await runAnalysisInWorker(audioBufferToMono(buffer), buffer.sampleRate, (fraction) => {
    statusLabel.textContent = `Анализ ${Math.round(fraction * 100)}%`
  })
  statusLabel.textContent = file.name
  trackName = file.name
  restoreTake()
  playButton.disabled = false
  recordButton.disabled = false
  saveButton.disabled = false
  buildLevel(analysis)
}

function buildLevel(analysis: AudioAnalysis): void {
  const difficulty = DIFFICULTIES.find((item) => item.id === difficultySelect.value) ?? DIFFICULTIES[2]
  const trace: LevelTrace = { audible: [], changes: [], spaced: [], even: [], parts: [], beforeLimit: [] }
  const notes = generateLaneLevel(analysis, difficulty, 'auto', trace)

  const audible = new Set(trace.audible)
  const spaced = new Set(trace.spaced)
  const even = new Set(trace.even)
  const toFrame = (note: LaneNote) => Math.round(note.time * analysis.fps)
  const planned = new Set(trace.beforeLimit.map(toFrame))
  const final = new Set(notes.map(toFrame))

  const onsets: OnsetInfo[] = []
  for (const time of analysis.onsetTimes) {
    const frame = Math.round(time * analysis.fps)
    let fate: Fate = 'cleared'
    if (final.has(frame)) fate = 'note'
    else if (!audible.has(frame)) fate = 'weak'
    else if (!spaced.has(frame)) fate = 'crowded'
    else if (!even.has(frame)) fate = 'uneven'
    else if (planned.has(frame)) fate = 'limit'
    onsets.push({ time, strength: analysis.onsetStrength[frame], fate })
  }

  state = { analysis, notes, onsets, changes: trace.changes.map((frame) => frame / analysis.fps), parts: trace.parts }
  showFunnel(state, trace)
  showReport()
  drawAll()
}

function showFunnel(current: MapState, trace: LevelTrace): void {
  const { analysis, notes, onsets } = current
  const starts = [...new Set(notes.map((note) => note.time))]
  let peak = 0
  for (let i = 0; i < starts.length; i++) {
    let inSecond = 0
    for (let j = i; j < starts.length && starts[j] - starts[i] < 1; j++) inSecond += 1
    peak = Math.max(peak, inSecond)
  }
  const countFate = (fate: Fate) => onsets.filter((onset) => onset.fate === fate).length
  const steps = [
    ['Детектор нашёл ударов', analysis.onsetTimes.length],
    ['Нот мелодии (кандидаты без ударов рядом)', trace.changes.length],
    ['Прошли порог (с голосом)', trace.audible.length],
    ['Прошли расстояние', trace.spaced.length],
    ['Прошли ровность', trace.even.length],
    ['Срезано пределом', countFate('limit')],
    ['Итог: моментов нажатия', starts.length],
    ['В среднем в секунду', (starts.length / analysis.duration).toFixed(2)],
    ['Пик за секунду', peak],
  ]
  funnel.innerHTML = steps.map(([label, value]) => `<div class="step"><b>${value}</b><span>${label}</span></div>`).join('')
}

function followPlayback(): void {
  if (audio.paused) return
  const span = Number(spanSelect.value)
  if (audio.currentTime < viewStart || audio.currentTime > viewStart + span * 0.8) {
    viewStart = Math.max(0, audio.currentTime - span * 0.2)
  }
  drawAll()
  requestAnimationFrame(followPlayback)
}

/** Подгоняет разрешение холста под экран и возвращает контекст в обычных пикселях. */
function prepare(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const scale = window.devicePixelRatio || 1
  canvas.width = canvas.clientWidth * scale
  canvas.height = canvas.clientHeight * scale
  const ctx = canvas.getContext('2d')
  ctx?.scale(scale, scale)
  return ctx
}

function drawAll(): void {
  if (!state) return
  drawOverview(state)
  drawDetail(state)
}

/** Весь трек: сколько ударов слышит детектор и сколько из них становится нотами. */
function drawOverview({ analysis, notes, onsets }: MapState): void {
  const ctx = prepare(overview)
  if (!ctx) return
  const width = overview.clientWidth
  const height = overview.clientHeight
  const bucketSec = 2
  const buckets = Math.ceil(analysis.duration / bucketSec)
  const barWidth = width / buckets
  const maxPerSecond = 8

  const starts = [...new Set(notes.map((note) => note.time))]
  for (let i = 0; i < buckets; i++) {
    const from = i * bucketSec
    const to = from + bucketSec
    const heard = onsets.filter((onset) => onset.time >= from && onset.time < to).length / bucketSec
    const played = starts.filter((time) => time >= from && time < to).length / bucketSec
    ctx.fillStyle = '#3c4a4d'
    ctx.fillRect(i * barWidth, height - (heard / maxPerSecond) * height, barWidth - 1, height)
    ctx.fillStyle = '#b84dff'
    ctx.fillRect(i * barWidth, height - (played / maxPerSecond) * height, barWidth - 1, height)
  }
  ctx.fillStyle = '#8fa09f'
  ctx.font = '12px system-ui'
  ctx.fillText('серым удары детектора в секунду, фиолетовым ноты в секунду', 8, 14)

  const toX = (time: number) => (time / analysis.duration) * width
  const span = Number(spanSelect.value)
  ctx.strokeStyle = '#5ee6b8'
  ctx.strokeRect(toX(viewStart), 0.5, toX(span), height - 1)
}

function drawDetail({ analysis, notes, onsets, changes, parts }: MapState): void {
  const ctx = prepare(detail)
  if (!ctx) return
  const width = detail.clientWidth
  const height = detail.clientHeight
  const span = Number(spanSelect.value)
  const toX = (time: number) => ((time - viewStart) / span) * width
  const inView = (time: number) => time >= viewStart && time <= viewStart + span

  const spectrumBottom = height * ROW_SPECTRUM
  const strengthBottom = spectrumBottom + height * ROW_STRENGTH
  const fatesBottom = strengthBottom + height * ROW_FATES

  drawSpectrum(ctx, analysis, width, spectrumBottom, span)
  drawMelody(ctx, analysis, width, spectrumBottom, span)
  drawStrength(ctx, analysis, width, spectrumBottom, strengthBottom, span)

  // Судьба каждого удара: высота тем больше, чем он сильнее
  for (const onset of onsets) {
    if (!inView(onset.time)) continue
    const info = FATES.find((fate) => fate.id === onset.fate)
    ctx.strokeStyle = info?.color ?? '#fff'
    ctx.lineWidth = 2
    const x = toX(onset.time)
    ctx.beginPath()
    ctx.moveTo(x, strengthBottom + 4)
    ctx.lineTo(x, fatesBottom - 4)
    ctx.stroke()
    ctx.globalAlpha = 0.25
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, spectrumBottom)
    ctx.lineTo(x, strengthBottom)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // Ноты мелодии: короткие метки сверху ряда судьбы
  ctx.strokeStyle = '#5ee6b8'
  ctx.lineWidth = 2
  for (const time of changes) {
    if (!inView(time)) continue
    ctx.beginPath()
    ctx.moveTo(toX(time), strengthBottom - 16)
    ctx.lineTo(toX(time), strengthBottom - 2)
    ctx.stroke()
  }

  // Режим отрезка: зелёная полоса значит «идём за ритмом», оранжевая «за яркими звуками»
  for (const part of parts) {
    ctx.fillStyle = part.chain.length > 0 ? '#5ee6b8' : '#e0a030'
    ctx.fillRect(toX(part.start), fatesBottom, toX(part.end) - toX(part.start) - 1, 5)
  }

  drawLanes(ctx, notes, fatesBottom, height, toX, inView)
  drawPresses(ctx, fatesBottom, height, toX, inView)
  drawGrid(ctx, width, height, span, toX)

  ctx.fillStyle = '#dfe9e8'
  ctx.font = '12px system-ui'
  ctx.fillText('Что слышно: спектрограмма, низкие внизу', 8, 14)
  ctx.fillText('Сила удара', 8, spectrumBottom + 14)
  ctx.fillText('Судьба удара', 8, strengthBottom + 14)
  ctx.fillText('Ноты на дорожках', 8, fatesBottom + 14)

  if (inView(audio.currentTime)) {
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(toX(audio.currentTime), 0)
    ctx.lineTo(toX(audio.currentTime), height)
    ctx.stroke()
  }
}

function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  analysis: AudioAnalysis,
  width: number,
  bottom: number,
  span: number,
): void {
  const bins = analysis.spectrumBins
  const binHeight = bottom / bins
  const columns = Math.min(Math.round(width / 3), Math.round(span * analysis.fps))
  const columnWidth = width / columns
  for (let column = 0; column < columns; column++) {
    const time = viewStart + (column / columns) * span
    const frame = Math.round(time * analysis.fps)
    if (frame >= analysis.frameCount) break
    for (let bin = 0; bin < bins; bin++) {
      const level = analysis.spectrum[frame * bins + bin] ** 1.5
      ctx.fillStyle = `hsl(${170 - level * 130} 80% ${level * 62}%)`
      ctx.fillRect(column * columnWidth, bottom - (bin + 1) * binHeight, columnWidth + 1, binHeight + 1)
    }
  }
}

/** Найденная высота поверх спектрограммы: белая линия. */
function drawMelody(
  ctx: CanvasRenderingContext2D,
  analysis: AudioAnalysis,
  width: number,
  bottom: number,
  span: number,
): void {
  // Та же логарифмическая шкала, что у спектрограммы: 30 Гц внизу, 16 кГц вверху
  const lowHz = 30
  const highHz = 16000
  ctx.fillStyle = '#ffffff'
  for (let x = 0; x < width; x += 2) {
    const frame = Math.round((viewStart + (x / width) * span) * analysis.fps)
    if (frame >= analysis.frameCount) break
    const pitch = analysis.melody.pitch[frame]
    if (pitch === 0) continue
    const hz = 440 * 2 ** ((pitch - 69) / 12)
    ctx.fillRect(x, bottom - (Math.log(hz / lowHz) / Math.log(highHz / lowHz)) * bottom, 2, 2)
  }
}

function drawStrength(
  ctx: CanvasRenderingContext2D,
  analysis: AudioAnalysis,
  width: number,
  top: number,
  bottom: number,
  span: number,
): void {
  ctx.strokeStyle = '#5ee6b8'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x < width; x++) {
    const frame = Math.round((viewStart + (x / width) * span) * analysis.fps)
    if (frame >= analysis.frameCount) break
    const y = bottom - analysis.onsetStrength[frame] * (bottom - top - 18)
    if (x === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}

function drawLanes(
  ctx: CanvasRenderingContext2D,
  notes: LaneNote[],
  top: number,
  bottom: number,
  toX: (time: number) => number,
  inView: (time: number) => boolean,
): void {
  const laneHeight = (bottom - top - 20) / 3
  const laneY = (lane: number) => top + 20 + laneHeight * (lane + 0.5)
  for (let lane = 0; lane < 3; lane++) {
    ctx.strokeStyle = '#2a3438'
    ctx.beginPath()
    ctx.moveTo(0, laneY(lane))
    ctx.lineTo(toX(1e6), laneY(lane))
    ctx.stroke()
  }

  for (const note of notes) {
    const end = note.time + (note.duration ?? 0)
    if (!inView(note.time) && !inView(end)) continue
    const x = toX(note.time)
    const y = laneY(note.lane)
    ctx.fillStyle = KIND_COLORS[note.kind]
    if (note.kind === 'hold') ctx.fillRect(x, y - 5, toX(end) - x, 10)
    if (note.kind === 'space') {
      ctx.fillRect(x - 5, top + 20, 10, laneHeight * 3)
      continue
    }
    if (note.kind === 'swipe') {
      ctx.font = 'bold 18px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(note.direction === 0 ? '↑' : note.direction > 0 ? '→' : '←', x, y + 6)
      ctx.textAlign = 'left'
      continue
    }
    ctx.beginPath()
    ctx.arc(x, y, 9, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Живые нажатия: белые кольца поверх нот на той же дорожке, долгие с хвостом. */
function drawPresses(
  ctx: CanvasRenderingContext2D,
  top: number,
  bottom: number,
  toX: (time: number) => number,
  inView: (time: number) => boolean,
): void {
  const laneHeight = (bottom - top - 20) / 3
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  for (const press of presses) {
    if (!inView(press.time)) continue
    const row = KEY_ROWS[press.key]
    const y = row === 3 ? top + 14 : top + 20 + laneHeight * (row + 0.5)
    const x = toX(press.time)
    ctx.beginPath()
    ctx.arc(x, y, 6, 0, Math.PI * 2)
    ctx.moveTo(x + 6, y)
    ctx.lineTo(toX(press.time + press.duration), y)
    ctx.stroke()
  }
}

/** Секундная сетка: по ней видно интервалы между нотами. */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  span: number,
  toX: (time: number) => number,
): void {
  ctx.font = '11px system-ui'
  const step = span > 12 ? 5 : 1
  for (let time = Math.ceil(viewStart / step) * step; time < viewStart + span; time += step) {
    const x = toX(time)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
    if (x < width - 30) {
      ctx.fillStyle = '#8fa09f'
      ctx.fillText(`${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`, x + 3, height - 4)
    }
  }
}
