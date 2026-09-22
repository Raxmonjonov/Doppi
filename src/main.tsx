import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from './theme/ThemeContext'
import { AuthProvider } from './data/auth'
import { MeProvider } from './data/MeContext'
import { startSync } from './data/store'
import App from './App'
import './index.css'

startSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <MeProvider>
            <App />
          </MeProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)