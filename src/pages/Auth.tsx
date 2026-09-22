import { useState } from 'react'
import { LogIn, UserPlus, AlertCircle } from 'lucide-react'
import { useAuth } from '../data/auth'
import { GoogleAuthButton } from '../components/GoogleAuthButton'

type Mode = 'login' | 'register'

export function AuthPage() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const switchMode = (m: Mode) => {
    setMode(m)
    setError(null)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)

    if (mode === 'login') {
      const err = await login(username, password)
      setBusy(false)
      if (err) setError(err)
      return
    }

    if (password !== confirm) {
      setBusy(false)
      setError("Parollar bir-biriga mos emas.")
      return
    }
    const err = await register({ name, username, email, password })
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">Do'ppi</div>
          <p className="auth-tag">Do'stlaringiz bilan ulanish</p>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab${mode === 'login' ? ' active' : ''}`}
            onClick={() => switchMode('login')}
          >
            <LogIn size={16} /> Kirish
          </button>
          <button
            type="button"
            className={`auth-tab${mode === 'register' ? ' active' : ''}`}
            onClick={() => switchMode('register')}
          >
            <UserPlus size={16} /> Ro'yxatdan o'tish
          </button>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          {mode === 'register' && (
            <label className="auth-field">
              <span>Ism</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ismingiz" autoComplete="name" />
            </label>
          )}

          <label className="auth-field">
            <span>Foydalanuvchi nomi</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="foydalanuvchi.nomi" autoComplete="username" />
          </label>

          {mode === 'register' && (
            <label className="auth-field">
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="siz@misol.com" autoComplete="email" />
            </label>
          )}

          <label className="auth-field">
            <span>Parol</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </label>

          {mode === 'register' && (
            <label className="auth-field">
              <span>Parolni tasdiqlang</span>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
            </label>
          )}

          {error && (
            <div className="auth-error">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
            {busy ? 'Iltimos kuting...' : mode === 'login' ? 'Kiring' : 'Hisob oching'}
          </button>
        </form>

        <div className="auth-divider"><span>yoki</span></div>

        <GoogleAuthButton />
      </div>
    </div>
  )
}