import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { useAuth } from '../data/auth'
import { useI18n } from '../i18n'

export function LoginPage() {
  const { t } = useI18n()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const err = await login(username, password)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">Do'ppi</div>
          <p className="auth-tag">{t('auth.tagline')}</p>
        </div>

        <h1 className="auth-title">{t('auth.tabLogin')}</h1>

        <form className="auth-form" onSubmit={onSubmit}>
          <label className="auth-field">
            <span>{t('auth.labelUsername')}</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('auth.usernamePlaceholder')} autoComplete="username" />
          </label>

          <label className="auth-field">
            <span>{t('auth.labelPassword')}</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
          </label>

          {error && (
            <div className="auth-error">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
            {busy ? t('auth.pleaseWait') : t('auth.loginSubmit')}
          </button>
        </form>

        <p className="auth-switch">
          {t('auth.noAccount')}{' '}
          <Link to="/register">{t('auth.tabRegister')}</Link>
        </p>
      </div>
    </div>
  )
}