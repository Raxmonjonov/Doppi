import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, ArrowLeft, Camera, Check } from 'lucide-react'
import { useAuth } from '../data/auth'
import { useI18n } from '../i18n'
import { fileToDataUrl } from '../lib/upload'

const STEPS = ['email', 'username', 'photo', 'work'] as const
type Step = (typeof STEPS)[number]

export function RegisterPage() {
  const { t } = useI18n()
  const { register } = useAuth()

  const [step, setStep] = useState<Step>('email')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [avatar, setAvatar] = useState('')
  const [work, setWork] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const stepIndex = STEPS.indexOf(step)

  const pickFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    const url = await fileToDataUrl(file, 4, (msg) => setError(msg))
    if (url) setAvatar(url)
  }

  const next = () => {
    setError(null)
    if (step === 'email') {
      const em = email.trim().toLowerCase()
      if (!/^\S+@\S+\.\S+$/.test(em)) {
        setError(t('auth.invalidEmail'))
        return
      }
      setStep('username')
      return
    }
    if (step === 'username') {
      const un = username.trim()
      if (un.length < 3) {
        setError(t('auth.usernameTooShort'))
        return
      }
      setStep('photo')
      return
    }
    if (step === 'photo') {
      setStep('work')
    }
  }

  const back = () => {
    setError(null)
    const prev = STEPS[stepIndex - 1]
    if (prev) setStep(prev)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)

    if (password.length < 4) {
      setBusy(false)
      setError(t('auth.passwordTooShort'))
      return
    }

    const err = await register({
      name: username.trim(),
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password,
      avatar,
      about: work.trim(),
    })
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

        <div className="auth-steps" aria-label={t('auth.stepLabel')}>
          {STEPS.map((s, i) => (
            <div key={s} className={`auth-step${i <= stepIndex ? ' done' : ''}${i === stepIndex ? ' active' : ''}`} />
          ))}
        </div>

        <h1 className="auth-title">{t('auth.tabRegister')}</h1>

        <form className="auth-form" onSubmit={onSubmit}>
          {step === 'email' && (
            <label className="auth-field">
              <span>{t('auth.labelEmail')}</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.emailPlaceholder')} autoComplete="email" autoFocus />
            </label>
          )}

          {step === 'username' && (
            <>
              <label className="auth-field">
                <span>{t('auth.labelUsername')}</span>
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('auth.usernamePlaceholder')} autoComplete="username" autoFocus />
              </label>
              <label className="auth-field">
                <span>{t('auth.labelPassword')}</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
              </label>
            </>
          )}

          {step === 'photo' && (
            <div className="auth-photo">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => void pickFile(e.target.files?.[0])}
              />
              <div className={`auth-photo-preview${avatar ? ' has' : ''}`} onClick={() => fileRef.current?.click()}>
                {avatar ? (
                  <img src={avatar} alt="avatar" />
                ) : (
                  <Camera size={32} />
                )}
                <span className="auth-photo-check"><Check size={14} /></span>
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
                {avatar ? t('auth.changePhoto') : t('auth.addPhoto')}
              </button>
            </div>
          )}

          {step === 'work' && (
            <label className="auth-field">
              <span>{t('auth.labelWork')}</span>
              <input value={work} onChange={(e) => setWork(e.target.value)} placeholder={t('auth.workPlaceholder')} autoComplete="organization-title" autoFocus />
            </label>
          )}

          {error && (
            <div className="auth-error">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div className="auth-actions">
            {stepIndex > 0 && (
              <button type="button" className="btn btn-secondary auth-back" onClick={back}>
                <ArrowLeft size={16} /> {t('auth.back')}
              </button>
            )}
            {step !== 'work' ? (
              <button type="button" className="btn btn-primary auth-next" onClick={next}>
                {t('auth.next')} <ArrowRight size={16} />
              </button>
            ) : (
              <button type="submit" className="btn btn-primary auth-submit-inline" disabled={busy}>
                {busy ? t('auth.pleaseWait') : t('auth.registerSubmit')}
              </button>
            )}
          </div>
        </form>

        <p className="auth-switch">
          {t('auth.haveAccount')}{' '}
          <Link to="/login">{t('auth.tabLogin')}</Link>
        </p>
      </div>
    </div>
  )
}