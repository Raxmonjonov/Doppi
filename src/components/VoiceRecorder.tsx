import { useEffect, useRef, useState } from 'react'
import { Mic, Square, X, Loader2 } from 'lucide-react'
import { useI18n } from '../i18n'
import { uploadAudio, pickAudioMime, type UploadedAudio } from '../lib/upload'

interface VoiceRecorderProps {
  onSend: (audio: UploadedAudio) => void
  onCancel: () => void
  disabled?: boolean
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/* Ovozli xabar yozuvchisi: MediaRecorder -> /api/media -> xabar.
   Yozuv tugashi yoki bekor qilinishi to'g'ridan-to'g'ri xabar yuboradi. */
export function VoiceRecorder({ onSend, onCancel, disabled }: VoiceRecorderProps) {
  const { t } = useI18n()
  const [elapsed, setElapsed] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const doneRef = useRef(false)

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }
  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const finish = async (blob: Blob) => {
    if (doneRef.current) return
    doneRef.current = true
    clearTimer()
    stopTracks()
    setBusy(true)
    setError('')
    const sent = await uploadAudio(blob, setError)
    setBusy(false)
    if (sent) onSend(sent)
    else onCancel()
  }

  useEffect(() => {
    let alive = true
    const start = async () => {
      if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setError(t('voice.unsupported'))
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const mime = pickAudioMime()
        try {
          recRef.current = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
        } catch {
          recRef.current = new MediaRecorder(stream)
        }
        chunksRef.current = []
        recRef.current.ondataavailable = (e) => {
          if (e.data && e.data.size) chunksRef.current.push(e.data)
        }
        recRef.current.onstop = () => {
          const type = recRef.current?.mimeType || 'audio/webm'
          finish(new Blob(chunksRef.current, { type }))
        }
        recRef.current.start()
        startedAtRef.current = Date.now()
        setElapsed(0)
        timerRef.current = window.setInterval(() => setElapsed((Date.now() - startedAtRef.current) / 1000), 250)
      } catch {
        setError(t('voice.micDenied'))
      }
    }
    void start()

    return () => {
      alive = false
      clearTimer()
      const rec = recRef.current
      if (rec && rec.state !== 'inactive') {
        rec.onstop = null
        try {
          rec.stop()
        } catch {
          /* ignore */
        }
      }
      stopTracks()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stop = () => {
    const rec = recRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
    else {
      doneRef.current = true
      clearTimer()
      stopTracks()
      onCancel()
    }
  }

  return (
    <div className="voice-recorder" role="group" aria-label={t('voice.recorder')}>
      <span className="voice-rec-dot" aria-hidden="true" />
      <span className="voice-rec-time">{fmt(elapsed)}</span>
      {error ? (
        <span className="voice-rec-error">{error}</span>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onCancel}
          disabled={busy || disabled}
          title={t('voice.cancel')}
        >
          <X size={18} />
        </button>
      )}
      <button
        type="button"
        className="btn btn-primary btn-sm voice-rec-send"
        onClick={stop}
        disabled={busy || !!error || disabled}
        title={t('voice.send')}
      >
        {busy ? <Loader2 size={18} className="spin" /> : <Square size={16} fill="currentColor" />}
        <span>{t('voice.send')}</span>
      </button>
    </div>
  )
}

/* Yozuvni boshlash tugmasi (idle holat) */
export function VoiceRecordButton({ onStart, disabled }: { onStart: () => void; disabled?: boolean }) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon"
      onClick={onStart}
      disabled={disabled}
      title={t('voice.record')}
      aria-label={t('voice.record')}
    >
      <Mic size={20} />
    </button>
  )
}
