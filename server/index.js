import express from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import webpushDefault from 'web-push'
import { sendMail, resetCodeMessage } from '../netlify/lib/delivery.mjs'
import {
  hashPassword,
  verifyPassword,
  passwordProblem,
  constantTimeEqual,
  makeToken,
  tokenRef,
  sessionMatches,
  mediaSignatureValid,
  signedMediaPath,
  mediaPathOf,
  sanitizeAvatar,
  RATE_LIMITS,
  rateLimit,
  rateLimitAny,
  securityHeaders,
  normalizeIdentity,
} from '../netlify/lib/security.mjs'

// web-push CommonJS moduli: default import to'g'ri kelishi uchun normallashtiramiz
const webpush = webpushDefault?.default ?? webpushDefault

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCHEMA_PATH = path.join(__dirname, 'schema.sql')

const { Pool, types } = pg
types.setTypeParser(types.builtins.INT8, (v) => (v === null ? null : Number(v)))
types.setTypeParser(types.builtins.INT4, (v) => (v === null ? null : Number(v)))

/* Baza ulanishi faqat env'dan. OLD: `postgres/postgres` va "Do'ppi" kodi
   ichida qat'i yozilgan edi — bu ish stansiyasining umumiy paroli va
   tayyorCredential bo'lib, xato tuzatishda ham "ishlayveradi" (ishlatilmay
   qoladi). Endi hech qanday standart credential yo'q: DATABASE_URL yoki
   PGUSER/PGPASSWORD/PGDATABASE to'liq berilishi shart. */
const DATABASE_URL = String(process.env.DATABASE_URL ?? '').trim()
if (!DATABASE_URL && process.env.NODE_ENV === 'production') {
  console.error('[xavfsizlik] DATABASE_URL belgilanmagan — server ishga tushmaydi.')
  process.exit(1)
}

const pgEnv = {
  user: String(process.env.PGUSER ?? '').trim(),
  password: String(process.env.PGPASSWORD ?? '').trim(),
  host: String(process.env.PGHOST ?? '').trim(),
  port: Number(process.env.PGPORT || 5432),
  database: String(process.env.PGDATABASE ?? '').trim(),
}
const missingPgEnv = ['user', 'password', 'host', 'database'].filter((k) => !pgEnv[k])
if (!DATABASE_URL && missingPgEnv.length) {
  console.error(
    '[xavfsizlik] Baza ulanishi belgilanmagan. DATABASE_URL yoki ' +
      `${missingPgEnv.map((k) => 'PG' + k.toUpperCase()).join(', ')} bering.`,
  )
  process.exit(1)
}

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: false } : undefined,
    })
  : new Pool(pgEnv)

async function ensureSchema() {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8')
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  // Xatolarni YUTIB TASHLASH xavfsiz: eski holatda har bir statement
  // alohida catch qilinardi, shuning uchun yangi bazada `posts` jadvali
  // yaratilishidan oldin kelgan ALTER xatosi yashirilib, server so'ng
  // ishga tushardi — va keyin har bir posts so'rovi runtime'da yiqilardi.
  // Barcha statement'lar `IF NOT EXISTS`/`IF EXISTS` bilan idempotent,
  // shuning uchun xatolar haqiqiy muammo: jadvalni TO'LIQ qo'llab
  // ishga tushmaslik kerak.
  const failures = []
  for (const stmt of statements) {
    try {
      await pool.query(stmt)
    } catch (e) {
      failures.push({ stmt: stmt.split('\n')[0].slice(0, 120), message: e.message })
    }
  }
  if (failures.length) {
    for (const f of failures) console.error(`Schema xatosi [${f.stmt}]: ${f.message}`)
    throw new Error(`Schema to'liq qo'llanilmadi: ${failures.length} ta xato (server ishga tushirilmaydi).`)
  }
}

const app = express()
// Media endi alohida /api/media orqali saqlanadi, shuning uchun data hujjati kichik bo'ladi.
// 25MB — eski data:URL li ma'lumotlar uchun zaxira. Katta JSON body — xotira
// (DoS) hujjumi, shuning uchun API uchun 2MB, media upload o'z limitida.
app.use('/api/media', express.json({ limit: '25mb' }))
app.use(express.json({ limit: '2mb' }))

/* ---------- Xavfsizlik sarlavhalari ----------
   Netlify function bilan bir xil to'plam (`security.mjs`), shuning uchun
   platformadan qat'i nazar brauzer bir xil qoidalarni oladi. */
app.use((req, res, next) => {
  for (const [k, v] of Object.entries(securityHeaders({ isStatic: !req.path.startsWith('/api/') }))) {
    res.setHeader(k, v)
  }
  // HSTS faqat HTTPS orqasida (localhostda TLS yo'q — sinov buzilmasin)
  if (process.env.NODE_ENV === 'production' && req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  next()
})

/* ---------- Parol kriptografiyasi va rate limit ----------
   Barcha himoyalar `netlify/lib/security.mjs` da — Netlify function va Express
   bir xil qoidalarni qo'llaydi. */

/* Sessiya 30 kun turadi va faol bo'lgani yangilanadi (sliding TTL). */
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000

function uaLabel(req) {
  const ua = String(req?.headers?.['user-agent'] ?? '').slice(0, 120)
  if (!ua) return ''
  if (/edg\//i.test(ua)) return 'Edge'
  if (/chrome|crios/i.test(ua)) return 'Chrome'
  if (/firefox|fxios/i.test(ua)) return 'Firefox'
  if (/safari/i.test(ua)) return 'Safari'
  return 'Brauzer'
}

function blockTooMany(res, wait) {
  res.setHeader('Retry-After', String(wait))
  return res.status(429).json({ error: 'Juda ko‘p urinish. Bir oz kutib, qayta yuboring.', retryAfter: wait })
}

/* Ommaviy foydalanuvchi ko'rinishi — email HECH QACHON boshqalarga
   ko'rsatilmaydi (eski versiya /api/users va DM javobida emailni sizib chiqarardi). */
function publicUser(u) {
  if (!u) return null
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    avatar: u.avatar ?? '',
    about: u.about ?? '',
    // Postgres ustunlari `created_at` (snake_case), store esa `createdAt`
    // (camelCase) qaytaradi — ikkalasini ham qabul qilamiz, aks holda maydon
    // bututga tushib qoladi.
    createdAt: u.createdAt ?? u.created_at ?? null,
    online: true,
  }
}

/* Faqat o'zini autentifikatsiya qilgan foydalanuvchiga — uning emaili
   o'ziga tegishli ma'lumot. */
function selfUser(u) {
  if (!u) return null
  return { ...publicUser(u), email: u.email }
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
  // Bazada xom token emas, uning HMAC imzosi saqlanadi (baza sizib chiqsa
  // ham foydalanuvchi tokeni ishlatib bo'lmaydi).
  const ref = tokenRef(token)
  try {
    const { rows } = await pool.query(
      `SELECT u.*, s.token AS session_token, s.ua AS session_ua, s.expires_at AS session_expires,
              s.last_seen AS session_last_seen, s.created_at AS session_created
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1`,
      [ref],
    )
    if (rows.length === 0) return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi.' })
    const row = rows[0]
    // `sessionMatches` `row.token` ni kutadi — Postgresda ustun `session_token`
    // deb belgilangan, shuning uchun shu yerda xom nomga qaytamiz.
    if (!sessionMatches({ ...row, token: row.session_token }, token)) {
      return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi.' })
    }
    if (row.session_expires && new Date(row.session_expires).getTime() <= Date.now()) {
      await pool.query(`DELETE FROM sessions WHERE token = $1`, [ref])
      return res.status(401).json({ error: 'Sessiya muddati tugagan. Qayta kiring.' })
    }
    req.user = row
    req.token = token
    req.tokenRef = ref
    // sliding TTL: muddatni faqat yaqin tugashiga tegilganda yangilaymiz (har so'rovda yozmaymiz)
    if (!row.session_expires || new Date(row.session_expires).getTime() - Date.now() < SESSION_TTL / 2) {
      pool
        .query(
          `UPDATE sessions SET last_seen = $1, expires_at = now() + ($2 || ' milliseconds')::interval WHERE token = $3`,
          [Date.now(), String(SESSION_TTL), ref],
        )
        .catch(() => {})
    }
    next()
  } catch (e) {
    // Sababsiz 500 qaytishidan keyin incidentni aniqlab bo'lmaydi —
    // har bir 500 yo'li xatoni log'ga yozishi shart.
    console.error('[authMiddleware]', e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
}

/* ---------- Auth ---------- */

app.post('/api/auth/register', async (req, res) => {
  const regWait = rateLimit('register:' + req.ip, RATE_LIMITS.register)
  if (regWait) return blockTooMany(res, regWait)
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
  if (uname.length > 32) return res.status(400).json({ error: 'Foydalanuvchi nomi juda uzun (32 belgidan oshmasligi kerak).' })
  if (em.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) {
    return res.status(400).json({ error: 'Email manzili noto‘g‘ri.' })
  }
  const pwProblem = passwordProblem(pw, { username: uname, email: em })
  if (pwProblem) return res.status(400).json({ error: pwProblem })
  try {
    const taken = await pool.query(
      `SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = $2`,
      [uname, em],
    )
    // 409 bitta xil xil xabarni qaytaradi: aks holda ro'yxatdan o'tish orqali
    // qaysi email bandligini aniqlab, foydalanuvchilarni o'tkazish mumkin
    if (taken.rows.length > 0) {
      return res.status(409).json({ error: "Bu username yoki email allaqachon ro'yxatdan o'tgan." })
    }

    const { salt, hash } = await hashPassword(pw)
    const id = Date.now()
    const createdAt = new Date().toISOString()
    await pool.query(
      `INSERT INTO users (id, name, username, email, salt, hash, avatar, about, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, nm, uname, em, salt, hash, av, ab, createdAt],
    )
    const token = makeToken()
    await pool.query(
      `INSERT INTO sessions (token, user_id, ua, created_at, expires_at)
       VALUES ($1,$2,$3, now(), now() + ($4 || ' milliseconds')::interval)`,
      [tokenRef(token), id, uaLabel(req), String(SESSION_TTL)],
    )
    const user = selfUser({ id, name: nm, username: uname, email: em, avatar: av, about: ab, createdAt })
    res.json({ token, user })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body ?? {}
  const idf = normalizeIdentity(username)
  // Ikki limit: IP bo'yicha va HISOB bo'yicha. Hisob limiti IP o'zgarishiga
  // bog'liq emas — credential stuffing va parol to'plab urinish to'xtaydi.
  const blocked = rateLimitAny([
    ['login:' + req.ip + ':' + idf, RATE_LIMITS.login],
    ['loginAcct:' + idf, RATE_LIMITS.loginAccount],
  ])
  if (blocked) return blockTooMany(res, blocked.wait)
  const pw = String(password ?? '')
  try {
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $1`,
      [idf],
    )
    const user = rows[0]
    const okPw = user ? await verifyPassword(pw, user.salt, user.hash) : false
    // Barcha holatlar uchun BIR XIL javob: foydalanuvchi borligi oshkor qilinmaydi
    if (!user || !okPw) return res.status(401).json({ error: "Login yoki parol noto'g'ri." })
    const token = makeToken()
    const now = Date.now()
    const nowIso = new Date(now).toISOString()
    await pool.query(
      `INSERT INTO sessions (token, user_id, last_seen, ua, created_at, expires_at)
       VALUES ($1,$2,$3,$4, now(), now() + ($5 || ' milliseconds')::interval)
       ON CONFLICT (token) DO UPDATE SET last_seen = EXCLUDED.last_seen, expires_at = EXCLUDED.expires_at`,
      [tokenRef(token), user.id, now, uaLabel(req), String(SESSION_TTL)],
    )
    await pool.query(`UPDATE users SET last_login_at = $1 WHERE id = $2`, [nowIso, user.id])
    res.json({ token, user: selfUser(user) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

/* ---------- Parol tiklash ---------- */

const RESET_CODE_TTL = 10 * 60 * 1000
const RESET_MAX_ATTEMPTS = 5
/* Inbox'ni bombalashga qarshi: bu vaqt ichida yangi kod yuborilmaydi */
const RESET_RESEND_COOLDOWN = 60 * 1000

function resetCodeEcho() {
  return process.env.NODE_ENV !== 'production' && process.env.RESET_CODE_ECHO !== '0'
}

function makeResetCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0')
}

function resetUrlFor(username) {
  const base = String(process.env.APP_URL ?? process.env.PUBLIC_URL ?? '').replace(/\/+$/, '')
  if (!base) return ''
  const q = new URLSearchParams({ username: String(username ?? '').trim(), forgot: '1' })
  return `${base}/login?${q.toString()}`
}

app.post('/api/auth/forgot', async (req, res) => {
  const forgotWait = rateLimit('forgot:' + req.ip, RATE_LIMITS.forgot)
  if (forgotWait) return blockTooMany(res, forgotWait)
  const { username } = req.body ?? {}
  const idf = String(username ?? '').trim().toLowerCase()
  try {
    const { rows } = await pool.query(
      `SELECT id, username, email FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $1`,
      [idf],
    )
    const un = rows[0] ? rows[0].username.toLowerCase() : idf
    const user = rows[0]
    // mavjudligini oshkor qilmaymiz — javob har doim bir xal
    if (!user) return res.json({ ok: true, sent: true })

    // Hisob bo'yicha limit: bitta hisobga so'rov yuborish (pochta bombasi)
    const acct = rateLimit('forgotAcct:' + un, RATE_LIMITS.forgotAccount)
    if (acct) return res.json({ ok: true, sent: true })

    // yaqinda yuborilgan bo'lsa, qayta yuborilmaydi (pochta bombasi himoyasi)
    const { rows: prev } = await pool.query(
      `SELECT expires_at, sent_at FROM password_resets WHERE username = $1`,
      [un],
    )
    const now = Date.now()
    if (prev[0] && new Date(prev[0].expires_at).getTime() > now && now - Number(prev[0].sent_at ?? 0) < RESET_RESEND_COOLDOWN) {
      return res.json({ ok: true, sent: true, throttled: true })
    }

    await pool.query(`DELETE FROM password_resets WHERE username = $1`, [un])
    const code = makeResetCode()
    const { salt, hash } = await hashPassword(code)
    await pool.query(
      `INSERT INTO password_resets (username, salt, code_hash, expires_at, attempts, sent_at)
       VALUES ($1,$2,$3,$4,0,$5)
       ON CONFLICT (username) DO UPDATE SET salt = EXCLUDED.salt, code_hash = EXCLUDED.code_hash,
         expires_at = EXCLUDED.expires_at, attempts = 0, sent_at = EXCLUDED.sent_at`,
      [un, salt, hash, new Date(Date.now() + RESET_CODE_TTL).toISOString(), now],
    )
    // yetkazish hech qachon javobni o'zgartirmaydi
    const mail = resetCodeMessage({ code, username: user.username, url: resetUrlFor(user.username), minutes: 10 })
    const sent = await sendMail({ to: user.email, ...mail })
    if (!sent.ok) console.error(`[parol tiklash] ${user.username}: yetkazilmadi (${sent.provider}: ${sent.error ?? 'noma\'lum'})`)
    res.json(resetCodeEcho() ? { ok: true, sent: true, debugCode: code, via: sent.provider } : { ok: true, sent: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/auth/reset', async (req, res) => {
  const resetWait = rateLimit('reset:' + req.ip, RATE_LIMITS.reset)
  if (resetWait) return blockTooMany(res, resetWait)
  const { username, code, password } = req.body ?? {}
  const idf = String(username ?? '').trim().toLowerCase()
  const pw = String(password ?? '')
  try {
    const { rows: userRows } = await pool.query(
      `SELECT id, username FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $1`,
      [idf],
    )
    const user = userRows[0]
    const { rows } = user
      ? await pool.query(`SELECT * FROM password_resets WHERE username = $1`, [user.username.toLowerCase()])
      : { rows: [] }
    const entry = rows[0]
    if (!entry || new Date(entry.expires_at).getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Tiklash kodi muddati tugagan. Yangi kod so‘rang.' })
    }
    if (entry.attempts >= RESET_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Juda ko‘p urinish. Yangi tiklash kodi so‘rang.' })
    }
    const okCode = await verifyPassword(String(code ?? '').trim(), entry.salt, entry.code_hash)
    if (!okCode) {
      await pool.query(`UPDATE password_resets SET attempts = attempts + 1 WHERE username = $1`, [entry.username])
      return res.status(400).json({ error: 'Kod noto‘g‘ri.' })
    }
    // Parol siyosati eski parollarga emas, YANGI parollarga qo'llaniladi
    const pwProblem = passwordProblem(pw, { username: user.username })
    if (pwProblem) {
      await pool.query(`UPDATE password_resets SET attempts = 0 WHERE username = $1`, [entry.username])
      return res.status(400).json({ error: pwProblem })
    }
    const { salt, hash } = await hashPassword(pw)
    await pool.query(
      `UPDATE users SET salt = $1, hash = $2, password_changed_at = now() WHERE id = $3`,
      [salt, hash, user.id],
    )
    await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [user.id]) // barcha qurilmalardagi sessiyalar bekor qilinadi
    await pool.query(`DELETE FROM password_resets WHERE username = $1`, [entry.username])
    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

/* ---------- Bildirishnomalar ---------- */

const NOTIFICATION_LIMIT = 200
const PUSH_SUB_LIMIT = 10
const PUSH_OFFLINE_MS = 60 * 1000

/* ---------- Web Push (bildirishnomani yopiq brauzerga yetkazish) ----------
   VAPID kalitlari: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY env dan olinadi.
   Yo'q bo'lsa bir marta generatsiya qilinib app_settings da saqlanadi. */

function validSubscription(sub) {
  return (
    sub &&
    typeof sub.endpoint === 'string' &&
    /^https:\/\//i.test(sub.endpoint) &&
    sub.endpoint.length < 500 &&
    sub.keys?.p256dh &&
    sub.keys?.auth
  )
}

function uaLabelOf(uaRaw) {
  return uaLabel({ headers: { 'user-agent': String(uaRaw ?? '') } })
}

let vapidCache = null

async function vapidKeys() {
  if (vapidCache) return vapidCache
  if (!webpush?.generateVAPIDKeys) return null
  const pub = process.env.VAPID_PUBLIC_KEY || ''
  const priv = process.env.VAPID_PRIVATE_KEY || ''
  if (pub && priv) {
    vapidCache = { publicKey: pub, privateKey: priv }
    return vapidCache
  }
  try {
    const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key = 'vapid'`)
    if (rows[0]?.value) {
      vapidCache = JSON.parse(rows[0].value)
      return vapidCache
    }
    const generated = webpush.generateVAPIDKeys()
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('vapid', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(generated)],
    )
    vapidCache = generated
    return vapidCache
  } catch (e) {
    console.error('VAPID kaliti tayyorlanmadi:', e.message)
    return null
  }
}

/* Foydalanuvchi oxirgi daqiqada faol bo'lsa push yubormaymiz — sahifa o'zi
   poll qilib brauzer Notification API'si bilan ko'rsatadi. */
async function isRecentlyActive(userId, ms = PUSH_OFFLINE_MS) {
  const { rows } = await pool.query(
    `SELECT 1 FROM sessions WHERE user_id = $1 AND last_seen > $2 LIMIT 1`,
    [userId, Date.now() - ms],
  )
  return rows.length > 0
}

function pushPayloadOf(item) {
  const isCall = item.kind === 'call'
  const parts = []
  if (item.hasAudio) parts.push('ovozli xabar')
  else if (item.hasImage) parts.push('rasm')
  else if (item.body) parts.push(String(item.body).slice(0, 90))
  const payload = {
    title: isCall ? "Kiruvchi qo'ng'iroq" : 'Yangi xabar',
    body: isCall
      ? `${item.actorName} qo'ng'iroq qildi`
      : `${item.actorName}${parts.length ? ': ' + parts.join(' · ') : ' yangi xabar yubordi'}`,
    tag: `notif-${item.id}`,
    notificationId: item.id,
    kind: item.kind,
    from: { id: item.actorId, name: item.actorName, username: item.actorUsername, avatar: item.actorAvatar },
    threadId: item.threadId ?? null,
    groupId: item.groupId ?? null,
    callKind: item.callKind ?? '',
  }
  if (isCall && !item.closed) {
    payload.actions = [
      { action: 'open', title: 'Ochish' },
      { action: 'join', title: "Qo'ng'iroqqa qo'shilish" },
    ]
  }
  return payload
}

/* Push yuborish hech qachon asosiy oqimni bloklamaydi. */
async function sendPush(userId, item) {
  try {
    if (!webpush?.sendNotification) return
    if (await isRecentlyActive(userId)) return
    const { rows } = await pool.query(`SELECT * FROM push_subscriptions WHERE user_id = $1`, [userId])
    if (!rows.length) return
    const keys = await vapidKeys()
    if (!keys) return
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@doppi.app', keys.publicKey, keys.privateKey)
    const body = JSON.stringify(pushPayloadOf(item))
    for (const s of rows) {
      try {
        const res = webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 300, urgency: 'high' },
        )
        if (res && typeof res.then === 'function') {
          res.catch(async (err) => {
            const code = err?.statusCode
            if (code === 404 || code === 410) {
              await pool.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [s.endpoint]).catch(() => {})
            }
          })
        }
      } catch {
        /* bitta qurilma xatosi boshqalarini to'xtatmasin */
      }
    }
  } catch (e) {
    console.error('push yuborilmadi:', e.message)
  }
}

async function insertNotification(userId, actor, data = {}) {
  if (!userId || Number(userId) === Number(actor?.id)) return null
  const id = Date.now() + Math.floor(Math.random() * 1000)
  const item = {
    id,
    kind: String(data.kind ?? 'message'),
    actorId: Number(actor?.id ?? 0),
    actorName: String(actor?.name ?? ''),
    actorUsername: String(actor?.username ?? ''),
    actorAvatar: String(actor?.avatar ?? ''),
    threadId: data.threadId ?? null,
    groupId: data.groupId ?? null,
    callKind: String(data.callKind ?? ''),
    body: String(data.body ?? '').slice(0, 200),
    hasAudio: !!data.hasAudio,
    hasImage: !!data.hasImage,
  }
  try {
    await pool.query(
      `INSERT INTO notifications
        (id, user_id, kind, actor_id, actor_name, actor_username, actor_avatar,
         thread_id, group_id, call_kind, body, has_audio, has_image, read, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false,$14)`,
      [
        id,
        userId,
        item.kind,
        item.actorId,
        item.actorName,
        item.actorUsername,
        item.actorAvatar,
        item.threadId,
        item.groupId,
        item.callKind,
        item.body,
        item.hasAudio,
        item.hasImage,
        Date.now(),
      ],
    )
    // faqat oxirgi N ta bildirishnoma saqlanadi
    await pool.query(
      `DELETE FROM notifications WHERE user_id = $1 AND id < (
         SELECT COALESCE(MIN(id), 0) FROM (
           SELECT id FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT $2
         ) t
       )`,
      [userId, NOTIFICATION_LIMIT],
    )
    // sahifa yopiq bo'lsa Web Push bilan yetkazamiz (bildirishnoma saqlangan)
    void sendPush(userId, item)
    return id
  } catch (e) {
    console.error('bildirishnoma yozilmadi:', e.message)
    return null
  }
}

/* Qo'ng'iroq tugaganda (hangup/decline) ochiq qo'ng'iroq bildirishnomalarini
   yopadi. Ikki holat bir vaqtda qo'llaniladi:
     1) signalni yuborganing o'z ro'yxatidagi (men chaqirilganman) — endi
        qabul qildim/rad etdim, eslatib turmasin;
     2) meni chaqirganlarning ro'yxatidagi (actor_id = men) — qo'ng'iroq tugadi. */
async function closeCallNotifications({ threadId = null, groupId = null, from = 0, selfId = 0 } = {}) {
  const scope = []
  const params = []
  if (threadId != null) {
    params.push(threadId)
    scope.push(`thread_id = $${params.length}`)
  }
  if (groupId != null) {
    params.push(groupId)
    scope.push(`group_id = $${params.length}`)
  }
  if (selfId) {
    params.push(selfId)
    scope.push(`(user_id = $${params.length} AND actor_id <> $${params.length})`)
  }
  if (from) {
    params.push(from)
    scope.push(`actor_id = $${params.length}`)
  }
  if (!params.length) return
  await pool.query(
    `UPDATE notifications SET closed = true, read = true
     WHERE kind = 'call' AND read = false AND closed = false AND (${scope.join(' OR ')})`,
    params,
  )
}

function notificationRow(n) {
  return {
    id: Number(n.id),
    kind: n.kind,
    actor: { id: Number(n.actor_id), name: n.actor_name, username: n.actor_username, avatar: n.actor_avatar },
    threadId: n.thread_id == null ? null : Number(n.thread_id),
    groupId: n.group_id == null ? null : Number(n.group_id),
    callKind: n.call_kind || '',
    body: n.body || '',
    hasAudio: !!n.has_audio,
    hasImage: !!n.has_image,
    closed: !!n.closed,
    read: !!n.read,
    createdAt: Number(n.created_at || n.id),
  }
}

app.get('/api/notifications', authMiddleware, async (req, res) => {
  const since = Number(req.query.since ?? 0) || 0
  try {
    const { rows } = await pool.query(
      `SELECT * FROM notifications WHERE user_id = $1 AND id > $2 ORDER BY id ASC LIMIT 100`,
      [req.user.id, since],
    )
    const { rows: unreadRows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read = false`,
      [req.user.id],
    )
    res.json({
      notifications: rows.map(notificationRow),
      unread: unreadRows[0]?.n ?? 0,
      serverTime: Date.now(),
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/notifications/read', authMiddleware, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : null
    let marked = 0
    if (ids && ids.length) {
      const { rowCount } = await pool.query(
        `UPDATE notifications SET read = true WHERE user_id = $1 AND read = false AND id = ANY($2::bigint[])`,
        [req.user.id, ids],
      )
      marked = rowCount ?? 0
    } else {
      const { rowCount } = await pool.query(
        `UPDATE notifications SET read = true WHERE user_id = $1 AND read = false`,
        [req.user.id],
      )
      marked = rowCount ?? 0
    }
    res.json({ ok: true, marked })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

/* ---------- Web Push obunasi (yopiq brauzerga yetkazish) ---------- */

app.get('/api/push/key', async (req, res) => {
  try {
    const keys = await vapidKeys()
    if (!keys) return res.json({ enabled: false, publicKey: null })
    res.json({ enabled: true, publicKey: keys.publicKey })
  } catch (e) {
    console.error(e)
    res.json({ enabled: false, publicKey: null })
  }
})

app.post('/api/push/subscribe', authMiddleware, async (req, res) => {
  try {
    if (!(await vapidKeys())) return res.status(501).json({ error: 'Push yetkazib berish sozlanmagan.' })
    const sub = req.body?.subscription
    if (!validSubscription(sub)) return res.status(400).json({ error: 'Obuna ma’lumotlari noto‘g‘ri.' })
    const endpoint = sub.endpoint
    await pool.query(
      `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, ua, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (endpoint) DO UPDATE
         SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh,
             auth = EXCLUDED.auth, ua = EXCLUDED.ua, created_at = EXCLUDED.created_at`,
      [
        endpoint,
        req.user.id,
        String(sub.keys.p256dh).slice(0, 200),
        String(sub.keys.auth).slice(0, 100),
        uaLabelOf(req.headers['user-agent']),
        Date.now(),
      ],
    )
    // bitta qurilmada ko'p obuna bo'lmasin
    await pool.query(
      `DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint NOT IN (
         SELECT endpoint FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
       )`,
      [req.user.id, PUSH_SUB_LIMIT],
    )
    res.json({ ok: true, id: crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 24) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/push/unsubscribe', authMiddleware, async (req, res) => {
  try {
    const endpoint = String(req.body?.endpoint ?? '').slice(0, 500)
    if (!endpoint) return res.status(400).json({ error: 'endpoint talab qilinadi.' })
    const { rowCount } = await pool.query(
      `DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2`,
      [endpoint, req.user.id],
    )
    res.json({ ok: true, removed: rowCount ?? 0 })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.get('/api/auth/sessions', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ua, created_at, last_seen, expires_at, token FROM sessions
       WHERE user_id = $1 ORDER BY last_seen DESC`,
      [req.user.id],
    )
    res.json({
      sessions: rows.map((s) => ({
        ua: s.ua || '',
        createdAt: s.created_at,
        lastSeen: s.last_seen || null,
        expiresAt: s.expires_at,
        current: sessionMatches(s, req.token),
      })),
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/auth/logout-all', authMiddleware, async (req, res) => {
  try {
    const { rowCount } = await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [req.user.id])
    await pool.query(`UPDATE users SET last_logout_at = $1 WHERE id = $2`, [new Date().toISOString(), req.user.id])
    res.json({ ok: true, revoked: rowCount ?? 0 })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  await pool.query(`DELETE FROM sessions WHERE token = $1`, [req.tokenRef])
  await pool.query(`UPDATE users SET last_logout_at = $1 WHERE id = $2`, [new Date().toISOString(), req.user.id])
  res.json({ ok: true })
})

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: selfUser(req.user) })
})

app.patch('/api/auth/me', authMiddleware, async (req, res) => {
  const { name, about, avatar } = req.body ?? {}
  const sets = []
  const values = []
  if (name !== undefined) { values.push(String(name).trim().slice(0, 80)); sets.push(`name = $${values.length}`) }
  if (about !== undefined) { values.push(String(about).slice(0, 500)); sets.push(`about = $${values.length}`) }
  if (avatar !== undefined) { values.push(sanitizeAvatar(String(avatar))); sets.push(`avatar = $${values.length}`) }
  if (sets.length > 0) {
    values.push(req.user.id)
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${values.length}`, values)
    const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [req.user.id])
    if (rows[0]) req.user = rows[0]
  }
  res.json({ user: selfUser(req.user) })
})

/* ---------- Presence ---------- */

app.post('/api/ping', authMiddleware, async (req, res) => {
  try {
    await pool.query(`UPDATE sessions SET last_seen = $1 WHERE token = $2`, [Date.now(), req.tokenRef])
    res.json({ ok: true })
  } catch (e) {
    console.error('[ping]', e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

/* ---------- Admin ----------

   OLD: `ADMIN_PASSWORD ?? 'Admin.Do\'ppi.Uzbekitan.66'` — env berilmasa
   hujjatda yozilgan parol ishlaydi. Bu klassik "default credential"
   zaifligi: README'da ko'rinadigan parol bilan butun admin panel olinadi.

   YANGI: ishlab chiqarishda ADMIN_PASSWORD majburiy. Berilmasa admin kirish
   butunlay rad etiladi (boshqa hech narsa buzilmaydi). Parol doimiy vaqtli
   taqqoslanadi va admin sessiyasi 12 soatda bekor bo'ladi. */
const ADMIN_USER = String(process.env.ADMIN_USERNAME ?? '').trim()
const ADMIN_PASS = String(process.env.ADMIN_PASSWORD ?? '')
const ADMIN_CONFIGURED = ADMIN_USER.length > 0 && ADMIN_PASS.length >= 12
const ADMIN_SESSION_TTL = 12 * 60 * 60 * 1000
const adminTokens = new Map()

if (process.env.NODE_ENV === 'production' && !ADMIN_CONFIGURED) {
  console.error(
    '[xavfsizlik] ADMIN_USERNAME va ADMIN_PASSWORD (kamida 12 belgi) ' +
      'belgilanmagan — admin panel o‘chirilgan holda qoladi.',
  )
}

function adminBearer(req) {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}

app.post('/api/admin/login', async (req, res) => {
  const username = String(req.body?.username ?? '')
  const blocked = rateLimitAny([
    ['adminLogin:' + req.ip, RATE_LIMITS.adminLogin],
    ['adminLoginAcct:' + username.toLowerCase().slice(0, 64), RATE_LIMITS.adminLoginAccount],
  ])
  if (blocked) return blockTooMany(res, blocked.wait)
  if (!ADMIN_CONFIGURED) {
    // Sozlanmagan holatda "not configured" va "wrong password" bir xil
    // ko'rinadi — aks holda admin env'i yo'qligini aniqlash mumkin bo'lardi.
    return res.status(401).json({ error: 'Foydalanuvchi nomi yoki parol xato.' })
  }
  const password = String(req.body?.password ?? '')
  // Ikkalasini ham doimiy vaqtli taqqoslash (eski `===` uzunlikni oshkor qilardi)
  const userOk = constantTimeEqual(username, ADMIN_USER)
  const passOk = constantTimeEqual(password, ADMIN_PASS)
  if (userOk && passOk) {
    const token = makeToken()
    // Xotirada faqat token imzosi saqlanadi — xom token hech qayerda turmaydi
    adminTokens.set(tokenRef(token), Date.now())
    return res.json({ token })
  }
  res.status(401).json({ error: 'Foydalanuvchi nomi yoki parol xato.' })
})

app.post('/api/admin/logout', async (req, res) => {
  const token = adminBearer(req)
  if (token) adminTokens.delete(tokenRef(token))
  res.json({ ok: true })
})

app.get('/api/dashboard', async (req, res) => {
  const token = adminBearer(req)
  const ref = token ? tokenRef(token) : ''
  // Admin sessiyasi ham muddati bilan cheklangan (avval umr bo'yi yashirdi)
  if (!token || !adminTokens.has(ref) || Date.now() - adminTokens.get(ref) > ADMIN_SESSION_TTL) {
    if (ref) adminTokens.delete(ref)
    return res.status(401).json({ error: 'Admin kirishi talab qilinadi.' })
  }
  adminTokens.set(ref, Date.now())
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
    if (m.audio) base.audio = m.audio
    if (m.audio_duration) base.audioDuration = Number(m.audio_duration)
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
        `SELECT id, sender_id AS from, text, image, audio, audio_duration, time, seal_until FROM messages WHERE thread_id = $1 ORDER BY id`,
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
      `SELECT id, sender_id AS from, text, image, audio, audio_duration, time, seal_until FROM messages WHERE thread_id = $1 ORDER BY id`,
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
  const audio = String(req.body?.audio ?? '').trim()
  if (!text && !image && !audio) return res.status(400).json({ error: "Xabar bo'sh bo'lishi mumkin emas." })
  try {
    const { rows } = await pool.query(
      `SELECT * FROM threads WHERE id = $1 AND (member_a = $2 OR member_b = $2)`,
      [id, req.user.id],
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Suhbat topilmadi.' })
    const mid = Date.now()
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const seal = Number(req.body?.sealUntil) || null
    const rawDur = Number(req.body?.audioDuration)
    const dur = audio && Number.isFinite(rawDur) && rawDur > 0 ? Math.round(rawDur * 100) / 100 : null
    await pool.query(
      `INSERT INTO messages (id, thread_id, sender_id, text, image, audio, audio_duration, time, seal_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [mid, id, req.user.id, text, image, audio, dur, time, seal],
    )
    // DM rasmi/ovozi faqat suhbat a'zolariga ko'rinadi
    await scopePrivateMedia([image, audio].filter(Boolean), 'dm', id, req.user.id)
    const peerId = Number(rows[0].member_a) === req.user.id ? Number(rows[0].member_b) : Number(rows[0].member_a)
    await insertNotification(peerId, req.user, {
      kind: 'message',
      threadId: id,
      body: audio ? '' : text.slice(0, 120),
      hasAudio: !!audio,
    })
    const out = { id: mid, from: req.user.id, text, time }
    if (image) out.image = image
    if (audio) out.audio = audio
    if (dur) out.audioDuration = dur
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
    if (kind === 'ring') {
      const callee = to || (Number(rows[0].member_a) === Number(req.user.id) ? Number(rows[0].member_b) : Number(rows[0].member_a))
      await insertNotification(callee, req.user, {
        kind: 'call',
        threadId: id,
        callKind: String(payload?.kind ?? 'video'),
      })
    }
    if (kind === 'hangup' || kind === 'decline') {
      await closeCallNotifications({ threadId: id, from: req.user.id, selfId: req.user.id })
    }
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
    `SELECT id, sender_id, text, image, audio, audio_duration, time, seal_until FROM group_messages WHERE group_id = $1 ORDER BY id`,
    [g.id],
  )
  const messages = msgs.map((m) => {
    const base = { id: m.id, from: m.sender_id, text: m.text, time: m.time }
    const sender = memberById.get(m.sender_id)
    if (sender) base.sender = sender
    if (m.image) base.image = m.image
    if (m.audio) base.audio = m.audio
    if (m.audio_duration) base.audioDuration = Number(m.audio_duration)
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
    const audio = typeof req.body?.audio === 'string' ? req.body.audio : ''
    if (!text && !image && !audio) return res.status(400).json({ error: "Xabar bo'sh bo'lishi mumkin emas." })
    const mid = Date.now()
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const seal = Number(req.body?.sealUntil) || null
    const rawDur = Number(req.body?.audioDuration)
    const dur = audio && Number.isFinite(rawDur) && rawDur > 0 ? Math.round(rawDur * 100) / 100 : null
    await pool.query(
      `INSERT INTO group_messages (id, group_id, sender_id, text, image, audio, audio_duration, time, seal_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [mid, id, req.user.id, text, image, audio, dur, time, seal],
    )
    // Guruhga biriktirilgan media faqat guruh a'zolariga ko'rinadi
    await scopePrivateMedia([image, audio].filter(Boolean), 'group', id, req.user.id)
    const { rows: members } = await pool.query(`SELECT user_id FROM group_members WHERE group_id = $1`, [id])
    for (const m of members) {
      await insertNotification(Number(m.user_id), req.user, {
        kind: 'group',
        groupId: id,
        body: audio ? '' : text.slice(0, 120),
        hasAudio: !!audio,
        hasImage: !!image,
      })
    }
    const out = { id: mid, from: req.user.id, sender: { id: req.user.id, name: req.user.name, username: req.user.username, avatar: req.user.avatar ?? '' }, text, time }
    if (image) out.image = image
    if (audio) out.audio = audio
    if (dur) out.audioDuration = dur
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
    if (kind === 'ring') {
      const { rows: members } = await pool.query(`SELECT user_id FROM group_members WHERE group_id = $1`, [id])
      for (const m of members) {
        if (Number(m.user_id) === Number(req.user.id)) continue
        await insertNotification(Number(m.user_id), req.user, {
          kind: 'call',
          groupId: id,
          callKind: String(payload?.kind ?? 'video'),
        })
      }
    }
    if (kind === 'hangup' || kind === 'decline') {
      await closeCallNotifications({ groupId: id, from: req.user.id, selfId: req.user.id })
    }
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

const MEDIA_LIMITS = { image: 8 * 1024 * 1024, video: 40 * 1024 * 1024, audio: 12 * 1024 * 1024 }
  const MEDIA_MIME = {
    'image/jpeg': 'image',
    'image/png': 'image',
    'image/webp': 'image',
    'image/gif': 'image',
    'video/mp4': 'video',
    'video/webm': 'video',
    'audio/webm': 'audio',
    'audio/ogg': 'audio',
    'audio/mp4': 'audio',
    'audio/mpeg': 'audio',
    'audio/wav': 'audio',
    'audio/x-m4a': 'audio',
  }
  const MEDIA_EXT = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/x-m4a': 'm4a',
  }

function isSafeMediaId(id) {
  const s = String(id ?? '')
  return s.length > 0 && s.length <= 120 && !s.includes('..') && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s)
}

/* Media ko'rinishi: 'public' — imzoli havola orqali (yoki autentifikatsiya
   bilan eski imzosiz havolalar); 'dm'/'group' — faqat suhbat yoki guruh
   a'zolari. Bunday faylni ID'ni taxmin qilib olish mumkin emas. */
async function mediaViewerAllowed(scope, refId, ownerId, req) {
  const h = req?.headers?.authorization ?? ''
  const bearer = h.startsWith('Bearer ') ? h.slice(7).trim() : ''
  if (!bearer) return false
  const ref = tokenRef(bearer)
  const { rows: sRows } = await pool.query(
    `SELECT u.id FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND (s.expires_at IS NULL OR s.expires_at > now())`,
    [ref],
  )
  const meId = sRows[0]?.id
  if (meId === undefined || meId === null) return false
  if (scope === 'dm') {
    if (!refId) return Number(ownerId) === Number(meId)
    const { rows } = await pool.query(
      `SELECT 1 FROM threads WHERE id = $1 AND (member_a = $2 OR member_b = $2)`,
      [refId, meId],
    )
    return rows.length > 0
  }
  if (scope === 'group') {
    if (!refId) return Number(ownerId) === Number(meId)
    const { rows } = await pool.query(
      `SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [refId, meId],
    )
    return rows.length > 0
  }
  return true
}

/* Xabar/guruhga biriktirilganda media'ni shu suhbatga "bog'laydi" — mijoz
   `scope: 'public'` deb yuborsa ham, fayl faqat a'zolarga ko'rinadi. */
async function scopePrivateMedia(values, scope, refId, ownerId) {
  for (const v of values) {
    const id = mediaPathOf(v)
    if (!id || !isSafeMediaId(id)) continue
    try {
      await pool.query(
        `UPDATE doppi_media SET scope = $1, ref_id = $2, owner_id = $3 WHERE id = $4`,
        [scope, refId ? Number(refId) : null, ownerId, id],
      )
    } catch (e) {
      console.error(`[media] scope yangilanmadi (${id}):`, e?.message ?? e)
    }
  }
}

app.get('/api/media/:id', async (req, res) => {
  const { id } = req.params
  if (!isSafeMediaId(id)) return res.status(400).json({ error: 'Noto‘g‘ri fayl nomi.' })
  try {
    const { rows } = await pool.query(
      'SELECT mime, bytes, scope, ref_id, owner_id FROM doppi_media WHERE id = $1',
      [id],
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Fayl topilmadi.' })
    const row = rows[0]
    const scope = String(row.scope ?? 'public')
    const sig = String(req.query.s ?? req.query.signature ?? '')
    if (scope !== 'public') {
      // Shaxsiy media: URL'ni ko'chirib olsa ham, faqat suhbat/guruh
      // a'zolari ochishi mumkin. IMZO bu yerda o'ynab bo'lmaydi — imzo
      // faqat ochiq fayllar uchun.
      const allowed = await mediaViewerAllowed(scope, row.ref_id, row.owner_id, req)
      if (!allowed) return res.status(401).json({ error: 'Ruxsat yo‘q. Avval tizimga kiring.' })
    } else if (!mediaSignatureValid(id, sig)) {
      // Ochiq media: imzo yo'q bo'lsa eski (imzosiz) havolalar uchun
      // autentifikatsiya yetarli
      const allowed = await mediaViewerAllowed(scope, row.ref_id, row.owner_id, req)
      if (!allowed) return res.status(401).json({ error: 'Ruxsat yo‘q. Avval tizimga kiring.' })
    }
    const bytes = Buffer.isBuffer(row.bytes) ? row.bytes : Buffer.from(row.bytes)
    res.setHeader('Content-Type', row.mime || 'application/octet-stream')
    res.setHeader('Content-Length', String(bytes.length))
    // Shaxsiy fayllar keshga tushmasin (brauzer keshi orqali sizib chiqmasin)
    res.setHeader(
      'Cache-Control',
      scope === 'public' ? 'private, max-age=31536000, immutable' : 'private, no-store',
    )
    res.end(bytes)
  } catch (e) {
    console.error('[media:get]', e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/media', authMiddleware, async (req, res) => {
  const mediaWait = rateLimit('media:' + req.user.id, RATE_LIMITS.media)
  if (mediaWait) return blockTooMany(res, mediaWait)
  const dataUrl = String(req.body?.dataUrl ?? '').trim()
  const m = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(dataUrl)
  if (!m) return res.status(400).json({ error: 'dataUrl formati noto‘g‘ri.' })
  const mime = m[1].toLowerCase()
  const kind = MEDIA_MIME[mime]
  if (!kind) return res.status(415).json({ error: `Bu fayl turi qabul qilinmaydi: ${mime}` })
  const bytes = Buffer.from(m[2], 'base64')
  if (!bytes.length) return res.status(400).json({ error: 'Fayl bo‘sh.' })
  if (bytes.length > MEDIA_LIMITS[kind]) {
    const mb = Math.round((MEDIA_LIMITS[kind] / (1024 * 1024)) * 10) / 10
    return res.status(413).json({ error: `Fayl hajmi katta (${mb} MB dan oshmasligi kerak).` })
  }
  const id = `${Date.now().toString(36)}${crypto.randomBytes(6).toString('hex')}.${MEDIA_EXT[mime]}`
  // Mijoz aytgan scope'ga ishonmaymiz: 'dm'/'group' uchun havolani
  // xabar yuborilganda `scopePrivateMedia` bilan qayta bog'lanadi.
  const askedScope = String(req.body?.scope ?? '').trim()
  const scope = askedScope === 'dm' || askedScope === 'group' ? askedScope : 'public'
  const refId = askedScope === 'dm' || askedScope === 'group' ? Number(req.body?.refId) || null : null
  try {
    await pool.query(
      `INSERT INTO doppi_media (id, mime, size, bytes, scope, ref_id, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET mime = EXCLUDED.mime, size = EXCLUDED.size,
         bytes = EXCLUDED.bytes, scope = EXCLUDED.scope, ref_id = EXCLUDED.ref_id, owner_id = EXCLUDED.owner_id`,
      [id, mime, bytes.length, bytes, scope, refId, req.user.id],
    )
    // Ochiq media imzoli URL bilan qaytariladi: ID'ni taxmin qilib
    // boshqalarning faylini yuklab bo'lmaydi.
    res.status(201).json({ id, url: signedMediaPath(id), mime, kind, size: bytes.length })
  } catch (e) {
    console.error('[media:upload]', e)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/media/gc', async (req, res) => {
  const token = adminBearer(req)
  if (!token || !adminTokens.has(token)) return res.status(403).json({ error: 'Faqat admin uchun.' })
  try {
    const { rows: refRows } = await pool.query(
      `SELECT DISTINCT (regexp_matches(txt, '/api/media/([A-Za-z0-9][A-Za-z0-9._-]*)', 'g'))[1] AS id
       FROM (
         SELECT images::text AS txt FROM posts
         UNION ALL SELECT video::text FROM posts
         UNION ALL SELECT image::text FROM stories
         UNION ALL SELECT image::text FROM reels
         UNION ALL SELECT photos::text FROM albums
         UNION ALL SELECT cover::text FROM "groups"
         UNION ALL SELECT avatar::text FROM users
         UNION ALL SELECT image::text FROM messages
         UNION ALL SELECT image::text FROM group_messages
       ) s
       WHERE txt LIKE '%/api/media/%'`,
    )
    const used = new Set(refRows.map((r) => r.id).filter(Boolean))
    const { rows: allRows } = await pool.query('SELECT id FROM doppi_media')
    const orphans = allRows.map((r) => r.id).filter((id) => !used.has(id))
    let removed = 0
    for (const id of orphans) {
      await pool.query('DELETE FROM doppi_media WHERE id = $1', [id])
      removed++
    }
    res.json({ removed, kept: allRows.length - orphans.length, scanned: allRows.length })
  } catch (e) {
    console.error('media gc xatosi:', e.message)
    res.status(500).json({ error: 'Server xatosi.' })
  }
})

app.post('/api/media/migrate', async (req, res) => {
  const token = adminBearer(req)
  if (!token || !adminTokens.has(token)) return res.status(403).json({ error: 'Faqat admin uchun.' })
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50))
  const MEDIA_COLUMNS = [
    { table: 'posts', column: 'images', json: true },
    { table: 'posts', column: 'video', json: false },
    { table: 'stories', column: 'image', json: false },
    { table: 'reels', column: 'image', json: false },
    { table: 'albums', column: 'photos', json: true },
    { table: 'groups', column: 'cover', json: false },
    { table: 'users', column: 'avatar', json: false },
    { table: 'messages', column: 'image', json: false },
    { table: 'messages', column: 'audio', json: false },
    { table: 'group_messages', column: 'image', json: false },
    { table: 'group_messages', column: 'audio', json: false },
  ]
  const DATA_URL_RE = /data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)/gi
  const stored = new Map() // dataUrl -> /api/media/<id>
  let migrated = 0
  let skipped = 0
  let bytes = 0

  try {
    for (const col of MEDIA_COLUMNS) {
      const { rows } = await pool.query(
        `SELECT id, ${col.column}::text AS txt FROM ${col.table}
         WHERE ${col.column}::text LIKE '%;base64,%'
         LIMIT 500`,
      )
      for (const row of rows) {
        if (!row.txt) continue
        const params = [row.id]
        let expr = `${col.column}::text`
        let touched = false
        for (const match of row.txt.matchAll(DATA_URL_RE)) {
          const dataUrl = match[0]
          if (stored.has(dataUrl)) {
            // already uploaded in this run
          } else if (migrated + skipped >= limit) {
            continue
          } else {
            const mime = match[1].toLowerCase()
            const kind = MEDIA_MIME[mime]
            const buf = Buffer.from(match[2], 'base64')
            if (!kind || !buf.length || buf.length > MEDIA_LIMITS[kind]) {
              skipped++
              continue
            }
            const id = `${Date.now().toString(36)}${crypto.randomBytes(6).toString('hex')}.${MEDIA_EXT[mime]}`
            await pool.query(
              `INSERT INTO doppi_media (id, mime, size, bytes) VALUES ($1, $2, $3, $4)
               ON CONFLICT (id) DO UPDATE SET bytes = EXCLUDED.bytes`,
              [id, mime, buf.length, buf],
            )
            stored.set(dataUrl, signedMediaPath(id))
            bytes += buf.length
            migrated++
          }
          const url = stored.get(dataUrl)
          if (!url) continue
          params.push(dataUrl, url)
          expr = `replace(${expr}, $${params.length - 1}, $${params.length})`
          touched = true
        }
        if (!touched) continue
        const cast = col.json ? '::jsonb' : ''
        await pool.query(`UPDATE ${col.table} SET ${col.column} = ${expr}${cast} WHERE id = $1`, params)
      }
    }
    res.json({ migrated, skipped, remaining: 0, bytes })
  } catch (e) {
    console.error('media migrate xatosi:', e.message)
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