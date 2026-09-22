import { useEffect, useRef, useState } from 'react'
import { Moon, Sun, Bell, Lock, Globe, Check, LogOut } from 'lucide-react'
import { useTheme } from '../theme/useTheme'
import { useAuth } from '../data/auth'
import { savedLangCodes, useI18n, languageName } from '../i18n'

export function Settings() {
  const { theme, toggle } = useTheme()
  const { user, logout } = useAuth()
  const { lang, setLang, t } = useI18n()
  const [emailNotifs, setEmailNotifs] = useState(() => localStorage.getItem('doppi-email-notifs-v1') !== 'off')
  const [twoFactor, setTwoFactor] = useState(() => localStorage.getItem('doppi-2fa-v1') === 'on')
  const [langOpen, setLangOpen] = useState(false)
  const langRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem('doppi-email-notifs-v1', emailNotifs ? 'on' : 'off')
  }, [emailNotifs])

  useEffect(() => {
    localStorage.setItem('doppi-2fa-v1', twoFactor ? 'on' : 'off')
  }, [twoFactor])

  useEffect(() => {
    if (!langOpen) return
    const onDoc = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [langOpen])

  return (
    <div className="fade-in" style={{ maxWidth: 640 }}>
      <h1 className="page-head">{t('settings.pageTitle')}</h1>
      <p className="page-sub">{t('settings.pageSub')}</p>

      <div className="card settings-card">
        <div className="setting-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {theme === 'light' ? <Sun size={20} /> : <Moon size={20} />}
            <div>
              <div className="setting-label">{t('settings.darkModeLabel')}</div>
              <div className="setting-desc">{theme === 'light' ? t('settings.lightModeDesc') : t('settings.darkModeDesc')}</div>
            </div>
          </div>
          <button type="button" role="switch" aria-checked={theme === 'dark'} className={`toggle${theme === 'dark' ? ' on' : ''}`} onClick={toggle}>
            <span className="knob">{theme === 'light' ? <Sun size={14} /> : <Moon size={14} />}</span>
          </button>
        </div>
      </div>

      <div className="card settings-card">
        <h4 style={{ marginBottom: 8 }}>{t('settings.notificationsTitle')}</h4>
        <div className="setting-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Bell size={20} />
            <div>
              <div className="setting-label">{t('settings.emailNotifsLabel')}</div>
              <div className="setting-desc">{t('settings.emailNotifsDesc')}</div>
            </div>
          </div>
          <button type="button" role="switch" aria-checked={emailNotifs} className={`toggle${emailNotifs ? ' on' : ''}`} onClick={() => setEmailNotifs((v) => !v)}>
            <span className="knob" />
          </button>
        </div>
        <div className="setting-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Lock size={20} />
            <div>
              <div className="setting-label">{t('settings.twoFactorLabel')}</div>
              <div className="setting-desc">{t('settings.twoFactorDesc')}</div>
            </div>
          </div>
          <button type="button" role="switch" aria-checked={twoFactor} className={`toggle${twoFactor ? ' on' : ''}`} onClick={() => setTwoFactor((v) => !v)}>
            <span className="knob" />
          </button>
        </div>
        <div
          className="setting-row lang-row"
          ref={langRef}
          role="button"
          tabIndex={0}
          onClick={() => setLangOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setLangOpen((v) => !v)
            }
          }}
          style={{ position: 'relative', cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Globe size={20} />
            <div>
              <div className="setting-label">{t('settings.languageLabel')}</div>
              <div className="setting-desc">{languageName(lang)}</div>
            </div>
          </div>
          {langOpen && (
            <div className="lang-dropdown">
              {savedLangCodes.map((code) => (
                <button
                  key={code}
                  type="button"
                  className={`lang-option${lang === code ? ' active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setLang(code)
                    setLangOpen(false)
                  }}
                >
                  <span className="lang-name">{languageName(code)}</span>
                  {lang === code && <Check size={15} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card settings-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h4 style={{ marginBottom: 8 }}>{t('settings.accountTitle')}</h4>
        <div className="setting-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <LogOut size={20} />
            <div>
              <div className="setting-label">{t('settings.logoutLabel')}</div>
              <div className="setting-desc">{user ? t('settings.logoutDesc', { name: user.username }) : ''}</div>
            </div>
          </div>
          <button type="button" className="btn btn-outline" onClick={() => void logout()}>
            {t('settings.logoutButton')}
          </button>
        </div>
      </div>
    </div>
  )
}