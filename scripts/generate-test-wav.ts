// Генерирует тестовый трек test-assets/test-track.wav (12 с, 120 BPM).
// Запуск: npm run gen:wav
import { mkdirSync, writeFileSync } from 'node:fs'
import { encodeWav, synthesizeDemoTrack } from '../src/audio/demoTrack.ts'

const outDir = 'test-assets'
const outFile = `${outDir}/test-track.wav`

mkdirSync(outDir, { recursive: true })
const wav = encodeWav(synthesizeDemoTrack(12))
writeFileSync(outFile, wav)
console.log(`Готово: ${outFile} (${(wav.length / 1024 / 1024).toFixed(2)} МБ)`)
