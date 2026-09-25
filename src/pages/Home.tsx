import { Link } from 'react-router-dom'
import { Play, List, Orbit } from 'lucide-react'
import { HomeComposer } from '../components/CreatePost'
import { StoriesRow } from '../components/StoriesRow'
import { PostCard } from '../components/PostCard'
import { OrbitView } from '../components/OrbitView'
import { useData } from '../data/store'
import { useI18n } from '../i18n'
import { useState } from 'react'

const DORMANT_MS = 24 * 60 * 60 * 1000

export function Home() {
  const { t } = useI18n()
  const posts = useData((d) => d.posts)
  const reels = useData((d) => d.reels)
  const [view, setView] = useState<'stream' | 'orbit'>(() =>
    localStorage.getItem('doppi-view-v1') === 'orbit' ? 'orbit' : 'stream',
  )

  const switchView = (v: 'stream' | 'orbit') => {
    setView(v)
    localStorage.setItem('doppi-view-v1', v)
  }

  const now = Date.now()
  const isStale = (p: { id: number }) => now - Number(p.id) > DORMANT_MS

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
        <OrbitView posts={posts} />
      ) : (
        posts.map((p) =>
          isStale(p) ? (
            <div key={p.id} className="wave-stale">
              <span className="wave-tag">{t('home.dormantWave')}</span>
              <PostCard post={p} />
            </div>
          ) : (
            <PostCard key={p.id} post={p} />
          ),
        )
      )}
    </div>
  )
}