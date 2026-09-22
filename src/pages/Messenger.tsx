import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Send, Image, Search, Pin, PinOff, Trash2 } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import type { Message } from '../data/mock'
import { useMe } from '../data/useMe'
import { useAuth } from '../data/auth'
import { api } from '../api/client'

interface RawThread {
  id: number
  user: { id: number; name: string; username: string; avatar: string; online: boolean }
  online: boolean
  messages: { id: number; from: number; text: string; time: string }[]
}

interface Thread {
  id: number
  user: RawThread['user']
  online: boolean
  messages: Message[]
}

function isOwnMessage(from: number, myId: number): boolean {
  return String(from) === String(myId)
}

function toThread(t: RawThread): Thread {
  return {
    id: t.id,
    user: t.user,
    online: t.online,
    messages: t.messages,
  }
}

async function loadThreads(): Promise<RawThread[]> {
  try {
    const { threads } = await api<{ threads: RawThread[] }>('/api/threads')
    return threads
  } catch {
    return []
  }
}

export function Messenger() {
  const me = useMe()
  const { accounts } = useAuth()
  const [threads, setThreads] = useState<Thread[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [userQuery, setUserQuery] = useState('')
  const [startOpen, setStartOpen] = useState(false)
  const [pinned, setPinned] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('doppi-pinned-v1') || '[]') as number[]
    } catch {
      return []
    }
  })
  const [menuThreadId, setMenuThreadId] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const togglePin = (id: number) => {
    setPinned((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
      try {
        localStorage.setItem('doppi-pinned-v1', JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
    setMenuThreadId(null)
  }

  const deleteThread = async (id: number) => {
    setMenuThreadId(null)
    setThreads((prev) => prev.filter((t) => t.id !== id))
    if (activeId === id) setActiveId(null)
    try {
      await api(`/api/threads/${id}`, { method: 'DELETE' })
    } catch {
      /* ignore */
    }
  }

  const active = threads.find((t) => t.id === activeId) ?? threads[0]

  useEffect(() => {
    let alive = true
    const fetchThreads = async () => {
      const ts = await loadThreads()
      if (!alive) return
      setThreads(ts.map((t) => toThread(t)))
    }
    void fetchThreads()
    const iv = setInterval(fetchThreads, 5000)
    return () => {
      alive = false
      clearInterval(iv)
    }
  }, [me.id])

  useEffect(() => {
    if (menuThreadId === null) return
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuThreadId(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuThreadId])

  const startChat = async (userId: number) => {
    setStartOpen(false)
    setUserQuery('')
    try {
      const { thread } = await api<{ thread: RawThread }>('/api/threads', {
        method: 'POST',
        body: { user: userId },
      })
      const mine = toThread(thread)
      setThreads((prev) => {
        const exists = prev.some((t) => t.id === mine.id)
        return exists ? prev : [...prev, mine]
      })
      setActiveId(mine.id)
    } catch {
      /* ignore */
    }
  }

  const send = async () => {
    const text = draft.trim()
    const target = activeId ?? threads[0]?.id
    if (!text || !target) return
    const msg: Message = { id: Date.now(), from: me.id, text, time: 'hozir' }
    setThreads((prev) => prev.map((t) => (t.id === target ? { ...t, messages: [...t.messages, msg] } : t)))
    setDraft('')
    try {
      await api(`/api/threads/${target}/messages`, { method: 'POST', body: { text } })
    } catch {
      /* offline — message stays local until next sync */
    }
  }

  const q = userQuery.trim().toLowerCase()
  const candidates = (q
    ? accounts
        .filter((a) => a.id !== me.id)
        .filter((a) => a.name.toLowerCase().includes(q) || a.username.toLowerCase().includes(q))
    : accounts.filter((a) => a.id !== me.id)
  ).map((a) => ({ id: a.id, name: a.name, username: a.username, avatar: a.avatar, online: true }))

  if (threads.length === 0 && !startOpen) {
    return (
      <div className="fade-in">
        <div className="card empty-state">
          <div className="empty-state-title">Xabarlar hozircha yo'q</div>
          <div className="empty-state-sub">Suhbat boshlash uchun qidiruvdan foydalanuvchi tanlang.</div>
          <button type="button" className="btn btn-primary" onClick={() => setStartOpen(true)}>
            <Search size={16} /> Yangi xabar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="messenger fade-in">
      <aside className="card threads">
        <div className="threads-head">
          Xabarlar
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setStartOpen((v) => !v)}>
            <Search size={14} /> Yangi
          </button>
        </div>
        {startOpen && (
          <SendUserPanel
            candidates={candidates}
            q={q}
            setQ={setUserQuery}
            onPick={startChat}
          />
        )}
        <div style={{ overflowY: 'auto', position: 'relative' }}>
          {[...threads]
            .sort((a, b) => {
              const pa = pinned.includes(a.id) ? 1 : 0
              const pb = pinned.includes(b.id) ? 1 : 0
              return pb - pa
            })
            .map((t) => {
              const last = t.messages[t.messages.length - 1]
              return (
                <div key={t.id} className={`thread-wrap${pinned.includes(t.id) ? ' pinned' : ''}`}>
                  <button
                    type="button"
                    className={`thread-row${t.id === activeId ? ' active' : ''}`}
                    onClick={() => setActiveId(t.id)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setMenuThreadId(t.id)
                    }}
                  >
                    <Avatar user={t.user} size={46} showOnline />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="name">
                        {pinned.includes(t.id) && <Pin size={12} className="pin-icon" />}
                        {t.user.name}
                      </div>
                      <div className="last">{last?.text}</div>
                    </div>
                  </button>
                  {menuThreadId === t.id && (
                    <div className="thread-menu" ref={menuRef}>
                      <button
                        type="button"
                        onClick={() => togglePin(t.id)}
                      >
                        {pinned.includes(t.id) ? <PinOff size={16} /> : <Pin size={16} />}
                        {pinned.includes(t.id) ? 'Pindan olib tashlash' : 'Pin qilish'}
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          if (window.confirm('Suhbat butunlay o\'chirilsinmi?')) void deleteThread(t.id)
                        }}
                      >
                        <Trash2 size={16} /> O'chirish
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      </aside>

      {active && (
        <section className="card chat-panel">
          <header className="chat-head">
            <Avatar user={active.user} size={40} showOnline={active.online} />
            <div>
              <Link to={`/profile?user=${active.user.id}`} className="chat-name">
                {active.user.name}
              </Link>
              <div className="status">{active.online ? 'Online' : 'Oxirgi marta: bugun'}</div>
            </div>
          </header>

          <div className="chat-messages">
            {active.messages.map((m) => (
              <div key={m.id} className={`msg ${isOwnMessage(m.from, me.id) ? 'mine' : 'theirs'}`}>
                {m.text}
                <span className="time">{m.time}</span>
              </div>
            ))}
            {active.messages.length === 0 && (
              <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--fn-text-muted)', padding: '12px 0' }}>
                Salom ayting — suhbatni boshlang!
              </div>
            )}
          </div>

          <footer className="chat-input">
            <button type="button" className="icon-btn" aria-label="Rasm yuklash">
              <Image size={20} />
            </button>
            <input
              type="text"
              placeholder={`${me.name.split(' ')[0]} sifatida xabar yozing...`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void send()
              }}
            />
            <button type="button" className="btn btn-primary" onClick={() => void send()} aria-label="Yuborish">
              <Send size={18} />
            </button>
          </footer>
        </section>
      )}
    </div>
  )
}

interface PanelProps {
  candidates: { id: number; name: string; username: string; avatar: string; online: boolean }[]
  q: string
  setQ: (v: string) => void
  onPick: (id: number) => void
}

function SendUserPanel({ candidates, q, setQ, onPick }: PanelProps) {
  return (
    <div className="send-user-panel">
      <div className="send-user-search">
        <Search size={16} />
        <input
          type="text"
          placeholder="Foydalanuvchini qidirish..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="send-user-list">
        {candidates.length === 0 && <div className="send-user-empty">Hech kim topilmadi</div>}
        {candidates.map((u) => (
          <button key={u.id} type="button" className="send-user-item" onClick={() => onPick(u.id)}>
            <Avatar user={u} size={40} showOnline />
            <span>
              {u.name}
              <small>@{u.username}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}