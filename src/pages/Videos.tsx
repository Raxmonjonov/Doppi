import { useRef, useState } from 'react'
import { Clapperboard, Trash2, Upload, X, Play } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { FullscreenVideo } from '../components/FullscreenVideo'
import { useMe } from '../data/useMe'
import type { LongVideo, LiveOwner } from '../data/store'
import type { User } from '../data/mock'
import { pullData, useData } from '../data/store'
import { useI18n } from '../i18n'
import { api } from '../api/client'
import { uploadVideo } from '../lib/upload'

function fmtDur(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  return `${m}:${String(r).padStart(2, '0')}`
}

function fmtWhen(ts: number): string {
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

export default function Videos() {
  const { t } = useI18n()
  const me = useMe()
  const videos = useData((d) => d.videos)
  const [open, setOpen] = useState<LongVideo | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [deleting, setDeleting] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const sorted = [...videos].sort((a, b) => b.createdAt - a.createdAt)

  const pickFile = () => fileRef.current?.click()

  const onFile = async (file?: File | null) => {
    if (!file) return
    setBusy(true)
    setErr('')
    try {
      const media = await uploadVideo(file, (msg) => setErr(msg))
      if (!media) {
        setBusy(false)
        return
      }
      const title = file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 120) || 'Video'
      await api('/api/videos', { method: 'POST', body: { title, src: media.url, duration: 0 } })
      if (fileRef.current) fileRef.current.value = ''
      await pullData()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async (v: LongVideo) => {
    if (!globalThis.confirm(t('video.deleteConfirm'))) return
    setDeleting(v.id)
    setErr('')
    try {
      await api(`/api/videos/${v.id}`, { method: 'DELETE' })
      if (open?.id === v.id) setOpen(null)
      await pullData()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <section className="videos-page">
      <header className="videos-head">
        <div>
          <h2>{t('video.title')}</h2>
          <p>{t('live.replay')}</p>
        </div>
        <button type="button" className="btn" disabled={busy} onClick={pickFile}>
          <Upload size={18} /> {t('video.upload')}
        </button>
      </header>
      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      {err ? <p className="fn-error">{err}</p> : null}
      {busy ? <p className="fn-muted">{t('app.loading')}</p> : null}

      <div className="videos-grid">
        {sorted.map((v) => {
          const mine = !!me && me.id === v.owner.id
          return (
            <div key={`v-${v.id}`} className="video-card">
              <button
                type="button"
                className="video-thumb"
                onClick={() => v.src && setOpen(v)}
                onContextMenu={(e) => e.preventDefault()}
                disabled={!v.src}
              >
                {v.src ? <Play size={36} className="video-play" /> : <Clapperboard size={30} />}
                {v.type === 'live' ? <span className="live-badge stale-badge">{t('video.typeLive')}</span> : null}
                {v.duration ? <span className="video-dur">{fmtDur(v.duration)}</span> : null}
              </button>
              <div className="video-card-body">
                <Avatar user={avatarUser(v.owner)} size={30} />
                <div className="video-card-text">
                  <strong>{v.title || t('video.typeLive')}</strong>
                  <span>
                    {v.owner.name} · {fmtWhen(v.createdAt)}
                  </span>
                </div>
                {mine ? (
                  <button
                    type="button"
                    className="icon-btn video-del"
                    disabled={deleting === v.id}
                    title={t('video.delete')}
                    aria-label={t('video.delete')}
                    onClick={() => void onDelete(v)}
                  >
                    <Trash2 size={16} />
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
      {sorted.length === 0 ? <p className="fn-empty">{t('video.noVideos')}</p> : null}

      {open?.src ? (
        <div className="video-modal" role="dialog" aria-modal="true">
          <button type="button" className="video-modal-close" onClick={() => setOpen(null)} aria-label="Yopish">
            <X size={22} />
          </button>
          <FullscreenVideo
            src={open.src}
            title={open.title || t('video.typeLive')}
            autoPlay
            onClose={() => setOpen(null)}
          />
        </div>
      ) : null}
    </section>
  )
}