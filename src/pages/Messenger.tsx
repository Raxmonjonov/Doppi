import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Send, Image, Search, Pin, PinOff, Trash2, X, Phone, Video, PhoneOff, Mic, MicOff, Camera, CameraOff } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import type { Message } from '../data/mock'
import { useMe } from '../data/useMe'
import { useAuth } from '../data/auth'
import { api } from '../api/client'
import { useI18n } from '../i18n'

interface RawThread {
  id: number
  user: { id: number; name: string; username: string; avatar: string; online: boolean }
  online: boolean
  messages: { id: number; from: number; text: string; time: string; image?: string }[]
}

interface Thread {
  id: number
  user: RawThread['user']
  online: boolean
  messages: Message[]
}

interface Signal {
  id: number
  threadId: number
  from: number
  to: number
  kind: string
  data: { sdp?: string; kind?: string; candidate?: RTCIceCandidateInit } | null
}

type ActiveCall = { mode: 'caller' | 'responder'; threadId: number; peerId: number; kind: 'video' | 'audio' }

const STUN: RTCIceServer = { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }

function isOwnMessage(from: number, myId: number): boolean {
  return String(from) === String(myId)
}

function toThread(t: RawThread): Thread {
  return {
    id: t.id,
    user: t.user,
    online: t.online,
    messages: t.messages,
  }
}

async function loadThreads(): Promise<RawThread[]> {
  try {
    const { threads } = await api<{ threads: RawThread[] }>('/api/threads')
    return threads
  } catch {
    return []
  }
}

export function Messenger() {
  const { t } = useI18n()
  const me = useMe()
  const { accounts } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [threads, setThreads] = useState<Thread[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [userQuery, setUserQuery] = useState('')
  const [startOpen, setStartOpen] = useState(false)
  const [pinned, setPinned] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('doppi-pinned-v1') || '[]') as number[]
    } catch {
      return []
    }
  })
  const [menuThreadId, setMenuThreadId] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const [imageToSend, setImageToSend] = useState<string | null>(null)
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null)
  const [incoming, setIncoming] = useState<{ threadId: number; from: number; name: string; kind: 'video' | 'audio' } | null>(null)
  const ringsSinceRef = useRef(0)

  const activeCallRef = useRef<ActiveCall | null>(null)
  activeCallRef.current = activeCall
  const incomingRef = useRef<typeof incoming>(null)
  incomingRef.current = incoming
  const threadsRef = useRef<Thread[]>(threads)
  threadsRef.current = threads

  const togglePin = (id: number) => {
    setPinned((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
      try {
        localStorage.setItem('doppi-pinned-v1', JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
    setMenuThreadId(null)
  }

  const deleteThread = async (id: number) => {
    setMenuThreadId(null)
    setThreads((prev) => prev.filter((t) => t.id !== id))
    if (activeId === id) setActiveId(null)
    try {
      await api(`/api/threads/${id}`, { method: 'DELETE' })
    } catch {
      /* ignore */
    }
  }

  const active = threads.find((t) => t.id === activeId) ?? threads[0]

  useEffect(() => {
    let alive = true
    const fetchThreads = async () => {
      const ts = await loadThreads()
      if (!alive) return
      setThreads(ts.map((t) => toThread(t)))
    }
    void fetchThreads()
    const iv = setInterval(fetchThreads, 5000)
    return () => {
      alive = false
      clearInterval(iv)
    }
  }, [me.id])

  useEffect(() => {
    const pollRings = async () => {
      try {
        const { signals } = await api<{ signals: Signal[] }>(`/api/threads/calls?since=${ringsSinceRef.current}`)
        for (const s of signals) {
          if (s.id > ringsSinceRef.current) ringsSinceRef.current = s.id
          if (s.kind === 'ring' && !activeCallRef.current) {
            const th = threadsRef.current.find((x) => x.id === s.threadId)
            setIncoming({
              threadId: s.threadId,
              from: s.from,
              name: th?.user.name ?? '',
              kind: (s.data?.kind as 'video' | 'audio') ?? 'video',
            })
          } else if ((s.kind === 'decline' || s.kind === 'hangup') && incomingRef.current) {
            if (s.threadId === incomingRef.current.threadId && s.from === incomingRef.current.from) {
              setIncoming(null)
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
    void pollRings()
    const iv = setInterval(pollRings, 4000)
    return () => {
      clearInterval(iv)
    }
  }, [me.id])

  useEffect(() => {
    if (menuThreadId === null) return
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuThreadId(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuThreadId])

  const peerId = Number(searchParams.get('user')) || 0

  const startChat = async (userId: number) => {
    setStartOpen(false)
    setUserQuery('')
    try {
      const { thread } = await api<{ thread: RawThread }>('/api/threads', {
        method: 'POST',
        body: { user: userId },
      })
      const mine = toThread(thread)
      setThreads((prev) => {
        const exists = prev.some((t) => t.id === mine.id)
        return exists ? prev : [...prev, mine]
      })
      setActiveId(mine.id)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!peerId) return
    void startChat(peerId)
    setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerId, threads.length === 0])

  const send = async () => {
    const text = draft.trim()
    const target = activeId ?? threads[0]?.id
    if ((!text && !imageToSend) || !target) return
    const msgId = Date.now()
    const msg: Message = { id: msgId, from: me.id, text, time: t('common.now') }
    if (imageToSend) msg.image = imageToSend
    setThreads((prev) => prev.map((t) => (t.id === target ? { ...t, messages: [...t.messages, msg] } : t)))
    setDraft('')
    setImageToSend(null)
    try {
      await api<{ message: Message }>(`/api/threads/${target}/messages`, {
        method: 'POST',
        body: imageToSend ? { text, image: imageToSend } : { text },
      })
    } catch {
      /* offline — message stays local until next sync */
    }
  }

  const onImageFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      setImageToSend(dataUrl)
    }
    reader.readAsDataURL(f)
  }

  const acceptCall = () => {
    if (!incoming) return
    setActiveCall({ mode: 'responder', threadId: incoming.threadId, peerId: incoming.from, kind: incoming.kind })
    setIncoming(null)
  }

  const declineCall = () => {
    if (!incoming) return
    void api(`/api/threads/${incoming.threadId}/calls`, { method: 'POST', body: { kind: 'decline', to: incoming.from, data: null } }).catch(
      () => {},
    )
    setIncoming(null)
  }

  const q = userQuery.trim().toLowerCase()
  const candidates = (q
    ? accounts
        .filter((a) => a.id !== me.id)
        .filter((a) => a.name.toLowerCase().includes(q) || a.username.toLowerCase().includes(q))
    : accounts.filter((a) => a.id !== me.id)
  ).map((a) => ({ id: a.id, name: a.name, username: a.username, avatar: a.avatar, online: true }))

  if (threads.length === 0 && !startOpen) {
    return (
      <div className="fade-in">
        <div className="card empty-state">
          <div className="empty-state-title">{t('messenger.emptyTitle')}</div>
          <div className="empty-state-sub">{t('messenger.emptySub')}</div>
          <button type="button" className="btn btn-primary" onClick={() => setStartOpen(true)}>
            <Search size={16} /> {t('messenger.newMessage')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="messenger fade-in">
      <aside className="card threads">
        <div className="threads-head">
          {t('messenger.threadsHeading')}
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setStartOpen((v) => !v)}>
            <Search size={14} /> {t('messenger.new')}
          </button>
        </div>
        {startOpen && (
          <SendUserPanel
            candidates={candidates}
            q={q}
            setQ={setUserQuery}
            onPick={startChat}
          />
        )}
        <div style={{ overflowY: 'auto', position: 'relative' }}>
          {[...threads]
            .sort((a, b) => {
              const pa = pinned.includes(a.id) ? 1 : 0
              const pb = pinned.includes(b.id) ? 1 : 0
              return pb - pa
            })
            .map((thread) => {
              const last = thread.messages[thread.messages.length - 1]
              return (
                <div key={thread.id} className={`thread-wrap${pinned.includes(thread.id) ? ' pinned' : ''}`}>
                  <button
                    type="button"
                    className={`thread-row${thread.id === activeId ? ' active' : ''}`}
                    onClick={() => setActiveId(thread.id)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setMenuThreadId(thread.id)
                    }}
                  >
                    <Avatar user={thread.user} size={46} showOnline />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="name">
                        {pinned.includes(thread.id) && <Pin size={12} className="pin-icon" />}
                        {thread.user.name}
                      </div>
                      <div className="last">{last?.text}</div>
                    </div>
                  </button>
                  {menuThreadId === thread.id && (
                    <div className="thread-menu" ref={menuRef}>
                      <button
                        type="button"
                        onClick={() => togglePin(thread.id)}
                      >
                        {pinned.includes(thread.id) ? <PinOff size={16} /> : <Pin size={16} />}
                        {pinned.includes(thread.id) ? t('messenger.unpin') : t('messenger.pin')}
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          if (window.confirm(t('messenger.deleteConfirm'))) void deleteThread(thread.id)
                        }}
                      >
                        <Trash2 size={16} /> {t('messenger.delete')}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      </aside>

      {active && (
        <section className="card chat-panel">
          <header className="chat-head">
            <Avatar user={active.user} size={40} showOnline={active.online} />
            <div>
              <Link to={`/profile?user=${active.user.id}`} className="chat-name">
                {active.user.name}
              </Link>
              <div className="status">{active.online ? t('messenger.online') : t('messenger.lastSeenToday')}</div>
            </div>
            <div className="group-call-buttons">
              <button
                type="button"
                className="icon-btn call-btn call-video"
                onClick={() => setActiveCall({ mode: 'caller', threadId: active.id, peerId: active.user.id, kind: 'video' })}
                title={t('groups.videoCall')}
                aria-label={t('groups.videoCall')}
              >
                <Video size={20} />
              </button>
              <button
                type="button"
                className="icon-btn call-btn call-audio"
                onClick={() => setActiveCall({ mode: 'caller', threadId: active.id, peerId: active.user.id, kind: 'audio' })}
                title={t('groups.voiceCall')}
                aria-label={t('groups.voiceCall')}
              >
                <Phone size={20} />
              </button>
            </div>
          </header>

          <div className="chat-messages">
            {active.messages.map((m) => (
              <div key={m.id} className={`msg ${isOwnMessage(m.from, me.id) ? 'mine' : 'theirs'}`}>
                {m.image && <img className="msg-image" src={m.image} alt="" loading="lazy" />}
                {m.text && <span className={m.image ? 'msg-text' : ''}>{m.text}</span>}
                <span className="time">{m.time}</span>
              </div>
            ))}
            {active.messages.length === 0 && (
              <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--fn-text-muted)', padding: '12px 0' }}>
                {t('messenger.emptyChatHint')}
              </div>
            )}
          </div>

          <footer className="chat-input">
            <button type="button" className="icon-btn" aria-label={t('messenger.attachImage')} onClick={() => imageRef.current?.click()}>
              <Image size={20} />
            </button>
            <input
              type="text"
              placeholder={t('messenger.inputPlaceholder', { name: me.name.split(' ')[0] })}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void send()
              }}
            />
            <button type="button" className="btn btn-primary" onClick={() => void send()} aria-label={t('common.send')}>
              <Send size={18} />
            </button>
          </footer>
          {imageToSend && (
            <div className="chat-image-preview">
              <img src={imageToSend} alt={t('messenger.imagePreviewAlt')} />
              <button type="button" className="icon-btn" onClick={() => setImageToSend(null)} aria-label={t('messenger.removeImage')}>
                <X size={16} />
              </button>
            </div>
          )}
          <input ref={imageRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onImageFile} />
        </section>
      )}

      {incoming && (
        <div className="fn-overlay">
          <div className="fn-modal incoming-call">
            <Avatar user={{ id: incoming.from, name: incoming.name, username: '', avatar: '', online: true }} size={72} />
            <div className="incoming-name">{incoming.name}</div>
            <div className="incoming-sub">{t(incoming.kind === 'video' ? 'groups.incomingVideo' : 'groups.incomingVoice')}</div>
            <div className="incoming-actions">
              <button type="button" className="icon-btn call-ctl call-end" onClick={declineCall} aria-label={t('groups.declineCall')}>
                <PhoneOff size={22} />
              </button>
              <button type="button" className="icon-btn call-ctl call-answer" onClick={acceptCall} aria-label={t('groups.acceptCall')}>
                {incoming.kind === 'video' ? <Video size={22} /> : <Phone size={22} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeCall && (
        <ThreadCall
          threadId={activeCall.threadId}
          meId={me.id}
          call={activeCall}
          peerName={threads.find((t) => t.id === activeCall.threadId)?.user.name ?? ''}
          onEnded={() => setActiveCall(null)}
        />
      )}
    </div>
  )
}

interface PanelProps {
  candidates: { id: number; name: string; username: string; avatar: string; online: boolean }[]
  q: string
  setQ: (v: string) => void
  onPick: (id: number) => void
}

function SendUserPanel({ candidates, q, setQ, onPick }: PanelProps) {
  const { t } = useI18n()
  return (
    <div className="send-user-panel">
      <div className="send-user-search">
        <Search size={16} />
        <input
          type="text"
          placeholder={t('messenger.searchUsersPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="send-user-list">
        {candidates.length === 0 && <div className="send-user-empty">{t('messenger.noUsers')}</div>}
        {candidates.map((u) => (
          <button key={u.id} type="button" className="send-user-item" onClick={() => onPick(u.id)}>
            <Avatar user={u} size={40} showOnline />
            <span>
              {u.name}
              <small>@{u.username}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function formatCallTime(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface Peer {
  pc: RTCPeerConnection | null
  hasAnswer: boolean
  iceBuffer: RTCIceCandidateInit[]
}

function StreamVideo({ stream, hidden }: { stream: MediaStream; hidden: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (!ref.current) return
    ref.current.srcObject = stream
    ref.current.play().catch(() => {})
  }, [stream])
  return <video ref={ref} autoPlay playsInline muted={false} className={hidden ? 'call-video-hidden' : ''} />
}

function ThreadCall({
  threadId,
  meId,
  call,
  peerName,
  onEnded,
}: {
  threadId: number
  meId: number
  call: ActiveCall
  peerName: string
  onEnded: () => void
}) {
  const { t } = useI18n()
  const peerRef = useRef<Peer>({ pc: null, hasAnswer: false, iceBuffer: [] })
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const selfStreamRef = useRef<MediaStream | null>(null)
  const localRef = useRef<HTMLVideoElement>(null)
  const [selfStream, setSelfStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [muted, setMuted] = useState(false)
  const [camOff, setCamOff] = useState(false)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const sinceRef = useRef(0)
  const endedRef = useRef(false)
  const [endReason, setEndReason] = useState<'declined' | 'ended' | null>(null)
  const [callSeconds, setCallSeconds] = useState(0)

  const kind = call.kind

  const postSignal = useCallback(
    (k: string, to: number, data: Signal['data'] | null) => {
      void api(`/api/threads/${threadId}/calls`, { method: 'POST', body: { kind: k, to, data } }).catch(() => {})
    },
    [threadId],
  )

  const getLocal = useCallback(async (): Promise<MediaStream | null> => {
    if (selfStreamRef.current) return selfStreamRef.current
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMediaError(t('groups.callMediaError'))
      return null
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: kind === 'video', audio: true })
      selfStreamRef.current = stream
      setSelfStream(stream)
      return stream
    } catch {
      setMediaError(t('groups.callMediaError'))
      return null
    }
  }, [kind, t])

  const createPeer = useCallback((): RTCPeerConnection | null => {
    if (peerRef.current.pc) return peerRef.current.pc
    if (typeof RTCPeerConnection === 'undefined') return null
    const pc = new RTCPeerConnection({ iceServers: [STUN] })
    peerRef.current = { pc, hasAnswer: false, iceBuffer: [] }

    pc.onicecandidate = (ev) => {
      if (ev.candidate) postSignal('ice', call.peerId, { candidate: ev.candidate })
    }
    pc.ontrack = (ev) => {
      if (!ev.streams?.[0] && !ev.track) return
      const stream = ev.streams?.[0] ?? new MediaStream()
      if (ev.track) stream.addTrack(ev.track)
      remoteStreamRef.current = stream
      setRemoteStream(stream)
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        peerRef.current = { pc: null, hasAnswer: false, iceBuffer: [] }
        remoteStreamRef.current = null
        setRemoteStream(null)
      }
    }
    return pc
  }, [postSignal, call.peerId])

  const flushIce = async () => {
    const peer = peerRef.current
    if (!peer.pc) return
    const buffered = peer.iceBuffer
    peer.iceBuffer = []
    for (const c of buffered) {
      try {
        await peer.pc.addIceCandidate(c)
      } catch {
        /* ignore */
      }
    }
  }

  const attachLocal = useCallback(
    async (pc: RTCPeerConnection) => {
      const local = await getLocal()
      if (!local) return
      for (const track of local.getTracks()) {
        if (!pc.getSenders().some((s) => s.track === track)) pc.addTrack(track, local)
      }
    },
    [getLocal],
  )

  const apiRef = useRef({
    async handleOffer(_from: number, _data: Signal['data']) {},
    async handleAnswer(_from: number, _data: Signal['data']) {},
    async handleIce(_from: number, _data: Signal['data']) {},
    async handleDecline(_from: number) {},
    async handleHangup(_from: number) {},
    createPeer,
    attachLocal,
    postSignal,
  })
  apiRef.current = {
    async handleOffer(_from: number, data: Signal['data']) {
      const pc = apiRef.current.createPeer()
      if (!pc) return
      await apiRef.current.attachLocal(pc)
      await pc.setRemoteDescription({ type: 'offer', sdp: String(data?.sdp ?? '') })
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await flushIce()
      postSignal('answer', call.peerId, { sdp: answer.sdp })
    },
    async handleAnswer(_from: number, data: Signal['data']) {
      const peer = peerRef.current
      if (!peer.pc) return
      await peer.pc.setRemoteDescription({ type: 'answer', sdp: String(data?.sdp ?? '') })
      peer.hasAnswer = true
      await flushIce()
    },
    async handleIce(_from: number, data: Signal['data']) {
      const candidate = data?.candidate
      const peer = peerRef.current
      if (!peer.pc || !candidate) return
      if (!peer.pc.remoteDescription) {
        peer.iceBuffer.push(candidate)
        return
      }
      try {
        await peer.pc.addIceCandidate(candidate)
      } catch {
        /* ignore */
      }
    },
    async handleDecline(_from: number) {
      const peer = peerRef.current
      peer.pc?.close()
      peerRef.current = { pc: null, hasAnswer: false, iceBuffer: [] }
      remoteStreamRef.current = null
      setRemoteStream(null)
      endedRef.current = true
      setEndReason('declined')
    },
    async handleHangup(_from: number) {
      const peer = peerRef.current
      peer.pc?.close()
      peerRef.current = { pc: null, hasAnswer: false, iceBuffer: [] }
      remoteStreamRef.current = null
      setRemoteStream(null)
      endedRef.current = true
      setEndReason('ended')
    },
    createPeer,
    attachLocal,
    postSignal,
  }

  // Bind local preview when the media arrives
  useEffect(() => {
    if (selfStream && localRef.current) localRef.current.srcObject = selfStream
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfStream])

  useEffect(() => {
    void getLocal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Signalling loop
  useEffect(() => {
    let alive = true
    let bootstrapped = false
    const iv = setInterval(async () => {
      try {
        const { signals } = await api<{ signals: Signal[] }>(`/api/threads/${threadId}/calls?since=${sinceRef.current}`)
        if (!bootstrapped) {
          bootstrapped = true
          for (const s of signals) if (s.id > sinceRef.current) sinceRef.current = s.id
          return
        }
        for (const s of signals) {
          if (s.id > sinceRef.current) sinceRef.current = s.id
          const h = apiRef.current
          if (s.kind === 'offer') await h.handleOffer(s.from, s.data)
          else if (s.kind === 'answer') await h.handleAnswer(s.from, s.data)
          else if (s.kind === 'ice') await h.handleIce(s.from, s.data)
          else if (s.kind === 'decline') await h.handleDecline(s.from)
          else if (s.kind === 'hangup') await h.handleHangup(s.from)
        }
        if (!alive) return
      } catch {
        /* ignore */
      }
    }, 1000)
    return () => {
      alive = false
      clearInterval(iv)
    }
  }, [threadId])

  // Start the call based on role
  useEffect(() => {
    void (async () => {
      await getLocal()
      if (localRef.current && selfStreamRef.current) localRef.current.srcObject = selfStreamRef.current
      if (call.mode === 'caller') {
        postSignal('ring', 0, { kind })
      } else {
        // responder: proactively offer to the caller
        const pc = apiRef.current.createPeer()
        if (pc) {
          await apiRef.current.attachLocal(pc)
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          postSignal('offer', call.peerId, { sdp: offer.sdp })
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    selfStream?.getAudioTracks().forEach((tr) => (tr.enabled = !muted))
  }, [selfStream, muted])

  useEffect(() => {
    selfStream?.getVideoTracks().forEach((tr) => (tr.enabled = !camOff))
  }, [selfStream, camOff])

  useEffect(() => {
    if (!endReason) return
    const to = setTimeout(onEnded, 2500)
    return () => clearTimeout(to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endReason])

  useEffect(() => {
    if (!remoteStream) return
    const iv = setInterval(() => setCallSeconds((s) => s + 1), 1000)
    return () => clearInterval(iv)
  }, [remoteStream])

  const hangup = () => {
    if (endedRef.current) return
    endedRef.current = true
    postSignal('hangup', 0, null)
    peerRef.current.pc?.close()
    peerRef.current = { pc: null, hasAnswer: false, iceBuffer: [] }
    remoteStreamRef.current = null
    setRemoteStream(null)
    selfStreamRef.current?.getTracks().forEach((tr) => tr.stop())
    selfStreamRef.current = null
    onEnded()
  }

  if (mediaError) {
    return (
      <div className="fn-overlay">
        <div className="fn-modal call-modal">
          <div className="call-error">
            <PhoneOff size={22} />
            {mediaError}
          </div>
          <div className="post-form-footer">
            <button type="button" className="btn btn-primary" onClick={onEnded}>
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (endReason) {
    return (
      <div className="fn-overlay">
        <div className="fn-modal call-modal">
          <div className="call-error">
            <PhoneOff size={22} />
            {t(endReason === 'declined' ? 'groups.callDeclined' : 'groups.callEnded')}
          </div>
          <div className="post-form-footer">
            <button type="button" className="btn btn-primary" onClick={onEnded}>
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const showVideo = kind === 'video' && !camOff

  return (
    <div className="fn-overlay">
      <div className="call-stage">
        <div className="call-head">
          <div className="call-title">{t(kind === 'video' ? 'groups.videoCall' : 'groups.voiceCall')}</div>
          <div className="call-sub">
            {remoteStream ? `${t('groups.callConnected')} · ${formatCallTime(callSeconds)}` : t('groups.callRinging')}
          </div>
        </div>

        <div className="call-grid">
          <div className="call-cname">{peerName}</div>
          {remoteStream ? (
            <div className="call-tile">
              <StreamVideo stream={remoteStream} hidden={!showVideo} />
              {!showVideo && (
                <div className="call-avatar-fallback">
                  <Avatar user={{ id: call.peerId, name: peerName, username: '', avatar: '', online: true }} size={72} />
                </div>
              )}
              <div className="call-tag">{peerName}</div>
            </div>
          ) : (
            <div className="call-tile">
              <div className="call-avatar-fallback">
                <Avatar user={{ id: call.peerId, name: peerName, username: '', avatar: '', online: true }} size={72} />
              </div>
              <div className="call-tag">{peerName}</div>
            </div>
          )}
          <div className="call-tile call-self">
            {selfStream ? (
              <video ref={localRef} muted playsInline autoPlay className={showVideo ? '' : 'call-video-hidden'} />
            ) : (
              <div className="call-avatar-fallback">
                <Avatar user={{ id: meId, name: t('groups.you'), username: '', avatar: '', online: true }} size={72} />
              </div>
            )}
            {!showVideo && selfStream && (
              <div className="call-avatar-fallback">
                <Avatar user={{ id: meId, name: t('groups.you'), username: '', avatar: '', online: true }} size={72} />
              </div>
            )}
            <div className="call-tag">{t('groups.you')}</div>
          </div>
        </div>

        <div className="call-controls">
          <button type="button" className={`icon-btn call-ctl${muted ? ' active' : ''}`} onClick={() => setMuted((v) => !v)} aria-label={t('groups.mute')}>
            {muted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          {kind === 'video' && (
            <button type="button" className={`icon-btn call-ctl${camOff ? ' active' : ''}`} onClick={() => setCamOff((v) => !v)} aria-label={t('groups.camOff')}>
              {camOff ? <CameraOff size={20} /> : <Camera size={20} />}
            </button>
          )}
          <button type="button" className="icon-btn call-ctl call-end" onClick={hangup} aria-label={t('groups.endCall')}>
            <PhoneOff size={22} />
          </button>
        </div>
      </div>
    </div>
  )
}