import { useEffect, useState } from 'react'
import { Hourglass, Clock } from 'lucide-react'
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

function formatAge(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (d > 0) return `${d}k${m > 0 ? ` ${m}m` : ''}`
  if (h > 0) return `${h}so${m > 0 ? ` ${m}m` : ''}`
  if (m > 0) return `${m}m`
  return `${total % 60}s`
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
  const albums = useData((d) => d.albums)
  const now = Date.now()
  const sealed = posts
    .filter((p) => p.sealUntil && p.sealUntil > now)
    .sort((a, b) => (a.sealUntil as number) - (b.sealUntil as number))

  interface Opened {
    id: number
    kind: 'post' | 'album'
    name: string
    sub: string
    opened: number
  }

  const opened: Opened[] = [
    ...posts
      .filter((p) => p.sealUntil && p.sealUntil <= now)
      .map((p) => ({
        id: p.id,
        kind: 'post' as const,
        name: p.author.name,
        sub: p.text || (p.images[0] ? t('sealWall.photoPost') : ''),
        opened: p.sealUntil as number,
      })),
    ...albums
      .filter((a) => a.sealUntil && a.sealUntil <= now)
      .map((a) => ({
        id: a.id,
        kind: 'album' as const,
        name: a.title || t('photos.defaultAlbumTitle'),
        sub: t('photos.photoCount', { count: a.count }),
        opened: a.sealUntil as number,
      })),
  ]
    .sort((a, b) => b.opened - a.opened)
    .slice(0, 8)

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

      {opened.length > 0 && (
        <div className="seal-wall-divider">
          <span>
            <Clock size={14} />
            {t('sealWall.openedTitle')}
          </span>
          <em>{t('sealWall.openedSub')}</em>
        </div>
      )}

      {opened.length > 0 && (
        <div className="card trail-wall">
          <div className="trail-wall-items">
            {opened.map((it) => {
              const just = now - it.opened < 60 * 1000
              return (
                <div className={`trail-item${just ? ' just' : ''}`} key={`${it.kind}-${it.id}`}>
                  <span className="trail-item-med">
                    <Hourglass size={13} />
                  </span>
                  <span className="trail-item-main">
                    <b>{it.name}</b>
                    <p>{it.sub}</p>
                  </span>
                  <span className="trail-item-meta">
                    {just ? (
                      <b className="trail-item-just">{t('sealWall.justOpened')}</b>
                    ) : (
                      <em>{t('sealWall.openedIn', { rest: formatAge(now - it.opened) })}</em>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}