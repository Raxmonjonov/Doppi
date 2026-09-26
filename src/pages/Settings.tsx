import { useCallback, useEffect, useRef, useState } from 'react'
import { Moon, Sun, Bell, Lock, Globe, Check, LogOut, MonitorSmartphone, ShieldOff, Volume2, BellRing } from 'lucide-react'
import { api } from '../api/client'
import { useTheme } from '../theme/useTheme'
import { useAuth } from '../data/auth'
import { useNotifications } from '../data/notifications'
import { savedLangCodes, useI18n, languageName } from '../i18n'

interface SessionInfo {
  ua: string
  createdAt: string | null
  lastSeen: number | null
  expiresAt: number | null
  current: boolean
}

export function Settings() {
  const { theme, toggle } = useTheme()
  const { user, logout } = useAuth()
  const { lang, setLang, t } = useI18n()
  const {
  permission,
  permissionGranted,
  requestPermission,
  soundOn,
  setSoundOn,
  pushSupported,
  pushEnabled,
  pushBusy,
  enablePush,
  disablePush,
} = useNotifications()
  const [emailNotifs, setEmailNotifs] = useState(() => localStorage.getItem('doppi-email-notifs-v1') !== 'off')
  const [twoFactor, setTwoFactor] = useState(() => localStorage.getItem('doppi-2fa-v1') === 'on')
  const [langOpen, setLangOpen] = useState(false)
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [sessionsBusy, setSessionsBusy] = useState(false)
  const [sessionNote, setSessionNote] = useState<string | null>(null)

  const loadSessions = useCallback(async () => {
    try {
      const r = await api<{ sessions: SessionInfo[] }>('/api/auth/sessions')
      setSessions(r.sessions ?? [])
    } catch {
      /* sessiya yo'q bo'lsa jimgina qoldiramiz */
    }
  }, [])

  useEffect(() => {
    if (user) void loadSessions()
  }, [user, loadSessions])

  const logoutAll = async () => {
    setSessionsBusy(true)
    setSessionNote(null)
    try {
      const r = await api<{ revoked: number }>('/api/auth/logout-all', { method: 'POST' })
      setSessionNote(t('settings.logoutAllDone', { count: r.revoked ?? 0 }))
      await logout()
    } catch (e) {
      setSessionNote(e instanceof Error ? e.message : 'Xatolik')
    } finally {
      setSessionsBusy(false)
    }
  }
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
        <h4 style={{ marginBottom: 8 }}>{t('notif.title')}</h4>
        <div className="setting-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <BellRing size={20} />
            <div>
              <div className="setting-label">{t('notif.enableTitle')}</div>
              <div className="setting-desc">
                {permission === 'unsupported'
                  ? t('notif.unsupported')
                  : permissionGranted
                    ? t('notif.enabled')
                    : permission === 'denied'
                      ? t('notif.blocked')
                      : t('notif.enableDesc')}
              </div>
            </div>
          </div>
          {!permissionGranted && permission !== 'unsupported' && permission !== 'denied' && (
            <button type="button" className="btn btn-outline" onClick={() => void requestPermission()}>
              {t('notif.enable')}
            </button>
          )}
        </div>

        <div className="setting-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Volume2 size={20} />
            <div>
              <div className="setting-label">{t('notif.sound')}</div>
              <div className="setting-desc">{t('notif.soundDesc')}</div>
            </div>
          </div>
          <button
            type="button"
            className={`btn ${soundOn ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setSoundOn(!soundOn)}
          >
            {soundOn ? t('notif.enabled') : t('notif.enable')}
          </button>
        </div>

        <div className="setting-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <BellRing size={20} />
            <div>
              <div className="setting-label">{t('notif.pushTitle')}</div>
              <div className="setting-desc">
                {!pushSupported
                  ? t('notif.pushUnsupported')
                  : pushEnabled
                    ? t('notif.pushEnabled')
                    : permission === 'denied'
                      ? t('notif.blocked')
                      : t('notif.pushDesc')}
              </div>
            </div>
          </div>
          {pushSupported && permission !== 'denied' && (
            <button
              type="button"
              className={`btn ${pushEnabled ? 'btn-outline' : 'btn-primary'}`}
              disabled={pushBusy}
              onClick={() => void (pushEnabled ? disablePush() : enablePush())}
            >
              {pushBusy ? '…' : pushEnabled ? t('notif.pushDisable') : t('notif.pushEnable')}
            </button>
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

        <div className="setting-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ShieldOff size={20} />
            <div>
              <div className="setting-label">{t('settings.logoutAllLabel')}</div>
              <div className="setting-desc">{t('settings.logoutAllDesc')}</div>
            </div>
          </div>
          <button type="button" className="btn btn-outline" onClick={() => void logoutAll()} disabled={sessionsBusy}>
            {sessionsBusy ? t('auth.pleaseWait') : t('settings.logoutAllButton')}
          </button>
        </div>

        {sessionNote && <div className="auth-note">{sessionNote}</div>}

        {sessions.length > 0 && (
          <div className="session-list">
            <div className="setting-label">{t('settings.sessionsTitle')}</div>
            {sessions.map((s, i) => (
              <div className="session-row" key={`${s.lastSeen ?? 'x'}-${i}`}>
                <MonitorSmartphone size={16} />
                <div>
                  <div className="setting-label">
                    {s.ua || t('settings.sessionsUnknown')}
                    {s.current && <span className="session-current"> · {t('settings.sessionsThis')}</span>}
                  </div>
                  <div className="setting-desc">
                    {s.lastSeen ? new Date(s.lastSeen).toLocaleString() : ''}
                    {s.expiresAt ? ` · ${t('settings.sessionsUntil')} ${new Date(s.expiresAt).toLocaleDateString()}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}