import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import MicrosoftAccount from './components/MicrosoftAccount'

createRoot(
  document.getElementById('root')!
).render(
  <StrictMode>
    <App />
    <MicrosoftAccount />
  </StrictMode>
)