import { ThumbsUp } from 'lucide-react'
import { pages } from '../data/mock'
import type { Page } from '../data/mock'

export function Pages() {
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}