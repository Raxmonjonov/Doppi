import crypto from 'node:crypto'

const DAY = 24 * 60 * 60 * 1000

export function emptyDoc() {
  return {
    users: [],
    sessions: [],
    posts: [],
    postLikes: [],
    postComments: [],
    postShares: [],
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
    groups: [],
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
    googleId: u.googleId ?? undefined,
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

export async function handleRequest(method, pathname, query, req, store) {
  const doc = await store.getDoc()
  const send = async (status, json) => ({ status, json })

  const segs = pathname.split('/').filter(Boolean)
  const api = segs.length >= 1 && segs[0] === 'api' ? segs.slice(1) : segs
  const [first, second, third, _fourth] = api

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
    const { name, username, email, password } = body
    const uname = String(username ?? '').trim()
    const nm = String(name ?? '').trim()
    const em = String(email ?? '').trim().toLowerCase()
    const pw = String(password ?? '')

    if (!nm || !uname || !em || !pw) return send(400, { error: "Barcha maydonlarni to'ldiring." })
    if (uname.length < 3) return send(400, { error: "Foydalanuvchi nomi kamida 3 belgidan iborat bo'lishi kerak." })
    if (pw.length < 4) return send(400, { error: "Parol kamida 4 belgidan iborat bo'lishi kerak." })

    const taken = doc.users.find((u) => u.username.toLowerCase() === uname.toLowerCase() || u.email.toLowerCase() === em)
    if (taken) {
      return send(409, {
        error: taken.username.toLowerCase() === uname.toLowerCase() ? 'Bu foydalanuvchi nomi band.' : "Bu email allaqachon ro'yxatdan o'tgan.",
      })
    }

    const { salt, hash } = hashPassword(pw)
    const id = Date.now()
    const createdAt = new Date().toISOString()
    doc.users.push({ id, name: nm, username: uname, email: em, salt, hash, avatar: '', about: '', createdAt, lastLoginAt: createdAt, lastLogoutAt: 0 })
    const token = makeToken()
    doc.sessions.push({ token, userId: id, lastSeen: Date.now() })
    await store.saveDoc(doc)
    return send(200, { token, user: publicUser({ id, name: nm, username: uname, email: em, avatar: '', about: '', createdAt }) })
  }

  if (method === 'POST' && first === 'auth' && second === 'login') {
    const body = await readBody(req)
    const idf = String(body.username ?? '').trim().toLowerCase()
    const pw = String(body.password ?? '')
    const user = doc.users.find((u) => u.username.toLowerCase() === idf || u.email.toLowerCase() === idf)
    if (!user) return send(404, { error: 'Bunday foydalanuvchi topilmadi.' })
    if (user.googleId && !user.hash) return send(400, { error: 'Bu hisob Google orqali ochilgan — Google tugmasi bilan kiring.' })
    if (!verifyPassword(pw, user.salt, user.hash)) return send(401, { error: "Parol noto'g'ri." })
    const token = makeToken()
    user.lastLoginAt = new Date().toISOString()
    doc.sessions.push({ token, userId: user.id, lastSeen: Date.now() })
    await store.saveDoc(doc)
    return send(200, { token, user: publicUser(user) })
  }

  if (method === 'POST' && first === 'auth' && second === 'google') {
    const body = await readBody(req)
    const { sub, email, name, picture } = body
    const em = String(email ?? '').trim().toLowerCase()
    if (!sub || !em) return send(400, { error: "Google profil ma'lumotlari yetarli emas." })
    let user = doc.users.find((u) => String(u.googleId ?? '') === String(sub) || (u.email ?? '').toLowerCase() === em)
    if (!user) {
      const base = em.split('@')[0].replace(/[^a-z0-9_.]/gi, '') || 'user'
      let username = base
      let n = 2
      for (;;) {
        if (!doc.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) break
        username = `${base}${n}`
        n += 1
      }
      const id = Date.now()
      const createdAt = new Date().toISOString()
      const avatar = String(picture ?? '')
      user = { id, name: String(name ?? base), username, email: em, salt: '', hash: '', avatar, about: '', googleId: String(sub), createdAt, lastLoginAt: createdAt, lastLogoutAt: 0 }
      doc.users.push(user)
    } else if (!user.googleId) {
      const pgret = String(picture ?? '')
      user.googleId = String(sub)
      if (!user.avatar) user.avatar = pgret
    }
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

  /* ---------- Presence ---------- */

  // Client heartbeat: keeps the session "online". Called every ~15s while the app is open.
  if (method === 'POST' && first === 'ping') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })
    await store.saveDoc(doc)
    return send(200, { ok: true })
  }

  if (method === 'GET' && first === 'dashboard') {
    const me = auth(doc, bearer)
    if (!me) return send(401, { error: 'Avtorizatsiya talab qilinadi.' })

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
        return {
          id: p.id,
          author: userForContent(au),
          time: p.time ?? '',
          text: p.text ?? '',
          images: Array.isArray(p.images) ? p.images : [],
          ...(p.video ? { video: p.video } : {}),
          likes,
          comments: doc.postComments
            .filter((c) => c.postId === p.id)
            .sort((a, b) => a.id - b.id)
            .map((c) => ({ id: c.id, author: userForContent(userById(doc, c.authorId)), text: c.text, time: c.time })),
          shared,
          ...(p.live ? { live: true } : {}),
          likedByMe: !!likedByMe,
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
      }))
      .sort((a, b) => b.id - a.id)

    const groups = [...doc.groups].sort((a, b) => b.id - a.id).map((g) => ({ id: g.id, name: g.name, cover: g.cover, joined: !!g.joined, members: g.members ?? "1 a'zo" }))
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

    for (const a of Array.isArray(d.albums) ? d.albums : []) {
      upsert(doc, 'albums', {
        id: Number(a.id),
        title: String(a.title ?? ''),
        photos: Array.isArray(a.photos) ? a.photos : [],
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

  /* ---------- Threads ---------- */

  function threadResponse(t, other, doc) {
    const messages = doc.messages
      .filter((m) => m.threadId === t.id)
      .sort((a, b) => a.id - b.id)
      .map((m) => {
        const base = { id: m.id, from: m.senderId, text: m.text, time: m.time }
        if (m.image) base.image = m.image
        return base
      })
    return { id: t.id, user: other ? publicUser(other) : null, online: true, messages }
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
    if (!text) return send(400, { error: "Xabar bo'sh bo'lishi mumkin emas." })
    const t = doc.threads.find((x) => x.id === id && (x.memberA === me.id || x.memberB === me.id))
    if (!t) return send(404, { error: 'Suhbat topilmadi.' })
    const mid = Date.now()
    const time = nowTime()
    const msg = { id: mid, threadId: id, senderId: me.id, text, time }
    if (body.image) msg.image = String(body.image)
    doc.messages.push(msg)
    await store.saveDoc(doc)
    const out = { id: mid, from: me.id, text, time }
    if (msg.image) out.image = msg.image
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
    await store.saveDoc(doc)
    return send(200, { ok: true })
  }

  return send(404, { error: "Tepada hech narsa topilmadi." })
}