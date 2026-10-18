// first: in the preview build, keep saved data apart from the real game's
import './storage/previewNamespace'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DEV_MODE } from './dev/devMode'
import { startPerfMonitor } from './dev/perfMonitor'

// dev mode: watch for hiccups from the very start (the dev panel shows them)
if (DEV_MODE) startPerfMonitor()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
