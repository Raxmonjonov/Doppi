import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from './theme/ThemeContext'
import { AuthProvider } from './data/auth'
import { MeProvider } from './data/MeContext'
import { I18nProvider } from './i18n'
import { startSync } from './data/store'
import App from './App'
import './index.css'

startSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <ThemeProvider>
          <AuthProvider>
            <MeProvider>
              <App />
            </MeProvider>
          </AuthProvider>
        </ThemeProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
)