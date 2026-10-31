import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Относительные пути: сайт работает и в подпапке хостинга
  base: './',
  build: {
    // Three.js сам по себе весит ~700 КБ (≈200 КБ в gzip) — это ожидаемо
    chunkSizeWarningLimit: 900,
    // Страницы: «Триада» на главной, визуализатор и «Орбита»
    rolldownOptions: {
      input: { main: 'index.html', visualizer: 'visualizer.html', orbit: 'game.html' },
    },
  },
})
