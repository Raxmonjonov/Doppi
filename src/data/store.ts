import { useSyncExternalStore } from 'react'
import type { Post, Story, Reel, Album, Group } from './mock'
import { api, getToken } from '../api/client'

export interface UserData {
  posts: Post[]
  stories: Story[]
  reels: Reel[]
  albums: Album[]
  groups: Group[]
  following: number[]
}

function empty(): UserData {
  return { posts: [], stories: [], reels: [], albums: [], groups: [], following: [] }
}

function normalize(d: Partial<UserData>): UserData {
  const reels = (d.reels ?? []).map((r) => ({
    ...r,
    comments: Array.isArray(r.comments) ? r.comments : [],
    shares: typeof r.shares === 'number' ? r.shares : 0,
  }))
  return {
    posts: d.posts ?? [],
    stories: d.stories ?? [],
    reels,
    albums: d.albums ?? [],
    groups: (d.groups ?? []).map((g) => ({
      ...g,
      name: g.name ?? '',
      cover: g.cover ?? '',
      members: g.members ?? '1 a\'zo',
      joined: !!g.joined,
    })),
    following: Array.isArray(d.following) ? d.following : [],
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

export async function pullData(): Promise<void> {
  if (!getToken()) return
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
    data = remote
    emit()
  } catch {
    /* offline — keep local */
  }
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

async function pushData(): Promise<void> {
  if (!getToken()) return
  try {
    await api('/api/data', {
      method: 'PUT',
      body: { posts: data.posts, stories: data.stories, reels: data.reels, albums: data.albums, groups: data.groups },
    })
  } catch {
    /* offline — will retry on next change */
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null

export function startSync() {
  if (pollTimer) return
  void pullData()
  pollTimer = setInterval(() => {
    void pullData()
  }, 5000)
}