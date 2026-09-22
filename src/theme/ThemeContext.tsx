import { useEffect, useState, type ReactNode } from 'react'
import { ThemeContext, type Theme } from './theme-store'

function getInitialTheme(): Theme {
  const saved = localStorage.getItem('fn-theme')
  if (saved === 'light' || saved === 'dark') return saved
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  return 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    root.setAttribute('data-theme-transition', '')
    const t = window.setTimeout(() => root.removeAttribute('data-theme-transition'), 250)
    localStorage.setItem('fn-theme', theme)
    return () => window.clearTimeout(t)
  }, [theme])

  const toggle = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'))

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}