// first: in the preview build, keep saved data apart from the real game's
import './storage/previewNamespace'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DEV_MODE } from './dev/devMode'
import { startPerfMonitor } from './dev/perfMonitor'
import { keepStorageOncePiloted } from './storage/backup'
import { listenForBack } from './native/back'
import { startQuality } from './settings/quality'

// dev mode: watch for hiccups from the very start (the dev panel shows them)
if (DEV_MODE) startPerfMonitor()

// a device that can't keep up is drawn lighter, until it can (settings/quality.ts)
startQuality()

// ask the browser not to clear the pilots' progress to make room
keepStorageOncePiloted()

// the Android app: the Back button closes what's open (or sends the app away)
listenForBack()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
