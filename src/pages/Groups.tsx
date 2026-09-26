import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Users,
  Plus,
  X,
  Upload,
  ArrowLeft,
  Phone,
  Video,
  Search,
  Send,
  ShieldCheck,
  PhoneOff,
  Mic,
  MicOff,
  Camera,
  CameraOff,
  MessageSquare,
  UserX,
  LogOut,
  Hourglass,
} from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { VoiceRecorder, VoiceRecordButton } from '../components/VoiceRecorder'
import { MsgBubble } from './Messenger'
import { api } from '../api/client'
import { useMe } from '../data/useMe'
import { useAuth } from '../data/auth'
import { useNotifications } from '../data/notifications'
import { uploadImage, type UploadedAudio } from '../lib/upload'
import { useI18n } from '../i18n'

interface GroupMember {
  id: number
  name: string
  username: string
  avatar: string
  online: boolean
}

interface GroupMessage {
  id: number
  from: number
  sender: { id: number; name: string; username: string; avatar: string } | null
  text: string
  time: string
  image?: string
  audio?: string
  audioDuration?: number
  sealUntil?: number
}

interface Group {
  id: number
  name: string
  cover: string
  createdBy: number
  isAdmin: boolean
  members: GroupMember[]
  messages: GroupMessage[]
}

interface Signal {
  id: number
  from: number
  to: number
  kind: string
  data: { sdp?: string; kind?: string; candidate?: RTCIceCandidateInit } | null
}

function isOwn(m: GroupMessage, myId: number): boolean {
  return String(m.from) === String(myId)
}

const STUN: RTCIceServer = { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }

/* ============ List page ============ */

export function Groups() {
  const { t } = useI18n()
  const me = useMe()
  const [groups, setGroups] = useState<Group[]>([])
  const [openGroupId, setOpenGroupId] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { groups: gs } = await api<{ groups: Group[] }>('/api/groups')
      setGroups(gs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xatolik')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const iv = setInterval(() => void load(), 8000)
    return () => clearInterval(iv)
  }, [load])

  const openGroup = openGroupId != null ? groups.find((g) => g.id === openGroupId) ?? null : null

  const myCount = groups.filter((g) => g.createdBy === me.id).length

  return (
    <div className="fade-in">
      <div className="page-head-row">
        <div>
          <h1 className="page-head">{t('groups.pageTitle')}</h1>
          <p className="page-sub">{t('groups.pageSub')}</p>
        </div>
        {!openGroup && (
          <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)} disabled={myCount >= 3}>
            <Plus size={17} /> {t('groups.createButton')}
          </button>
        )}
      </div>

      {openGroup ? (
        <GroupDetail
          key={openGroup.id}
          group={openGroup}
          meId={me.id}
          onBack={() => setOpenGroupId(null)}
          onGroupChanged={(g) => setGroups((prev) => prev.map((x) => (x.id === g.id ? g : x)))}
        />
      ) : (
        <>
          <button type="button" className="group-create-card" onClick={() => setCreateOpen(true)} disabled={myCount >= 3}>
            <span className="group-create-plus">
              <Plus size={24} strokeWidth={2.5} />
            </span>
            <span>
              <strong>{t('groups.createCardTitle')}</strong>
              <small>{myCount >= 3 ? t('groups.limitReached') : t('groups.createCardHint')}</small>
            </span>
          </button>

          {loading && groups.length === 0 ? (
            <div className="card empty-state">{t('app.loading')}</div>
          ) : groups.length === 0 ? (
            <div className="card empty-state">
              <div className="empty-state-title">{t('groups.emptyTitle')}</div>
              <div className="empty-state-sub">{t('groups.emptySub')}</div>
            </div>
          ) : (
            <div className="cards-grid">
              {groups.map((g) => (
                <div className="card entity-card" key={g.id}>
                  <div className="entity-cover" onClick={() => setOpenGroupId(g.id)} style={{ cursor: 'pointer' }}>
                    {g.cover ? (
                      <img src={g.cover} alt={g.name} loading="lazy" />
                    ) : (
                      <div className="entity-cover-fallback">{g.name.charAt(0)}</div>
                    )}
                  </div>
                  <div className="entity-body">
                    <div className="title">{g.name}</div>
                    <div className="sub">
                      <Users size={14} /> {g.members.length} ·{' '}
                      {g.isAdmin ? <strong>{t('groups.adminTag')}</strong> : t('groups.statusJoined')}
                    </div>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpenGroupId(g.id)}>
                      <MessageSquare size={15} /> {t('groups.openChat')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {createOpen && (
        <CreateGroupModal
          t={t}
          mineCount={myCount}
          onClose={() => setCreateOpen(false)}
          onCreated={(g) => {
            setGroups((prev) => [g, ...prev])
            setCreateOpen(false)
            setOpenGroupId(g.id)
          }}
        />
      )}

      {error && !openGroup && <div className="upload-error">{error}</div>}
    </div>
  )
}

function CreateGroupModal({
  t,
  mineCount,
  onClose,
  onCreated,
}: {
  t: (k: string, p?: Record<string, string | number>) => string
  mineCount: number
  onClose: () => void
  onCreated: (g: Group) => void
}) {
  const [name, setName] = useState('')
  const [cover, setCover] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError(null)
    const res = await uploadImage(f, (msg) => setError(msg))
    if (res) setCover(res.url)
  }

  const create = async () => {
    const n = name.trim()
    if (!n) {
      setError(t('groups.errorNameRequired'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { group } = await api<{ group: Group }>('/api/groups', { method: 'POST', body: { name: n, cover } })
      onCreated(group)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('groups.errorGeneral'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fn-overlay" onClick={onClose}>
      <div className="fn-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fn-modal-head">
          <h3>{t('groups.modalTitle')}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            <X size={20} />
          </button>
        </div>

        <div className="post-form">
          <div className="group-limit-hint">{t('groups.limitHint', { count: Math.max(0, 3 - mineCount) })}</div>

          <div>
            <label className="form-label">{t('groups.labelName')}</label>
            <input
              type="text"
              className="form-input"
              placeholder={t('groups.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="form-label">{t('groups.labelCover')}</label>
            <button type="button" className="group-cover-picker" onClick={() => fileRef.current?.click()}>
              {cover ? (
                <img src={cover} alt={t('groups.coverAlt')} />
              ) : (
                <span>
                  <Upload size={22} />
                  {t('groups.pickImage')}
                </span>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
          </div>

          {error && <div className="upload-error">{error}</div>}

          <div className="post-form-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void create()} disabled={busy}>
              <Plus size={16} /> {t('groups.createSubmit')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============ Group detail ============ */

type ActiveCall =
  | { mode: 'caller'; kind: 'video' | 'audio' }
  | { mode: 'responder'; peerId: number; kind: 'video' | 'audio' }

function GroupDetail({
  group,
  meId,
  onBack,
  onGroupChanged,
}: {
  group: Group
  meId: number
  onBack: () => void
  onGroupChanged: (g: Group) => void
}) {
  const { t } = useI18n()
  const { accounts } = useAuth()
  const { joinRequest, consumeJoin } = useNotifications()
  const [messages, setMessages] = useState<GroupMessage[]>(group.messages)
  const [members, setMembers] = useState<GroupMember[]>(group.members)
  const [draft, setDraft] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sealMs, setSealMs] = useState<number | null>(null)
  const [, setRev] = useState(0)
  const bump = useCallback(() => setRev((r) => r + 1), [])
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null)
  const [incoming, setIncoming] = useState<{ from: number; name: string; kind: 'video' | 'audio' } | null>(null)
  const [recording, setRecording] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const chatMessagesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = chatMessagesRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const sinceRef = useRef(0)

  useEffect(() => {
    setMessages(group.messages)
    setMembers(group.members)
  }, [group])

  const loadGroup = useCallback(async () => {
    try {
      const { group: g } = await api<{ group: Group }>(`/api/groups/${group.id}`)
      setMessages((prev) => {
        const serverIds = new Set(g.messages.map((m) => String(m.id)))
        const extra = prev.filter((m) => !serverIds.has(String(m.id)))
        return extra.length ? [...g.messages, ...extra] : g.messages
      })
      setMembers(g.members)
      onGroupChanged(g)
    } catch {
      /* ignore */
    }
  }, [group.id, onGroupChanged])

  const loadGroupRef = useRef(loadGroup)
  loadGroupRef.current = loadGroup

  // Poll messages/members + incoming call rings
  useEffect(() => {
    let alive = true
    let bootstrapped = false
    let inFlight = false
    const iv = setInterval(async () => {
      void loadGroupRef.current()
      if (inFlight) return
      inFlight = true
      try {
        const { signals } = await api<{ signals: Signal[] }>(`/api/groups/${group.id}/calls?since=${sinceRef.current}`)
        if (!alive) return
        if (!bootstrapped) {
          bootstrapped = true
          for (const s of signals) if (s.id > sinceRef.current) sinceRef.current = s.id
          return
        }
        for (const s of signals) {
          if (s.id > sinceRef.current) sinceRef.current = s.id
          if (s.kind === 'ring' && !activeCallRef.current && !incomingRef.current) {
            const fromName = membersRef.current.find((m) => m.id === s.from)?.name ?? ''
            setIncoming({ from: s.from, name: fromName, kind: (s.data?.kind as 'video' | 'audio') ?? 'video' })
          } else if ((s.kind === 'decline' || s.kind === 'hangup') && incomingRef.current) {
            if (s.from === incomingRef.current.from) setIncoming(null)
          }
        }
      } catch {
        /* ignore */
      } finally {
        inFlight = false
      }
      if (!alive) return
    }, 4000)
    return () => {
      alive = false
      inFlight = false
      clearInterval(iv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id])

  const activeCallRef = useRef<ActiveCall | null>(null)
  activeCallRef.current = activeCall
  const membersRef = useRef<GroupMember[]>(members)
  membersRef.current = members
  const incomingRef = useRef<typeof incoming>(null)
  incomingRef.current = incoming

  const send = async () => {
    const text = draft.trim()
    if (!text) return
    const sealAt = sealMs ? Date.now() + sealMs : undefined
    const optimistic: GroupMessage = {
      id: Date.now(),
      from: meId,
      sender: null,
      text,
      time: t('common.now'),
      ...(sealAt ? { sealUntil: sealAt } : {}),
    }
    setMessages((prev) => [...prev, optimistic])
    setDraft('')
    setSealMs(null)
    try {
      const { message } = await api<{ message: GroupMessage }>(`/api/groups/${group.id}/messages`, {
        method: 'POST',
        body: { text, ...(sealAt ? { sealUntil: sealAt } : {}) },
      })
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? message : m)))
    } catch {
      /* offline */
    }
  }

  const sendVoice = async (audio: UploadedAudio) => {
    setRecording(false)
    const sealAt = sealMs ? Date.now() + sealMs : undefined
    const optimistic: GroupMessage = {
      id: Date.now(),
      from: meId,
      sender: null,
      text: '',
      time: t('common.now'),
      audio: audio.url,
      audioDuration: audio.duration,
      ...(sealAt ? { sealUntil: sealAt } : {}),
    }
    setMessages((prev) => [...prev, optimistic])
    setSealMs(null)
    try {
      const { message } = await api<{ message: GroupMessage }>(`/api/groups/${group.id}/messages`, {
        method: 'POST',
        body: { text: '', audio: audio.url, audioDuration: audio.duration, ...(sealAt ? { sealUntil: sealAt } : {}) },
      })
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? message : m)))
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : t('voice.sendFailed'))
    }
  }

  const removeMember = async (targetId: number) => {
    const target = members.find((m) => m.id === targetId)
    if (!target || !window.confirm(t('groups.removeConfirm', { name: target.name }))) return
    try {
      const { group: g } = await api<{ group: Group }>(`/api/groups/${group.id}/members`, {
        method: 'DELETE',
        body: { userId: targetId },
      })
      setMembers(g.members)
      setMessages((prev) => {
        const serverIds = new Set(g.messages.map((m) => String(m.id)))
        const extra = prev.filter((m) => !serverIds.has(String(m.id)))
        return extra.length ? [...g.messages, ...extra] : g.messages
      })
      onGroupChanged(g)
    } catch {
      window.alert(t('groups.errorGeneral'))
    }
  }

  const leaveGroup = async () => {
    if (!window.confirm(t('groups.leaveConfirm'))) return
    try {
      await api(`/api/groups/${group.id}/members`, {
        method: 'DELETE',
        body: { userId: meId },
      })
      onBack()
    } catch {
      window.alert(t('groups.errorGeneral'))
    }
  }

  const acceptCall = () => {
    if (!incoming) return
    setActiveCall({ mode: 'responder', peerId: incoming.from, kind: incoming.kind })
    setIncoming(null)
  }

  const declineCall = () => {
    if (!incoming) return
    void api(`/api/groups/${group.id}/calls`, { method: 'POST', body: { kind: 'decline', to: incoming.from, data: null } }).catch(
      () => {},
    )
    setIncoming(null)
  }

  /* Bildirishnomadagi "Qo'ng'iroqqa qo'shilish" — responder rejimini
     darhol boshlaydi, ring signal o'tib ketgan bo'lsa ham. */
  useEffect(() => {
    if (!joinRequest || joinRequest.scope !== 'group' || Number(joinRequest.scopeId) !== Number(group.id)) return
    const req = consumeJoin()
    if (!req) return
    setActiveCall({ mode: 'responder', peerId: req.from, kind: req.callKind === 'audio' ? 'audio' : 'video' })
  }, [joinRequest, consumeJoin, group.id])

  const q = query.trim().toLowerCase()
  const memberIds = new Set(members.map((m) => m.id))
  const candidates = accounts
    .filter((a) => a.id !== meId && !memberIds.has(a.id))
    .filter((a) => !q || a.name.toLowerCase().includes(q) || a.username.toLowerCase().includes(q))
    .map((a) => ({ id: a.id, name: a.name, username: a.username, avatar: a.avatar, online: true }))

  return (
    <div className="group-detail">
      <div className="group-detail-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label={t('common.back')}>
          <ArrowLeft size={20} />
        </button>
        <Avatar
          user={members.find((m) => m.id === group.createdBy) ?? { id: 0, name: group.name, username: '', avatar: group.cover, online: true }}
          size={40}
        />
        <div>
          <div className="chat-name">{group.name}</div>
          <div className="status">
            <Users size={13} /> {members.length}
          </div>
        </div>
        <div className="group-call-buttons">
          <button type="button" className="icon-btn call-btn call-video" onClick={() => setActiveCall({ mode: 'caller', kind: 'video' })} title={t('groups.videoCall')}>
            <Video size={20} />
          </button>
          <button type="button" className="icon-btn call-btn call-audio" onClick={() => setActiveCall({ mode: 'caller', kind: 'audio' })} title={t('groups.voiceCall')}>
            <Phone size={20} />
          </button>
          {!group.isAdmin && (
            <button type="button" className="icon-btn call-btn call-end" onClick={() => void leaveGroup()} title={t('groups.leaveGroup')} aria-label={t('groups.leaveGroup')}>
              <LogOut size={20} />
            </button>
          )}
        </div>
      </div>

      <div className="group-layout">
        <aside className="card group-members">
          <div className="threads-head">
            {t('groups.membersTitle')}
            {group.isAdmin && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>
                <Plus size={14} /> {t('groups.addMember')}
              </button>
            )}
          </div>
          <div className="group-members-list">
            {members.map((m) => (
              <div key={m.id} className="dash-user-row">
                <Avatar user={{ ...m, online: m.online }} size={36} showOnline />
                <div>
                  <div className="dash-user-name">
                    {m.name}
                    {m.id === group.createdBy && (
                      <span className="group-admin-badge">
                        <ShieldCheck size={12} /> {t('groups.adminTag')}
                      </span>
                    )}
                  </div>
                  <div className="dash-user-sub">@{m.username}</div>
                </div>
                {group.isAdmin && m.id !== group.createdBy && (
                  <button
                    type="button"
                    className="icon-btn member-remove"
                    onClick={() => void removeMember(m.id)}
                    aria-label={t('groups.removeMember')}
                    title={t('groups.removeMember')}
                  >
                    <UserX size={16} />
                  </button>
                )}
              </div>
            ))}
            {members.length === 0 && <div className="send-user-empty">{t('groups.emptyMembers')}</div>}
          </div>
        </aside>

        <section className="card chat-panel">
          <div className="chat-messages" ref={chatMessagesRef}>
            {messages.map((m) => (
              <div key={m.id}>
                {!isOwn(m, meId) && m.sender && (
                  <div className="msg-author">
                    <Avatar user={{ ...m.sender, online: true }} size={20} /> {m.sender.name}
                  </div>
                )}
                <MsgBubble m={m} mine={isOwn(m, meId)} onReveal={bump} />
              </div>
            ))}
            {messages.length === 0 && <div className="chat-empty-hint">{t('groups.chatEmpty')}</div>}
          </div>

          <footer className="chat-input">
            <button
              type="button"
              className={`seal-toggle${sealMs ? ' active' : ''}`}
              aria-label={sealMs ? t('messenger.sealWillOpen') : t('messenger.sealToggle')}
              title={sealMs ? t('messenger.sealWillOpen') : t('messenger.sealToggle')}
              onClick={() => setSealMs((prev) => (prev === null ? 3600000 : prev === 3600000 ? 86400000 : null))}
            >
              <Hourglass size={18} />
              {sealMs && <span className="seal-toggle-tag">{sealMs === 3600000 ? '1' : '24'}</span>}
            </button>
            {recording ? (
              <VoiceRecorder onSend={(audio) => void sendVoice(audio)} onCancel={() => setRecording(false)} />
            ) : (
              <>
                <VoiceRecordButton onStart={() => setRecording(true)} />
                <input
                  type="text"
                  placeholder={t('groups.chatPlaceholder')}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void send()
                  }}
                />
                <button type="button" className="btn btn-primary" onClick={() => void send()} aria-label={t('common.send')}>
                  <Send size={18} />
                </button>
              </>
            )}
          </footer>
          {errorMsg && <div className="upload-error">{errorMsg}</div>}
        </section>
      </div>

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

      {addOpen && (
        <div className="fn-overlay" onClick={() => setAddOpen(false)}>
          <div className="fn-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fn-modal-head">
              <h3>{t('groups.addMember')}</h3>
              <button type="button" className="icon-btn" onClick={() => setAddOpen(false)} aria-label={t('common.close')}>
                <X size={20} />
              </button>
            </div>
            <div className="send-user-panel">
              <div className="send-user-search">
                <Search size={16} />
                <input type="text" placeholder={t('groups.searchMember')} value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <div className="send-user-list">
                {candidates.length === 0 && <div className="send-user-empty">{t('groups.noCandidateMembers')}</div>}
                {candidates.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="send-user-item"
                    onClick={() => {
                      void (async () => {
                        try {
                          const { group: g } = await api<{ group: Group }>(`/api/groups/${group.id}/members`, {
                            method: 'POST',
                            body: { userId: u.id },
                          })
                          setMembers(g.members)
                          onGroupChanged(g)
                          setAddOpen(false)
                          setQuery('')
                        } catch {
                          /* ignore */
                        }
                      })()
                    }}
                  >
                    <Avatar user={u} size={40} showOnline />
                    <span>
                      {u.name}
                      <small>@{u.username}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeCall && (
        <GroupCall
          groupId={group.id}
          meId={meId}
          call={activeCall}
          members={members}
          onEnded={() => setActiveCall(null)}
        />
      )}
    </div>
  )
}

/* ============ WebRTC group call ============ */

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

function GroupCall({
  groupId,
  meId,
  call,
  members,
  onEnded,
}: {
  groupId: number
  meId: number
  call: ActiveCall
  members: GroupMember[]
  onEnded: () => void
}) {
  const { t } = useI18n()
  const peersRef = useRef<Map<number, Peer>>(new Map())
  const remoteStreamsRef = useRef<Map<number, MediaStream>>(new Map())
  const selfStreamRef = useRef<MediaStream | null>(null)
  const localRef = useRef<HTMLVideoElement>(null)
  const [selfStream, setSelfStream] = useState<MediaStream | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<{ userId: number; stream: MediaStream }[]>([])
  const [muted, setMuted] = useState(false)
  const [camOff, setCamOff] = useState(false)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const sinceRef = useRef(0)
  const endedRef = useRef(false)
  const [endReason, setEndReason] = useState<'declined' | 'ended' | null>(null)
  const [callFailed, setCallFailed] = useState(false)
  const prePeerIceRef = useRef<Map<number, RTCIceCandidateInit[]>>(new Map())

  const kind = call.kind

  const postSignal = useCallback(
    (k: string, to: number, data: Signal['data'] | null) => {
      void api(`/api/groups/${groupId}/calls`, { method: 'POST', body: { kind: k, to, data } }).catch(() => {})
    },
    [groupId],
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

  const createPeer = useCallback((userId: number): RTCPeerConnection | null => {
    const existing = peersRef.current.get(userId)
    if (existing?.pc) return existing.pc
    if (typeof RTCPeerConnection === 'undefined') return null
    const pc = new RTCPeerConnection({ iceServers: [STUN] })
    peersRef.current.set(userId, { pc, hasAnswer: false, iceBuffer: [] })

    pc.onicecandidate = (ev) => {
      if (ev.candidate) postSignal('ice', userId, { candidate: ev.candidate })
    }
    pc.ontrack = (ev) => {
      if (!ev.streams?.[0] && !ev.track) return
      const stream = ev.streams?.[0] ?? new MediaStream()
      if (ev.track) stream.addTrack(ev.track)
      remoteStreamsRef.current.set(userId, stream)
      setRemoteStreams((prev) => [...prev.filter((s) => s.userId !== userId), { userId, stream }])
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        peersRef.current.delete(userId)
        setRemoteStreams((prev) => prev.filter((s) => s.userId !== userId))
        if (!endedRef.current && pc.connectionState === 'failed') {
          endedRef.current = true
          postSignal('hangup', 0, null)
          selfStreamRef.current?.getTracks().forEach((tr) => tr.stop())
          selfStreamRef.current = null
          setCallFailed(true)
        }
      }
    }
    return pc
  }, [postSignal])

  const flushIce = async (userId: number) => {
    const peer = peersRef.current.get(userId)
    if (!peer?.pc) return
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

  const flushPrePeerIce = async (userId: number) => {
    const buffered = prePeerIceRef.current.get(userId) ?? []
    prePeerIceRef.current.delete(userId)
    const peer = peersRef.current.get(userId)
    if (!peer?.pc) return
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

  // Keep a live reference to handlers so the polling loop never uses stale closures.
  const apiRef = useRef({
    async handleOffer(_from: number, _data: Signal['data']) {},
    async handleAnswer(_from: number, _data: Signal['data']) {},
    async handleIce(_from: number, _data: Signal['data']) {},
    async handleDecline(_from: number) {},
    async handleHangup(_from: number) {},
    createPeer,
    attachLocal,
    postSignal,
    getLocal,
    flushIce,
  })
  apiRef.current = {
    async handleOffer(from: number, data: Signal['data']) {
      const pc = createPeer(from)
      if (!pc) return
      await attachLocal(pc)
      await pc.setRemoteDescription({ type: 'offer', sdp: String(data?.sdp ?? '') })
      await flushPrePeerIce(from)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await flushIce(from)
      postSignal('answer', from, { sdp: answer.sdp })
    },
    async handleAnswer(from: number, data: Signal['data']) {
      const peer = peersRef.current.get(from)
      if (!peer?.pc) return
      await peer.pc.setRemoteDescription({ type: 'answer', sdp: String(data?.sdp ?? '') })
      peer.hasAnswer = true
      await flushIce(from)
      await flushPrePeerIce(from)
    },
    async handleIce(from: number, data: Signal['data']) {
      const candidate = data?.candidate
      if (!candidate) return
      const peer = peersRef.current.get(from)
      if (!peer?.pc || !peer.pc.remoteDescription) {
        const arr = prePeerIceRef.current.get(from) ?? []
        arr.push(candidate)
        prePeerIceRef.current.set(from, arr)
        return
      }
      try {
        await peer.pc.addIceCandidate(candidate)
      } catch {
        /* ignore */
      }
    },
    async handleDecline(from: number) {
      const peer = peersRef.current.get(from)
      peer?.pc?.close()
      peersRef.current.delete(from)
      remoteStreamsRef.current.delete(from)
      setRemoteStreams((prev) => prev.filter((s) => s.userId !== from))
      if (!endedRef.current) {
        endedRef.current = true
        selfStreamRef.current?.getTracks().forEach((tr) => tr.stop())
        selfStreamRef.current = null
        setEndReason('declined')
      }
    },
    async handleHangup(from: number) {
      const peer = peersRef.current.get(from)
      peer?.pc?.close()
      peersRef.current.delete(from)
      remoteStreamsRef.current.delete(from)
      setRemoteStreams((prev) => prev.filter((s) => s.userId !== from))
      if (!endedRef.current) {
        endedRef.current = true
        selfStreamRef.current?.getTracks().forEach((tr) => tr.stop())
        selfStreamRef.current = null
        setEndReason('ended')
      }
    },
    createPeer,
    attachLocal,
    postSignal,
    getLocal,
    flushIce,
  }

  // Initialize local media and bind the preview element when it exists
  useEffect(() => {
    if (selfStream && localRef.current) localRef.current.srcObject = selfStream
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfStream])

  // Kick off media acquisition once
  useEffect(() => {
    void getLocal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Signalling loop
  useEffect(() => {
    let alive = true
    let bootstrapped = false
    let inFlight = false
    const tick = async () => {
      if (inFlight || !alive) return
      inFlight = true
      try {
        const { signals } = await api<{ signals: Signal[] }>(`/api/groups/${groupId}/calls?since=${sinceRef.current}`)
        if (!alive) return
        if (!bootstrapped) {
          bootstrapped = true
          for (const s of signals) if (s.id > sinceRef.current) sinceRef.current = s.id
          return
        }
        for (const s of signals) {
          if (s.id > sinceRef.current) sinceRef.current = s.id
          try {
            const h = apiRef.current
            if (s.kind === 'offer') await h.handleOffer(s.from, s.data)
            else if (s.kind === 'answer') await h.handleAnswer(s.from, s.data)
            else if (s.kind === 'ice') await h.handleIce(s.from, s.data)
            else if (s.kind === 'decline') await h.handleDecline(s.from)
            else if (s.kind === 'hangup') await h.handleHangup(s.from)
          } catch {
            /* skip faulty signal, keep iterating */
          }
        }
      } catch {
        /* ignore */
      } finally {
        inFlight = false
      }
    }
    void tick()
    const iv = setInterval(tick, 1000)
    return () => {
      alive = false
      inFlight = false
      clearInterval(iv)
    }
  }, [groupId])

  // Start the call based on role
  useEffect(() => {
    void (async () => {
      await getLocal()
      if (localRef.current && selfStreamRef.current) localRef.current.srcObject = selfStreamRef.current
      if (call.mode === 'caller') {
        postSignal('ring', 0, { kind })
      } else {
        // responder: proactively offer to the caller
        const pc = apiRef.current.createPeer(call.peerId)
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

  // Cleanup on unmount (navigation away, parent unmount, call replaced): stop mic/cam + close peers
  useEffect(() => {
    const peers = peersRef.current
    const streams = remoteStreamsRef.current
    return () => {
      if (endedRef.current) return
      for (const [, peer] of peers) peer.pc?.close()
      peers.clear()
      streams.clear()
      // eslint-disable-next-line react-hooks/exhaustive-deps
      selfStreamRef.current?.getTracks().forEach((tr) => tr.stop())
      selfStreamRef.current = null
    }
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

  const hangup = () => {
    if (endedRef.current) return
    endedRef.current = true
    postSignal('hangup', 0, null)
    for (const [, peer] of peersRef.current) peer.pc?.close()
    peersRef.current.clear()
    remoteStreamsRef.current.clear()
    setRemoteStreams([])
    selfStreamRef.current?.getTracks().forEach((tr) => tr.stop())
    selfStreamRef.current = null
    onEnded()
  }

  if (callFailed) {
    return (
      <div className="fn-overlay">
        <div className="fn-modal call-modal">
          <div className="call-error">
            <PhoneOff size={22} />
            {t('groups.callEnded')}
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

  const showVideo = kind === 'video' && !camOff

  return (
    <div className="fn-overlay">
      <div className="call-stage">
        <div className="call-head">
          <div className="call-title">{t(kind === 'video' ? 'groups.videoCall' : 'groups.voiceCall')}</div>
          <div className="call-sub">{remoteStreams.length > 0 ? t('groups.callConnected') : t('groups.callRinging')}</div>
        </div>

        <div className="call-grid">
          <div className="call-tile call-self">
            {selfStream ? (
              <video ref={localRef} muted playsInline autoPlay className={showVideo ? '' : 'call-video-hidden'} />
            ) : (
              <div className="call-avatar-fallback">
                <Avatar user={{ id: meId, name: 'You', username: '', avatar: '', online: true }} size={72} />
              </div>
            )}
            {!showVideo && selfStream && (
              <div className="call-avatar-fallback">
                <Avatar user={{ id: meId, name: 'You', username: '', avatar: '', online: true }} size={72} />
              </div>
            )}
            <div className="call-tag">{t('groups.you')}</div>
          </div>

          {remoteStreams.map((r) => {
            const m = members.find((x) => x.id === r.userId)
            return (
              <div key={r.userId} className="call-tile">
                <StreamVideo stream={r.stream} hidden={!showVideo} />
                {!showVideo && (
                  <div className="call-avatar-fallback">
                    <Avatar user={m ? { ...m, online: true } : { id: r.userId, name: '', username: '', avatar: '', online: true }} size={72} />
                  </div>
                )}
                <div className="call-tag">{m?.name ?? ''}</div>
              </div>
            )
          })}
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