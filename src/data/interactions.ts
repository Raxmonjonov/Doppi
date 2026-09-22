import { api } from '../api/client'
import { updateData, readUserData } from './store'
import type { Post, Reel, Album } from './mock'
import { translate } from '../i18n'

const tr = (key: string, params?: Record<string, string | number>) => {
  let lang = 'uz'
  try {
    lang = localStorage.getItem('doppi-lang-v1') ?? 'uz'
  } catch {
    /* ignore */
  }
  return translate(lang, key, params)
}

export async function toggleFollow(userId: number): Promise<void> {
  const wasFollowing = readUserData(null).following.includes(userId)
  updateData((d) => {
    d.following = wasFollowing ? d.following.filter((id) => id !== userId) : [...d.following, userId]
  })
  try {
    const r = await api<{ following: boolean }>(`/api/users/${userId}/follow`, { method: 'POST' })
    updateData((d) => {
      d.following = r.following
        ? Array.from(new Set([...d.following, userId]))
        : d.following.filter((id) => id !== userId)
    })
  } catch {
    /* offline — local kept */
  }
}

async function ensureThread(userId: number): Promise<number> {
  const { thread } = await api<{ thread: { id: number } }>('/api/threads', {
    method: 'POST',
    body: { user: userId },
  })
  return thread.id
}

export async function sendPostToUser(post: Post, userId: number): Promise<void> {
  updateData((d) => {
    d.posts = d.posts.map((p) => (p.id === post.id ? { ...p, shared: (p.shared ?? 0) + 1 } : p))
  })
  try {
    const tid = await ensureThread(userId)
    await api(`/api/threads/${tid}/messages`, {
      method: 'POST',
      body: { text: tr('interactions.sharedPostMessage', { text: post.text || tr('interactions.sharedPostFallback') }) },
    })
    const r = await api<{ shared: number }>(`/api/posts/${post.id}/share`, { method: 'POST' })
    updateData((d) => {
      d.posts = d.posts.map((p) => (p.id === post.id ? { ...p, shared: r.shared } : p))
    })
  } catch {
    /* offline — local kept */
  }
}

export async function sendReelToUser(reel: Reel, userId: number): Promise<void> {
  updateData((d) => {
    d.reels = d.reels.map((r) => (r.id === reel.id ? { ...r, shares: (r.shares ?? 0) + 1 } : r))
  })
  try {
    const tid = await ensureThread(userId)
    await api(`/api/threads/${tid}/messages`, {
      method: 'POST',
      body: { text: tr('interactions.sharedReelMessage', { text: reel.caption || tr('interactions.sharedReelFallback') }) },
    })
    const res = await api<{ shares: number }>(`/api/reels/${reel.id}/share`, { method: 'POST' })
    updateData((d) => {
      d.reels = d.reels.map((r) => (r.id === reel.id ? { ...r, shares: res.shares } : r))
    })
  } catch {
    /* offline — local kept */
  }
}

export async function togglePostLike(post: Post): Promise<void> {
  updateData((d) => {
    d.posts = d.posts.map((p) =>
      p.id === post.id ? { ...p, likes: p.likes + (p.likedByMe ? -1 : 1), likedByMe: !p.likedByMe } : p,
    )
  })
  try {
    const r = await api<{ liked: boolean; likes: number }>(`/api/posts/${post.id}/like`, { method: 'POST' })
    updateData((d) => {
      d.posts = d.posts.map((p) => (p.id === post.id ? { ...p, likes: r.likes, likedByMe: r.liked } : p))
    })
  } catch {
    /* offline — local kept */
  }
}

export async function addPostComment(post: Post, comment: { id: number; author: Post['author']; text: string; time: string }): Promise<void> {
  updateData((d) => {
    d.posts = d.posts.map((p) => (p.id === post.id ? { ...p, comments: [...p.comments, comment] } : p))
  })
  try {
    await api(`/api/posts/${post.id}/comment`, { method: 'POST', body: { text: comment.text } })
  } catch {
    /* offline — local kept */
  }
}

export async function sharePost(post: Post): Promise<void> {
  updateData((d) => {
    d.posts = d.posts.map((p) => (p.id === post.id ? { ...p, shared: (p.shared ?? 0) + 1 } : p))
  })
  try {
    const r = await api<{ shared: number }>(`/api/posts/${post.id}/share`, { method: 'POST' })
    updateData((d) => {
      d.posts = d.posts.map((p) => (p.id === post.id ? { ...p, shared: r.shared } : p))
    })
  } catch {
    /* offline — local kept */
  }
}

export async function toggleReelLike(reel: Reel): Promise<void> {
  updateData((d) => {
    d.reels = d.reels.map((r) =>
      r.id === reel.id ? { ...r, likes: r.likes + (r.likedByMe ? -1 : 1), likedByMe: !r.likedByMe } : r,
    )
  })
  try {
    const res = await api<{ liked: boolean; likes: number }>(`/api/reels/${reel.id}/like`, { method: 'POST' })
    updateData((d) => {
      d.reels = d.reels.map((r) => (r.id === reel.id ? { ...r, likes: res.likes, likedByMe: res.liked } : r))
    })
  } catch {
    /* offline — local kept */
  }
}

export async function addReelComment(reel: Reel, comment: { id: number; author: Reel['author']; text: string; time: string }): Promise<void> {
  updateData((d) => {
    d.reels = d.reels.map((r) => (r.id === reel.id ? { ...r, comments: [...r.comments, comment] } : r))
  })
  try {
    await api(`/api/reels/${reel.id}/comment`, { method: 'POST', body: { text: comment.text } })
  } catch {
    /* offline — local kept */
  }
}

export async function shareReel(reel: Reel): Promise<void> {
  updateData((d) => {
    d.reels = d.reels.map((r) => (r.id === reel.id ? { ...r, shares: (r.shares ?? 0) + 1 } : r))
  })
  try {
    const res = await api<{ shares: number }>(`/api/reels/${reel.id}/share`, { method: 'POST' })
    updateData((d) => {
      d.reels = d.reels.map((r) => (r.id === reel.id ? { ...r, shares: res.shares } : r))
    })
  } catch {
    /* offline — local kept */
  }
}

export async function toggleAlbumLike(album: Album): Promise<void> {
  updateData((d) => {
    d.albums = d.albums.map((a) =>
      a.id === album.id ? { ...a, likes: a.likes + (a.likedByMe ? -1 : 1), likedByMe: !a.likedByMe } : a,
    )
  })
  try {
    const r = await api<{ liked: boolean; likes: number }>(`/api/albums/${album.id}/like`, { method: 'POST' })
    updateData((d) => {
      d.albums = d.albums.map((a) => (a.id === album.id ? { ...a, likes: r.likes, likedByMe: r.liked } : a))
    })
  } catch {
    /* offline — local kept */
  }
}

export async function markStoryViewed(storyId: number): Promise<void> {
  try {
    await api(`/api/stories/${storyId}/view`, { method: 'POST' })
  } catch {
    /* offline */
  }
}