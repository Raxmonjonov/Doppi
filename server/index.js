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
app.use(express.json({ limit: '100mb' }))

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
    await pool.query(`INSERT INTO sessions (token, user_id) VALUES ($1,$2)`, [token, user.id])
    res.json({ token, user: publicUser(user) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  await pool.query(`DELETE FROM sessions WHERE token = $1`, [req.token])
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
      `SELECT p.id, p.time, p.text, p.images, p.video, p.live,
        u.id AS au_id, u.name AS au_name, u.username AS au_username, u.avatar AS au_avatar, u.about AS au_about,
        (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = p.id) AS likes,
        (SELECT COUNT(*)::int FROM post_shares ps WHERE ps.post_id = p.id) AS shared,
        EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = $1) AS liked_by_me
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
      `SELECT a.id, a.title, a.photos,
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
    likedByMe: !!p.liked_by_me,
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

  const albums = albumsR.rows.map((a) => ({
    id: a.id,
    title: a.title,
    count: Array.isArray(a.photos) ? a.photos.length : 0,
    likes: a.likes ?? 0,
    photos: Array.isArray(a.photos) ? a.photos : [],
  }))

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
        `INSERT INTO posts (id, author_id, time, text, images, video, live)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET
           author_id = EXCLUDED.author_id,
           time = EXCLUDED.time,
           text = EXCLUDED.text,
           images = EXCLUDED.images,
           video = EXCLUDED.video,
           live = EXCLUDED.live`,
        [Number(p.id), authorId, String(p.time ?? ''), String(p.text ?? ''), JSON.stringify(p.images ?? []), p.video ?? null, !!p.live],
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

    for (const a of Array.isArray(d.albums) ? d.albums : []) {
      await client.query(
        `INSERT INTO albums (id, title, photos)
         VALUES ($1,$2,$3)
         ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, photos = EXCLUDED.photos`,
        [Number(a.id), String(a.title ?? ''), JSON.stringify(Array.isArray(a.photos) ? a.photos : [])],
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

function threadResponse(t, other, messages) {
  return {
    id: t.id,
    user: other ? publicUser(other) : null,
    online: true,
    messages,
  }
}

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
        `SELECT id, sender_id AS from, text, time FROM messages WHERE thread_id = $1 ORDER BY id`,
        [t.id],
      )
      threads.push(threadResponse(t, other, msgs))
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
      `SELECT id, sender_id AS from, text, time FROM messages WHERE thread_id = $1 ORDER BY id`,
      [thread.id],
    )
    res.json({ thread: threadResponse(thread, other, msgs) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/threads/:id/messages', authMiddleware, async (req, res) => {
  const id = Number(req.params.id)
  const text = String(req.body?.text ?? '').trim()
  if (!text) return res.status(400).json({ error: "Xabar bo'sh bo'lishi mumkin emas." })
  try {
    const { rows } = await pool.query(
      `SELECT * FROM threads WHERE id = $1 AND (member_a = $2 OR member_b = $2)`,
      [id, req.user.id],
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Suhbat topilmadi.' })
    const mid = Date.now()
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    await pool.query(
      `INSERT INTO messages (id, thread_id, sender_id, text, time) VALUES ($1,$2,$3,$4,$5)`,
      [mid, id, req.user.id, text, time],
    )
    res.json({ message: { id: mid, from: req.user.id, text, time } })
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