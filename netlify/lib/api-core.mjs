import crypto from 'node:crypto'

const DAY = 24 * 60 * 60 * 1000

export function emptyDoc() {
  return {
    users: [],
    sessions: [],
    adminSessions: [],
    posts: [],
    postLikes: [],
    postComments: [],
    postShares: [],
    sealShields: [],
    stories: [],
    storyViews: [],
    reels: [],
    reelLikes: [],
    reelComments: [],
    reelShares: [],
    albums: [],
    albumLikes: [],
    threads: [],
    messages: [],
    threadCallSignals: [],
    groups: [],
    groupMessages: [],
    callSignals: [],
    follows: [],
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return { salt, hash }
}

function verifyPassword(password, salt, hash) {
  const test = crypto.scryptSync(password, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(hash, 'hex'))
}

function makeToken() {
  return crypto.randomBytes(32).toString('hex')
}

function publicUser(u) {
  if (!u) return null
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    avatar: u.avatar ?? '',
    about: u.about ?? '',
    createdAt: u.createdAt,
    online: true,
  }
}

function userForContent(u) {
  if (!u) return null
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    avatar: u.avatar ?? '',
    online: true,
    about: u.about ?? '',
  }
}

function userById(doc, id) {
  return doc.users.find((u) => u.id === id)
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function upsert(doc, key, item, idKey = 'id') {
  const idx = doc[key].findIndex((x) => x[idKey] === item[idKey])
  if (idx >= 0) doc[key][idx] = item
  else doc[key].push(item)
}

function removeFrom(doc, key, pred) {
  if (!Array.isArray(doc[key])) return
  const idx = doc[key].findIndex(pred)
  if (idx >= 0) doc[key].splice(idx, 1)
}

async function readBody(req) {
  try {
    return (await req.json()) ?? {}
  } catch {
    return {}
  }
}

export const MEDIA_LIMITS = {
  image: 8 * 1024 * 1024,
  video: 40 * 1024 * 1024,
}

const MEDIA_MIME = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
}

const MEDIA_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
}

export function parseDataUrl(dataUrl) {
  const m = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(String(dataUrl ?? '').trim())
  if (!m) return null
  const mime = m[1].toLowerCase()
  const bytes = Buffer.from(m[2], 'base64')
  if (!bytes.length) return null
  return { mime, bytes }
}

export function mediaIdFor(id, mime) {
  return `${id}.${MEDIA_EXT[mime] ?? 'bin'}`
}

/* Media id is used as a storage key (Blobs key / file path / SQL text) — keep it boring. */
export function isSafeMediaId(id) {
  const s = String(id ?? '')
  return s.length > 0 && s.length <= 120 && !s.includes('..') && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s)
}

/* Hujjatda qolib ketgan barcha media havolalari: kim vaqtincha o'chirilsa ham
   "ishlatilgan" hisoblanadi. */
export function collectMediaRefs(doc) {
  const refs = new Set()
  const take = (v) => {
    if (typeof v !== 'string') return
    const m = /\/api\/media\/([A-Za-z0-9][\w.-]*)$/.exec(v)
    if (m) refs.add(m[1])
  }
  for (const u of doc.users ?? []) take(u.avatar)
  for (const p of doc.posts ?? []) {
    for (const i of p.images ?? []) take(i)
    take(p.video)
  }
  for (const s of doc.stories ?? []) take(s.image)
  for (const r of doc.reels ?? []) {
    take(r.image)
    take(r.video)
  }
  for (const a of doc.albums ?? []) {
    take(a.cover)
    for (const ph of a.photos ?? []) take(ph?.url)
  }
  for (const g of doc.groups ?? []) take(g.cover)
  for (const m of doc.messages ?? []) take(m.image)
  for (const m of doc.groupMessages ?? []) take(m.image)
  return refs
}

/* Ro'yxatga olinmagan (vaqtincha o'chirilgan post yoki bekor qilingan
   yuklash) media fayllarini o'chiradi. */
export async function collectGarbageMedia(doc, store) {
  if (typeof store.listMedia !== 'function' || typeof store.deleteMedia !== 'function') {
    return { removed: 0, kept: 0, unsupported: true }
  }
  const used = collectMediaRefs(doc)
  const all = await store.listMedia()
  const orphans = all.filter((id) => !used.has(id))
  const removed = await store.deleteMedia(orphans)
  return { removed, kept: all.length - orphans.length, scanned: all.length }
}

export async function handleRequest(method, pathname, query, req, store) {
  const segs = pathname.split('/').filter(Boolean)
  const api = segs.length >= 1 && segs[0] === 'api' ? segs.slice(1) : segs
  const [first, second, third, _fourth] = api

  /* ---------- Media (binary) — doc hujjatini yuklamaydi ---------- */

  if (method === 'GET' && first === 'media' && second && typeof store.getMedia === 'function') {
    if (!isSafeMediaId(second)) return { status: 400, json: { error: 'Noto‘g‘ri fayl nomi.' } }
    const item = await store.getMedia(String(second))
    if (!item) return { status: 404, json: { error: 'Fayl topilmadi.' } }
    return { status: 200, binary: { body: item.bytes, type: item.mime } }
  }

  const doc = await store.getDoc()
  const send = async (status, json) => ({ status, json })

  const bearer = String(req.headers?.authorization ?? req.headers?.get?.('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  const auth = (d, token) => {
    if (!token) return null
    const s = d.sessions.find((x) => x.token === token)
    if (!s) return null
    s.lastSeen = Date.now()
    return userById(d, s.userId) ?? null
  }

  /* ---------- Auth ---------- */

  if (method === 'POST' && first === 'auth' && second === 'register') {
    const body = await readBody(req)
    const { name, username, email, password, avatar, about } = body
    const uname = String(username ?? '').trim()
    const nm = String(name ?? '').trim() || uname
    const em = String(email ?? '').trim().toLowerCase()
    const pw = String(password ?? '')
    const av = typeof avatar === 'string' ? avatar : ''
    const ab = typeof about === 'string' ? about : ''

    if (!nm || !uname || !em || !pw) return send(400, { error: "Barcha maydonlarni to'ldiring." })
    if (uname.length < 3) return send(400, { error: "Foydalanuvchi nomi kamida 3 belgidan iborat bo'lishi kerak." })
    if (pw.length < 4) return send(400, { error: 'Parol kamida 4 belgidan iborat bo\'lishi kerak.' })

    const taken = doc.users.find((u) => u.username.toLowerCase() === uname.toLowerCase() || u.email.toLowerCase() === em)
    if (taken) {
      return send(409, {
        error: taken.username.toLowerCase() === uname.toLowerCase() ? 'Bu foydalanuvchi nomi band.' : "Bu email allaqachon ro'yxatdan o'tgan.",
      })
    }

    const { salt, hash } = hashPassword(pw)
    const id = Date.now()
    const createdAt = new Date().toISOString()
    doc.users.push({ id, name: nm, username: uname, email: em, salt, hash, avatar: av, about: ab, createdAt, lastLoginAt: createdAt, lastLogoutAt: 0 })
    const token = makeToken()
    doc.sessions.push({ token, userId: id, lastSeen: Date.now() })
    await store.saveDoc(doc)
    return send(200, { token, user: publicUser({ id, name: nm, username: uname, email: em, avatar: av, about: ab, createdAt }) })
  }

  if (method === 'POST' && first === 'auth' && second === 'login') {
    const body = await readBody(req)
    const idf = String(body.username ?? '').trim().toLowerCase()
    const pw = String(body.password ?? '')
    const user = doc.users.find((u) => u.username.toLowerCase() === idf || u.email.toLowerCase() === idf)
    if (!user) return send(404, { error: 'Bunday foydalanuvchi topilmadi.' })
    if (!verifyPassword(pw, user.salt, user.hash)) return send(401, { error: "Parol noto'g'ri." })
    const token = makeToken()
    user.lastLoginAt = new Date().toISOString()
    doc.sessions.push({ token, userId: user.id, lastSeen: Date.now() })
    await store.saveDoc(doc)
    return send(200, { token, user: publicUser(user) })
  }

  if (method === 'POST' && first === 'auth' && second === 'logout') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    me.lastLogoutAt = Date.now()
    removeFrom(doc, 'sessions', (s) => s.token === bearer)
    await store.saveDoc(doc)
    return send(200, { ok: true })
  }

  /* ---------- Admin ---------- */

  const ADMIN_USER = process.env.ADMIN_USERNAME ?? 'Admin'
  const ADMIN_PASS = process.env.ADMIN_PASSWORD ?? 'Admin.Do\'ppi.Uzbekitan.66'
  const adminAuth = (d, token) => {
    if (!token) return null
    const s = d.adminSessions?.find((x) => x.token === token)
    if (!s) return null
    s.lastSeen = Date.now()
    return s
  }

  if (method === 'POST' && first === 'admin' && second === 'login') {
    const body = await readBody(req)
    const un = String(body.username ?? '')
    const pw = String(body.password ?? '')
    if (un === ADMIN_USER && pw === ADMIN_PASS) {
      const token = makeToken()
      doc.adminSessions = doc.adminSessions ?? []
      doc.adminSessions.push({ token, userId: 'admin', lastSeen: Date.now() })
      await store.saveDoc(doc)
      return send(200, { token })
    }
    return send(401, { error: 'Foydalanuvchi nomi yoki parol xato.' })
  }

  if (method === 'POST' && first === 'admin' && second === 'logout') {
    removeFrom(doc, 'adminSessions', (s) => s.token === bearer)
    await store.saveDoc(doc)
    return send(200, { ok: true })
  }

  /* ---------- Presence ---------- */

  // Client heartbeat: keeps the session "online". Called every ~15s while the app is open.
  if (method === 'POST' && first === 'ping') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    await store.saveDoc(doc)
    return send(200, { ok: true })
  }

  if (method === 'GET' && first === 'dashboard') {
    const admin = adminAuth(doc, bearer)
    if (!admin) return send(401, { error: 'Admin kirishi talab qilinadi.' })

    const now = Date.now()
    const ONLINE_MS = 60 * 1000 // online = lastSeen within the last minute

    const onlineIds = new Set()
    const offlineIds = new Set()
    for (const u of doc.users) {
      const hasActive = doc.sessions.some((s) => s.userId === u.id && now - Number(s.lastSeen ?? 0) < ONLINE_MS)
      ;(hasActive ? onlineIds : offlineIds).add(u.id)
    }

    const lastLogout = doc.users
      .filter((u) => Number(u.lastLogoutAt ?? 0) > 0)
      .sort((a, b) => Number(b.lastLogoutAt) - Number(a.lastLogoutAt))[0] ?? null

    const recent = [...doc.users]
      .sort((a, b) => {
        const at = (u) => new Date(u.lastLoginAt ?? u.createdAt).getTime() || 0
        return at(b) - at(a)
      })
      .slice(0, 6)

    const dayMs = 24 * 60 * 60 * 1000
    const growth = []
    for (let i = 13; i >= 0; i--) {
      const start = new Date(now - i * dayMs)
      start.setHours(0, 0, 0, 0)
      const end = start.getTime() + dayMs
      const count = doc.users.filter((u) => {
        const t = new Date(u.createdAt).getTime() || 0
        return t >= start.getTime() && t < end
      }).length
      growth.push({ day: start.toISOString().slice(0, 10), count })
    }

    const uBase = (u) => ({ id: u.id, name: u.name, username: u.username, avatar: u.avatar ?? '' })

    return send(200, {
      totals: {
        users: doc.users.length,
        online: onlineIds.size,
        offline: offlineIds.size,
        posts: doc.posts.length,
        comments: doc.postComments.length,
        reels: doc.reels.length,
        messages: doc.messages.length,
        threads: doc.threads.length,
        groups: doc.groups.length,
        albums: doc.albums.length,
        stories: doc.stories.length,
        follows: doc.follows.length,
      },
      growth,
      lastLogout: lastLogout ? { ...uBase(lastLogout), at: Number(lastLogout.lastLogoutAt) } : null,
      lastOnline: [...onlineIds].map((id) => uBase(userById(doc, id))),
      recentUsers: recent.map((u) => ({ ...uBase(u), lastLoginAt: u.lastLoginAt ?? u.createdAt, createdAt: u.createdAt })),
    })
  }

  if (method === 'GET' && first === 'auth' && second === 'me') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    return send(200, { user: publicUser(me) })
  }

  if (method === 'PATCH' && first === 'auth' && second === 'me') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const body = await readBody(req)
    if (body.name !== undefined) me.name = String(body.name).trim()
    if (body.about !== undefined) me.about = String(body.about)
    if (body.avatar !== undefined) me.avatar = String(body.avatar)
    await store.saveDoc(doc)
    return send(200, { user: publicUser(me) })
  }

  /* ---------- Users ---------- */

  if (method === 'GET' && first === 'users' && second === undefined) {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const q = String(query.q ?? '').trim().toLowerCase()
    let users = doc.users.filter((u) => u.id !== me.id)
    if (q) users = users.filter((u) => (u.name ?? '').toLowerCase().includes(q) || (u.username ?? '').toLowerCase().includes(q))
    users = [...users].sort((a, b) => String(a.name).localeCompare(String(b.name)))
    return send(200, { users: users.map(publicUser) })
  }

  if (method === 'POST' && first === 'users' && third === 'follow') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const targetId = Number(second)
    if (!Number.isInteger(targetId) || targetId === me.id) return send(400, { error: "O'zingizni kuzata olmaysiz." })
    if (!userById(doc, targetId)) return send(404, { error: 'Foydalanuvchi topilmadi.' })
    const idx = doc.follows.findIndex((f) => f.followerId === me.id && f.followeeId === targetId)
    let nowFollowing
    if (idx >= 0) {
      doc.follows.splice(idx, 1)
      nowFollowing = false
    } else {
      doc.follows.push({ followerId: me.id, followeeId: targetId })
      nowFollowing = true
    }
    await store.saveDoc(doc)
    return send(200, { following: nowFollowing })
  }

  /* ---------- Data ---------- */

  if (method === 'GET' && first === 'data' && second === undefined) {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const storyCutoff = Date.now() - DAY

    const posts = doc.posts
      .filter((p) => userById(doc, p.authorId))
      .map((p) => {
        const au = userById(doc, p.authorId)
        const likes = doc.postLikes.filter((l) => l.postId === p.id).length
        const shared = doc.postShares.filter((s) => s.postId === p.id).length
        const likedByMe = doc.postLikes.some((l) => l.postId === p.id && l.userId === me.id)
        const shields = doc.sealShields.filter((s) => s.postId === p.id).length
        const shieldedByMe = doc.sealShields.some((s) => s.postId === p.id && s.userId === me.id)
        return {
          id: p.id,
          author: userForContent(au),
          time: p.time ?? '',
          text: p.text ?? '',
          images: Array.isArray(p.images) ? p.images : [],
          ...(p.video ? { video: p.video } : {}),
          ...(p.sealUntil ? { sealUntil: p.sealUntil } : {}),
          likes,
          comments: doc.postComments
            .filter((c) => c.postId === p.id)
            .sort((a, b) => a.id - b.id)
            .map((c) => ({ id: c.id, author: userForContent(userById(doc, c.authorId)), text: c.text, time: c.time })),
          shared,
          ...(p.live ? { live: true } : {}),
          likedByMe: !!likedByMe,
          ...(shields ? { shields } : {}),
          ...(shieldedByMe ? { shieldedByMe: true } : {}),
        }
      })
      .sort((a, b) => b.id - a.id)

    const storiesData = doc.stories
      .filter((s) => s.id > storyCutoff)
      .filter(
        (s) =>
          s.authorId === me.id ||
          doc.follows.some((f) => f.followerId === me.id && f.followeeId === s.authorId),
      )
      .map((s) => {
        const au = userById(doc, s.authorId)
        const viewed = doc.storyViews.some((v) => v.storyId === s.id && v.userId === me.id)
        return {
          id: s.id,
          author: userForContent(au),
          image: s.image,
          viewed,
        }
      })
      .sort((a, b) => b.id - a.id)

    const reels = doc.reels
      .filter((r) => userById(doc, r.authorId))
      .map((r) => {
        const au = userById(doc, r.authorId)
        const likes = doc.reelLikes.filter((l) => l.reelId === r.id).length
        const shares = doc.reelShares.filter((s) => s.reelId === r.id).length
        const likedByMe = doc.reelLikes.some((l) => l.reelId === r.id && l.userId === me.id)
        return {
          id: r.id,
          author: userForContent(au),
          image: r.image,
          caption: r.caption ?? '',
          sound: r.sound ?? '',
          likes,
          comments: doc.reelComments
            .filter((c) => c.reelId === r.id)
            .sort((a, b) => a.id - b.id)
            .map((c) => ({ id: c.id, author: userForContent(userById(doc, c.authorId)), text: c.text, time: c.time })),
          shares,
          viewMode: r.viewMode ?? 'none',
          likedByMe: !!likedByMe,
        }
      })
      .sort((a, b) => b.id - a.id)

    const albums = [...doc.albums]
      .map((a) => ({
        id: a.id,
        title: a.title ?? '',
        count: Array.isArray(a.photos) ? a.photos.length : 0,
        likes: doc.albumLikes.filter((l) => l.albumId === a.id).length,
        photos: Array.isArray(a.photos) ? a.photos : [],
        ...(a.sealUntil ? { sealUntil: Number(a.sealUntil) } : {}),
      }))
      .sort((a, b) => b.id - a.id)

    const groups = [...doc.groups].sort((a, b) => b.id - a.id)
    const following = doc.follows.filter((f) => f.followerId === me.id).map((f) => f.followeeId)

    const staleIds = doc.stories.filter((s) => s.id <= storyCutoff).map((s) => s.id)
    if (staleIds.length > 0) {
      const before = doc.stories.length
      doc.stories = doc.stories.filter((s) => s.id > storyCutoff)
      doc.storyViews = doc.storyViews.filter((v) => !staleIds.includes(v.storyId))
      if (doc.stories.length !== before) await store.saveDoc(doc)
    }

    return send(200, { posts, stories: storiesData, reels, albums, groups, following })
  }

  if (method === 'PUT' && first === 'data' && second === undefined) {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const d = await readBody(req)
    const storyCutoff = Date.now() - DAY

    for (const p of Array.isArray(d.posts) ? d.posts : []) {
      const authorId = Number(p.author?.id) || me.id
      if (!userById(doc, authorId)) continue
      upsert(doc, 'posts', {
        id: Number(p.id),
        authorId,
        time: String(p.time ?? ''),
        text: String(p.text ?? ''),
        images: Array.isArray(p.images) ? p.images : [],
        video: p.video ?? null,
        live: !!p.live,
        ...(p.sealUntil ? { sealUntil: Number(p.sealUntil) } : {}),
      })
    }

    for (const s of Array.isArray(d.stories) ? d.stories : []) {
      if (Number(s.id) < storyCutoff) continue
      const authorId = Number(s.author?.id) || me.id
      if (!userById(doc, authorId)) continue
      upsert(doc, 'stories', { id: Number(s.id), authorId, image: String(s.image ?? '') })
    }

    for (const g of Array.isArray(d.groups) ? d.groups : []) {
      const existing = doc.groups.find((x) => x.id === Number(g.id))
      if (existing) {
        existing.name = String(g.name ?? '')
        existing.cover = String(g.cover ?? '')
        existing.joined = !!g.joined
        if (g.members) existing.members = String(g.members)
      } else {
        doc.groups.push({ id: Number(g.id), name: String(g.name ?? ''), cover: String(g.cover ?? ''), joined: !!g.joined, members: String(g.members ?? "1 a'zo"), createdBy: me.id })
      }
    }

    for (const r of Array.isArray(d.reels) ? d.reels : []) {
      const authorId = Number(r.author?.id) || me.id
      if (!userById(doc, authorId)) continue
      upsert(doc, 'reels', {
        id: Number(r.id),
        authorId,
        image: String(r.image ?? ''),
        caption: String(r.caption ?? ''),
        sound: String(r.sound ?? ''),
        viewMode: String(r.viewMode ?? 'none'),
      })
    }

    const incomingAlbums = Array.isArray(d.albums) ? d.albums : []
    const existingIds = new Set(doc.albums.map((x) => String(x.id)))
    const incomingIds = new Set(incomingAlbums.map((a) => String(Number(a.id))))
    const addCount = [...incomingIds].filter((id) => !existingIds.has(id)).length
    if (existingIds.size + addCount > 10) {
      return send(403, { error: 'Ko\'pi bilan 10 ta albom yaratish mumkin.' })
    }
    const remainingPhotos = doc.albums
      .filter((x) => !incomingIds.has(String(x.id)))
      .reduce((n, x) => n + (Array.isArray(x.photos) ? x.photos.length : 0), 0)
    const incomingTotal = incomingAlbums.reduce((n, a) => n + (Array.isArray(a.photos) ? a.photos.length : 0), 0)
    if (remainingPhotos + incomingTotal > 30) {
      return send(403, { error: 'Barcha albomlarda ko\'pi bilan 30 ta rasm bo\'lishi mumkin.' })
    }
    for (const a of incomingAlbums) {
      upsert(doc, 'albums', {
        id: Number(a.id),
        title: String(a.title ?? ''),
        photos: Array.isArray(a.photos) ? a.photos : [],
        ...(a.sealUntil ? { sealUntil: Number(a.sealUntil) } : {}),
      })
    }

    await store.saveDoc(doc)
    return send(200, { ok: true })
  }

  /* ---------- Posts ---------- */

  if (method === 'POST' && first === 'posts' && third === 'like') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const id = Number(second)
    if (!doc.posts.some((p) => p.id === id)) return send(404, { error: 'Post topilmadi.' })
    const idx = doc.postLikes.findIndex((l) => l.postId === id && l.userId === me.id)
    const liked = idx < 0
    if (liked) doc.postLikes.push({ postId: id, userId: me.id })
    else doc.postLikes.splice(idx, 1)
    const likes = doc.postLikes.filter((l) => l.postId === id).length
    await store.saveDoc(doc)
    return send(200, { liked, likes })
  }

  if (method === 'POST' && first === 'posts' && third === 'comment') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const id = Number(second)
    const body = await readBody(req)
    const text = String(body.text ?? '').trim()
    if (!text) return send(400, { error: "Izoh bo'sh bo'lishi mumkin emas." })
    if (!doc.posts.some((p) => p.id === id)) return send(404, { error: 'Post topilmadi.' })
    const cid = Date.now()
    const time = nowTime()
    doc.postComments.push({ id: cid, postId: id, authorId: me.id, text, time })
    await store.saveDoc(doc)
    return send(200, { comment: { id: cid, author: userForContent(me), text, time } })
  }

  if (method === 'POST' && first === 'posts' && third === 'share') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const id = Number(second)
    if (!doc.posts.some((p) => p.id === id)) return send(404, { error: 'Post topilmadi.' })
    doc.postShares.push({ postId: id, userId: me.id })
    const shared = doc.postShares.filter((s) => s.postId === id).length
    await store.saveDoc(doc)
    return send(200, { shared })
  }

  if (method === 'POST' && first === 'posts' && third === 'shield') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const id = Number(second)
    const post = doc.posts.find((p) => p.id === id)
    if (!post) return send(404, { error: 'Post topilmadi.' })
    if (!post.sealUntil || Number(post.sealUntil) <= Date.now())
      return send(400, { error: "Muhr allaqachon ochilgan — qalqon qo'yib bo'lmaydi." })
    if (Number(post.authorId) === me.id)
      return send(403, { error: "O'z postingizni himoya qila olmaysiz." })
    if (doc.sealShields.some((s) => s.postId === id && s.userId === me.id))
      return send(409, { error: 'Siz bu postni allaqachon himoya qilgansiz.' })
    const shields = doc.sealShields.filter((s) => s.postId === id).length
    if (shields >= 3)
      return send(409, { error: 'Bu post allaqachon maksimal himoyalangan.' })
    post.sealUntil = Number(post.sealUntil) + 30 * 60 * 1000
    doc.sealShields.push({ postId: id, userId: me.id, createdAt: Date.now() })
    await store.saveDoc(doc)
    return send(200, { sealUntil: post.sealUntil, shields: shields + 1 })
  }

  /* ---------- Reels ---------- */

  if (method === 'POST' && first === 'reels' && third === 'like') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const id = Number(second)
    if (!doc.reels.some((r) => r.id === id)) return send(404, { error: 'Reels topilmadi.' })
    const idx = doc.reelLikes.findIndex((l) => l.reelId === id && l.userId === me.id)
    const liked = idx < 0
    if (liked) doc.reelLikes.push({ reelId: id, userId: me.id })
    else doc.reelLikes.splice(idx, 1)
    const likes = doc.reelLikes.filter((l) => l.reelId === id).length
    await store.saveDoc(doc)
    return send(200, { liked, likes })
  }

  if (method === 'POST' && first === 'reels' && third === 'comment') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const id = Number(second)
    const body = await readBody(req)
    const text = String(body.text ?? '').trim()
    if (!text) return send(400, { error: "Izoh bo'sh bo'lishi mumkin emas." })
    if (!doc.reels.some((r) => r.id === id)) return send(404, { error: 'Reels topilmadi.' })
    const cid = Date.now()
    const time = nowTime()
    doc.reelComments.push({ id: cid, reelId: id, authorId: me.id, text, time })
    await store.saveDoc(doc)
    return send(200, { comment: { id: cid, author: userForContent(me), text, time } })
  }

  if (method === 'POST' && first === 'reels' && third === 'share') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const id = Number(second)
    if (!doc.reels.some((r) => r.id === id)) return send(404, { error: 'Reels topilmadi.' })
    doc.reelShares.push({ reelId: id, userId: me.id })
    const shares = doc.reelShares.filter((s) => s.reelId === id).length
    await store.saveDoc(doc)
    return send(200, { shares })
  }

  /* ---------- Albums ---------- */

  if (method === 'POST' && first === 'albums' && third === 'like') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const id = Number(second)
    if (!doc.albums.some((a) => a.id === id)) return send(404, { error: 'Albom topilmadi.' })
    const idx = doc.albumLikes.findIndex((l) => l.albumId === id && l.userId === me.id)
    const liked = idx < 0
    if (liked) doc.albumLikes.push({ albumId: id, userId: me.id })
    else doc.albumLikes.splice(idx, 1)
    const likes = doc.albumLikes.filter((l) => l.albumId === id).length
    await store.saveDoc(doc)
    return send(200, { liked, likes })
  }

  /* ---------- Stories ---------- */

  if (method === 'POST' && first === 'stories' && third === 'view') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const id = Number(second)
    if (!doc.stories.some((s) => s.id === id) && !doc.storyViews.some((v) => v.storyId === id)) {
      return send(404, { error: 'Hikoya topilmadi.' })
    }
    if (!doc.storyViews.some((v) => v.storyId === id && v.userId === me.id)) {
      doc.storyViews.push({ storyId: id, userId: me.id })
      await store.saveDoc(doc)
    }
    return send(200, { ok: true })
  }

  /* ---------- Groups ---------- */

  const MAX_GROUPS = 3

  function groupResponse(g, meId) {
    const members = (g.memberIds ?? []).map((id) => userById(doc, id)).filter(Boolean).map((u) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      avatar: u.avatar ?? '',
      online: doc.sessions.some((s) => s.userId === u.id && Date.now() - Number(s.lastSeen ?? 0) < 60_000),
    }))
    const messages = (doc.groupMessages ?? [])
      .filter((m) => m.groupId === g.id)
      .sort((a, b) => a.id - b.id)
      .map((m) => {
        const sender = userById(doc, m.senderId)
        const base = {
          id: m.id,
          from: m.senderId,
          sender: sender ? { id: sender.id, name: sender.name, username: sender.username, avatar: sender.avatar ?? '' } : null,
          text: m.text,
          time: m.time,
        }
        if (m.image) base.image = m.image
        if (m.sealUntil) base.sealUntil = Number(m.sealUntil)
        return base
      })
    return {
      id: g.id,
      name: g.name,
      cover: g.cover,
      createdBy: g.createdBy,
      isAdmin: g.createdBy === meId,
      members,
      messages,
    }
  }

  if (method === 'GET' && first === 'groups' && second === undefined) {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const list = [...doc.groups]
      .filter((g) => (g.memberIds ?? []).includes(me.id))
      .sort((a, b) => b.id - a.id)
      .map((g) => groupResponse(g, me.id))
    return send(200, { groups: list })
  }

  if (method === 'POST' && first === 'groups' && second === undefined) {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const body = await readBody(req)
    const name = String(body.name ?? '').trim()
    const cover = String(body.cover ?? '').trim()
    if (!name) return send(400, { error: "Guruh nomini kiriting." })
    const mine = doc.groups.filter((g) => g.createdBy === me.id).length
    if (mine >= MAX_GROUPS) return send(403, { error: `Siz ko'pi bilan ${MAX_GROUPS} ta guruh yaratishingiz mumkin.` })
    const g = { id: Date.now(), name, cover, createdBy: me.id, memberIds: [me.id] }
    doc.groups.push(g)
    await store.saveDoc(doc)
    return send(200, { group: groupResponse(g, me.id) })
  }

  if (method === 'GET' && first === 'groups' && second !== undefined && third === undefined) {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const id = Number(second)
    const g = doc.groups.find((x) => x.id === id && (x.memberIds ?? []).includes(me.id))
    if (!g) return send(404, { error: 'Guruh topilmadi.' })
    return send(200, { group: groupResponse(g, me.id) })
  }

  if (method === 'POST' && first === 'groups' && third === 'members') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const id = Number(second)
    const g = doc.groups.find((x) => x.id === id)
    if (!g) return send(404, { error: 'Guruh topilmadi.' })
    if (g.createdBy !== me.id) return send(403, { error: 'Faqat guruh yaratuvchisi a\'zo qo\'shishi mumkin.' })
    const body = await readBody(req)
    const userId = Number(body.userId)
    if (!Number.isInteger(userId) || !userById(doc, userId)) return send(400, { error: "Foydalanuvchi topilmadi." })
    if (!(g.memberIds ?? []).includes(userId)) {
      g.memberIds = [...(g.memberIds ?? []), userId]
      await store.saveDoc(doc)
    }
    return send(200, { group: groupResponse(g, me.id) })
  }

  if (method === 'DELETE' && first === 'groups' && third === 'members') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const id = Number(second)
    const g = doc.groups.find((x) => x.id === id)
    if (!g) return send(404, { error: 'Guruh topilmadi.' })
    const body = await readBody(req)
    const target = Number(body.userId) || me.id
    if (target === g.createdBy) return send(400, { error: "Guruh yaratuvchisini chiqarib bo'lmaydi." })
    if (g.createdBy !== me.id && target !== me.id) return send(403, { error: 'Ruxsat yo\'q.' })
    g.memberIds = (g.memberIds ?? []).filter((x) => x !== target)
    await store.saveDoc(doc)
    return send(200, { group: groupResponse(g, me.id) })
  }

  if (method === 'POST' && first === 'groups' && third === 'messages') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const id = Number(second)
    const g = doc.groups.find((x) => x.id === id && (x.memberIds ?? []).includes(me.id))
    if (!g) return send(404, { error: 'Guruh topilmadi.' })
    const body = await readBody(req)
    const text = String(body.text ?? '').trim()
    if (!text && !body.image) return send(400, { error: "Xabar bo'sh bo'lishi mumkin emas." })
    const mid = Date.now()
    const time = nowTime()
    const msg = { id: mid, groupId: id, senderId: me.id, text, time }
    if (body.image) msg.image = String(body.image)
    if (body.sealUntil) msg.sealUntil = Number(body.sealUntil)
    doc.groupMessages = doc.groupMessages ?? []
    doc.groupMessages.push(msg)
    await store.saveDoc(doc)
    const out = { id: mid, from: me.id, sender: { id: me.id, name: me.name, username: me.username, avatar: me.avatar ?? '' }, text, time }
    if (msg.image) out.image = msg.image
    if (msg.sealUntil) out.sealUntil = msg.sealUntil
    return send(200, { message: out })
  }

  /* ---------- Group calls (WebRTC signalling relay) ---------- */

  if (method === 'POST' && first === 'groups' && third === 'calls') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const id = Number(second)
    const g = doc.groups.find((x) => x.id === id && (x.memberIds ?? []).includes(me.id))
    if (!g) return send(404, { error: 'Guruh topilmadi.' })
    const body = await readBody(req)
    const kind = String(body.kind ?? '')
    const to = Number(body.to ?? 0)
    const payload = body.data ?? null
    const signal = { id: Date.now(), groupId: id, from: me.id, to, kind, data: payload }
    doc.callSignals = doc.callSignals ?? []
    doc.callSignals.push(signal)
    const sameGroup = doc.callSignals.filter((x) => x.groupId === id)
    if (sameGroup.length > 500) {
      const keep = sameGroup.slice(-500)
      doc.callSignals = doc.callSignals.filter((x) => x.groupId !== id).concat(keep)
    }
    await store.saveDoc(doc)
    return send(200, { signal })
  }

  if (method === 'GET' && first === 'groups' && third === 'calls') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const id = Number(second)
    const g = doc.groups.find((x) => x.id === id && (x.memberIds ?? []).includes(me.id))
    if (!g) return send(404, { error: 'Guruh topilmadi.' })
    const since = Number(query.since ?? 0)
    const signals = (doc.callSignals ?? [])
      .filter((s) => s.groupId === id && s.id > since && s.from !== me.id && (s.to === 0 || s.to === me.id))
      .sort((a, b) => a.id - b.id)
    return send(200, { signals })
  }

  if (method === 'POST' && first === 'threads' && third === 'calls') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const id = Number(second)
    const t = doc.threads.find((x) => x.id === id && (x.memberA === me.id || x.memberB === me.id))
    if (!t) return send(404, { error: 'Suhbat topilmadi.' })
    const body = await readBody(req)
    const kind = String(body.kind ?? '')
    const to = Number(body.to ?? 0)
    const payload = body.data ?? null
    const sid = Date.now()
    const signal = { id: sid, threadId: id, from: me.id, to, kind, data: payload }
    doc.threadCallSignals = doc.threadCallSignals ?? []
    doc.threadCallSignals.push(signal)
    const sameThread = doc.threadCallSignals.filter((x) => x.threadId === id)
    if (sameThread.length > 500) {
      const keep = sameThread.slice(-500)
      doc.threadCallSignals = doc.threadCallSignals.filter((x) => x.threadId !== id).concat(keep)
    }
    await store.saveDoc(doc)
    return send(200, { signal })
  }

  if (method === 'GET' && first === 'threads' && third === 'calls') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const id = Number(second)
    const t = doc.threads.find((x) => x.id === id && (x.memberA === me.id || x.memberB === me.id))
    if (!t) return send(404, { error: 'Suhbat topilmadi.' })
    const since = Number(query.since ?? 0)
    const signals = (doc.threadCallSignals ?? [])
      .filter((s) => s.threadId === id && s.id > since && s.from !== me.id && (s.to === 0 || s.to === me.id))
      .sort((a, b) => a.id - b.id)
    return send(200, { signals })
  }

  /* ---------- Threads ---------- */

  function threadResponse(t, other, doc) {
    const messages = doc.messages
      .filter((m) => m.threadId === t.id)
      .sort((a, b) => a.id - b.id)
      .map((m) => {
        const base = { id: m.id, from: m.senderId, text: m.text, time: m.time }
        if (m.image) base.image = m.image
        if (m.sealUntil) base.sealUntil = Number(m.sealUntil)
        return base
      })
    return { id: t.id, user: other ? publicUser(other) : null, online: true, messages }
  }

  if (method === 'GET' && first === 'threads' && second === 'calls' && third === undefined) {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const since = Number(query.since ?? 0)
    const signals = (doc.threadCallSignals ?? []).filter((s) => {
      const t = doc.threads.find((x) => x.id === s.threadId)
      if (!t || (t.memberA !== me.id && t.memberB !== me.id)) return false
      return s.id > since && s.from !== me.id && (s.to === 0 || s.to === me.id)
    }).sort((a, b) => a.id - b.id)
    return send(200, { signals })
  }

  if (method === 'GET' && first === 'threads' && second === undefined) {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const threads = []
    for (const t of doc.threads) {
      if (t.memberA !== me.id && t.memberB !== me.id) continue
      const otherId = t.memberA === me.id ? t.memberB : t.memberA
      const other = userById(doc, otherId)
      if (!other) continue
      threads.push(threadResponse(t, other, doc))
    }
    return send(200, { threads })
  }

  if (method === 'POST' && first === 'threads' && second === undefined) {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const body = await readBody(req)
    const otherId = Number(body.user)
    if (!Number.isInteger(otherId) || otherId === me.id) return send(400, { error: "Xabarchi noto'g'ri." })
    let thread = doc.threads.find(
      (t) => (t.memberA === me.id && t.memberB === otherId) || (t.memberA === otherId && t.memberB === me.id),
    )
    if (!thread) {
      thread = { id: Date.now(), memberA: me.id, memberB: otherId }
      doc.threads.push(thread)
      await store.saveDoc(doc)
    }
    const other = userById(doc, otherId)
    return send(200, { thread: threadResponse(thread, other, doc) })
  }

  if (method === 'POST' && first === 'threads' && third === 'messages') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const id = Number(second)
    const body = await readBody(req)
    const text = String(body.text ?? '').trim()
    if (!text && !body.image) return send(400, { error: "Xabar bo'sh bo'lishi mumkin emas." })
    const t = doc.threads.find((x) => x.id === id && (x.memberA === me.id || x.memberB === me.id))
    if (!t) return send(404, { error: 'Suhbat topilmadi.' })
    const mid = Date.now()
    const time = nowTime()
    const msg = { id: mid, threadId: id, senderId: me.id, text, time }
    if (body.image) msg.image = String(body.image)
    if (body.sealUntil) msg.sealUntil = Number(body.sealUntil)
    doc.messages.push(msg)
    await store.saveDoc(doc)
    const out = { id: mid, from: me.id, text, time }
    if (msg.image) out.image = msg.image
    if (msg.sealUntil) out.sealUntil = msg.sealUntil
    return send(200, { message: out })
  }

  if (method === 'DELETE' && first === 'threads' && third === undefined) {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    const id = Number(second)
    const t = doc.threads.find((x) => x.id === id && (x.memberA === me.id || x.memberB === me.id))
    if (!t) return send(404, { error: 'Suhbat topilmadi.' })
    doc.threads = doc.threads.filter((x) => x.id !== id)
    doc.messages = doc.messages.filter((m) => m.threadId !== id)
    doc.threadCallSignals = doc.threadCallSignals.filter((s) => s.threadId !== id)
    await store.saveDoc(doc)
    return send(200, { ok: true })
  }

  /* ---------- Media: ishlatilmay qolgan fayllarni tozalash (faqat admin) ---------- */

  if (method === 'POST' && first === 'media' && second === 'gc') {
    if (!adminAuth(doc, bearer)) return send(403, { error: 'Faqat admin uchun.' })
    const result = await collectGarbageMedia(doc, store)
    if (result.unsupported) return send(501, { error: 'Bu store media tozalashni qo‘llab-quvvatlamaydi.' })
    return send(200, result)
  }

  /* ---------- Media yuklash ---------- */

  if (method === 'POST' && first === 'media' && second === undefined) {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    if (typeof store.putMedia !== 'function') return send(501, { error: 'Media yuklash qo‘llab-quvvatlanmaydi.' })
    const body = await readBody(req)
    const parsed = parseDataUrl(body.dataUrl)
    if (!parsed) return send(400, { error: 'dataUrl formati noto‘g‘ri.' })
    const kind = MEDIA_MIME[parsed.mime]
    if (!kind) return send(415, { error: `Bu fayl turi qabul qilinmaydi: ${parsed.mime}` })
    if (parsed.bytes.length > MEDIA_LIMITS[kind]) {
      return send(413, { error: `Fayl hajmi katta (${kind === 'video' ? 40 : 8} MB dan oshmasligi kerak).` })
    }
    const id = mediaIdFor(`${Date.now().toString(36)}${crypto.randomBytes(6).toString('hex')}`, parsed.mime)
    await store.putMedia(id, parsed.mime, parsed.bytes)
    return send(201, {
      id,
      url: `/api/media/${id}`,
      mime: parsed.mime,
      kind,
      size: parsed.bytes.length,
    })
  }

  return send(404, { error: "Tepada hech narsa topilmadi." })
}