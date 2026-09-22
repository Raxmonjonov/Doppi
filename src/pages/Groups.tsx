import { useRef, useState } from 'react'
import { Users, Plus, X, Upload, UserCheck, UserPlus } from 'lucide-react'
import type { Group } from '../data/mock'
import { updateData, useData } from '../data/store'
import { fileToDataUrl } from '../lib/upload'
import { useI18n } from '../i18n'

export function Groups() {
  const { t } = useI18n()
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
      setError(t('groups.errorNameRequired'))
      return
    }
    if (!cover) {
      setError(t('groups.errorCoverRequired'))
      return
    }
    const g: Group = {
      id: Date.now(),
      name: n,
      members: t('groups.defaultMembers'),
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

  const join = (g: Group) => {
    updateData((d) => {
      d.groups = d.groups.map((x) => (x.id === g.id ? { ...x, joined: !x.joined } : x))
    })
  }

  return (
    <div className="fade-in">
      <div className="page-head-row">
        <div>
          <h1 className="page-head">{t('groups.pageTitle')}</h1>
          <p className="page-sub">{t('groups.pageSub')}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          <Plus size={17} /> {t('groups.createButton')}
        </button>
      </div>

      <button type="button" className="group-create-card" onClick={() => setOpen(true)}>
        <span className="group-create-plus">
          <Plus size={24} strokeWidth={2.5} />
        </span>
        <span>
          <strong>{t('groups.createCardTitle')}</strong>
          <small>{t('groups.createCardHint')}</small>
        </span>
      </button>

      {groups.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-title">{t('groups.emptyTitle')}</div>
          <div className="empty-state-sub">{t('groups.emptySub')}</div>
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
                  <Users size={14} /> {g.members} · {g.joined ? t('groups.statusJoined') : t('groups.statusPublic')}
                </div>
                <button
                  type="button"
                  className={`btn ${g.joined ? 'btn-outline' : 'btn-primary'} btn-sm`}
                  onClick={() => join(g)}
                >
                  {g.joined ? <UserCheck size={15} /> : <UserPlus size={15} />}
                  {g.joined ? t('groups.joinedButton') : t('groups.joinButton')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fn-overlay" onClick={() => setOpen(false)}>
          <div className="fn-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fn-modal-head">
              <h3>{t('groups.modalTitle')}</h3>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label={t('common.close')}>
                <X size={20} />
              </button>
            </div>

            <div className="post-form">
              <div>
                <label className="form-label">{t('groups.labelName')}</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={t('groups.namePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label">{t('groups.labelCover')}</label>
                <button type="button" className="group-cover-picker" onClick={pickImage}>
                  {cover ? (
                    <img src={cover} alt={t('groups.coverAlt')} />
                  ) : (
                    <span>
                      <Upload size={22} />
                      {t('groups.pickImage')}
                    </span>
                  )}
                </button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
              </div>

              {error && <div className="upload-error">{error}</div>}

              <div className="post-form-footer">
                <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
                  {t('common.cancel')}
                </button>
                <button type="button" className="btn btn-primary" onClick={create}>
                  <Plus size={16} /> {t('groups.createSubmit')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}