import { useRef, useState } from 'react'
import { Users, Plus, X, Upload } from 'lucide-react'
import type { Group } from '../data/mock'
import { updateData, useData } from '../data/store'
import { fileToDataUrl } from '../lib/upload'

export function Groups() {
  const groups = useData((d) => d.groups)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [cover, setCover] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const pickImage = () => fileRef.current?.click()

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError(null)
    const url = await fileToDataUrl(f, 8, (msg) => setError(msg))
    if (url) setCover(url)
  }

  const create = () => {
    const n = name.trim()
    if (!n) {
      setError('Guruh nomini kiriting.')
      return
    }
    if (!cover) {
      setError('Guruh uchun rasm tanlang.')
      return
    }
    const g: Group = {
      id: Date.now(),
      name: n,
      members: '1 a\'zo',
      cover,
      joined: true,
    }
    updateData((d) => {
      d.groups = [g, ...d.groups]
    })
    setName('')
    setCover('')
    setOpen(false)
  }

  return (
    <div className="fade-in">
      <div className="page-head-row">
        <div>
          <h1 className="page-head">Guruhlar</h1>
          <p className="page-sub">O'zingizga mos jamoalarni toping va qo'shiling.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          <Plus size={17} /> Guruh yaratish
        </button>
      </div>

      <button type="button" className="group-create-card" onClick={() => setOpen(true)}>
        <span className="group-create-plus">
          <Plus size={24} strokeWidth={2.5} />
        </span>
        <span>
          <strong>Yangi guruh yaratish</strong>
          <small>Nom va rasm qo'shib guruh yarating</small>
        </span>
      </button>

      {groups.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-title">Guruhlar hozircha yo'q</div>
          <div className="empty-state-sub">Yuqoridagi tugma orqali birinchi guruhingizni yaratishingiz mumkin.</div>
        </div>
      ) : (
        <div className="cards-grid">
          {groups.map((g: Group) => (
            <div className="card entity-card" key={g.id}>
              <div className="entity-cover">
                <img src={g.cover} alt={g.name} loading="lazy" />
              </div>
              <div className="entity-body">
                <div className="title">{g.name}</div>
                <div className="sub">
                  <Users size={14} /> {g.members} · Jamoat guruhi
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fn-overlay" onClick={() => setOpen(false)}>
          <div className="fn-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fn-modal-head">
              <h3>Yangi guruh yaratish</h3>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Yopish">
                <X size={20} />
              </button>
            </div>

            <div className="post-form">
              <div>
                <label className="form-label">Guruh nomi</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Masalan: Do'stlar"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label">Guruh rasmi</label>
                <button type="button" className="group-cover-picker" onClick={pickImage}>
                  {cover ? (
                    <img src={cover} alt="Guruh rasmi" />
                  ) : (
                    <span>
                      <Upload size={22} />
                      Rasm tanlash
                    </span>
                  )}
                </button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
              </div>

              {error && <div className="upload-error">{error}</div>}

              <div className="post-form-footer">
                <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
                  Bekor qilish
                </button>
                <button type="button" className="btn btn-primary" onClick={create}>
                  <Plus size={16} /> Yaratish
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}