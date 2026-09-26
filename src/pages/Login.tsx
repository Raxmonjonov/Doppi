import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, KeyRound } from 'lucide-react'
import { useAuth } from '../data/auth'
import { useI18n } from '../i18n'
import { api } from '../api/client'

export function LoginPage() {
  const { t } = useI18n()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [mode, setMode] = useState<'login' | 'forgot'>('login')
  const [step, setStep] = useState<'user' | 'code'>('user')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [devCode, setDevCode] = useState<string | null>(null)

  /* Xabardagi havola: /login?username=...&forgot=1 — foydalanuvchi allaqachon
     emailingizga yuborilgan kodni kiritish bosqichiga to'g'ridan-to'g'ri o'tadi. */
  const [params] = useSearchParams()
  const fromEmailLink = params.get('forgot') === '1' && !!params.get('username')
  const [linkHandled, setLinkHandled] = useState(false)
  if (fromEmailLink && !linkHandled) {
    setLinkHandled(true)
    setUsername(params.get('username') ?? '')
    setMode('forgot')
    setStep('code')
    setNotice(t('auth.forgotSentToEmail'))
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const err = await login(username, password)
    setBusy(false)
    if (err) setError(err)
  }

  const backToLogin = () => {
    setMode('login')
    setStep('user')
    setCode('')
    setNewPassword('')
    setNotice(null)
    setDevCode(null)
    setError(null)
  }

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const r = await api<{ ok: boolean; debugCode?: string }>('/api/auth/forgot', {
        method: 'POST',
        token: null,
        body: { username },
      })
      setNotice(t('auth.forgotSentToEmail'))
      setDevCode(r.debugCode ?? null)
      setStep('code')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik')
    } finally {
      setBusy(false)
    }
  }

  const saveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await api('/api/auth/reset', {
        method: 'POST',
        token: null,
        body: { username, code, password: newPassword },
      })
      setPassword(newPassword)
      setNotice(t('auth.resetDone'))
      setStep('user')
      setCode('')
      setNewPassword('')
      setDevCode(null)
      setMode('login')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik')
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'forgot') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="auth-logo">Do'ppi</div>
            <p className="auth-tag">{t('auth.tagline')}</p>
          </div>

          <h1 className="auth-title">{t('auth.forgotTitle')}</h1>

          {step === 'user' ? (
            <form className="auth-form" onSubmit={sendCode}>
              <label className="auth-field">
                <span>{t('auth.labelUsername')}</span>
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('auth.usernamePlaceholder')} autoComplete="username" />
              </label>

              {notice && <div className="auth-note">{notice}</div>}

              {error && (
                <div className="auth-error">
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              <button type="submit" className="btn btn-primary auth-submit" disabled={busy || !username}>
                <KeyRound size={16} /> {busy ? t('auth.pleaseWait') : t('auth.forgotSend')}
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={saveNewPassword}>
              {notice && <div className="auth-note">{notice}</div>}
              {devCode && <div className="auth-note">{t('auth.forgotDevCode', { code: devCode })}</div>}

              <label className="auth-field">
                <span>{t('auth.forgotCodeLabel')}</span>
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" inputMode="numeric" autoComplete="one-time-code" />
              </label>

              <label className="auth-field">
                <span>{t('auth.forgotNewPassword')}</span>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t('auth.passwordPlaceholder')} autoComplete="new-password" />
              </label>

              {error && (
                <div className="auth-error">
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              <button type="submit" className="btn btn-primary auth-submit" disabled={busy || !code || newPassword.length < 4}>
                {busy ? t('auth.pleaseWait') : t('auth.resetSubmit')}
              </button>

              <button
                type="button"
                className="auth-linkbtn"
                disabled={busy}
                onClick={() => {
                  setStep('user')
                  setNotice(null)
                  setError(null)
                }}
              >
                {t('auth.forgotResend')}
              </button>
            </form>
          )}

          <p className="auth-switch">
            <button type="button" className="auth-linkbtn" onClick={backToLogin}>
              <ArrowLeft size={14} /> {t('auth.backToLogin')}
            </button>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">Do'ppi</div>
          <p className="auth-tag">{t('auth.tagline')}</p>
        </div>

        <h1 className="auth-title">{t('auth.tabLogin')}</h1>

        {notice && <div className="auth-note">{notice}</div>}

        <form className="auth-form" onSubmit={onSubmit}>
          <label className="auth-field">
            <span>{t('auth.labelUsername')}</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('auth.usernamePlaceholder')} autoComplete="username" />
          </label>

          <label className="auth-field">
            <span>{t('auth.labelPassword')}</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('auth.passwordPlaceholder')} autoComplete="current-password" />
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
          <button type="button" className="auth-linkbtn" onClick={() => { setMode('forgot'); setNotice(null); setError(null) }}>
            {t('auth.forgotLink')}
          </button>
        </p>

        <p className="auth-switch">
          {t('auth.noAccount')}{' '}
          <Link to="/register">{t('auth.tabRegister')}</Link>
        </p>
      </div>
    </div>
  )
}
