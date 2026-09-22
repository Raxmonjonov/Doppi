import { useState } from 'react'
import { useI18n } from '../i18n'
import { Lightbox } from './Lightbox'

interface MediaGridProps {
  images: string[]
  video?: string
}

export function MediaGrid({ images, video }: MediaGridProps) {
  const [lightIndex, setLightIndex] = useState<number | null>(null)
  const { t } = useI18n()

  if (video) {
    return (
      <div className="post-media">
        <div className="cell">
          <video src={video} controls muted playsInline style={{ width: '100%', display: 'block' }} />
        </div>
      </div>
    )
  }

  const n = images.length
  if (n === 0) return null

  const visible = n > 4 ? images.slice(0, 4) : images
  const cls = `media-grid mg-${Math.min(n, 4)}`

  return (
    <div className="post-media">
      <div className={cls}>
        {visible.map((src, i) => (
          <div className="cell" key={i}>
            <img src={src} alt={t('mediaGrid.imageAlt', { n: i + 1 })} loading="lazy" onClick={() => setLightIndex(i)} />
            {i === 3 && n > 4 && <span className="more-overlay">+{n - 4}</span>}
          </div>
        ))}
      </div>
      {lightIndex !== null && (
        <Lightbox images={visible} index={lightIndex} onClose={() => setLightIndex(null)} onIndex={setLightIndex} />
      )}
    </div>
  )
}