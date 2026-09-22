import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ImagePlus, Video, Smile, X, Send, Upload } from 'lucide-react'
import { Avatar } from './Avatar'
import { Lightbox } from './Lightbox'
import { useMe } from '../data/useMe'
import type { Post } from '../data/mock'
import { updateData } from '../data/store'
import { fileToDataUrl } from '../lib/upload'

export function CreatePost() {
  const me = useMe()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [video, setVideo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const imageRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('fn:open-post', handler)
    return () => window.removeEventListener('fn:open-post', handler)
  }, [])

  useEffect(() => {
    setOpen(false)
    setText('')
    setImage(null)
    setVideo(null)
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
    const url = await fileToDataUrl(file, kind === 'image' ? 10 : 25, (msg) => setError(msg))
    if (!url) return
    if (kind === 'image') {
      setImage(url)
      setVideo(null)
    } else {
      setVideo(url)
      setImage(null)
    }
  }

  const submit = () => {
    const t = text.trim()
    if (!t && !image && !video) return
    const post: Post = {
      id: Date.now(),
      author: me,
      time: 'hozir',
      text: t || '',
      images: image ? [image] : [],
      ...(video ? { video } : {}),
      likes: 0,
      comments: [],
      shared: 0,
    }
    updateData((d) => {
      d.posts = [post, ...d.posts]
    })
    setText('')
    setImage(null)
    setVideo(null)
    setOpen(false)
  }

  return (
    <>
      <div className="card create-post" style={{ marginBottom: 20 }}>
        <Avatar user={me} size={42} />
        <button type="button" className="input-pill" onClick={() => setOpen(true)}>
          Nima yangiliklar, {me.name.split(' ')[0]}?
        </button>
      </div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="create-post-actions">
          <button
            type="button"
            className="cpa-item"
            onClick={() => {
              setOpen(true)
              videoRef.current?.click()
            }}
            style={{ color: 'var(--fn-danger)' }}
          >
            <Video size={20} /> Video
          </button>
          <button
            type="button"
            className="cpa-item"
            onClick={() => {
              setOpen(true)
              imageRef.current?.click()
            }}
            style={{ color: 'var(--fn-success)' }}
          >
            <ImagePlus size={20} /> Rasm
          </button>
          <button type="button" className="cpa-item" onClick={() => setOpen(true)} style={{ color: 'var(--fn-warning)' }}>
            <Smile size={20} /> Kayfiyat
          </button>
        </div>
      </div>

      {open && (
        <div className="fn-overlay" onClick={() => setOpen(false)}>
          <div className="fn-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fn-modal-head">
              <h3>Post yaratish</h3>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Yopish">
                <X size={20} />
              </button>
            </div>
            <div className="post-form">
              <textarea
                autoFocus
                placeholder={`Nima yangiliklar, ${me.name.split(' ')[0]}?`}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              {error && <div className="upload-error">{error}</div>}
              {(image || video) && (
                <div className="media-picker preview">
                  {image && (
                    <img src={image} alt="" className="selected" onClick={() => setPreviewOpen(true)}
                      style={{ cursor: 'zoom-in' }} />
                  )}
                  {video && <video src={video} controls muted className="selected" />
                  }
                  <button type="button" className="icon-btn" onClick={() => { setImage(null); setVideo(null) }} aria-label="O'chirish">
                    <X size={18} />
                  </button>
                </div>
              )}
              <div className="post-form-uploads">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => imageRef.current?.click()}>
                  <Upload size={15} /> Rasm yuklash
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => videoRef.current?.click()}>
                  <Video size={15} /> Video yuklash
                </button>
              </div>
              <div className="post-form-footer">
                <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
                  Bekor qilish
                </button>
                <button type="button" className="btn btn-primary" onClick={submit} disabled={!text.trim() && !image && !video}>
                  <Send size={16} /> Post qilish
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