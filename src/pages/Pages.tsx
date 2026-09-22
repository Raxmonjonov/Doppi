import { useState } from 'react'
import { ThumbsUp, Check } from 'lucide-react'
import { pages } from '../data/mock'
import type { Page } from '../data/mock'

export function Pages() {
  const [subscribed, setSubscribed] = useState<Record<number, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('doppi-pages-v1') || '{}')
    } catch {
      return {}
    }
  })

  const toggle = (id: number) => {
    setSubscribed((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try {
        localStorage.setItem('doppi-pages-v1', JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  return (
    <div className="fade-in">
      <h1 className="page-head">Sahifalar</h1>
      <p className="page-sub">Sevimli brend va ijodkorlarni kuzating.</p>

      {pages.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-title">Sahifalar hozircha yo'q</div>
          <div className="empty-state-sub">Hozircha hech qanday sahifa mavjud emas.</div>
        </div>
      ) : (
        <div className="cards-grid">
          {pages.map((p: Page) => (
            <div className="card entity-card" key={p.id}>
              <div className="entity-cover">
                <img src={p.cover} alt={p.name} loading="lazy" />
              </div>
              <div className="entity-body">
                <div className="title">{p.name}</div>
                <div className="sub">
                  <ThumbsUp size={14} /> {p.followers} · {p.category}
                </div>
                <button
                  type="button"
                  className={`btn ${subscribed[p.id] ? 'btn-outline' : 'btn-primary'} btn-sm`}
                  onClick={() => toggle(p.id)}
                >
                  <Check size={15} /> {subscribed[p.id] ? 'Obuna bo\'lingan' : 'Obuna bo\'lish'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}