import { Link } from 'react-router-dom'
import { Play } from 'lucide-react'
import { HomeComposer } from '../components/CreatePost'
import { StoriesRow } from '../components/StoriesRow'
import { PostCard } from '../components/PostCard'
import { useData } from '../data/store'
import { useI18n } from '../i18n'

export function Home() {
  const { t } = useI18n()
  const posts = useData((d) => d.posts)
  const reels = useData((d) => d.reels)

  return (
    <div>
      <HomeComposer />
      <StoriesRow />

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
      ) : (
        posts.map((p) => <PostCard key={p.id} post={p} />)
      )}
    </div>
  )
}