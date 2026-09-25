import { useEffect, useState } from 'react'
import { Hourglass } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { useData } from '../data/store'
import { useI18n } from '../i18n'

function formatRest(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (d > 0) return `${d}k ${h}so`
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function SealCard({ id, name, avatar, until }: { id: number; name: string; avatar: string; until: number }) {
  const { t } = useI18n()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [])

  const rest = until - now
  if (rest <= 0) return null
  const by = new Date(until)

  return (
    <div className="seal-wall-card" title={`${name} · ${t('sealWall.opensAt')} ${by.toLocaleTimeString()}`}>
      <div className="seal-wall-medallion">
        <Hourglass size={26} />
      </div>
      <div className="seal-wall-rest">{formatRest(rest)}</div>
      <div className="seal-wall-author">
        <Avatar user={{ id, name, avatar, online: true, username: '', about: '' }} size={20} />
        <span>{name}</span>
      </div>
      <div className="seal-wall-caption">{t('sealWall.revealHint')}</div>
    </div>
  )
}

export default function SealWall() {
  const { t } = useI18n()
  const posts = useData((d) => d.posts)
  const now = Date.now()
  const sealed = posts
    .filter((p) => p.sealUntil && p.sealUntil > now)
    .sort((a, b) => (a.sealUntil as number) - (b.sealUntil as number))

  return (
    <div>
      <header className="page-head">
        <h1 className="page-title">{t('sealWall.title')}</h1>
        <p className="page-sub">{t('sealWall.sub')}</p>
      </header>

      {sealed.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-title">{t('sealWall.emptyTitle')}</div>
          <div className="empty-state-sub">{t('sealWall.emptySub')}</div>
        </div>
      ) : (
        <div className="seal-wall-grid">
          {sealed.map((p) => (
            <SealCard key={p.id} id={p.author.id} name={p.author.name} avatar={p.author.avatar} until={p.sealUntil as number} />
          ))}
        </div>
      )}
    </div>
  )
}