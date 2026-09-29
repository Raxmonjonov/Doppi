import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Clapperboard, Loader2, Radio, Volume2, VolumeX, Eye } from 'lucide-react'
import { api } from '../api/client'
import { useMe } from '../data/useMe'
import { useData } from '../data/store'
import type { Live } from '../data/store'
import { useI18n } from '../i18n'
import { fetchSignals, pickRecorderMime, pushSignal, STUN } from '../lib/live'
import { baseMime, uploadDataUrl } from '../lib/upload'
import { formatCount } from '../lib/format'

const POLL_MS = 2500
const MAX_REPLAY_BYTES = 38 * 1024 * 1024

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('read failed'))
    r.readAsDataURL(blob)
  })
}

function fmtDur(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

/* ---------------- Ijrochi (broadcaster) ---------------- */
function BroadcastRoom({ live }: { live: Live }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const localRef = useRef<HTMLVideoElement>(null)
  const pcsRef = useRef<Map<number, RTCPeerConnection>>(new Map())
  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const sinceRef = useRef(0)
  const endedRef = useRef(false)
  const [viewers, setViewers] = useState(live.viewers)
  const [started, setStarted] = useState(false)
  const [err, setErr] = useState('')
  const [secs, setSecs] = useState(0)
  const [ending, setEnding] = useState(false)

  const liveId = live.id
  const liveIdRef = useRef(liveId)
  liveIdRef.current = liveId
  const secsRef = useRef(0)

  useEffect(() => {
    const t0 = Date.now()
    const iv = setInterval(() => {
      secsRef.current = Math.floor((Date.now() - t0) / 1000)
      setSecs(secsRef.current)
    }, 1000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    let cancelled = false
    const pcs = pcsRef.current
    const stream = streamRef
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
          setErr(t('live.unsupported'))
          return
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop())
          return
        }
        streamRef.current = stream
        if (localRef.current) {
          localRef.current.srcObject = stream
          try {
            await localRef.current.play()
          } catch {
            /* usergesture talab bo'lishi mumkin */
          }
        }
        try {
          const mime = pickRecorderMime()
          const rec = new MediaRecorder(stream, {
            ...(mime ? { mimeType: mime } : {}),
            videoBitsPerSecond: 600_000,
            audioBitsPerSecond: 96_000,
          })
          rec.ondataavailable = (e) => {
            if (e.data?.size) chunksRef.current.push(e.data)
          }
          rec.start(3000)
          recRef.current = rec
        } catch {
          /* recorder yo'q — faqat jonli oq (qayd bo'lmaydi) */
        }
        setStarted(true)
      } catch {
        setErr(t('live.camDenied'))
      }
    }
    void start()
    return () => {
      cancelled = true
      pcs.forEach((pc) => {
        try {
          pc.close()
        } catch {
          /* ignore */
        }
      })
      pcs.clear()
      stream.current?.getTracks().forEach((tr) => tr.stop())
      stream.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Signal relay: tomoshabinlar kelganda ularga WebRTC offer yuboramiz */
  useEffect(() => {
    if (!started) return
    let stop = false
    let inFlight = false
    const loop = async () => {
      // Sekin javobda (Neon + sekin tarmoq) interval parallel so'rovlar
      // tug'iladi — ular kechikib kelib signallarni takroran qaytaradi.
      // Bitta oqim: avvalgisi tugamaguncha yangi poll yo'q.
      if (inFlight) return
      inFlight = true
      try {
        const poll = await fetchSignals(liveIdRef.current, sinceRef.current)
        if (stop) return
        setViewers(poll.viewers)
        for (const s of poll.signals) {
          if (s.id > sinceRef.current) sinceRef.current = s.id
          if (s.kind === 'viewer-join') onJoin(s.from)
          else if (s.kind === 'viewer-leave') onLeave(s.from)
          else if (s.kind === 'answer' && s.data && (s.data as { type?: string }).type === 'answer') {
            const pc = pcsRef.current.get(s.from)
            pc?.setRemoteDescription(s.data as RTCSessionDescriptionInit).catch(() => undefined)
          } else if (s.kind === 'ice' && s.data) {
            const pc = pcsRef.current.get(s.from)
            pc?.addIceCandidate(s.data as RTCIceCandidateInit).catch(() => undefined)
          }
        }
      } catch {
        /* offline — keyingi tiktakda qayta uriniladi */
      } finally {
        inFlight = false
      }
    }
    const iv = setInterval(() => void loop(), POLL_MS)
    return () => {
      stop = true
      clearInterval(iv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started])

  const onJoin = (viewerId: number) => {
    if (pcsRef.current.has(viewerId)) return
    const stream = streamRef.current
    if (!stream) return
    const pc = new RTCPeerConnection({ iceServers: STUN })
    stream.getTracks().forEach((tr) => pc.addTrack(tr, stream))
    pc.onicecandidate = (e) => {
      if (e.candidate) void pushSignal(liveIdRef.current, 'ice', viewerId, e.candidate)
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        try {
          pc.close()
        } catch {
          /* ignore */
        }
        if (pcsRef.current.get(viewerId) === pc) pcsRef.current.delete(viewerId)
      }
    }
    pcsRef.current.set(viewerId, pc)
    pc.createOffer()
      .then(async (offer) => {
        await pc.setLocalDescription(offer)
        await pushSignal(liveIdRef.current, 'offer', viewerId, pc.localDescription)
      })
      .catch(() => undefined)
  }

  const onLeave = (viewerId: number) => {
    const pc = pcsRef.current.get(viewerId)
    if (pc) {
      try {
        pc.close()
      } catch {
        /* ignore */
      }
      pcsRef.current.delete(viewerId)
    }
  }

  const requestEnd = async () => {
    if (endedRef.current || ending) return
    endedRef.current = true
    setEnding(true)
    pcsRef.current.forEach((pc) => {
      try {
        pc.close()
      } catch {
        /* ignore */
      }
    })
    pcsRef.current.clear()
    let url = ''
    const rec = recRef.current
    if (rec && rec.state !== 'inactive') {
      const blob = await new Promise<Blob>((resolve) => {
        const onstop = () => resolve(new Blob(chunksRef.current, { type: baseMime(rec.mimeType) || 'video/webm' }))
        if (rec.onstop) {
          const prev = rec.onstop
          rec.onstop = () => {
            prev?.call(rec, undefined as unknown as BlobEvent)
            onstop()
          }
        } else rec.onstop = onstop
        rec.stop()
      })
      if (blob.size > 0 && blob.size <= MAX_REPLAY_BYTES) {
        const dataUrl = await blobToDataUrl(blob)
        try {
          url = await uploadDataUrl(dataUrl, 'video')
        } catch {
          url = ''
        }
      }
    }
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
    try {
      await api(`/api/lives/${liveIdRef.current}/end`, {
        method: 'POST',
        body: { video: url || '', duration: secsRef.current, title: live.title || '' },
      })
    } catch {
      /* server arxivlashtirmadi — qaytish shart emas */
    }
    navigate('/videos')
  }

  if (!started) {
    return (
      <section className="live-room-loading">
        {err ? <p className="fn-error">{err}</p> : <Loader2 className="spin" size={30} />}
      </section>
    )
  }

  return (
    <section className="live-room">
      <header className="live-room-head">
        <button type="button" className="icon-btn" onClick={() => navigate('/live')} aria-label="Orqaga">
          <ArrowLeft size={20} />
        </button>
        <div className="live-room-title">
          <strong>{live.title || t('live.title')}</strong>
          <span className="live-badge">
            <i className="live-dot" /> {t('live.broadcaster')} · {fmtDur(secs)}
          </span>
        </div>
        <span className="live-viewers">
          <Eye size={14} /> {formatCount(viewers)}
        </span>
      </header>
      <div className="live-room-stage">
        <video
          ref={localRef}
          muted
          autoPlay
          playsInline
          controlsList="nodownload"
          disablePictureInPicture
          style={{ transform: 'scaleX(-1)' }}
          onContextMenu={(e) => e.preventDefault()}
        />
        <div className="live-room-camera-status">
          <Radio size={15} /> {t('live.recording')}
        </div>
      </div>
      <div className="live-room-actions">
        <button type="button" className="btn btn-text" onClick={() => navigate('/live')}>
          <ArrowLeft size={17} /> {t('live.title')}
        </button>
        <button type="button" className="btn btn-danger" disabled={ending} onClick={() => void requestEnd()}>
          {ending ? '…' : t('live.end')}
        </button>
      </div>
    </section>
  )
}

/* ---------------- Tomoshabin ---------------- */
function ViewerRoom({ live }: { live: Live }) {
  const { t } = useI18n()
  const me = useMe()
  const navigate = useNavigate()
  const remoteRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([])
  const lastOfferIdRef = useRef(0)
  const sinceRef = useRef(0)
  const [sound, setSound] = useState(false)
  const [ended, setEnded] = useState(false)
  const [waiting, setWaiting] = useState(true)

  const liveId = live.id
  const ownerId = live.owner.id
  const liveIdRef = useRef(liveId)
  liveIdRef.current = liveId
  const ownerIdRef = useRef(ownerId)
  ownerIdRef.current = ownerId
  const meIdRef = useRef(me?.id ?? 0)
  meIdRef.current = me?.id ?? 0

  useEffect(() => {
    void pushSignal(liveIdRef.current, 'viewer-join', ownerIdRef.current, null)
    return () => {
      void pushSignal(liveIdRef.current, 'viewer-leave', ownerIdRef.current, null)
      const pc = pcRef.current
      if (pc) {
        try {
          pc.close()
        } catch {
          /* ignore */
        }
        pcRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let stop = false
    let inFlight = false
    const loop = async () => {
      // BroadcastRoom'dagidek bitta oqim — parallel/kechikib kelgan javoblar
      // signallarni takroran qaytarmasin (takroriy offer yangi pc yaratib,
      // media oqimini uzib qo'yardi).
      if (inFlight) return
      inFlight = true
      try {
        const poll = await fetchSignals(liveIdRef.current, sinceRef.current)
        if (stop) return
        if (poll.status === 'ended') {
          setEnded(true)
          clearInterval(iv)
          return
        }
        for (const s of poll.signals) {
          if (s.id > sinceRef.current) sinceRef.current = s.id
          if (s.kind === 'offer' && s.data && (s.data as { type?: string }).type === 'offer') {
            // Bir xil offer signalining takroriy delivery'si (kechikib kelgan
            // javob) — e'tiborsiz: yangi pc yaratsak eskisi yopilib SDP mos
            // kelmay qoladi → video oqimi uziladi. Yangi offer (boshqa id) —
            // haqiqiy qayta-urinish: eski pc yopilib yangisi qabul qilinadi.
            if (s.id === lastOfferIdRef.current) continue
            lastOfferIdRef.current = s.id
            const prev = pcRef.current
            if (prev) {
              try {
                prev.close()
              } catch {
                /* ignore */
              }
              pcRef.current = null
            }
            const pc = new RTCPeerConnection({ iceServers: STUN })
            pcRef.current = pc
            pc.ontrack = (e) => {
              setWaiting(false)
              const el = remoteRef.current
              if (el) {
                el.srcObject = e.streams[0] ?? new MediaStream([e.track])
                el.play().catch(() => undefined)
              }
            }
            pc.onicecandidate = (e) => {
              if (e.candidate) void pushSignal(liveIdRef.current, 'ice', ownerIdRef.current, e.candidate)
            }
            try {
              await pc.setRemoteDescription(s.data as RTCSessionDescriptionInit)
              const answer = await pc.createAnswer()
              await pc.setLocalDescription(answer)
              await pushSignal(liveIdRef.current, 'answer', ownerIdRef.current, pc.localDescription)
              pendingIceRef.current.forEach((c) => pc.addIceCandidate(c).catch(() => undefined))
              pendingIceRef.current = []
            } catch {
              /* SDP mos kelmadi — e'lon qilinmaydi, keyingi urinishlarda takrorlanadi */
            }
          } else if (s.kind === 'ice') {
            const pc = pcRef.current
            if (pc) pc.addIceCandidate(s.data as RTCIceCandidateInit).catch(() => undefined)
            else pendingIceRef.current.push(s.data as RTCIceCandidateInit)
          }
        }
      } catch {
        /* offline — keyingi tiktakda qayta uriniladi */
      } finally {
        inFlight = false
      }
    }
    const iv = setInterval(() => void loop(), POLL_MS)
    return () => {
      stop = true
      clearInterval(iv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleSound = () => {
    setSound((s) => {
      const next = !s
      const el = remoteRef.current
      if (el) {
        el.muted = !next
        if (next) el.play().catch(() => undefined)
      }
      return next
    })
  }

  return (
    <section className="live-room">
      <header className="live-room-head">
        <button type="button" className="icon-btn" onClick={() => navigate('/live')} aria-label="Orqaga">
          <ArrowLeft size={20} />
        </button>
        <div className="live-room-title">
          <strong>{live.title || t('live.title')}</strong>
          <span className="live-badge">
            <i className="live-dot" /> {live.owner.name}
          </span>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={toggleSound}
          aria-label="Ovoz"
          title={t('video.clickFullscreen')}
        >
          {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
      </header>
      <div className="live-room-stage" onClick={() => document.fullscreenElement ? void document.exitFullscreen() : void document.querySelector('.live-room-stage')?.requestFullscreen?.().catch(() => undefined)}>
        {ended ? (
          <div className="live-room-ended">
            <Clapperboard size={40} />
            <p>{t('live.stopped')}</p>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/videos')}>
              {t('video.title')}
            </button>
          </div>
        ) : (
          <video
            ref={remoteRef}
            muted={!sound}
            autoPlay
            playsInline
            controlsList="nodownload noremoteplayback"
            disablePictureInPicture
            onContextMenu={(e) => e.preventDefault()}
          />
        )}
        {!ended && waiting && (
          <div className="live-room-wait">
            <Loader2 className="spin" size={30} />
            <span>{t('live.noSignal')}</span>
          </div>
        )}
      </div>
      <div className="live-room-actions">
        <button type="button" className="btn btn-text" onClick={() => navigate('/live')}>
          <ArrowLeft size={17} /> {t('live.title')}
        </button>
      </div>
    </section>
  )
}

export default function LiveRoom() {
  const { id } = useParams()
  const me = useMe()
  const { t } = useI18n()
  const navigate = useNavigate()
  const liveId = Number(id)
  const live = useData((d) => d.lives.find((x) => x.id === liveId))
  const hasLives = useData((d) => d.lives.length > 0)

  if (!live) {
    return (
      <section className="live-room live-room-finished">
        {hasLives ? (
          <p className="fn-empty">{t('live.missed')}</p>
        ) : (
          <Loader2 className="spin" size={30} />
        )}
      </section>
    )
  }

  if (live.status === 'ended') {
    const hasReplay = !!live.video
    return (
      <section className="live-room live-room-finished">
        <p className="fn-empty">{t('live.stopped')}</p>
        {hasReplay ? <p>{t('live.replay')}</p> : null}
        <button type="button" className="btn btn-primary" onClick={() => navigate('/videos')}>
          {t('video.title')}
        </button>
      </section>
    )
  }

  const isOwner = !!me && me.id === live.owner.id
  if (isOwner) {
    return <BroadcastRoom live={live} key={`bcast-${live.id}`} />
  }
  return <ViewerRoom live={live} key={`view-${live.id}`} />
}