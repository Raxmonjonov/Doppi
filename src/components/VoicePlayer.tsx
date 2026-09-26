import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Loader2 } from 'lucide-react'
import { useMediaObjectUrl } from '../lib/media'

interface VoicePlayerProps {
  src: string
  duration?: number
  own?: boolean
  mine?: boolean
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/* Ovozli xabar playeri. own = boshqalar xabari, mine = mening xabarim
   (ranglar shunga qarab o'zgaradi). */
export function VoicePlayer({ src, duration, own, mine }: VoicePlayerProps) {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [total, setTotal] = useState(duration ?? 0)
  const [loading, setLoading] = useState(false)
  // Shaxsiy (DM/guruh) ovoz autentifikatsiya talab qiladi — blob orqali
  const playUrl = useMediaObjectUrl(src)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) setTotal(el.duration)
    }
    const onTime = () => setPos(el.currentTime)
    const onEnd = () => {
      setPlaying(false)
      setPos(0)
    }
    const onWait = () => setLoading(true)
    const onPlayEvt = () => setLoading(false)
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('durationchange', onMeta)
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('ended', onEnd)
    el.addEventListener('waiting', onWait)
    el.addEventListener('canplay', onPlayEvt)
    el.addEventListener('playing', onPlayEvt)
    return () => {
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('durationchange', onMeta)
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('ended', onEnd)
      el.removeEventListener('waiting', onWait)
      el.removeEventListener('canplay', onPlayEvt)
      el.removeEventListener('playing', onPlayEvt)
    }
  }, [src])

  /* src o'zgarganda holatni qayta boshlaymiz (render paytida — effect emas). */
  const [prevSrc, setPrevSrc] = useState(src)
  if (prevSrc !== src) {
    setPrevSrc(src)
    setPos(0)
    setPlaying(false)
  }

  const toggle = () => {
    const el = ref.current
    if (!el) return
    if (el.paused) {
      void el.play().catch(() => setPlaying(false))
      setPlaying(true)
    } else {
      el.pause()
      setPlaying(false)
    }
  }

  const pct = total > 0 ? Math.min(100, (pos / total) * 100) : 0
  const cls = ['voice-player']
  if (own) cls.push(mine ? 'voice-player--mine' : 'voice-player--own')
  else if (mine) cls.push('voice-player--mine')

  return (
    <div className={cls.join(' ')}>
      <audio ref={ref} src={playUrl} preload="metadata" />
      <button
        type="button"
        className="voice-play"
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause' : 'Play'}
      >
        {loading && !playing ? <Loader2 size={16} className="spin" /> : playing ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
      </button>
      <button
        type="button"
        className="voice-track"
        onClick={toggle}
        aria-label="Seek"
        style={{ ['--pct' as string]: `${pct}%` }}
      >
        <span className="voice-fill" />
      </button>
      <span className="voice-time">{fmt(playing || pos ? pos : total)}</span>
    </div>
  )
}
