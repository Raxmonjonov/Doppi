import { Link } from 'react-router-dom'
import { Play, List, Orbit, Waves, Lock, Clock, History } from 'lucide-react'
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

interface WaveEvent {
  at: number
  kind: 'seal' | 'sink'
  name: string
}

function formatRest(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h > 0) return `${h}so${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m`
  return `${total % 60}s`
}

function WaveWall({ events }: { events: WaveEvent[] }) {
  const { t } = useI18n()
  if (events.length === 0) return null
  return (
    <div className="card wave-wall">
      <div className="wave-wall-head">
        <Clock size={15} />
        <span>{t('home.waveWallTitle')}</span>
      </div>
      <div className="wave-wall-body">
        {events.map((e, i) => {
          const rest = e.at - Date.now()
          return (
            <div className={`wave-wall-item ${e.kind}`} key={i}>
              <span className="wave-wall-ic">
                {e.kind === 'seal' ? <Lock size={13} /> : <Waves size={13} />}
              </span>
              <span className="wave-wall-name">{e.name}</span>
              <span className="wave-wall-time">
                {e.kind === 'seal' ? t('home.waveSealOpens') : t('home.waveSinks')} ·{' '}
                {t('home.waveIn', { rest: formatRest(rest) })}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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
  const [rewind, setRewind] = useState(0)
  const asOf = now - rewind
  const rewinding = rewind > 0
  const maxRewind = Math.min(Math.max(...posts.map((p) => now - Number(p.id)), 0), 30 * 24 * 3600 * 1000)
  const inTime = (p: { id: number }) => Number(p.id) <= asOf
  const ageAt = (p: { id: number }) => asOf - Number(p.id)
  const ageOf = (p: { id: number }) => now - Number(p.id)
  const isFresh = (p: { id: number }) => ageOf(p) <= FRESH_MS
  const isStale = (p: { id: number }) => ageOf(p) > DORMANT_MS
  const isSealed = (p: { id: number; sealUntil?: number }) => !!p.sealUntil && now < p.sealUntil
  const dormant = posts.filter(isStale)

  const waveEvents: WaveEvent[] = posts
    .reduce<WaveEvent[]>((acc, p) => {
      if (p.sealUntil && now < p.sealUntil) {
        acc.push({ at: p.sealUntil, kind: 'seal', name: p.author.name })
      }
      const sinkAt = Number(p.id) + DORMANT_MS
      if (sinkAt > now) {
        acc.push({ at: sinkAt, kind: 'sink', name: p.author.name })
      }
      return acc
    }, [])
    .sort((a, b) => a.at - b.at)
    .slice(0, 5)

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

      <div className="card time-machine">
        <div className="time-machine-head">
          <span className="time-machine-title">
            <History size={14} />
            {t('home.rewindTitle')}
          </span>
          {rewinding ? (
            <button type="button" className="time-machine-reset" onClick={() => setRewind(0)}>
              {t('home.rewindNow')}
            </button>
          ) : (
            <span className="time-machine-now">{t('home.rewindNowTxt')}</span>
          )}
        </div>
        <input
          type="range"
          className="time-machine-range"
          min={0}
          max={maxRewind}
          step={60000}
          value={rewind}
          onChange={(e) => setRewind(Number(e.target.value))}
        />
        <div className="time-machine-caption">
          {rewinding ? t('home.rewindAt', { rest: formatRest(rewind) }) : t('home.rewindHint')}
        </div>
      </div>

      <WaveWall events={waveEvents} />

      <WaveWall events={waveEvents} />

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
          {posts.map((p) => {
            if (rewinding && !inTime(p)) return null
            if (rewinding) {
              const age = ageAt(p)
              const sealedNow = !!p.sealUntil && asOf < p.sealUntil
              const freshNow = age <= FRESH_MS && !sealedNow
              const staleNow = age > DORMANT_MS
              if (staleNow) {
                return (
                  <div key={p.id} className="wave-stale">
                    <span className="wave-tag">{t('home.dormantWave')}</span>
                    <PostCard post={p} asOf={asOf} />
                  </div>
                )
              }
              return (
                <div key={p.id} className={freshNow ? 'post-fresh' : undefined}>
                  <PostCard post={p} asOf={asOf} />
                </div>
              )
            }
            return isStale(p) ? (
              <div key={p.id} className="wave-stale">
                <span className="wave-tag">{t('home.dormantWave')}</span>
                <PostCard post={p} />
              </div>
            ) : (
              <div key={p.id} className={isFresh(p) && !isSealed(p) ? 'post-fresh' : undefined}>
                <PostCard post={p} />
              </div>
            )
          })}

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