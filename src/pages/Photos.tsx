import { useRef, useState } from 'react'
import { Heart, Image as ImageIcon, Upload } from 'lucide-react'
import type { Album } from '../data/mock'
import { updateData, useData } from '../data/store'
import { Lightbox } from '../components/Lightbox'
import { formatCount } from '../lib/format'
import { toggleAlbumLike } from '../data/interactions'

export function Photos() {
  const albums = useData((d) => d.albums)
  const fileRef = useRef<HTMLInputElement>(null)
  const album = albums[0]

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    const urls: string[] = []
    let done = 0
    files.forEach((f) => {
      const reader = new FileReader()
      reader.onload = () => {
        urls.push(String(reader.result))
        done++
        if (done === files.length) {
          const photos = urls.map((url) => ({ url }))
          updateData((d) => {
            if (d.albums[0]) {
              const a = d.albums[0]
              d.albums = [{ ...a, count: a.count + photos.length, photos: [...a.photos, ...photos] }]
            } else {
              const a: Album = { id: 1, title: 'Fotosuratlarim', count: photos.length, likes: 0, photos }
              d.albums = [a]
            }
          })
        }
      }
      reader.readAsDataURL(f)
    })
    e.target.value = ''
  }

  return (
    <div className="fade-in">
      <h1 className="page-head">Fotoalbomlar</h1>
      <p className="page-sub">Faqat siz yuklagan rasmlar saqlanadi.</p>

      {!album ? (
        <div className="card empty-state">
          <div className="empty-state-title">Albomlar hozircha bo'sh</div>
          <div className="empty-state-sub">O'z rasmlaringizni yuklab, albom yarating.</div>
          <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
            <Upload size={18} /> Rasm yuklash
          </button>
        </div>
      ) : (
        <div className="albums-grid">
          <AlbumGridData album={album} />
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onFiles} />
    </div>
  )
}

function AlbumGridData({ album }: { album: Album }) {
  const [tagOpen, setTagOpen] = useState<number | null>(null)
  const [lightIndex, setLightIndex] = useState<number | null>(null)
  const urls = album.photos.map((p) => p.url)
  return (
    <div className="card album-card">
      <div className="album-cover-wrap">
        <img src={album.photos[0].url} alt={album.title} loading="lazy" onClick={() => setLightIndex(0)} />
        <div className="album-hover">
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ImageIcon size={16} /> {album.count}
          </span>
          <button
            type="button"
            className={`album-like${album.likedByMe ? ' active' : ''}`}
            onClick={() => void toggleAlbumLike(album)}
            aria-label="Albomga yoqdi"
          >
            <Heart size={16} fill={album.likedByMe ? 'currentColor' : 'none'} /> {formatCount(album.likes)}
          </button>
        </div>
      </div>
      <div className="album-meta">
        <div className="title">{album.title}</div>
        <div className="sub">Siz bilan bo'lishildi · {album.count} ta rasm</div>
      </div>
      <div style={{ padding: '0 12px 12px' }}>
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