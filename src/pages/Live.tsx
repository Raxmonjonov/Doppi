import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Radio, Clapperboard, Play, Eye } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import type { Live, LiveOwner } from '../data/store'
import type { User } from '../data/mock'
import { useData, updateLocal } from '../data/store'
import { useMe } from '../data/useMe'
import { useI18n } from '../i18n'
import { api } from '../api/client'
import { formatCount } from '../lib/format'

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function avatarUser(o: LiveOwner): User {
  return { id: o.id, name: o.name, username: o.username, avatar: o.avatar, online: false }
}

function fmtDur(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  return `${m}:${String(r).padStart(2, '0')}`
}

interface LiveCardProps {
  live: Live
  mine: boolean
  ending: boolean
  onOpen: (live: Live) => void
  onEnd: (live: Live) => void
}

function LiveCard({ live, mine, ending, onOpen, onEnd }: LiveCardProps) {
  const { t } = useI18n()
  const active = live.status === 'live'
  return (
    <div className="live-card">
      <button type="button" className="live-card-main" onClick={() => onOpen(live)}>
        <div className={`live-thumb${active ? ' live-thumb-live' : ''}`}>
          {active ? (
            <>
              <span className="live-badge">
                <i className="live-dot" /> {t('live.live')}
              </span>
              <span className="live-viewers">
                <Eye size={13} /> {formatCount(live.viewers)}
              </span>
            </>
          ) : live.video ? (
            <Play size={34} className="live-play" />
          ) : (
            <span className="live-ended-tag">{t('live.stopped')}</span>
          )}
          <span className="live-mini">{active ? live.title || t('live.title') : `${fmtDur(live.duration ?? 0)}`}</span>
        </div>
        <div className="live-card-body">
          <Avatar user={avatarUser(live.owner)} size={34} />
          <div className="live-card-text">
            <strong>{live.title || (active ? t('live.title') : t('video.typeLive'))}</strong>
            <span>
              {live.owner.name} · {active ? `${formatCount(live.viewers)} ${t('live.viewers', { n: live.viewers })}` : timeAgo(live.endedAt ?? live.startedAt)}
            </span>
          </div>
        </div>
      </button>
      {mine && active ? (
        <button type="button" className="btn btn-danger live-card-end" disabled={ending} onClick={() => onEnd(live)}>
          {ending ? '…' : t('live.end')}
        </button>
      ) : null}
    </div>
  )
}

export default function Live() {
  const { t } = useI18n()
  const me = useMe()
  const navigate = useNavigate()
  const lives = useData((d) => d.lives)
  const active = lives.filter((l) => l.status === 'live')
  const ended = lives.filter((l) => l.status === 'ended' && !!l.video)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [ending, setEnding] = useState<number | null>(null)
  const [err, setErr] = useState('')

  const openLive = (live: Live) => {
    if (live.status === 'live') navigate(`/live/${live.id}`)
    else navigate('/videos')
  }

  const goLive = async () => {
    setErr('')
    setBusy(true)
    try {
      const out = await api<{ live: Live }>('/api/lives', { method: 'POST', body: { title: title.trim() } })
      // Efirni store'ga darhol qo'shamiz — xona (BroadcastRoom) live'ni
      // /api/data poll'ini kutmasin (sekin tarmoqda bu 15s+ kutish edi).
      updateLocal((d) => {
        d.lives = [out.live, ...d.lives.filter((l) => l.id !== out.live.id)]
      })
      navigate(`/live/${out.live.id}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const endOwnLive = async (live: Live) => {
    if (!globalThis.confirm(t('live.endConfirm'))) return
    setEnding(live.id)
    setErr('')
    try {
      await api(`/api/lives/${live.id}/end`, { method: 'POST', body: { video: '', duration: live.duration ?? 0, title: live.title } })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setEnding(null)
    }
  }

  return (
    <section className="live-page">
      <header className="live-head">
        <div>
          <h2>{t('live.title')}</h2>
          <p>{t('live.live')} — {t('live.replay')}</p>
        </div>
        <button type="button" className="btn" onClick={() => setOpen((o) => !o)}>
          <Radio size={18} /> {t('live.start')}
        </button>
      </header>

      {open && (
        <div className="live-start-panel">
          <input
            className="form-input"
            value={title}
            maxLength={90}
            placeholder={t('live.titlePlaceholder')}
            onChange={(e) => setTitle(e.target.value)}
          />
          {err ? <p className="fn-error">{err}</p> : null}
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void goLive()}>
            {busy ? '…' : t('live.goLive')}
          </button>
          {me?.name ? (
            <p className="live-me-hint">
              <Avatar user={avatarUser({ id: me.id, name: me.name, username: me.username ?? '', avatar: me.avatar ?? '' })} size={20} /> <span>{me.name}</span>
            </p>
          ) : null}
        </div>
      )}

      <div className="live-grid">
        {active.map((l) => (
          <LiveCard
            key={`live-${l.id}`}
            live={l}
            mine={!!me && me.id === l.owner.id}
            ending={ending === l.id}
            onOpen={openLive}
            onEnd={endOwnLive}
          />
        ))}
        {ended.map((l) => (
          <LiveCard key={`ended-${l.id}`} live={l} mine={false} ending={false} onOpen={openLive} onEnd={endOwnLive} />
        ))}
      </div>
      {active.length === 0 && ended.length === 0 ? <p className="fn-empty">{t('live.noLives')}</p> : null}

      <h3 className="live-sub">
        <Clapperboard size={18} /> {t('video.title')}
      </h3>
    </section>
  )
}