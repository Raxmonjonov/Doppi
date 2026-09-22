import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

interface LightboxProps {
  images: string[]
  index: number
  onClose: () => void
  onIndex: (i: number) => void
}

export function Lightbox({ images, index, onClose, onIndex }: LightboxProps) {
  const prev = () => onIndex((index - 1 + images.length) % images.length)
  const next = () => onIndex((index + 1) % images.length)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, images.length])

  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <button
        type="button"
        className="icon-btn lightbox-close"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        aria-label="Yopish"
      >
        <X size={24} />
      </button>

      {images.length > 1 && (
        <>
          <button
            type="button"
            className="icon-btn lightbox-nav prev"
            onClick={(e) => {
              e.stopPropagation()
              prev()
            }}
            aria-label="Oldingi"
          >
            <ChevronLeft size={28} />
          </button>
          <button
            type="button"
            className="icon-btn lightbox-nav next"
            onClick={(e) => {
              e.stopPropagation()
              next()
            }}
            aria-label="Keyingi"
          >
            <ChevronRight size={28} />
          </button>
        </>
      )}

      <img src={images[index]} alt="" onClick={(e) => e.stopPropagation()} />
      <div className="lightbox-count">
        {index + 1} / {images.length}
      </div>
    </div>,
    document.body,
  )
}