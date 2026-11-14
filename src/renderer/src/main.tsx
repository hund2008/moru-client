import './assets/main.css'
import './assets/scrollbars.css'
import './assets/themes.css'
import { initializeTheme } from './theme'
import { initializeClickSounds } from './click-sound'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import MicrosoftAccount from './components/MicrosoftAccount'
import WindowTitleBar from './components/WindowTitleBar'

initializeTheme()
initializeClickSounds()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <MicrosoftAccount />
    <WindowTitleBar />
  </StrictMode>
)