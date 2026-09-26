import { useEffect, useRef, useState } from 'react'
import {
  Heart,
  MessageCircle,
  Share2,
  MoreHorizontal,
  Music2,
  Clapperboard,
  X,
  Send,
  Play,
  Check,
  Orbit,
} from 'lucide-react'
import { Avatar } from '../components/Avatar'
import type { Reel, User } from '../data/mock'
import { updateData, useData } from '../data/store'
import { useMe } from '../data/useMe'
import { useAuth } from '../data/auth'
import { uploadVideo } from '../lib/upload'
import { formatCount } from '../lib/format'
import { addReelComment, shareReel, sendReelToUser, toggleReelLike } from '../data/interactions'
import { useI18n } from '../i18n'
import { OrbitView } from '../components/OrbitView'

interface ReelItemProps {
  reel: Reel
  active: boolean
  peers: User[]
}

export function ReelItem({ reel, active, peers }: ReelItemProps) {
  const { t } = useI18n()
  const qualities = [
    { key: 'super', label: t('reels.qualitySuper') },
    { key: 'high', label: t('reels.qualityHigh') },
    { key: 'mid', label: t('reels.qualityMid') },
    { key: 'low', label: t('reels.qualityLow') },
  ]
  const videoRef = useRef<HTMLVideoElement>(null)
  const [progress, setProgress] = useState(0)
  const [showBar, setShowBar] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [selectedPeers, setSelectedPeers] = useState<Set<number>>(new Set())
  const [moreOpen, setMoreOpen] = useState(false)
  const [quality, setQuality] = useState('high')
  const [draft, setDraft] = useState('')

  const liked = !!reel.likedByMe

  const allSelected = selectedPeers.size === peers.length

  useEffect(() => {
    const v = videoRef.current
    if (!v || active) return
    v.pause()
  }, [active])

  useEffect(() => {
    if (!showBar) return
    const t = setTimeout(() => setShowBar(false), 3000)
    return () => clearTimeout(t)
  }, [showBar])

  const onTime = () => {
    const v = videoRef.current
    if (v && v.duration) setProgress(v.currentTime / v.duration)
  }

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.muted = false
      v.play().catch(() => undefined)
      setPlaying(true)
    } else {
      v.pause()
      setPlaying(false)
    }
  }

  const submitComment = (e: React.FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    void addReelComment(reel, { id: Date.now(), author: reel.author, text, time: t('common.now') })
    setDraft('')
  }

  const togglePeer = (id: number) => {
    setSelectedPeers((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedPeers(allSelected ? new Set() : new Set(peers.map((p) => p.id)))
  }

  const doShare = () => {
    if (selectedPeers.size === 0) return
    void shareReel(reel)
    selectedPeers.forEach((pid) => void sendReelToUser(reel, pid))
    setSelectedPeers(new Set())
    setShareOpen(false)
  }

  return (
    <div className="reels-frame">
      <video
        ref={videoRef}
        src={reel.image}
        loop
        playsInline
        preload="metadata"
        onClick={togglePlay}
        onTimeUpdate={onTime}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <div className="reels-overlay" />

      {!playing && (
        <button type="button" className="reels-play" onClick={togglePlay} aria-label={t('reels.play')}>
          <Play size={40} fill="currentColor" />
        </button>
      )}

      <div className="reels-top">
        <span style={{ color: '#fff', fontWeight: 600 }}>{reel.author.name}</span>
      </div>

      <div className="reels-side">
        <button type="button" className={`rfl-btn${liked ? ' active' : ''}`} onClick={() => void toggleReelLike(reel)}>
          <span className="rfl-icon">
            <Heart size={22} fill={liked ? 'currentColor' : 'none'} />
          </span>
          {formatCount(reel.likes)}
        </button>
        <button type="button" className="rfl-btn" onClick={() => setCommentsOpen(true)}>
          <span className="rfl-icon">
            <MessageCircle size={22} />
          </span>
          {formatCount(reel.comments.length)}
        </button>
        <button
          type="button"
          className="rfl-btn"
          onClick={() => {
            setSelectedPeers(new Set())
            setShareOpen(true)
          }}
        >
          <span className="rfl-icon">
            <Share2 size={22} />
          </span>
          {formatCount(reel.shares)}
        </button>
        <button type="button" className="rfl-btn" onClick={() => setMoreOpen((s) => !s)}>
          <span className="rfl-icon">
            <MoreHorizontal size={22} />
          </span>
        </button>
      </div>

      <div className="reels-caption">
        {reel.caption}
        <div className="sound-chip">
          <Music2 size={15} />
        </div>
      </div>

      <button type="button" className="reels-bottom-tap" onClick={() => setShowBar((s) => !s)} aria-label={t('reels.toggleProgress')} />

      <div className={`reels-progress${showBar ? ' show' : ''}`}>
        <div className="reels-progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>

      {moreOpen && (
        <div className="reels-share-menu">
          <div className="reels-quality-title">{t('reels.qualityTitle')}</div>
          {qualities.map((q) => (
            <button
              key={q.key}
              type="button"
              className={quality === q.key ? 'active' : ''}
              onClick={() => {
                setQuality(q.key)
                setMoreOpen(false)
              }}
            >
              <Check size={16} /> {q.label}
            </button>
          ))}
        </div>
      )}

      {shareOpen && (
        <div className="fn-overlay" onClick={() => setShareOpen(false)}>
          <div className="fn-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fn-modal-head">
              <h3>{t('reels.shareTitle')}</h3>
              <button type="button" className="icon-btn" onClick={() => setShareOpen(false)} aria-label={t('common.close')}>
                <X size={20} />
              </button>
            </div>
            <div className="reels-share-selectall">
              <span>{t('reels.selectAll')}</span>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            </div>
            <div className="reels-share-list">
              {peers.map((p) => (
                <label className="reels-share-item" key={p.id}>
                  <Avatar user={p} size={36} />
                  <span>
                    {p.name}
                    <small>@{p.username}</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={selectedPeers.has(p.id)}
                    onChange={() => togglePeer(p.id)}
                  />
                </label>
              ))}
            </div>
            <div className="post-form-footer">
              <button type="button" className="btn btn-outline" onClick={() => setShareOpen(false)}>
                {t('common.cancel')}
              </button>
              <button type="button" className="btn btn-primary" disabled={selectedPeers.size === 0} onClick={doShare}>
                <Send size={16} /> {t('reels.shareSend', { count: selectedPeers.size })}
              </button>
            </div>
          </div>
        </div>
      )}

      {commentsOpen && (
        <div className="fn-overlay" onClick={() => setCommentsOpen(false)}>
          <div className="fn-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fn-modal-head">
              <h3>{t('reels.commentsTitle', { count: reel.comments.length })}</h3>
              <button type="button" className="icon-btn" onClick={() => setCommentsOpen(false)} aria-label={t('common.close')}>
                <X size={20} />
              </button>
            </div>
            <div className="reel-comments">
              {reel.comments.length === 0 ? (
                <p className="reel-comments-empty">{t('reels.emptyComments')}</p>
              ) : (
                reel.comments.map((c) => (
                  <div className="reel-comment" key={c.id}>
                    <Avatar user={c.author} size={32} />
                    <div>
                      <span className="reel-comment-name">{c.author.name}</span>
                      <p>{c.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <form className="reel-comment-form" onSubmit={submitComment}>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('reels.commentPlaceholder')} />
              <button type="submit" className="btn btn-primary btn-sm" aria-label="Yuborish">
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export function Reels() {
  const { t } = useI18n()
  const me = useMe()
  const { accounts } = useAuth()
  const users: User[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    username: a.username,
    avatar: a.avatar,
    online: true,
    about: a.about,
  }))
  const reels = useData((d) => d.reels)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const [view, setView] = useState<'vertical' | 'orbit'>(() =>
    localStorage.getItem('doppi-view-reels-v1') === 'vertical' ? 'vertical' : 'orbit',
  )
  const fileRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const switchView = (v: 'vertical' | 'orbit') => {
    setView(v)
    localStorage.setItem('doppi-view-reels-v1', v)
  }

  const upload = () => fileRef.current?.click()

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError(null)
    const up = await uploadVideo(f, (msg) => setError(msg))
    if (!up) return
    const url = up.url
    const r: Reel = {
      id: Date.now(),
      author: me,
      image: url,
      caption: t('reels.defaultCaption'),
      sound: 'Original audio',
      likes: 0,
      comments: [],
      shares: 0,
      viewMode: 'none',
    }
    updateData((d) => {
      d.reels = [r, ...d.reels]
    })
    setActive(0)
  }

  const onScroll = () => {
    const el = scrollRef.current
    if (!el || reels.length === 0) return
    const idx = Math.round(el.scrollTop / el.clientHeight)
    setActive(Math.max(0, Math.min(idx, reels.length - 1)))
  }

  return (
    <div className="reels-page fade-in">
      <div className="reels-toolbar">
        <strong>{t('reels.pageTitle')}</strong>
        <button type="button" className="btn btn-primary btn-sm" onClick={upload}>
          <Clapperboard size={16} /> {t('reels.uploadVideo')}
        </button>
      </div>

      {error && <div className="upload-error">{error}</div>}

      {reels.length > 0 && (
        <div className="view-switch" role="group" aria-label="reels view">
          <button
            type="button"
            className={view === 'vertical' ? 'active' : ''}
            onClick={() => switchView('vertical')}
          >
            <Clapperboard size={16} />
            <span>{t('reels.viewVertical')}</span>
          </button>
          <button
            type="button"
            className={view === 'orbit' ? 'active' : ''}
            onClick={() => switchView('orbit')}
          >
            <Orbit size={16} />
            <span>{t('reels.viewOrbit')}</span>
          </button>
        </div>
      )}

      {reels.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-title">{t('reels.emptyTitle')}</div>
          <div className="empty-state-sub">{t('reels.emptySub')}</div>
          <button type="button" className="btn btn-primary" onClick={upload}>
            <Clapperboard size={18} /> {t('reels.uploadVideo')}
          </button>
        </div>
      ) : view === 'orbit' ? (
        <OrbitView
          items={reels.map((r) => ({
            id: r.id,
            thumb: r.image,
            name: r.author.name,
            likes: r.likes,
            createdAt: r.id,
          }))}
          title={t('reels.orbitTitle')}
          renderViewer={(item) => {
            const r = reels.find((x) => x.id === item.id)
            return r ? (
              <div className="orbit-reel">
                <ReelItem reel={r} active peers={users} />
              </div>
            ) : null
          }}
        />
      ) : (
        <div className="reels-scroll" ref={scrollRef} onScroll={onScroll}>
          {reels.map((r) => (
            <div className="reels-view" key={r.id}>
              <ReelItem reel={r} active={reels[active]?.id === r.id} peers={users} />
            </div>
          ))}
        </div>
      )}

      <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/ogg" style={{ display: 'none' }} onChange={onFile} />
    </div>
  )
}