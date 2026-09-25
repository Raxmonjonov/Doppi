import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { X, ZoomIn, ZoomOut, Orbit } from 'lucide-react'
import { useI18n } from '../i18n'

const GOLDEN = Math.PI * (3 - Math.sqrt(5))
const DORMANT_MS = 24 * 60 * 60 * 1000

export interface OrbitItem {
  id: number
  thumb?: string
  name: string
  likes: number
  live?: boolean
  createdAt: number
}

interface Props {
  items: OrbitItem[]
  title?: string
  renderViewer?: (item: OrbitItem) => ReactNode
}

export function OrbitView({ items, title, renderViewer }: Props) {
  const { t } = useI18n()
  const stageRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [openId, setOpenId] = useState<number | null>(null)

  const now = Date.now()

  const layout = useMemo(
    () =>
      items.map((_, i) => {
        const a = i * GOLDEN
        return {
          x: Math.cos(a) * (96 + Math.sqrt(i + 1) * 44),
          y: Math.sin(a) * (96 + Math.sqrt(i + 1) * 44),
          delay: i < 22 ? i * 45 : 900,
        }
      }),
    [items.length],
  )

  const openItem = items.find((n) => n.id === openId) ?? null
  const freshCount = items.filter((n) => now - n.createdAt <= DORMANT_MS).length
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
          <Orbit size={16} />
          <span>{title ?? t('home.orbitTitle')}</span>
          <em>
            {freshCount}/{items.length}
          </em>
        </div>
        <div className="orbit-hint">{t('home.orbitHint')}</div>
        <div className="orbit-zoom">
          <button
            type="button"
            className="icon-btn"
            onClick={() => zoomBy(1.25)}
            aria-label={t('home.zoomIn')}
            title={t('home.zoomIn')}
          >
            <ZoomIn size={18} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => zoomBy(0.8)}
            aria-label={t('home.zoomOut')}
            title={t('home.zoomOut')}
          >
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
          {items.length === 0 && <div className="orbit-empty">{t('home.emptyOrbit')}</div>}
          {items.map((n, i) => {
            const pos = layout[i]
            const stale = now - n.createdAt > DORMANT_MS
            const x = pos.x + (stale ? 44 : 0)
            const y = pos.y + (stale ? 44 : 0)
            return (
              <button
                key={n.id}
                type="button"
                className={`orbit-node${stale ? ' stale' : ''}`}
                style={{ left: 208 + x, top: 208 + y, animationDelay: `${pos.delay}ms`, zIndex: i }}
                onClick={() => setOpenId(n.id)}
                aria-label={n.name}
                title={n.name}
              >
                {n.thumb ? (
                  <img src={n.thumb} alt="" loading="lazy" />
                ) : (
                  <span className="orbit-node-fallback">{n.name.charAt(0)}</span>
                )}
                <span className="orbit-node-ring" />
                <span className="orbit-node-likes">{n.likes}</span>
                {n.live && <span className="orbit-node-live" />}
                {stale && <span className="orbit-node-stale" />}
              </button>
            )
          })}
        </div>
      </div>

      {openItem && renderViewer && (
        <div className="fn-overlay orbit-viewer" onClick={() => setOpenId(null)}>
          <div className="orbit-viewer-inner" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="icon-btn orbit-viewer-close"
              onClick={() => setOpenId(null)}
              aria-label={t('common.close')}
            >
              <X size={22} />
            </button>
            {renderViewer(openItem)}
          </div>
        </div>
      )}
    </div>
  )
}