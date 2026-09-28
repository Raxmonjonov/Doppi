import { useCallback, useEffect, useRef, useState } from 'react'
import { Maximize, Minimize, X, Volume2, VolumeX } from 'lucide-react'
import { useI18n } from '../i18n'

interface FullscreenVideoProps {
  src: string
  title?: string
  muted?: boolean
  autoPlay?: boolean
  onClose?: () => void
}

/* Uzun video / efir qaydlari uchun yagona himoyalangan player:
   - ustiga bosish -> to'liq ekran (istalgan qismni bosish mumkin)
   - controlsList=nodownload, noPiP, o'ng-tugmani va drag'ni bloklaydi
   - serverda alohida: inline Content-Disposition + nosniff */
export function FullscreenVideo({ src, title, muted, autoPlay, onClose }: FullscreenVideoProps) {
  const { t } = useI18n()
  const boxRef = useRef<HTMLDivElement>(null)
  const [fs, setFs] = useState(false)
  const [sound, setSound] = useState(!muted)

  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const el = boxRef.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen?.().catch(() => undefined)
  }, [])

  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onClose?.()
  }

  return (
    <div
      ref={boxRef}
      className={`fnfs-box${fs ? ' fnfs-fs' : ''}`}
      onClick={toggleFullscreen}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      {onClose ? (
        <button type="button" className="fnfs-close" onClick={stop} aria-label="Yopish">
          <X size={20} />
        </button>
      ) : null}
      <video
        src={src}
        controls
        controlsList="nodownload noremoteplayback noplaybackrate"
        disablePictureInPicture
        playsInline
        autoPlay={autoPlay}
        muted={!sound}
        preload="metadata"
        onContextMenu={(e) => e.preventDefault()}
      />
      {!fs && onClose ? (
        <div className="fnfs-hint">
          {fs ? <Minimize size={16} /> : <Maximize size={16} />}
          {t('video.clickFullscreen')}
        </div>
      ) : null}
      <button
        type="button"
        className="fnfs-sound"
        aria-label="Ovoz"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setSound((s) => !s)
        }}
      >
        {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
      </button>
      {title ? <div className="fnfs-title">{title}</div> : null}
    </div>
  )
}