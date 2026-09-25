import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, FolderPlus, Heart, Image as ImageIcon, Plus, Upload, Hourglass, Lock } from 'lucide-react'
import type { Album } from '../data/mock'
import { updateData, useData } from '../data/store'
import { Lightbox } from '../components/Lightbox'
import { formatCount } from '../lib/format'
import { toggleAlbumLike } from '../data/interactions'
import { useI18n } from '../i18n'

const MAX_ALBUMS = 10
const MAX_PHOTOS = 30

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

function isSealed(a: Album, now: number): boolean {
  return !!a.sealUntil && now < a.sealUntil
}

export function Photos() {
  const { t } = useI18n()
  const albums = useData((d) => d.albums)
  const [openId, setOpenId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const [createSeal, setCreateSeal] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadTarget = useRef<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const totalPhotos = albums.reduce((n, a) => n + a.count, 0)
  const album = albums.find((a) => a.id === openId) ?? null
  const canAddAlbum = albums.length < MAX_ALBUMS
  const canUpload = totalPhotos < MAX_PHOTOS

  const submitCreation = () => {
    const title = draft.trim() || t('photos.defaultAlbumTitle')
    if (title && canAddAlbum) {
      updateData((d) => {
        d.albums = [
          ...d.albums,
          {
            id: Date.now(),
            title,
            count: 0,
            likes: 0,
            photos: [],
            ...(createSeal ? { sealUntil: Date.now() + createSeal } : {}),
          },
        ]
      })
      setDraft('')
      setCreateSeal(null)
      setCreating(false)
    }
  }

  const sealLabel = (v: number | null) =>
    v === 3600000 ? t('postCard.seal.hour1') : v === 86400000 ? t('postCard.seal.day1') : v === 604800000 ? t('postCard.seal.week1') : t('postCard.seal.none')

  const openUpload = (targetId: number | null) => {
    if (!canUpload) return
    uploadTarget.current = targetId
    fileRef.current?.click()
  }

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    const targetId = uploadTarget.current
    const remaining = Math.max(0, MAX_PHOTOS - totalPhotos)
    const take = files.slice(0, remaining)
    const urls: string[] = []
    let done = 0
    take.forEach((f) => {
      const reader = new FileReader()
      reader.onload = () => {
        urls.push(String(reader.result))
        done++
        if (done === take.length) {
          const photos = urls.map((url) => ({ url }))
          updateData((d) => {
            if (targetId === null) {
              d.albums = [...d.albums, { id: Date.now(), title: t('photos.defaultAlbumTitle'), count: photos.length, likes: 0, photos }]
            } else {
              d.albums = d.albums.map((a) =>
                a.id === targetId ? { ...a, count: a.count + photos.length, photos: [...a.photos, ...photos] } : a,
              )
            }
          })
        }
      }
      reader.readAsDataURL(f)
    })
    e.target.value = ''
  }

  if (album) {
    return (
      <div className="fade-in">
        <div className="album-detail-head">
          <button type="button" className="icon-btn" onClick={() => setOpenId(null)} aria-label={t('photos.backToAlbums')}>
            <ArrowLeft size={20} />
          </button>
          <div className="album-detail-title">{album.title}</div>
          <button type="button" className="btn btn-primary" onClick={() => openUpload(album.id)} disabled={!canUpload}>
            <Upload size={18} /> {t('photos.addPhotos')}
          </button>
        </div>
        {!canUpload && <div className="photos-limit-note">{t('photos.photoLimitReached')}</div>}
        <AlbumDetail album={album} now={now} />
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onFiles} />
      </div>
    )
  }

  return (
    <div className="fade-in">
      <h1 className="page-head">{t('photos.pageTitle')}</h1>
      <p className="page-sub">
        {t('photos.pageSub')} <span className="photos-progress">{t('photos.totalProgress', { count: totalPhotos })}</span>
      </p>

      {albums.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-title">{t('photos.emptyTitle')}</div>
          <div className="empty-state-sub">{t('photos.emptySub')}</div>
          <div className="empty-actions">
            <button type="button" className="btn btn-primary" onClick={() => openUpload(null)}>
              <Upload size={18} /> {t('photos.uploadPhotos')}
            </button>
            <button type="button" className="btn" onClick={() => setCreating(true)}>
              <FolderPlus size={18} /> {t('photos.newAlbum')}
            </button>
          </div>
        </div>
      ) : (
        <div className="albums-grid">
          {albums.map((a) => (
            <div className="card album-card" key={a.id}>
              <div className="album-cover-wrap" onClick={() => setOpenId(a.id)}>
                {isSealed(a, now) ? (
                  <div className="album-cover-sealed">
                    <span className="album-cover-seal-ic">
                      <Lock size={22} />
                    </span>
                    <span className="album-cover-seal-rest">{formatRest((a.sealUntil as number) - now)}</span>
                  </div>
                ) : a.photos[0] ? (
                  <img src={a.photos[0].url} alt={a.title} loading="lazy" />
                ) : (
                  <div className="album-cover-empty">
                    <ImageIcon size={34} />
                  </div>
                )}
                <div className="album-hover">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ImageIcon size={16} /> {a.count}
                  </span>
                  <button
                    type="button"
                    className={`album-like${a.likedByMe ? ' active' : ''}`}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      void toggleAlbumLike(a)
                    }}
                    aria-label={t('photos.likeAlbum')}
                  >
                    <Heart size={16} fill={a.likedByMe ? 'currentColor' : 'none'} /> {formatCount(a.likes)}
                  </button>
                </div>
              </div>
              <div className="album-meta">
                <div className="title">{a.title}</div>
                <div className="sub">
                  {isSealed(a, now) ? (
                    <span className="album-seal-badge">
                      <Hourglass size={13} /> {t('photos.sealedSub')}
                    </span>
                  ) : (
                    t('photos.photoCount', { count: a.count })
                  )}
                </div>
              </div>
            </div>
          ))}
          {canAddAlbum && (
            <button type="button" className="card album-new-tile" onClick={() => setCreating(true)}>
              <Plus size={26} />
              <span>{t('photos.newAlbum')}</span>
            </button>
          )}
        </div>
      )}
      {!canUpload && albums.length > 0 && <div className="photos-limit-note">{t('photos.photoLimitReached')}</div>}

      {creating && (
        <div className="fn-overlay" onClick={() => setCreating(false)}>
          <div className="fn-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fn-modal-head">{t('photos.createAlbum')}</div>
            <div style={{ padding: 16 }}>
              <input
                autoFocus
                className="form-input"
                placeholder={t('photos.albumNamePlaceholder')}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitCreation()}
              />
              <div className="seal-row">
                <span className="seal-row-label">
                  <Lock size={14} /> {t('photos.sealPickerLabel')}
                </span>
                <div className="seal-pills">
                  {[null, 3600000, 86400000, 604800000].map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      className={`seal-pill${createSeal === v ? ' active' : ''}`}
                      onClick={() => setCreateSeal(v)}
                    >
                      {sealLabel(v)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="post-form-footer">
              <button type="button" className="btn" onClick={() => setCreating(false)}>
                {t('common.cancel')}
              </button>
              <button type="button" className="btn btn-primary" onClick={submitCreation}>
                {t('photos.createAlbum')}
              </button>
            </div>
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onFiles} />
    </div>
  )
}

function AlbumDetail({ album, now }: { album: Album; now: number }) {
  const { t } = useI18n()
  const [tagOpen, setTagOpen] = useState<number | null>(null)
  const [lightIndex, setLightIndex] = useState<number | null>(null)
  const [justRevealed, setJustRevealed] = useState(false)
  const wasSealedRef = useRef(false)
  const sealedNow = isSealed(album, now)
  const urls = album.photos.map((p) => p.url)

  useEffect(() => {
    if (wasSealedRef.current && !sealedNow) {
      setJustRevealed(true)
      const id = window.setTimeout(() => setJustRevealed(false), 2600)
      wasSealedRef.current = sealedNow
      return () => window.clearTimeout(id)
    }
    wasSealedRef.current = sealedNow
    return
  }, [sealedNow])

  if (album.photos.length === 0) {
    return (
      <div className="card empty-state">
        <div className="empty-state-title">{t('photos.albumEmptyTitle')}</div>
        <div className="empty-state-sub">{t('photos.albumEmptySub')}</div>
      </div>
    )
  }

  if (sealedNow) {
    return (
      <div className="card album-card album-view">
        <div className="album-seal-hero">
          <div className="seal-wall-medallion">
            <Hourglass size={30} />
          </div>
          <div className="album-seal-title">{t('photos.sealedHeroTitle')}</div>
          <div className="album-seal-sub">{t('photos.sealedHeroSub')}</div>
          <div className="seal-wall-rest">{formatRest((album.sealUntil as number) - now)}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="card album-card album-view">
      <div className="album-media-wrap">
        {justRevealed && (
          <div className="reveal-flash">
            <span className="reveal-ic">✦</span>
            <span>{t('postCard.revealFlash')}</span>
          </div>
        )}
        <div className="album-media">
          {album.photos.map((p, i) => (
            <div className="cell" key={i}>
              <img src={p.url} alt="" loading="lazy" onClick={() => setLightIndex(i)} />
              {p.tag && (
                <>
                  <button
                    type="button"
                    className="photo-tag"
                    style={{ top: `${p.tag.y}%`, left: `${p.tag.x}%` }}
                    onClick={() => setTagOpen(tagOpen === i ? null : i)}
                    aria-label={p.tag.name}
                  />
                  {tagOpen === i && <span className="photo-tag-pop">{p.tag.name}</span>}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      {lightIndex !== null && (
        <Lightbox images={urls} index={lightIndex} onClose={() => setLightIndex(null)} onIndex={setLightIndex} />
      )}
    </div>
  )
}