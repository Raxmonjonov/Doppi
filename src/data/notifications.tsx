import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import { translate } from '../i18n'

export type NotificationKind = 'message' | 'group' | 'call'

export interface AppNotification {
  id: number
  kind: NotificationKind
  actor: { id: number; name: string; username: string; avatar: string }
  threadId: number | null
  groupId: number | null
  callKind: string
  body: string
  hasAudio: boolean
  hasImage: boolean
  closed: boolean
  read: boolean
  createdAt: number
}

/* Bildirishnoma orqali "qo'ng'iroqqa qo'shilish" so'rovi.
   Messenger/Groups shu so'rovni ko'rib o'z o'zaro aloqasini
   responder rejimida boshlaydi. */
export interface CallJoinRequest {
  id: number
  scope: 'thread' | 'group'
  scopeId: number
  from: number
  fromName: string
  callKind: string
  at: number
}

interface NotificationsValue {
  items: AppNotification[]
  unread: number
  soundOn: boolean
  setSoundOn: (on: boolean) => void
  permission: NotificationPermission | 'unsupported'
  permissionGranted: boolean
  requestPermission: () => Promise<boolean>
  refresh: () => Promise<void>
  markRead: (ids: number[]) => Promise<void>
  markAllRead: () => Promise<void>
  joinRequest: CallJoinRequest | null
  consumeJoin: () => CallJoinRequest | null
  setJoinRequest: (req: CallJoinRequest | null) => void
}

const NotificationsContext = createContext<NotificationsValue | null>(null)

const POLL_MS = 4000
const MAX_ITEMS = 60
const SOUND_KEY = 'doppi-notify-sound-v1'

const tr = (key: string, params?: Record<string, string | number>) => {
  let lang = 'uz'
  try {
    lang = localStorage.getItem('doppi-lang-v1') ?? 'uz'
  } catch {
    /* ignore */
  }
  return translate(lang, key, params)
}

/* Qisqa "puf" ovozi (WebAudio) — qo'ng'iroq uchun, fayl yuklamasdan. */
function playTone(kind: 'message' | 'call') {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    const seq = kind === 'call' ? [660, 520, 660, 520] : [880, 1100]
    seq.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const at = ctx.currentTime + i * 0.18
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(kind === 'call' ? 0.22 : 0.12, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16)
      osc.connect(gain).connect(ctx.destination)
      osc.start(at)
      osc.stop(at + 0.18)
    })
    window.setTimeout(() => {
      void ctx.close().catch(() => {})
    }, (seq.length + 1) * 200)
  } catch {
    /* audio bloklangan bo'lishi mumkin */
  }
}

function titleFor(n: AppNotification): string {
  if (n.kind === 'call') {
    const verb = n.callKind === 'audio' ? tr('notif.incomingAudio') : tr('notif.incomingVideo')
    return `${n.actor.name} — ${verb}`
  }
  if (n.hasAudio) return `${n.actor.name}: ${tr('notif.voiceMessage')}`
  if (n.hasImage && !n.body) return `${n.actor.name}: ${tr('notif.imageMessage')}`
  return `${n.actor.name}: ${n.body || tr('notif.newMessage')}`
}

export function NotificationsProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [joinRequest, setJoinRequest] = useState<CallJoinRequest | null>(null)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )
  const [soundOn, setSoundOnState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SOUND_KEY) !== '0'
    } catch {
      return true
    }
  })

  const cursorRef = useRef(0)
  const inFlightRef = useRef(false)
  const seenRef = useRef(new Set<number>())
  const primedRef = useRef(false)

  const setSoundOn = useCallback((on: boolean) => {
    setSoundOnState(on)
    try {
      localStorage.setItem(SOUND_KEY, on ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [])

  const announce = useCallback(
    (n: AppNotification) => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      if (document.visibilityState === 'visible' && document.hasFocus()) return
      try {
        const note = new Notification(titleFor(n), {
          body: n.kind === 'call' ? tr('notif.openToJoin') : n.body || tr('notif.openToRead'),
          icon: n.actor.avatar || undefined,
          tag: `doppi-${n.kind}-${n.id}`,
          silent: true,
        })
        note.onclick = () => {
          window.focus()
          note.close()
        }
      } catch {
        /* ignore */
      }
    },
    [],
  )

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const res = await api<{ notifications: AppNotification[]; unread: number }>(
        `/api/notifications?since=${cursorRef.current}`,
      )
      const incoming = res.notifications ?? []
      if (incoming.length) {
        const maxId = incoming.reduce((m, n) => Math.max(m, n.id), cursorRef.current)
        cursorRef.current = maxId
        setItems((prev) => {
          const known = new Set(prev.map((p) => p.id))
          const fresh = incoming.filter((n) => !known.has(n.id))
          fresh.forEach((n) => {
            if (primedRef.current && !seenRef.current.has(n.id)) {
              seenRef.current.add(n.id)
              if (soundOn) playTone(n.kind === 'call' ? 'call' : 'message')
              announce(n)
            } else {
              seenRef.current.add(n.id)
            }
          })
          return [...prev, ...fresh].slice(-MAX_ITEMS)
        })
      }
      if (typeof res.unread === 'number') setUnread(res.unread)
      primedRef.current = true
    } catch {
      /* tarmoq uzilsa navbatdaki urinishga qoldiramiz */
    } finally {
      inFlightRef.current = false
    }
  }, [announce, soundOn])

  /* Tab ko'rinib turgan paytdan xabarni darhol o'qilgan deb belgilamaymiz —
     foydalanuvchi ochishni xohlasa, badge osilishi to'g'ri. Faqat tab
     yashiringanda o'z-o'zidan o'qilgan deb hisoblaymiz. */
  useEffect(() => {
    if (!enabled) return
    void refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, refresh])

  const markRead = useCallback(async (ids: number[]) => {
    if (!ids.length) return
    const idSet = new Set(ids)
    setItems((prev) => {
      const next = prev.map((n) => (idSet.has(n.id) ? { ...n, read: true } : n))
      setUnread(next.reduce((acc, n) => acc + (n.read ? 0 : 1), 0))
      return next
    })
    try {
      await api('/api/notifications/read', { method: 'POST', body: { ids } })
    } catch {
      /* ignore */
    }
  }, [])

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnread(0)
    try {
      await api('/api/notifications/read', { method: 'POST', body: {} })
    } catch {
      /* ignore */
    }
  }, [])

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') {
      setPermission('unsupported')
      return false
    }
    if (Notification.permission === 'granted') {
      setPermission('granted')
      return true
    }
    const res = await Notification.requestPermission()
    setPermission(res)
    return res === 'granted'
  }, [])

  const consumeJoin = useCallback(() => {
    const req = joinRequest
    if (req) setJoinRequest(null)
    return req
  }, [joinRequest])

  const value = useMemo<NotificationsValue>(
    () => ({
      items,
      unread,
      soundOn,
      setSoundOn,
      permission,
      permissionGranted: permission === 'granted',
      requestPermission,
      refresh,
      markRead,
      markAllRead,
      joinRequest,
      consumeJoin,
      setJoinRequest,
    }),
    [items, unread, soundOn, setSoundOn, permission, requestPermission, refresh, markRead, markAllRead, joinRequest, consumeJoin],
  )

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

export function useNotifications(): NotificationsValue {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotifications NotificationsProvider ichida ishlatilishi kerak')
  return ctx
}
