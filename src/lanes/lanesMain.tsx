import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LanesApp } from './LanesApp.tsx'
import '../game/game.css'
import './lanes.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanesApp />
  </StrictMode>,
)
