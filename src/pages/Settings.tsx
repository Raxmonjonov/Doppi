import { useEffect, useRef, useState } from 'react'
import { Moon, Sun, Bell, Lock, Globe, Check, LogOut } from 'lucide-react'
import { useTheme } from '../theme/useTheme'
import { useAuth } from '../data/auth'
import { languages } from '../data/languages'

export function Settings() {
  const { theme, toggle } = useTheme()
  const { user, logout } = useAuth()
  const [emailNotifs, setEmailNotifs] = useState(() => localStorage.getItem('doppi-email-notifs-v1') !== 'off')
  const [twoFactor, setTwoFactor] = useState(() => localStorage.getItem('doppi-2fa-v1') === 'on')
  const [langOpen, setLangOpen] = useState(false)
  const storedLangCode = localStorage.getItem('doppi-lang-v1')
  const [lang, setLang] = useState(
    () => languages.find((l) => l.code === storedLangCode) ?? languages[0],
  )
  const langRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem('doppi-email-notifs-v1', emailNotifs ? 'on' : 'off')
  }, [emailNotifs])

  useEffect(() => {
    localStorage.setItem('doppi-2fa-v1', twoFactor ? 'on' : 'off')
  }, [twoFactor])

  const pickLang = (l: (typeof languages)[number]) => {
    setLang(l)
    localStorage.setItem('doppi-lang-v1', l.code)
    setLangOpen(false)
  }

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
      <h1 className="page-head">Sozlamalar</h1>
      <p className="page-sub">Hisobingiz va xabarnomalarni boshqaring.</p>

      <div className="card settings-card">
        <div className="setting-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {theme === 'light' ? <Sun size={20} /> : <Moon size={20} />}
            <div>
              <div className="setting-label">Tungi rejim</div>
              <div className="setting-desc">{theme === 'light' ? 'Kunduzgi rejim yoqilgan' : 'Tungi rejim yoqilgan'}</div>
            </div>
          </div>
          <button type="button" role="switch" aria-checked={theme === 'dark'} className={`toggle${theme === 'dark' ? ' on' : ''}`} onClick={toggle}>
            <span className="knob">{theme === 'light' ? <Sun size={14} /> : <Moon size={14} />}</span>
          </button>
        </div>
      </div>

      <div className="card settings-card">
        <h4 style={{ marginBottom: 8 }}>Xabarnomalar</h4>
        <div className="setting-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Bell size={20} />
            <div>
              <div className="setting-label">E-mail xabarnomalari</div>
              <div className="setting-desc">Yangi faollik haqida xat yuborish</div>
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
              <div className="setting-label">Ikki bosqichli himoya</div>
              <div className="setting-desc">Kirishda qo\u2018shimcha kod talab qilish</div>
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
              <div className="setting-label">Til</div>
              <div className="setting-desc">{lang.name}</div>
            </div>
          </div>
          {langOpen && (
            <div className="lang-dropdown">
              {languages.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  className={`lang-option${lang.code === l.code ? ' active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    pickLang(l)
                  }}
                >
                  <span className="lang-name">{l.name}</span>
                  {lang.code === l.code && <Check size={15} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card settings-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h4 style={{ marginBottom: 8 }}>Hisob</h4>
        <div className="setting-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <LogOut size={20} />
            <div>
              <div className="setting-label">Chiqish</div>
              <div className="setting-desc">{user ? `@${user.username} sifatida tizimdan chiqing` : ''}</div>
            </div>
          </div>
          <button type="button" className="btn btn-outline" onClick={() => void logout()}>
            Chiqish
          </button>
        </div>
      </div>
    </div>
  )
}