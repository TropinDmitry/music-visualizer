import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Three.js сам по себе весит ~700 КБ (≈200 КБ в gzip) — это ожидаемо
    chunkSizeWarningLimit: 900,
    // Две страницы: визуализатор и игра «Орбита»
    rolldownOptions: {
      input: { main: 'index.html', game: 'game.html' },
    },
  },
})
