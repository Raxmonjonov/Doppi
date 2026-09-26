import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, Hourglass } from 'lucide-react'
import { useAuth } from '../data/auth'
import { useData } from '../data/store'
import { useI18n } from '../i18n'
import { Avatar } from './Avatar'
import { LiveClock } from './LiveClock'
import { NotificationBell } from './NotificationBell'

export function Navbar() {
  const { t } = useI18n()
  const { accounts, user } = useAuth()
  const posts = useData((d) => d.posts)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [tick, setTick] = useState(() => Date.now())
  const wrapRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  let minUntil = Infinity
  let nextSeal: (typeof posts)[number] | undefined
  for (const p of posts) {
    if (p.sealUntil && p.sealUntil > tick && p.sealUntil < minUntil) {
      minUntil = p.sealUntil
      nextSeal = p
    }
  }

  const sealRest = nextSeal && nextSeal.sealUntil && nextSeal.sealUntil > tick ? nextSeal.sealUntil - tick : 0
  const sealText =
    sealRest > 0
      ? `${Math.floor(sealRest / 3600000)}:${String(Math.floor((sealRest % 3600000) / 60000)).padStart(2, '0')}:${String(Math.floor((sealRest % 60000) / 1000)).padStart(2, '0')}`
      : ''

  const q = query.trim().toLowerCase()
  const results = q
    ? accounts
        .filter((a) => a.id !== user?.id)
        .filter((a) => a.name.toLowerCase().includes(q) || a.username.toLowerCase().includes(q))
        .slice(0, 8)
    : []

  const pick = (id: number) => {
    setOpen(false)
    setQuery('')
    navigate(`/profile?user=${id}`)
  }

  return (
    <header className="fn-navbar">
      <Link to="/" className="fn-logo">Do'ppi</Link>

      <div className="fn-search fn-search-wrap" ref={wrapRef}>
        <Search size={18} />
        <input
          type="text"
          placeholder={t('navbar.searchPlaceholder')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
        />
        {open && (
          <div className="search-dropdown">
            {q && results.length === 0 ? (
              <div className="search-empty">{t('navbar.searchNoResults')}</div>
            ) : (
              results.map((a) => (
                <button key={a.id} type="button" className="search-item" onClick={() => pick(a.id)}>
                  <Avatar user={{ id: a.id, name: a.name, username: a.username, avatar: a.avatar, online: true, about: a.about }} size={36} />
                  <span className="search-item-meta">
                    <span className="search-item-name">{a.name}</span>
                    <small>@{a.username}</small>
                  </span>
                </button>
              ))
            )}
            {!q && <div className="search-empty">{t('navbar.searchPrompt')}</div>}
          </div>
        )}
      </div>

      {nextSeal && (
        <Link to="/seals" className="fn-soat-chip" title={`${t('navbar.nextSeal')} · ${nextSeal.author.name}`}>
          <span className="fn-soat-ic">
            <Hourglass size={14} />
          </span>
          <span className="fn-soat-text">{sealText}</span>
        </Link>
      )}

      <NotificationBell />
      <LiveClock />
    </header>
  )
}