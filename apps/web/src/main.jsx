import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './app/App.jsx'
import { installStyles } from './styles/install'
import { initTheme } from './services/theme'
import { initTextSize } from './services/textSize'

// Tokens + base styles and the resolved theme are in place before first paint.
installStyles()
initTheme()
initTextSize()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
