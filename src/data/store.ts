import { useSyncExternalStore } from 'react'
import type { Post, Story, Reel, Album, Group } from './mock'
import { api, getToken, apiUrl } from '../api/client'

export interface LiveOwner {
  id: number
  name: string
  username: string
  avatar: string
}

export interface Live {
  id: number
  owner: LiveOwner
  title: string
  startedAt: number
  status: 'live' | 'ended'
  viewers: number
  video?: string
  endedAt?: number
  duration?: number
}

export interface LongVideo {
  id: number
  owner: LiveOwner
  title: string
  src: string
  type: 'live' | 'upload'
  liveId?: number | null
  duration: number
  createdAt: number
}

export interface UserData {
  posts: Post[]
  stories: Story[]
  reels: Reel[]
  albums: Album[]
  groups: Group[]
  following: number[]
  lives: Live[]
  videos: LongVideo[]
}

/* Serverdagi media fayllari nisbiy yo'l bilan saqlanadi (/api/media/x.webp).
   VITE_API_URL bo'lsa (Netlify) ularni to'g'ri origin'ga ulash kerak.
   data: va http(s): manzillar o'zgarishsiz qoladi. */
function mediaUrl(value: unknown): unknown {
  if (typeof value === 'string' && value.startsWith('/api/media/')) return apiUrl(value)
  return value
}

function empty(): UserData {
  return { posts: [], stories: [], reels: [], albums: [], groups: [], following: [], lives: [], videos: [] }
}

function normalize(d: Partial<UserData>): UserData {
  const reels = (d.reels ?? []).map((r) => ({
    ...r,
    image: mediaUrl(r.image) as string,
    comments: Array.isArray(r.comments) ? r.comments : [],
    shares: typeof r.shares === 'number' ? r.shares : 0,
  }))
  return {
    posts: (d.posts ?? []).map((p) => ({
      ...p,
      images: (p.images ?? []).map((i) => mediaUrl(i) as string),
      ...(p.video ? { video: mediaUrl(p.video) as string } : {}),
    })),
    stories: (d.stories ?? []).map((s) => ({ ...s, image: mediaUrl(s.image) as string })),
    reels,
    albums: (d.albums ?? []).map((a) => ({
      ...a,
      photos: (a.photos ?? []).map((ph) => ({ ...ph, url: mediaUrl(ph.url) as string })),
    })),
    groups: (d.groups ?? []).map((g) => ({
      ...g,
      name: g.name ?? '',
      cover: mediaUrl(g.cover) as string,
      members: g.members ?? '1 a\'zo',
      joined: !!g.joined,
    })),
    following: Array.isArray(d.following) ? d.following : [],
    lives: (d.lives ?? []).map((l) => ({
      ...l,
      video: typeof l.video === 'string' && l.video ? (mediaUrl(l.video) as string) : '',
    })),
    videos: (d.videos ?? []).map((v) => ({
      ...v,
      src: typeof v.src === 'string' && v.src ? (mediaUrl(v.src) as string) : '',
    })),
  }
}

let data: UserData = empty()
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useData<T>(selector: (d: UserData) => T): T {
  return useSyncExternalStore(subscribe, () => selector(data))
}

export function readUserData(_uid: number | null): UserData {
  return data
}

function loadLegacy(): UserData | null {
  const LEGACY_KEYS = ['doppi-data-v1', 'doppi-user-data-v1']
  for (const key of LEGACY_KEYS) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const d = JSON.parse(raw) as Partial<UserData>
      const hasData = (d.posts?.length ?? 0) > 0 || (d.stories?.length ?? 0) > 0 || (d.reels?.length ?? 0) > 0 || (d.albums?.length ?? 0) > 0 || (d.groups?.length ?? 0) > 0
      if (!hasData) continue
      try {
        localStorage.removeItem(key)
      } catch {
        /* ignore */
      }
      return normalize(d)
    } catch {
      /* ignore */
    }
  }
  return null
}

let pullInFlight = false

export async function pullData(): Promise<void> {
  if (!getToken()) return
  // Sekin tarmoqda /api/data javobi 5s dan ancha uzoq ketadi — interval
  // tug'ilgan parallel pull'lar bandwidth'ni bo'lib, o'z-o'zini DDoS qiladi
  // (har biri yanada sekinlashadi → hech qachon tugamaydi). Faqat bittasi.
  if (pullInFlight) return
  pullInFlight = true
  try {
    const d = await api<Partial<UserData>>('/api/data')
    const remote = normalize(d)
    const hasRemote = remote.posts.length > 0 || remote.stories.length > 0 || remote.reels.length > 0 || remote.albums.length > 0 || remote.groups.length > 0
    if (!hasRemote) {
      const legacy = loadLegacy()
      if (legacy) {
        data = legacy
        emit()
        await pushData()
        return
      }
    }
    // Xatolik: optimistic qo'shilgan live (POST /api/lives)ni javobi undan
    // OLDIN generatsiya qilingan eski pull yo'qotib yuboradi — xona qayta
    // mount bo'lib (live topilmadi) WebRTC uziladi. Lokalda 'live' holatida
    // turib, remote'da yo'q efirlarni saqlaymiz — keyingi to'liq javob
    // (serverda allaqachon yaratilgandan) o'zini to'g'rilaydi.
    const pendingLives = data.lives.filter((l) => l.status === 'live' && !remote.lives.some((x) => x.id === l.id))
    if (pendingLives.length > 0) {
      remote.lives = [...remote.lives, ...pendingLives].sort((a, b) => b.id - a.id)
    }
    data = remote
    emit()
  } catch {
    /* offline — keep local */
  } finally {
    pullInFlight = false
  }
}

/* Server egalikdagi bo'limlar (lives/videos) uchun: lokal o'zgarish store'ga
   yoziladi, lekin PUT /api/data (postlar/guruhlar) schedule qilinmaydi —
   ular serverda yaratiladi/saqlanadi. */
export function updateLocal(fn: (d: UserData) => void) {
  fn(data)
  emit()
}

let pushTimer: ReturnType<typeof setTimeout> | null = null

export function updateData(fn: (d: UserData) => void) {
  fn(data)
  emit()
  schedulePush()
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    void pushData()
  }, 400)
}

let pushInFlight = false
let pushQueued = false

async function pushData(): Promise<void> {
  if (!getToken()) return
  // PUT /api/data butun holatni (MB'lar) yuboradi — parallel yozuvlar
  // sekin upload'ni kesib, to'planib ketmasin; o'rtadagi o'zgarishlar
  // oxirgi bitta push'da yetib boradi (queued).
  if (pushInFlight) {
    pushQueued = true
    return
  }
  pushInFlight = true
  try {
    await api('/api/data', {
      method: 'PUT',
      body: { posts: data.posts, stories: data.stories, reels: data.reels, albums: data.albums, groups: data.groups },
    })
  } catch {
    /* offline — will retry on next change */
  } finally {
    pushInFlight = false
    if (pushQueued) {
      pushQueued = false
      void pushData()
    }
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null

function sendPing() {
  if (!getToken()) return
  // Yashirin tabda presence yubormaymiz: brauzer fon tabidan 30sda bir
  // kelgan yagona so'rov server compute'ini uxlatishga (≥5 daqiqa
  // so'rovsiz tufayli suspend) yo'l qo'ymasdi.
  if (document.visibilityState !== 'visible') return
  void api('/api/ping', { method: 'POST' }).catch(() => {
    /* offline — ignore */
  })
}

export function startSync() {
  if (pollTimer) return
  void pullData()
  pollTimer = setInterval(() => {
    // Yashirin tabda /api/data so'rovini o'tkazib yuboramiz — shu vaqtning
    // o'zida (5s) server hech qachon suspend bo'lolmasdi. Qaytganda
    // visibilitychange darhol yangilaydi; yashirin paytda push xabari
    // service worker orqali yetadi.
    if (document.visibilityState !== 'visible') return
    void pullData()
  }, 5000)
  sendPing()
  setInterval(sendPing, 30000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void pullData()
      sendPing()
    }
  })
}