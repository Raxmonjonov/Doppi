import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useAuth } from '../data/auth'
import { useI18n } from '../i18n'
import { Avatar } from './Avatar'

export function Navbar() {
  const { t } = useI18n()
  const { accounts, user } = useAuth()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
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
    </header>
  )
}