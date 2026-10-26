import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './styles/app.css'
import { initStorage } from './lib/persist'

// Stores read persisted state at import time, so storage must be loaded before the app module is evaluated.
void initStorage().then(async () => {
  const { App } = await import('./App')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
})
