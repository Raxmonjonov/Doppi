import { useEffect, useMemo, useRef, useState } from 'react'
import { X, ZoomIn, ZoomOut, Waves } from 'lucide-react'
import type { Post } from '../data/mock'
import { PostCard } from './PostCard'
import { useI18n } from '../i18n'

const GOLDEN = Math.PI * (3 - Math.sqrt(5))
const DORMANT_MS = 24 * 60 * 60 * 1000

interface OrbitingNode extends Post {
  x: number
  y: number
  stale: boolean
}

export function OrbitView({ posts }: { posts: Post[] }) {
  const { t } = useI18n()
  const stageRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [openId, setOpenId] = useState<number | null>(null)

  const now = Date.now()

  const nodes = useMemo<OrbitingNode[]>(() => {
    const out: OrbitingNode[] = []
    posts.forEach((p, i) => {
      const stale = now - Number(p.id) > DORMANT_MS
      const a = i * GOLDEN
      const r = (stale ? 30 : 0) + 96 + Math.sqrt(i + 1) * 44
      out.push({ ...p, x: Math.cos(a) * r, y: Math.sin(a) * r, stale })
    })
    return out
  }, [posts, now])

  const openPost = nodes.find((n) => n.id === openId) ?? null

  const clampScale = (s: number) => Math.min(3, Math.max(0.35, s))

  const zoomBy = (f: number) => setScale((s) => clampScale(s * f))

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setScale((s) => clampScale(s * Math.exp(-e.deltaY * 0.0012)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div className="orbit-wrap">
      <div className="orbit-toolbar">
        <div className="orbit-title">
          <Waves size={16} />
          <span>{t('home.orbitTitle')}</span>
          <em>{nodes.filter((n) => !n.stale).length}/{nodes.length}</em>
        </div>
        <div className="orbit-hint">{t('home.orbitHint')}</div>
        <div className="orbit-zoom">
          <button type="button" className="icon-btn" onClick={() => zoomBy(1.25)} aria-label={t('home.zoomIn')} title={t('home.zoomIn')}>
            <ZoomIn size={18} />
          </button>
          <button type="button" className="icon-btn" onClick={() => zoomBy(0.8)} aria-label={t('home.zoomOut')} title={t('home.zoomOut')}>
            <ZoomOut size={18} />
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className="orbit-stage"
        onPointerDown={(e) => {
          dragging.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return
          setPan({
            x: dragging.current.px + (e.clientX - dragging.current.sx),
            y: dragging.current.py + (e.clientY - dragging.current.sy),
          })
        }}
        onPointerUp={() => {
          dragging.current = null
        }}
      >
        <div className="orbit-field" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}>
          {nodes.length === 0 && <div className="orbit-empty">{t('home.emptyOrbit')}</div>}
          {nodes.map((n, i) => (
            <button
              key={n.id}
              type="button"
              className={`orbit-node${n.stale ? ' stale' : ''}`}
              style={{ left: 208 + n.x, top: 208 + n.y, animationDelay: `${Math.min(i * 45, 900)}ms`, zIndex: i }}
              onClick={() => setOpenId(n.id)}
              onDoubleClick={() => setOpenId(n.id)}
              aria-label={n.author.name}
              title={n.author.name}
            >
              {n.images[0] ? (
                <img src={n.images[0]} alt="" loading="lazy" />
              ) : (
                <span className="orbit-node-fallback">{n.author.name.charAt(0)}</span>
              )}
              <span className="orbit-node-ring" />
              <span className="orbit-node-likes">{n.likes}</span>
              {n.live && <span className="orbit-node-live" />}
              {n.stale && <span className="orbit-node-stale" />}
            </button>
          ))}
        </div>
      </div>

      {openPost && (
        <div className="fn-overlay orbit-viewer" onClick={() => setOpenId(null)}>
          <div className="orbit-viewer-inner" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="icon-btn orbit-viewer-close" onClick={() => setOpenId(null)} aria-label={t('common.close')}>
              <X size={22} />
            </button>
            <PostCard post={openPost} />
          </div>
        </div>
      )}
    </div>
  )
}