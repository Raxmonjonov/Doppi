import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ImagePlus, Video, Smile, X, Send, Upload, Lock } from 'lucide-react'
import { useI18n } from '../i18n'
import { Avatar } from './Avatar'
import { Lightbox } from './Lightbox'
import { useMe } from '../data/useMe'
import type { Post } from '../data/mock'
import { updateData } from '../data/store'
import { uploadImage, uploadVideo } from '../lib/upload'

const SEAL_OPTIONS: { key: 'none' | 'hour1' | 'day1' | 'week1'; ms: number }[] = [
  { key: 'none', ms: 0 },
  { key: 'hour1', ms: 60 * 60 * 1000 },
  { key: 'day1', ms: 24 * 60 * 60 * 1000 },
  { key: 'week1', ms: 7 * 24 * 60 * 60 * 1000 },
]

function dispatch(kind: 'image' | 'video' | null) {
  if (kind) window.dispatchEvent(new CustomEvent('fn:pick-media', { detail: kind }))
  else window.dispatchEvent(new CustomEvent('fn:open-post'))
}

export function HomeComposer() {
  const me = useMe()
  const { t } = useI18n()
  return (
    <>
      <div className="card create-post" style={{ marginBottom: 20 }}>
        <Avatar user={me} size={42} />
        <button type="button" className="input-pill" onClick={() => dispatch(null)}>
          {t('createPost.composerPlaceholder', { name: me.name.split(' ')[0] })}
        </button>
      </div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="create-post-actions">
          <button type="button" className="cpa-item" onClick={() => dispatch('video')} style={{ color: 'var(--fn-danger)' }}>
            <Video size={20} /> {t('createPost.actionVideo')}
          </button>
          <button type="button" className="cpa-item" onClick={() => dispatch('image')} style={{ color: 'var(--fn-success)' }}>
            <ImagePlus size={20} /> {t('createPost.actionPhoto')}
          </button>
          <button type="button" className="cpa-item" onClick={() => window.dispatchEvent(new CustomEvent('fn:add-mood'))} style={{ color: 'var(--fn-warning)' }}>
            <Smile size={20} /> {t('createPost.actionMood')}
          </button>
        </div>
      </div>
    </>
  )
}

export function CreatePost() {
  const me = useMe()
  const { t } = useI18n()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [video, setVideo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<'image' | 'video' | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [seal, setSeal] = useState<'none' | 'hour1' | 'day1' | 'week1'>('none')
  const imageRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const open = () => setOpen(true)
    const pickMedia = (e: Event) => {
      setOpen(true)
      const kind = (e as CustomEvent).detail as 'image' | 'video'
      if (kind === 'image') imageRef.current?.click()
      else if (kind === 'video') videoRef.current?.click()
    }
    const addMood = () => {
      setOpen(true)
      setText((t) => t + (t ? ' ' : '') + ['😊', '🔥', '❤️', '🎉', '😂', '👍'][Math.floor(Math.random() * 6)])
    }
    window.addEventListener('fn:open-post', open)
    window.addEventListener('fn:pick-media', pickMedia)
    window.addEventListener('fn:add-mood', addMood)
    return () => {
      window.removeEventListener('fn:open-post', open)
      window.removeEventListener('fn:pick-media', pickMedia)
      window.removeEventListener('fn:add-mood', addMood)
    }
  }, [])

  useEffect(() => {
    setOpen(false)
    setText('')
    setImage(null)
    setVideo(null)
    setSeal('none')
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const readFile = async (file: File, kind: 'image' | 'video') => {
    setError(null)
    setUploading(kind)
    const res = kind === 'image' ? await uploadImage(file, setError) : await uploadVideo(file, setError)
    setUploading(null)
    if (!res) return
    if (kind === 'image') {
      setImage(res.url)
      setVideo(null)
    } else {
      setVideo(res.url)
      setImage(null)
    }
  }

  const submit = () => {
    const trimmed = text.trim()
    if (!trimmed && !image && !video) return
    const sealMs = SEAL_OPTIONS.find((o) => o.key === seal)?.ms ?? 0
    const post: Post = {
      id: Date.now(),
      author: me,
      time: t('common.now'),
      text: trimmed || '',
      images: image ? [image] : [],
      ...(video ? { video } : {}),
      likes: 0,
      comments: [],
      shared: 0,
      ...(sealMs > 0 ? { sealUntil: Date.now() + sealMs } : {}),
    }
    updateData((d) => {
      d.posts = [post, ...d.posts]
    })
    setText('')
    setImage(null)
    setVideo(null)
    setSeal('none')
    setOpen(false)
  }

  return (
    <> 
      {open && (
        <div className="fn-overlay" onClick={() => setOpen(false)}>
          <div className="fn-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fn-modal-head">
              <h3>{t('createPost.title')}</h3>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label={t('common.close')}>
                <X size={20} />
              </button>
            </div>
            <div className="post-form">
              <textarea
                autoFocus
                placeholder={t('createPost.textareaPlaceholder', { name: me.name.split(' ')[0] })}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              {error && <div className="upload-error">{error}</div>}
              {uploading && <div className="upload-progress">{uploading === 'image' ? t('upload.uploadingImage') : t('upload.uploadingVideo')}</div>}
              {(image || video) && (
                <div className="media-picker preview">
                  {image && (
                    <img src={image} alt="" className="selected" onClick={() => setPreviewOpen(true)}
                      style={{ cursor: 'zoom-in' }} />
                  )}
                  {video && <video src={video} controls muted className="selected" />
                  }
                  <button type="button" className="icon-btn" onClick={() => { setImage(null); setVideo(null) }} aria-label={t('createPost.removeMedia')}>
                    <X size={18} />
                  </button>
                </div>
              )}
              <div className="post-form-uploads">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => imageRef.current?.click()}>
                  <Upload size={15} /> {t('createPost.uploadPhoto')}
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => videoRef.current?.click()}>
                  <Video size={15} /> {t('createPost.uploadVideo')}
                </button>
              </div>
              <div className="seal-row">
                <span className="seal-row-label">
                  <Lock size={14} /> {t('createPost.sealLabel')}
                </span>
                <div className="seal-pills">
                  {SEAL_OPTIONS.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      className={`seal-pill${seal === o.key ? ' active' : ''}`}
                      onClick={() => setSeal(o.key)}
                    >
                      {t(`createPost.seal.${o.key}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="post-form-footer">
                <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
                  {t('common.cancel')}
                </button>
                <button type="button" className="btn btn-primary" onClick={submit} disabled={!text.trim() && !image && !video}>
                  <Send size={16} /> {t('createPost.submit')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <input
        ref={imageRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) readFile(f, 'image')
          e.target.value = ''
        }}
      />
      <input
        ref={videoRef}
        type="file"
        accept="video/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) readFile(f, 'video')
          e.target.value = ''
        }}
      />

      {image && previewOpen && (
        <Lightbox
          images={[image]}
          index={0}
          onClose={() => setPreviewOpen(false)}
          onIndex={() => undefined}
        />
      )}
    </>
  )
}
