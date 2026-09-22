import { useState } from 'react'
import { X, Search } from 'lucide-react'
import type { User } from '../data/mock'
import { useAuth } from '../data/auth'
import { useMe } from '../data/useMe'
import { Avatar } from './Avatar'

interface ShareDialogProps {
  open: boolean
  onClose: () => void
  onPick: (user: User) => void
}

export function ShareDialog({ open, onClose, onPick }: ShareDialogProps) {
  const me = useMe()
  const { accounts } = useAuth()
  const [q, setQ] = useState('')

  if (!open) return null

  const query = q.trim().toLowerCase()
  const peers: User[] = accounts
    .filter((a) => a.id !== me.id)
    .filter((a) => !query || a.name.toLowerCase().includes(query) || a.username.toLowerCase().includes(query))
    .map((a) => ({ id: a.id, name: a.name, username: a.username, avatar: a.avatar, online: true, about: a.about }))

  const pick = (u: User) => {
    setQ('')
    onPick(u)
  }

  return (
    <div className="fn-overlay" onClick={onClose}>
      <div className="fn-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fn-modal-head">
          <h3>Ulashish</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Yopish">
            <X size={20} />
          </button>
        </div>

        <div className="send-user-panel">
          <div className="send-user-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Foydalanuvchini qidirish..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
          </div>
          <div className="send-user-list">
            {peers.length === 0 && <div className="send-user-empty">Hech kim topilmadi</div>}
            {peers.map((u) => (
              <button key={u.id} type="button" className="send-user-item" onClick={() => pick(u)}>
                <Avatar user={u} size={40} showOnline />
                <span>
                  {u.name}
                  <small>@{u.username}</small>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="post-form-footer" style={{ padding: '0 16px 16px' }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Bekor qilish
          </button>
        </div>
      </div>
    </div>
  )
}