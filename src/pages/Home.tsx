import { Link } from 'react-router-dom'
import { Play, List, Orbit, Waves } from 'lucide-react'
import { HomeComposer } from '../components/CreatePost'
import { StoriesRow } from '../components/StoriesRow'
import { PostCard } from '../components/PostCard'
import { OrbitView } from '../components/OrbitView'
import { Avatar } from '../components/Avatar'
import { useData } from '../data/store'
import { useI18n } from '../i18n'
import { useState } from 'react'

const FRESH_MS = 60 * 60 * 1000
const DORMANT_MS = 24 * 60 * 60 * 1000

export function Home() {
  const { t } = useI18n()
  const posts = useData((d) => d.posts)
  const reels = useData((d) => d.reels)
  const [view, setView] = useState<'stream' | 'orbit'>(() =>
    localStorage.getItem('doppi-view-v1') === 'stream' ? 'stream' : 'orbit',
  )

  const switchView = (v: 'stream' | 'orbit') => {
    setView(v)
    localStorage.setItem('doppi-view-v1', v)
  }

  const now = Date.now()
  const ageOf = (p: { id: number }) => now - Number(p.id)
  const isFresh = (p: { id: number }) => ageOf(p) <= FRESH_MS
  const isStale = (p: { id: number }) => ageOf(p) > DORMANT_MS
  const isSealed = (p: { id: number; sealUntil?: number }) => !!p.sealUntil && now < p.sealUntil
  const dormant = posts.filter(isStale)

  return (
    <div>
      <HomeComposer />
      <StoriesRow />

      {posts.length > 0 && (
        <div className="view-switch" role="group" aria-label="view">
          <button
            type="button"
            className={view === 'stream' ? 'active' : ''}
            onClick={() => switchView('stream')}
          >
            <List size={16} />
            <span>{t('home.viewStream')}</span>
          </button>
          <button
            type="button"
            className={view === 'orbit' ? 'active' : ''}
            onClick={() => switchView('orbit')}
          >
            <Orbit size={16} />
            <span>{t('home.viewOrbit')}</span>
          </button>
        </div>
      )}

      {reels.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="reels-strip-head">
            <span className="reels-strip-title">{t('home.reelsStripTitle')}</span>
            <Link to="/reels" className="reels-strip-more">
              {t('home.seeAll')}
            </Link>
          </div>
          <div className="reels-strip">
            {reels.slice(0, 12).map((r) => (
              <Link to="/reels" key={r.id} className="reels-strip-item">
                <video src={r.image} muted loop playsInline preload="metadata" />
                <span className="reels-strip-play">
                  <Play size={18} fill="currentColor" />
                </span>
                <span className="reels-strip-name">{r.author.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {posts.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-title">{t('home.emptyPostsTitle')}</div>
          <div className="empty-state-sub">{t('home.emptyPostsSub')}</div>
        </div>
      ) : view === 'orbit' ? (
        <OrbitView
          items={posts.map((p) => ({
            id: p.id,
            thumb: isSealed(p) ? undefined : p.images[0],
            name: p.author.name,
            likes: p.likes,
            live: p.live,
            sealed: isSealed(p),
            createdAt: p.id,
          }))}
          renderViewer={(item) => {
            const p = posts.find((x) => x.id === item.id)
            return p ? <PostCard post={p} /> : null
          }}
        />
      ) : (
        <>
          {posts.map((p) =>
            isStale(p) ? (
              <div key={p.id} className="wave-stale">
                <span className="wave-tag">{t('home.dormantWave')}</span>
                <PostCard post={p} />
              </div>
            ) : (
              <div key={p.id} className={isFresh(p) && !isSealed(p) ? 'post-fresh' : undefined}>
                <PostCard post={p} />
              </div>
            ),
          )}

          {dormant.length > 0 && (
            <div className="card horizon-card">
              <details className="horizon-details">
                <summary>
                  <Waves size={18} />
                  <span className="horizon-title">{t('home.horizonTitle')}</span>
                  <b className="horizon-count">{dormant.length}</b>
                  <span className="horizon-chev" />
                </summary>
                <div className="horizon-list">
                  {dormant.map((p) => (
                    <div className="horizon-item" key={p.id}>
                      <Avatar user={p.author} size={34} />
                      <div className="horizon-item-main">
                        <b>{p.author.name}</b>
                        <p>{p.text || (p.images[0] ? t('home.horizonPhoto') : '')}</p>
                      </div>
                      <span className="horizon-item-time">{p.time}</span>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </>
      )}
    </div>
  )
}