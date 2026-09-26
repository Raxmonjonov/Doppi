import express from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCHEMA_PATH = path.join(__dirname, 'schema.sql')

const { Pool, types } = pg
types.setTypeParser(types.builtins.INT8, (v) => (v === null ? null : Number(v)))
types.setTypeParser(types.builtins.INT4, (v) => (v === null ? null : Number(v)))

const pool = new Pool({
  user: 'postgres',
  password: 'postgres',
  host: '127.0.0.1',
  port: 5432,
  database: "Do'ppi",
})

async function ensureSchema() {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8')
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  for (const stmt of statements) {
    try {
      await pool.query(stmt)
    } catch (e) {
      console.error('Schema xatosi:', e.message)
    }
  }
}

const app = express()
// Media endi alohida /api/media orqali saqlanadi, shuning uchun data hujjati kichik bo'ladi.
// 25MB — eski data:URL li ma'lumotlar uchun zaxira.
app.use(express.json({ limit: '25mb' }))

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

async function authMiddleware(req, res, next) {
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi.' })
  try {
    const { rows } = await pool.query(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1`,
      [token],
    )
    if (rows.length === 0) return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi.' })
    req.user = rows[0]
    req.token = token
    next()
  } catch (e) {
    res.status(500).json({ error: 'Server xatosi.' })
  }
}

/* ---------- Auth ---------- */

app.post('/api/auth/register', async (req, res) => {
  const { name, username, email, password, avatar, about } = req.body ?? {}
  const uname = String(username ?? '').trim()
  const nm = String(name ?? '').trim() || uname
  const em = String(email ?? '').trim().toLowerCase()
  const pw = String(password ?? '')
  const av = typeof avatar === 'string' ? avatar : ''
  const ab = typeof about === 'string' ? about : ''

  if (!nm || !uname || !em || !pw) {
    return res.status(400).json({ error: "Barcha maydonlarni to'ldiring." })
  }
  if (uname.length < 3) return res.status(400).json({ error: "Foydalanuvchi nomi kamida 3 belgidan iborat bo'lishi kerak." })
  if (pw.length < 4) return res.status(400).json({ error: "Parol kamida 4 belgidan iborat bo'lishi kerak." })
  try {
    const taken = await pool.query(
      `SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = $2`,
      [uname, em],
    )
    if (taken.rows.length > 0) {
      const conflict = taken.rows[0]
      const which = await pool.query(`SELECT username, email FROM users WHERE id = $1`, [conflict.id])
      const u = which.rows[0]
      return res.status(409).json({
        error: u.username.toLowerCase() === uname.toLowerCase() ? 'Bu foydalanuvchi nomi band.' : "Bu email allaqachon ro'yxatdan o'tgan.",
      })
    }

    const { salt, hash } = hashPassword(pw)
    const id = Date.now()
    const createdAt = new Date().toISOString()
    await pool.query(
      `INSERT INTO users (id, name, username, email, salt, hash, avatar, about, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, nm, uname, em, salt, hash, av, ab, createdAt],
    )
    const token = makeToken()
    await pool.query(`INSERT INTO sessions (token, user_id) VALUES ($1,$2)`, [token, id])
    const user = publicUser({ id, name: nm, username: uname, email: em, avatar: av, about: ab, createdAt })
    res.json({ token, user })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body ?? {}
  const idf = String(username ?? '').trim().toLowerCase()
  const pw = String(password ?? '')
  try {
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $1`,
      [idf],
    )
    const user = rows[0]
    if (!user) return res.status(404).json({ error: 'Bunday foydalanuvchi topilmadi.' })
    if (!verifyPassword(pw, user.salt, user.hash)) {
      return res.status(401).json({ error: "Parol noto'g'ri." })
    }
    const token = makeToken()
    const now = Date.now()
    const nowIso = new Date(now).toISOString()
    await pool.query(
      `INSERT INTO sessions (token, user_id, last_seen) VALUES ($1,$2,$3)
       ON CONFLICT (token) DO UPDATE SET last_seen = EXCLUDED.last_seen`,
      [token, user.id, now],
    )
    await pool.query(`UPDATE users SET last_login_at = $1 WHERE id = $2`, [nowIso, user.id])
    res.json({ token, user: publicUser(user) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  await pool.query(`DELETE FROM sessions WHERE token = $1`, [req.token])
  await pool.query(`UPDATE users SET last_logout_at = $1 WHERE id = $2`, [new Date().toISOString(), req.user.id])
  res.json({ ok: true })
})

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: publicUser(req.user) })
})

app.patch('/api/auth/me', authMiddleware, async (req, res) => {
  const { name, about, avatar } = req.body ?? {}
  const sets = []
  const values = []
  if (name !== undefined) { values.push(String(name).trim()); sets.push(`name = $${values.length}`) }
  if (about !== undefined) { values.push(String(about)); sets.push(`about = $${values.length}`) }
  if (avatar !== undefined) { values.push(String(avatar)); sets.push(`avatar = $${values.length}`) }
  if (sets.length > 0) {
    values.push(req.user.id)
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${values.length}`, values)
    const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [req.user.id])
    if (rows[0]) req.user = rows[0]
  }
  res.json({ user: publicUser(req.user) })
})

/* ---------- Presence ---------- */

app.post('/api/ping', authMiddleware, async (req, res) => {
  try {
    await pool.query(`UPDATE sessions SET last_seen = $1 WHERE token = $2`, [Date.now(), req.token])
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

/* ---------- Admin ---------- */

const ADMIN_USER = process.env.ADMIN_USERNAME ?? 'Admin'
const ADMIN_PASS = process.env.ADMIN_PASSWORD ?? 'Admin.Do\'ppi.Uzbekitan.66'
const adminTokens = new Map()

function adminBearer(req) {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body ?? {}
  if (String(username ?? '') === ADMIN_USER && String(password ?? '') === ADMIN_PASS) {
    const token = makeToken()
    adminTokens.set(token, Date.now())
    return res.json({ token })
  }
  res.status(401).json({ error: 'Foydalanuvchi nomi yoki parol xato.' })
})

app.post('/api/admin/logout', async (req, res) => {
  adminTokens.delete(adminBearer(req) ?? '')
  res.json({ ok: true })
})

app.get('/api/dashboard', async (req, res) => {
  const token = adminBearer(req)
  if (!token || !adminTokens.has(token)) {
    return res.status(401).json({ error: 'Admin kirishi talab qilinadi.' })
  }
  adminTokens.set(token, Date.now())
  const now = Date.now()
  const ONLINE_MS = 60 * 1000
  try {
    const [usersR, onlineR, postsR, commentsR, reelsR, messagesR, threadsR, groupsR, albumsR, storiesR, followsR] = await Promise.all([
      pool.query(`SELECT id, name, username, avatar, created_at, last_login_at, last_logout_at FROM users`),
      pool.query(`SELECT DISTINCT user_id FROM sessions WHERE last_seen > $1`, [now - ONLINE_MS]),
      pool.query(`SELECT COUNT(*)::int AS n FROM posts`),
      pool.query(`SELECT COUNT(*)::int AS n FROM post_comments`),
      pool.query(`SELECT COUNT(*)::int AS n FROM reels`),
      pool.query(`SELECT COUNT(*)::int AS n FROM messages`),
      pool.query(`SELECT COUNT(*)::int AS n FROM threads`),
      pool.query(`SELECT COUNT(*)::int AS n FROM groups`),
      pool.query(`SELECT COUNT(*)::int AS n FROM albums`),
      pool.query(`SELECT COUNT(*)::int AS n FROM stories`),
      pool.query(`SELECT COUNT(*)::int AS n FROM follows`),
    ])
    const users = usersR.rows
    const onlineIds = new Set(onlineR.rows.map((r) => Number(r.user_id)))
    const userById = new Map(users.map((u) => [Number(u.id), u]))
    const uBase = (u) => ({ id: Number(u.id), name: u.name, username: u.username, avatar: u.avatar ?? '' })
    const lastLogout = users
      .filter((u) => u.last_logout_at)
      .sort((a, b) => new Date(b.last_logout_at).getTime() - new Date(a.last_logout_at).getTime())[0]
    const recent = [...users]
      .sort((a, b) => {
        const at = (u) => new Date(u.last_login_at || u.created_at).getTime() || 0
        return at(b) - at(a)
      })
      .slice(0, 6)
    const dayMs = 24 * 60 * 60 * 1000
    const growth = []
    for (let i = 13; i >= 0; i--) {
      const start = new Date(now - i * dayMs)
      start.setHours(0, 0, 0, 0)
      const end = start.getTime() + dayMs
      const count = users.filter((u) => {
        const t = new Date(u.created_at).getTime() || 0
        return t >= start.getTime() && t < end
      }).length
      growth.push({ day: start.toISOString().slice(0, 10), count })
    }
    res.json({
      totals: {
        users: users.length,
        online: [...onlineIds].filter((id) => userById.has(id)).length,
        offline: users.length - [...onlineIds].filter((id) => userById.has(id)).length,
        posts: postsR.rows[0].n,
        comments: commentsR.rows[0].n,
        reels: reelsR.rows[0].n,
        messages: messagesR.rows[0].n,
        threads: threadsR.rows[0].n,
        groups: groupsR.rows[0].n,
        albums: albumsR.rows[0].n,
        stories: storiesR.rows[0].n,
        follows: followsR.rows[0].n,
      },
      growth,
      lastLogout: lastLogout ? { ...uBase(lastLogout), at: new Date(lastLogout.last_logout_at).getTime() } : null,
      lastOnline: [...onlineIds]
        .map((id) => userById.get(id))
        .filter((u) => !!u)
        .map((u) => uBase(u)),
      recentUsers: recent.map((u) => ({
        ...uBase(u),
        lastLoginAt: u.last_login_at || u.created_at,
        createdAt: u.created_at,
      })),
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

/* ---------- Users ---------- */

app.get('/api/users', authMiddleware, async (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase()
  let sql = `SELECT * FROM users WHERE id != $1`
  const values = [req.user.id]
  if (q) {
    sql += ` AND (LOWER(name) LIKE $2 OR LOWER(username) LIKE $2)`
    values.push(`%${q}%`)
  }
  sql += ` ORDER BY name`
  const { rows } = await pool.query(sql, values)
  res.json({ users: rows.map(publicUser) })
})

/* ---------- Follow ---------- */

app.post('/api/users/:id/follow', authMiddleware, async (req, res) => {
  const targetId = Number(req.params.id)
  if (!Number.isInteger(targetId) || targetId === req.user.id) {
    return res.status(400).json({ error: "O'zingizni kuzata olmaysiz." })
  }
  try {
    const user = await pool.query(`SELECT id FROM users WHERE id = $1`, [targetId])
    if (user.rows.length === 0) return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' })
    const existing = await pool.query(
      `SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2`,
      [req.user.id, targetId],
    )
    if (existing.rows.length > 0) {
      await pool.query(`DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2`, [req.user.id, targetId])
    } else {
      await pool.query(`INSERT INTO follows (follower_id, followee_id) VALUES ($1,$2)`, [req.user.id, targetId])
    }
    res.json({ following: existing.rows.length === 0 })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

/* ---------- Data (posts/stories/reels/albums) ---------- */

app.get('/api/data', authMiddleware, async (req, res) => {
  const userId = req.user.id
  const storyCutoff = Date.now() - 24 * 60 * 60 * 1000
  const [postsR, commentsR, storiesR, reelsR, reelCommentsR, albumsR, groupsR, followsR] = await Promise.all([
    pool.query(
      `SELECT p.id, p.time, p.text, p.images, p.video, p.live, p.seal_until,
        u.id AS au_id, u.name AS au_name, u.username AS au_username, u.avatar AS au_avatar, u.about AS au_about,
        (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = p.id) AS likes,
        (SELECT COUNT(*)::int FROM post_shares ps WHERE ps.post_id = p.id) AS shared,
        (SELECT COUNT(*)::int FROM seal_shields ss WHERE ss.post_id = p.id) AS shields,
        EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = $1) AS liked_by_me,
        EXISTS(SELECT 1 FROM seal_shields ss WHERE ss.post_id = p.id AND ss.user_id = $1) AS shielded_by_me
       FROM posts p JOIN users u ON u.id = p.author_id ORDER BY p.id DESC`,
      [userId],
    ),
    pool.query(
      `SELECT pc.id, pc.post_id, pc.text, pc.time, u.id AS au_id, u.name AS au_name, u.username AS au_username, u.avatar AS au_avatar FROM post_comments pc JOIN users u ON u.id = pc.author_id ORDER BY pc.id`,
    ),
    pool.query(
      `SELECT s.id, s.image, u.id AS au_id, u.name AS au_name, u.username AS au_username, u.avatar AS au_avatar, u.about AS au_about
       FROM stories s JOIN users u ON u.id = s.author_id
       WHERE s.id > $1
         AND (s.author_id = $2 OR EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = $2 AND f.followee_id = s.author_id))
       ORDER BY s.id DESC`,
      [storyCutoff, userId],
    ),
    pool.query(
      `SELECT r.id, r.image, r.caption, r.sound, r.view_mode,
        u.id AS au_id, u.name AS au_name, u.username AS au_username, u.avatar AS au_avatar, u.about AS au_about,
        (SELECT COUNT(*)::int FROM reel_likes rl WHERE rl.reel_id = r.id) AS likes,
        (SELECT COUNT(*)::int FROM reel_shares rs WHERE rs.reel_id = r.id) AS shares,
        EXISTS(SELECT 1 FROM reel_likes rl WHERE rl.reel_id = r.id AND rl.user_id = $1) AS liked_by_me
       FROM reels r JOIN users u ON u.id = r.author_id ORDER BY r.id DESC`,
      [userId],
    ),
    pool.query(
      `SELECT rc.id, rc.reel_id, rc.text, rc.time, u.id AS au_id, u.name AS au_name, u.username AS au_username, u.avatar AS au_avatar FROM reel_comments rc JOIN users u ON u.id = rc.author_id ORDER BY rc.id`,
    ),
    pool.query(
      `SELECT a.id, a.title, a.photos, a.seal_until,
        (SELECT COUNT(*)::int FROM album_likes al WHERE al.album_id = a.id) AS likes
       FROM albums a ORDER BY a.id DESC`,
    ),
    pool.query(`SELECT g.id, g.name, g.cover, g.joined FROM groups g ORDER BY g.id DESC`),
    pool.query(`SELECT followee_id FROM follows WHERE follower_id = $1`, [userId]),
  ])

  const commentsByPost = new Map()
  for (const c of commentsR.rows) {
    if (!commentsByPost.has(c.post_id)) commentsByPost.set(c.post_id, [])
    commentsByPost.get(c.post_id).push({
      id: c.id,
      author: userForContent({ id: c.au_id, name: c.au_name, username: c.au_username, avatar: c.au_avatar }),
      text: c.text,
      time: c.time,
    })
  }

  const commentsByReel = new Map()
  for (const c of reelCommentsR.rows) {
    if (!commentsByReel.has(c.reel_id)) commentsByReel.set(c.reel_id, [])
    commentsByReel.get(c.reel_id).push({
      id: c.id,
      author: userForContent({ id: c.au_id, name: c.au_name, username: c.au_username, avatar: c.au_avatar }),
      text: c.text,
      time: c.time,
    })
  }

  const posts = postsR.rows.map((p) => ({
    id: p.id,
    author: userForContent({ id: p.au_id, name: p.au_name, username: p.au_username, avatar: p.au_avatar, about: p.au_about }),
    time: p.time,
    text: p.text ?? '',
    images: Array.isArray(p.images) ? p.images : [],
    ...(p.video ? { video: p.video } : {}),
    likes: p.likes ?? 0,
    comments: commentsByPost.get(p.id) ?? [],
    shared: p.shared ?? 0,
    ...(p.live ? { live: true } : {}),
    ...(p.seal_until ? { sealUntil: Number(p.seal_until) } : {}),
    likedByMe: !!p.liked_by_me,
    ...(p.shields ? { shields: p.shields } : {}),
    ...(p.shielded_by_me ? { shieldedByMe: true } : {}),
  }))

  const stories = await Promise.all(
    storiesR.rows.map(async (s) => {
      const viewedR = await pool.query(
        `SELECT 1 FROM story_views WHERE story_id = $1 AND user_id = $2`,
        [s.id, userId],
      )
      return {
        id: s.id,
        author: userForContent({ id: s.au_id, name: s.au_name, username: s.au_username, avatar: s.au_avatar, about: s.au_about }),
        image: s.image,
        viewed: viewedR.rows.length > 0,
      }
    }),
  )

  const reels = reelsR.rows.map((r) => ({
    id: r.id,
    author: userForContent({ id: r.au_id, name: r.au_name, username: r.au_username, avatar: r.au_avatar, about: r.au_about }),
    image: r.image,
    caption: r.caption ?? '',
    sound: r.sound ?? '',
    likes: r.likes ?? 0,
    comments: commentsByReel.get(r.id) ?? [],
    shares: r.shares ?? 0,
    viewMode: r.view_mode ?? 'none',
    likedByMe: !!r.liked_by_me,
  }))

  const albums = albumsR.rows.map((a) => {
    const base = {
      id: a.id,
      title: a.title,
      count: Array.isArray(a.photos) ? a.photos.length : 0,
      likes: a.likes ?? 0,
      photos: Array.isArray(a.photos) ? a.photos : [],
    }
    if (a.seal_until) base.sealUntil = Number(a.seal_until)
    return base
  })

  const groups = groupsR.rows.map((g) => ({
    id: g.id,
    name: g.name,
    cover: g.cover,
    joined: !!g.joined,
  }))

  const following = followsR.rows.map((r) => r.followee_id)

  await pool.query(`DELETE FROM stories WHERE id < $1`, [storyCutoff])

  res.json({ posts, stories, reels, albums, groups, following })
})

app.put('/api/data', authMiddleware, async (req, res) => {
  const d = req.body ?? {}
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const p of Array.isArray(d.posts) ? d.posts : []) {
      const authorId = Number(p.author?.id) || req.user.id
      const exists = await client.query(`SELECT id FROM users WHERE id = $1`, [authorId])
      if (exists.rows.length === 0) continue
      await client.query(
        `INSERT INTO posts (id, author_id, time, text, images, video, live, seal_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET
           author_id = EXCLUDED.author_id,
           time = EXCLUDED.time,
           text = EXCLUDED.text,
           images = EXCLUDED.images,
           video = EXCLUDED.video,
           live = EXCLUDED.live,
           seal_until = EXCLUDED.seal_until`,
        [Number(p.id), authorId, String(p.time ?? ''), String(p.text ?? ''), JSON.stringify(p.images ?? []), p.video ?? null, !!p.live, Number(p.sealUntil) || null],
      )
    }

    for (const s of Array.isArray(d.stories) ? d.stories : []) {
      if (Number(s.id) < Date.now() - 24 * 60 * 60 * 1000) continue
      const authorId = Number(s.author?.id) || req.user.id
      const exists = await client.query(`SELECT id FROM users WHERE id = $1`, [authorId])
      if (exists.rows.length === 0) continue
      await client.query(
        `INSERT INTO stories (id, author_id, image)
         VALUES ($1,$2,$3)
         ON CONFLICT (id) DO UPDATE SET image = EXCLUDED.image, author_id = EXCLUDED.author_id`,
        [Number(s.id), authorId, String(s.image ?? '')],
      )
    }

    for (const g of Array.isArray(d.groups) ? d.groups : []) {
      await client.query(
        `INSERT INTO groups (id, name, cover, joined, created_by)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, cover = EXCLUDED.cover, joined = EXCLUDED.joined`,
        [Number(g.id), String(g.name ?? ''), String(g.cover ?? ''), !!g.joined, req.user.id],
      )
    }

    for (const r of Array.isArray(d.reels) ? d.reels : []) {
      const authorId = Number(r.author?.id) || req.user.id
      const exists = await client.query(`SELECT id FROM users WHERE id = $1`, [authorId])
      if (exists.rows.length === 0) continue
      await client.query(
        `INSERT INTO reels (id, author_id, image, caption, sound, view_mode)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET
           author_id = EXCLUDED.author_id,
           image = EXCLUDED.image,
           caption = EXCLUDED.caption,
           sound = EXCLUDED.sound,
           view_mode = EXCLUDED.view_mode`,
        [Number(r.id), authorId, String(r.image ?? ''), String(r.caption ?? ''), String(r.sound ?? ''), String(r.viewMode ?? 'none')],
      )
    }

    const incomingAlbums = Array.isArray(d.albums) ? d.albums : []
    const currentAlbums = (await client.query(`SELECT id, photos FROM albums`)).rows
    const existingIds = new Set(currentAlbums.map((a) => String(a.id)))
    const incomingIds = new Set(incomingAlbums.map((a) => String(Number(a.id))))
    const addCount = [...incomingIds].filter((id) => !existingIds.has(id)).length
    if (existingIds.size + addCount > 10) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: "Ko'pi bilan 10 ta albom yaratish mumkin." })
    }
    const remainingPhotos = currentAlbums
      .filter((a) => !incomingIds.has(String(a.id)))
      .reduce((n, a) => n + (Array.isArray(a.photos) ? a.photos.length : 0), 0)
    const incomingTotal = incomingAlbums.reduce((n, a) => n + (Array.isArray(a.photos) ? a.photos.length : 0), 0)
    if (remainingPhotos + incomingTotal > 30) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: "Barcha albomlarda ko'pi bilan 30 ta rasm bo'lishi mumkin." })
    }

    for (const a of incomingAlbums) {
      const seal = Number(a.sealUntil) || null
      await client.query(
        `INSERT INTO albums (id, title, photos, seal_until)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, photos = EXCLUDED.photos, seal_until = EXCLUDED.seal_until`,
        [Number(a.id), String(a.title ?? ''), JSON.stringify(Array.isArray(a.photos) ? a.photos : []), seal],
      )
    }

    await client.query('COMMIT')
    res.json({ ok: true })
  } catch (e) {
    await client.query('ROLLBACK')
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  } finally {
    client.release()
  }
})

/* ---------- Interactions: like / comment / share ---------- */

function lastLikeInfo(rows) {
  return rows.length > 0 ? rows[0] : null
}

app.post('/api/posts/:id/like', authMiddleware, async (req, res) => {
  const id = Number(req.params.id)
  try {
    const item = await pool.query(`SELECT id FROM posts WHERE id = $1`, [id])
    if (item.rows.length === 0) return res.status(404).json({ error: 'Post topilmadi.' })
    const existing = await pool.query(`SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2`, [id, req.user.id])
    if (existing.rows.length > 0) {
      await pool.query(`DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2`, [id, req.user.id])
    } else {
      await pool.query(`INSERT INTO post_likes (post_id, user_id) VALUES ($1,$2)`, [id, req.user.id])
    }
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS likes FROM post_likes WHERE post_id = $1`, [id])
    res.json({ liked: existing.rows.length === 0, likes: rows[0].likes })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/posts/:id/comment', authMiddleware, async (req, res) => {
  const id = Number(req.params.id)
  const text = String(req.body?.text ?? '').trim()
  if (!text) return res.status(400).json({ error: "Izoh bo'sh bo'lishi mumkin emas." })
  try {
    const item = await pool.query(`SELECT id FROM posts WHERE id = $1`, [id])
    if (item.rows.length === 0) return res.status(404).json({ error: 'Post topilmadi.' })
    const cid = Date.now()
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    await pool.query(
      `INSERT INTO post_comments (id, post_id, author_id, text, time) VALUES ($1,$2,$3,$4,$5)`,
      [cid, id, req.user.id, text, time],
    )
    const { rows } = await pool.query(
      `SELECT u.* FROM users u WHERE id = $1`,
      [req.user.id],
    )
    res.json({ comment: { id: cid, author: userForContent(rows[0]), text, time } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/posts/:id/share', authMiddleware, async (req, res) => {
  const id = Number(req.params.id)
  try {
    const item = await pool.query(`SELECT id FROM posts WHERE id = $1`, [id])
    if (item.rows.length === 0) return res.status(404).json({ error: 'Post topilmadi.' })
    await pool.query(`INSERT INTO post_shares (post_id, user_id) VALUES ($1,$2)`, [id, req.user.id])
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS shared FROM post_shares WHERE post_id = $1`, [id])
    res.json({ shared: rows[0].shared })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

const SHIELD_EXTEND_MS = 30 * 60 * 1000
const SHIELD_MAX = 3

app.post('/api/posts/:id/shield', authMiddleware, async (req, res) => {
  const id = Number(req.params.id)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const item = await client.query(
      `SELECT p.author_id, p.seal_until FROM posts p WHERE p.id = $1 FOR UPDATE`,
      [id],
    )
    if (item.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Post topilmadi.' })
    }
    const row = item.rows[0]
    if (!row.seal_until || Number(row.seal_until) <= Date.now()) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: "Muhr allaqachon ochilgan — qalqon qo'yib bo'lmaydi." })
    }
    if (Number(row.author_id) === req.user.id) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: "O'z postingizni himoya qila olmaysiz." })
    }
    const dup = await client.query(
      `SELECT 1 FROM seal_shields WHERE post_id = $1 AND user_id = $2`,
      [id, req.user.id],
    )
    if (dup.rows.length > 0) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Siz bu postni allaqachon himoya qilgansiz.' })
    }
    const shieldR = await client.query(
      `SELECT COUNT(*)::int AS n FROM seal_shields WHERE post_id = $1`,
      [id],
    )
    if (shieldR.rows[0].n >= SHIELD_MAX) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Bu post allaqachon maksimal himoyalangan.' })
    }
    await client.query(
      `INSERT INTO seal_shields (post_id, user_id) VALUES ($1,$2)`,
      [id, req.user.id],
    )
    const upd = await client.query(
      `UPDATE posts SET seal_until = seal_until + $1 WHERE id = $2 RETURNING seal_until`,
      [SHIELD_EXTEND_MS, id],
    )
    await client.query('COMMIT')
    res.json({ sealUntil: Number(upd.rows[0].seal_until), shields: shieldR.rows[0].n + 1 })
  } catch (e) {
    await client.query('ROLLBACK')
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  } finally {
    client.release()
  }
})

app.post('/api/reels/:id/like', authMiddleware, async (req, res) => {
  const id = Number(req.params.id)
  try {
    const item = await pool.query(`SELECT id FROM reels WHERE id = $1`, [id])
    if (item.rows.length === 0) return res.status(404).json({ error: 'Reels topilmadi.' })
    const existing = await pool.query(`SELECT 1 FROM reel_likes WHERE reel_id = $1 AND user_id = $2`, [id, req.user.id])
    if (existing.rows.length > 0) {
      await pool.query(`DELETE FROM reel_likes WHERE reel_id = $1 AND user_id = $2`, [id, req.user.id])
    } else {
      await pool.query(`INSERT INTO reel_likes (reel_id, user_id) VALUES ($1,$2)`, [id, req.user.id])
    }
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS likes FROM reel_likes WHERE reel_id = $1`, [id])
    res.json({ liked: existing.rows.length === 0, likes: rows[0].likes })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/reels/:id/comment', authMiddleware, async (req, res) => {
  const id = Number(req.params.id)
  const text = String(req.body?.text ?? '').trim()
  if (!text) return res.status(400).json({ error: "Izoh bo'sh bo'lishi mumkin emas." })
  try {
    const item = await pool.query(`SELECT id FROM reels WHERE id = $1`, [id])
    if (item.rows.length === 0) return res.status(404).json({ error: 'Reels topilmadi.' })
    const cid = Date.now()
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    await pool.query(
      `INSERT INTO reel_comments (id, reel_id, author_id, text, time) VALUES ($1,$2,$3,$4,$5)`,
      [cid, id, req.user.id, text, time],
    )
    const { rows } = await pool.query(`SELECT u.* FROM users u WHERE id = $1`, [req.user.id])
    res.json({ comment: { id: cid, author: userForContent(rows[0]), text, time } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/reels/:id/share', authMiddleware, async (req, res) => {
  const id = Number(req.params.id)
  try {
    const item = await pool.query(`SELECT id FROM reels WHERE id = $1`, [id])
    if (item.rows.length === 0) return res.status(404).json({ error: 'Reels topilmadi.' })
    await pool.query(`INSERT INTO reel_shares (reel_id, user_id) VALUES ($1,$2)`, [id, req.user.id])
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS shares FROM reel_shares WHERE reel_id = $1`, [id])
    res.json({ shares: rows[0].shares })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/albums/:id/like', authMiddleware, async (req, res) => {
  const id = Number(req.params.id)
  try {
    const item = await pool.query(`SELECT id FROM albums WHERE id = $1`, [id])
    if (item.rows.length === 0) return res.status(404).json({ error: 'Albom topilmadi.' })
    const existing = await pool.query(`SELECT 1 FROM album_likes WHERE album_id = $1 AND user_id = $2`, [id, req.user.id])
    if (existing.rows.length > 0) {
      await pool.query(`DELETE FROM album_likes WHERE album_id = $1 AND user_id = $2`, [id, req.user.id])
    } else {
      await pool.query(`INSERT INTO album_likes (album_id, user_id) VALUES ($1,$2)`, [id, req.user.id])
    }
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS likes FROM album_likes WHERE album_id = $1`, [id])
    res.json({ liked: existing.rows.length === 0, likes: rows[0].likes })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/stories/:id/view', authMiddleware, async (req, res) => {
  const id = Number(req.params.id)
  try {
    await pool.query(
      `INSERT INTO story_views (story_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [id, req.user.id],
    )
    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

/* ---------- Messages ---------- */

function msgRow(m) {
  const base = { id: m.id, from: m.from, text: m.text, time: m.time }
  if (m.image) base.image = m.image
  if (m.seal_until) base.sealUntil = Number(m.seal_until)
  return base
}

function threadResponse(t, other, messages) {
  return {
    id: t.id,
    user: other ? publicUser(other) : null,
    online: true,
    messages,
  }
}

app.get('/api/threads/calls', authMiddleware, async (req, res) => {
  try {
    const since = Number(req.query.since ?? 0)
    const { rows } = await pool.query(
      `SELECT s.* FROM thread_call_signals s
       JOIN threads t ON t.id = s.thread_id
       WHERE (t.member_a = $1 OR t.member_b = $1) AND s.id > $2
         AND s.sender_id <> $1 AND (s.recipient_id = 0 OR s.recipient_id = $1)
       ORDER BY s.id`,
      [req.user.id, since],
    )
    const out = rows.map((s) => ({ id: s.id, threadId: s.thread_id, from: s.sender_id, to: s.recipient_id, kind: s.kind, data: s.payload }))
    res.json({ signals: out })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.get('/api/threads', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM threads WHERE member_a = $1 OR member_b = $1`,
      [req.user.id],
    )
    const threads = []
    for (const t of rows) {
      const otherId = t.member_a === req.user.id ? t.member_b : t.member_a
      const { rows: users } = await pool.query(`SELECT * FROM users WHERE id = $1`, [otherId])
      const other = users[0]
      if (!other) continue
      const { rows: msgs } = await pool.query(
        `SELECT id, sender_id AS from, text, image, time, seal_until FROM messages WHERE thread_id = $1 ORDER BY id`,
        [t.id],
      )
      threads.push(threadResponse(t, other, msgs.map(msgRow)))
    }
    res.json({ threads })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/threads', authMiddleware, async (req, res) => {
  const { user: otherId } = req.body ?? {}
  if (!Number.isInteger(otherId) || otherId === req.user.id) {
    return res.status(400).json({ error: "Xabarchi noto'g'ri." })
  }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM threads WHERE (member_a = $1 AND member_b = $2) OR (member_a = $2 AND member_b = $1)`,
      [req.user.id, otherId],
    )
    let thread = rows[0]
    if (!thread) {
      const tid = Date.now()
      await pool.query(
        `INSERT INTO threads (id, member_a, member_b) VALUES ($1,$2,$3)`,
        [tid, req.user.id, otherId],
      )
      thread = { id: tid, member_a: req.user.id, member_b: otherId }
    }
    const { rows: users } = await pool.query(`SELECT * FROM users WHERE id = $1`, [otherId])
    const other = users[0]
    const { rows: msgs } = await pool.query(
      `SELECT id, sender_id AS from, text, image, time, seal_until FROM messages WHERE thread_id = $1 ORDER BY id`,
      [thread.id],
    )
    res.json({ thread: threadResponse(thread, other, msgs.map(msgRow)) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/threads/:id/messages', authMiddleware, async (req, res) => {
  const id = Number(req.params.id)
  const text = String(req.body?.text ?? '').trim()
  const image = String(req.body?.image ?? '').trim()
  if (!text && !image) return res.status(400).json({ error: "Xabar bo'sh bo'lishi mumkin emas." })
  try {
    const { rows } = await pool.query(
      `SELECT * FROM threads WHERE id = $1 AND (member_a = $2 OR member_b = $2)`,
      [id, req.user.id],
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Suhbat topilmadi.' })
    const mid = Date.now()
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const seal = Number(req.body?.sealUntil) || null
    await pool.query(
      `INSERT INTO messages (id, thread_id, sender_id, text, image, time, seal_until) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [mid, id, req.user.id, text, image, time, seal],
    )
    const out = { id: mid, from: req.user.id, text, time }
    if (image) out.image = image
    if (seal) out.sealUntil = seal
    res.json({ message: out })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.delete('/api/threads/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id)
  try {
    const { rows } = await pool.query(
      `SELECT * FROM threads WHERE id = $1 AND (member_a = $2 OR member_b = $2)`,
      [id, req.user.id],
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Suhbat topilmadi.' })
    await pool.query(`DELETE FROM threads WHERE id = $1`, [id])
    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/threads/:id/calls', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { rows } = await pool.query(
      `SELECT * FROM threads WHERE id = $1 AND (member_a = $2 OR member_b = $2)`,
      [id, req.user.id],
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Suhbat topilmadi.' })
    const kind = String(req.body?.kind ?? '')
    const to = Number(req.body?.to ?? 0)
    const payload = req.body?.data ?? null
    const sid = Date.now()
    await pool.query(
      `INSERT INTO thread_call_signals (id, thread_id, sender_id, recipient_id, kind, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [sid, id, req.user.id, to, kind, JSON.stringify(payload)],
    )
    await pool.query(
      `DELETE FROM thread_call_signals
       WHERE thread_id = $1 AND id < (SELECT COALESCE(MAX(id), 0) - 500 FROM thread_call_signals WHERE thread_id = $1)`,
      [id],
    )
    res.json({ signal: { id: sid, threadId: id, from: req.user.id, to, kind, data: payload } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.get('/api/threads/:id/calls', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { rows } = await pool.query(
      `SELECT * FROM threads WHERE id = $1 AND (member_a = $2 OR member_b = $2)`,
      [id, req.user.id],
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Suhbat topilmadi.' })
    const since = Number(req.query.since ?? 0)
    const { rows: signals } = await pool.query(
      `SELECT * FROM thread_call_signals
       WHERE thread_id = $1 AND id > $2 AND sender_id <> $3 AND (recipient_id = 0 OR recipient_id = $3)
       ORDER BY id`,
      [id, since, req.user.id],
    )
    const out = signals.map((s) => ({ id: s.id, threadId: s.thread_id, from: s.sender_id, to: s.recipient_id, kind: s.kind, data: s.payload }))
    res.json({ signals: out })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

/* ---------- Groups ---------- */

const MAX_GROUPS = 3

async function memberIdsOf(groupId) {
  const { rows } = await pool.query(`SELECT user_id FROM group_members WHERE group_id = $1`, [groupId])
  return rows.map((r) => r.user_id)
}

async function groupResponse(g, meId) {
  const ids = await memberIdsOf(g.id)
  const members = []
  for (const uid of ids) {
    const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [uid])
    if (rows[0]) {
      const u = rows[0]
      members.push({ id: u.id, name: u.name, username: u.username, avatar: u.avatar ?? '', online: true })
    }
  }
  const memberById = new Map(members.map((m) => [m.id, m]))
  const { rows: msgs } = await pool.query(
    `SELECT id, sender_id, text, image, time, seal_until FROM group_messages WHERE group_id = $1 ORDER BY id`,
    [g.id],
  )
  const messages = msgs.map((m) => {
    const base = { id: m.id, from: m.sender_id, text: m.text, time: m.time }
    const sender = memberById.get(m.sender_id)
    if (sender) base.sender = sender
    if (m.image) base.image = m.image
    if (m.seal_until) base.sealUntil = Number(m.seal_until)
    return base
  })
  return {
    id: g.id,
    name: g.name,
    cover: g.cover ?? '',
    createdBy: g.created_by,
    isAdmin: g.created_by === meId,
    members,
    messages,
  }
}

async function isGroupMember(groupId, userId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`,
    [groupId, userId],
  )
  return rows.length > 0
}

app.get('/api/groups', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT g.* FROM groups g
       JOIN group_members gm ON gm.group_id = g.id
       WHERE gm.user_id = $1
       ORDER BY g.id DESC`,
      [req.user.id],
    )
    const out = []
    for (const g of rows) out.push(await groupResponse(g, req.user.id))
    res.json({ groups: out })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/groups', authMiddleware, async (req, res) => {
  try {
    const mine = await pool.query(
      `SELECT 1 FROM groups g JOIN group_members gm ON gm.group_id = g.id
       WHERE gm.user_id = $1 AND g.created_by = $1`,
      [req.user.id],
    )
    if (mine.rows.length >= MAX_GROUPS) {
      return res.status(403).json({ error: 'Siz ko\'pi bilan 3 ta guruh yaratishingiz mumkin.' })
    }
    const name = String(req.body?.name ?? '').trim()
    if (!name) return res.status(400).json({ error: 'Guruh nomini kiriting.' })
    const cover = typeof req.body?.cover === 'string' ? req.body.cover : ''
    const id = Date.now()
    await pool.query(
      `INSERT INTO groups (id, name, cover, joined, created_by) VALUES ($1,$2,$3,true,$4)`,
      [id, name, cover, req.user.id],
    )
    await pool.query(
      `INSERT INTO group_members (group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [id, req.user.id],
    )
    const { rows } = await pool.query(`SELECT * FROM groups WHERE id = $1`, [id])
    res.json({ group: await groupResponse(rows[0], req.user.id) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.get('/api/groups/:id', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const ok = await isGroupMember(id, req.user.id)
    if (!ok) return res.status(404).json({ error: 'Guruh topilmadi.' })
    const { rows } = await pool.query(`SELECT * FROM groups WHERE id = $1`, [id])
    if (rows.length === 0) return res.status(404).json({ error: 'Guruh topilmadi.' })
    res.json({ group: await groupResponse(rows[0], req.user.id) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/groups/:id/members', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { rows } = await pool.query(`SELECT * FROM groups WHERE id = $1`, [id])
    const g = rows[0]
    if (!g) return res.status(404).json({ error: 'Guruh topilmadi.' })
    if (g.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Faqat guruh yaratuvchisi a\'zo qo\'shishi mumkin.' })
    }
    const userId = Number(req.body?.userId)
    const { rows: users } = await pool.query(`SELECT * FROM users WHERE id = $1`, [userId])
    if (users.length === 0) return res.status(400).json({ error: 'Foydalanuvchi topilmadi.' })
    await pool.query(
      `INSERT INTO group_members (group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [id, userId],
    )
    res.json({ group: await groupResponse(g, req.user.id) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.delete('/api/groups/:id/members', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { rows } = await pool.query(`SELECT * FROM groups WHERE id = $1`, [id])
    const g = rows[0]
    if (!g) return res.status(404).json({ error: 'Guruh topilmadi.' })
    const target = Number(req.body?.userId) || req.user.id
    if (target === g.created_by) {
      return res.status(400).json({ error: "Guruh yaratuvchisini chiqarib bo'lmaydi." })
    }
    if (g.created_by !== req.user.id && target !== req.user.id) {
      return res.status(403).json({ error: 'Ruxsat yo\'q.' })
    }
    await pool.query(
      `DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [id, target],
    )
    res.json({ group: await groupResponse(g, req.user.id) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/groups/:id/messages', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const ok = await isGroupMember(id, req.user.id)
    if (!ok) return res.status(404).json({ error: 'Guruh topilmadi.' })
    const text = String(req.body?.text ?? '').trim()
    const image = typeof req.body?.image === 'string' ? req.body.image : ''
    if (!text && !image) return res.status(400).json({ error: "Xabar bo'sh bo'lishi mumkin emas." })
    const mid = Date.now()
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const seal = Number(req.body?.sealUntil) || null
    await pool.query(
      `INSERT INTO group_messages (id, group_id, sender_id, text, image, time, seal_until) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [mid, id, req.user.id, text, image, time, seal],
    )
    const out = { id: mid, from: req.user.id, sender: { id: req.user.id, name: req.user.name, username: req.user.username, avatar: req.user.avatar ?? '' }, text, time }
    if (image) out.image = image
    if (seal) out.sealUntil = seal
    res.json({ message: out })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/groups/:id/calls', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const ok = await isGroupMember(id, req.user.id)
    if (!ok) return res.status(404).json({ error: 'Guruh topilmadi.' })
    const kind = String(req.body?.kind ?? '')
    const to = Number(req.body?.to ?? 0)
    const payload = req.body?.data ?? null
    const sid = Date.now()
    await pool.query(
      `INSERT INTO group_call_signals (id, group_id, sender_id, recipient_id, kind, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [sid, id, req.user.id, to, kind, JSON.stringify(payload)],
    )
    await pool.query(
      `DELETE FROM group_call_signals
       WHERE group_id = $1 AND id < (SELECT COALESCE(MAX(id), 0) - 500 FROM group_call_signals WHERE group_id = $1)`,
      [id],
    )
    res.json({ signal: { id: sid, groupId: id, from: req.user.id, to, kind, data: payload } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.get('/api/groups/:id/calls', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const ok = await isGroupMember(id, req.user.id)
    if (!ok) return res.status(404).json({ error: 'Guruh topilmadi.' })
    const since = Number(req.query.since ?? 0)
    const { rows } = await pool.query(
      `SELECT * FROM group_call_signals
       WHERE group_id = $1 AND id > $2 AND sender_id <> $3 AND (recipient_id = 0 OR recipient_id = $3)
       ORDER BY id`,
      [id, since, req.user.id],
    )
    const signals = rows.map((s) => {
      const out = { id: s.id, groupId: s.group_id, from: s.sender_id, to: s.recipient_id, kind: s.kind, data: s.payload }
      return out
    })
    res.json({ signals })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

/* ---------- Media (binary) ---------- */

const MEDIA_LIMITS = { image: 8 * 1024 * 1024, video: 40 * 1024 * 1024 }
const MEDIA_MIME = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
}
const MEDIA_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm' }

function isSafeMediaId(id) {
  const s = String(id ?? '')
  return s.length > 0 && s.length <= 120 && !s.includes('..') && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s)
}

app.get('/api/media/:id', async (req, res) => {
  const { id } = req.params
  if (!isSafeMediaId(id)) return res.status(400).json({ error: 'Noto‘g‘ri fayl nomi.' })
  try {
    const { rows } = await pool.query('SELECT mime, bytes FROM doppi_media WHERE id = $1', [id])
    if (rows.length === 0) return res.status(404).json({ error: 'Fayl topilmadi.' })
    const bytes = Buffer.isBuffer(rows[0].bytes) ? rows[0].bytes : Buffer.from(rows[0].bytes)
    res.setHeader('Content-Type', rows[0].mime || 'application/octet-stream')
    res.setHeader('Content-Length', String(bytes.length))
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.end(bytes)
  } catch (e) {
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/media', authMiddleware, async (req, res) => {
  const dataUrl = String(req.body?.dataUrl ?? '').trim()
  const m = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(dataUrl)
  if (!m) return res.status(400).json({ error: 'dataUrl formati noto‘g‘ri.' })
  const mime = m[1].toLowerCase()
  const kind = MEDIA_MIME[mime]
  if (!kind) return res.status(415).json({ error: `Bu fayl turi qabul qilinmaydi: ${mime}` })
  const bytes = Buffer.from(m[2], 'base64')
  if (!bytes.length) return res.status(400).json({ error: 'Fayl bo‘sh.' })
  if (bytes.length > MEDIA_LIMITS[kind]) {
    return res.status(413).json({ error: `Fayl hajmi katta (${kind === 'video' ? 40 : 8} MB dan oshmasligi kerak).` })
  }
  const id = `${Date.now().toString(36)}${crypto.randomBytes(6).toString('hex')}.${MEDIA_EXT[mime]}`
  try {
    await pool.query(
      `INSERT INTO doppi_media (id, mime, size, bytes) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET mime = EXCLUDED.mime, size = EXCLUDED.size, bytes = EXCLUDED.bytes`,
      [id, mime, bytes.length, bytes],
    )
    res.status(201).json({ id, url: `/api/media/${id}`, mime, kind, size: bytes.length })
  } catch (e) {
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

/* ---------- SPA (built frontend) ---------- */

const DIST_PATH = path.join(__dirname, '..', 'dist')

app.use(express.static(DIST_PATH))

app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api')) return next()
  const indexHtml = path.join(DIST_PATH, 'index.html')
  if (fs.existsSync(indexHtml)) {
    res.sendFile(indexHtml)
  } else {
    res.status(404).json({ error: 'Frontend build topilmadi. Avval "npm run build" bajarilgan bo\'lishi kerak.' })
  }
})

const PORT = Number(process.env.PORT || 4000)

ensureSchema().then(() => {
  app.listen(PORT, () => {
    console.log(`Do'ppi API ishga tushdi (PostgreSQL) → http://127.0.0.1:${PORT}`)
  })
}).catch((e) => {
  console.error('Schema yaratishda xatolik:', e)
  process.exit(1)
})