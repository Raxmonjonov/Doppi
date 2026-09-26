/* Xavfsizlik yordamchilari — ikkala backend (Netlify function va Express)
   shu modulni ishlatadi, shuning uchun xatti-harakat bir xil bo'ladi.

   Bu modul FAQAT server tomonda ishlaydi. Hech qanday maxfiy qiymat
   (SESSION_SECRET, ADMIN_PASSWORD, RESEND_API_KEY, DATABASE_URL ...) mijozga
   yuborilmaydi va `src/` ichiga import qilinmaydi. */
import crypto from 'node:crypto'

/* ---------- Parol kriptografiyasi ---------- */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      String(password),
      salt,
      SCRYPT.keylen,
      { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key)),
    )
  })
}

/* Nodir single-threaded bo'lgani uchun scryptSync butun jarayonni bloklaydi:
   bir nechta parallel urinish server'ni qaytarib turadi. Async variant
   event loop'ni bo'sh qoldiradi. */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = (await scryptAsync(password, salt)).toString('hex')
  return { salt, hash }
}

export async function verifyPassword(password, salt, hash) {
  let expected
  try {
    expected = Buffer.from(String(hash ?? ''), 'hex')
  } catch {
    return false
  }
  // Noto'g'ri uzunlikdagi hash (buzilgan yozuv) tasodifiy 500 bermasligi uchun
  if (expected.length !== SCRYPT.keylen) return false
  const actual = await scryptAsync(password, String(salt ?? ''))
  return crypto.timingSafeEqual(actual, expected)
}

/* Parol siyosati. Eski foydalanuvchilar kamida 4 belgi bilan yaratilgan edi —
   login siyosatni tekshirmaydi, faqat yangi parollar qat'iyroq talab qilinadi. */
export const MIN_PASSWORD_LENGTH = 8

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'passw0rd', '12345678', '123456789',
  '1234567890', 'qwerty123', 'qwertyuiop', 'iloveyou', 'admin123', 'administrator',
  'letmein123', 'welcome123', 'sunshine', 'princess', 'football', 'baseball',
  'trustno1', 'dragon123', 'monkey123', 'shadow123', 'superman', 'qaz123456',
  'o‘zbekiston', 'ozbekiston', 'doppi123', 'doppiadmin', 'salom123', 'parol123',
])

/* Qaytaradi: null (parol qabul qilinadi) yoki xatolik matni. */
export function passwordProblem(password, { username = '', email = '' } = {}) {
  const pw = String(password ?? '')
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return `Parol kamida ${MIN_PASSWORD_LENGTH} belgidan iborat bo'lishi kerak.`
  }
  if (pw.length > 512) return 'Parol juda uzun.'
  const low = pw.toLowerCase()
  if (COMMON_PASSWORDS.has(low)) return 'Bu parol juda keng tarqalgan — boshqasini tanlang.'
  const un = String(username ?? '').trim().toLowerCase()
  const em = String(email ?? '').split('@')[0].trim().toLowerCase()
  // "alisher123" -> foydalanuvchi nomi yoki emailning o'zi parol bo'lmasligi kerak
  if (un.length >= 3 && low.includes(un)) return "Parol foydalanuvchi nomini o'z ichiga olmasligi kerak."
  if (em.length >= 3 && low.includes(em)) return "Parol emailning o'zini o'z ichiga olmasligi kerak."
  if (/^(.)\1+$/.test(pw)) return "Parol bitta belgidan iborat bo'lsa, boshqasini tanlang."
  return null
}

/* ---------- Doimiy vaqtli taqqoslash (timing-safe) ---------- */

export function constantTimeEqual(a, b) {
  const ab = Buffer.from(String(a ?? ''), 'utf8')
  const bb = Buffer.from(String(b ?? ''), 'utf8')
  // turli uzunlikni ham oshkor qilmaslik uchun avnol hash'laymiz
  if (ab.length !== bb.length) {
    crypto.timingSafeEqual(ab, ab)
    return false
  }
  return crypto.timingSafeEqual(ab, bb)
}

/* ---------- Server-side maxfiy kalit ---------- */

let ephemeralSecret = null

/* Ishlab chiqarishda SESSION_SECRET majburiy. Berilmasa jarayon davomida
   tasodifiy kalit yaratiladi — bu holatda qayta ishga tushgandan keyin eski
   sessiyalar va media imzolari bekor bo'ladi (local ishlash uchun qulay). */
export function serverSecret() {
  const fromEnv = String(process.env.SESSION_SECRET ?? '').trim()
  if (fromEnv.length >= 16) return fromEnv
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SESSION_SECRET production uchun majburiy (Kamida 16 belgi). ' +
        'Netlify va server sozlamalarida tasodifiy uzun qiymat qo‘ying.',
    )
  }
  if (!ephemeralSecret) ephemeralSecret = crypto.randomBytes(32).toString('hex')
  return ephemeralSecret
}

/* Sessiya tokeni koding imzosi bilan saqlansin, shunda baza/kalendar sizib
   chiqsa ham foydalanuvchi tokeni ishlatib bo'lmaydi. */
export function tokenRef(token) {
  return crypto.createHmac('sha256', serverSecret()).update(`tok:${String(token ?? '')}`).digest('hex')
}

/* Sessiya tekshiruvi.
   OD: bazadagi qiymat xom token bilan solishtirilardi — baza sizib chiqsa
   (gitga tushgan `db.json`/`seed.json` shunday) sizibchi darhol kirish olardi.
   YANGI: odatda faqat HMAC imzosi qabul qilinadi, xom eski sessiyalar
   rad etiladi. `ALLOW_LEGACY_SESSIONS=1` faqat lokal migratsiya uchun. */
export function sessionMatches(row, token) {
  if (!row || !token) return false
  const stored = String(row.token ?? '')
  if (!stored) return false
  if (stored.length === 64 && /^[0-9a-f]{64}$/.test(stored)) {
    return constantTimeEqual(stored, tokenRef(token))
  }
  if (String(process.env.ALLOW_LEGACY_SESSIONS ?? '') === '1' && stored === String(token)) return true
  return false
}

export function makeToken() {
  return crypto.randomBytes(32).toString('hex')
}

/* ---------- Media imzosi ---------- */

/* Media id'lariga HMAC imzo qo'shamiz: tasodifiy deb taxmin qilinmaydi va
   URL'ni o'zgartirib boshqa faylni ko'rsatib bo'lmaydi. */
export function mediaSignature(id) {
  return crypto.createHmac('sha256', serverSecret()).update(`media:${String(id ?? '')}`).digest('hex').slice(0, 32)
}

export function mediaSignatureValid(id, signature) {
  return constantTimeEqual(mediaSignature(id), String(signature ?? ''))
}

export function signedMediaPath(id) {
  return `/api/media/${id}?s=${mediaSignature(id)}`
}

/* Eski (imzosiz) havolalar ham qabul qilinadi, lekin faqat autentifikatsiya
   bilan — shu bilan birga'likda ochiq bo'lib qolmaydi. */
export function mediaPathOf(value) {
  const m = /^\/api\/media\/([A-Za-z0-9][\w.-]*)/.exec(String(value ?? ''))
  return m ? m[1] : null
}

export function mediaSignatureOf(value) {
  const m = /[?&]s=([0-9a-f]{32})/.exec(String(value ?? ''))
  return m ? m[1] : null
}

/* ---------- Rate limit / credential stuffing ---------- */

/* Ikki darajali hisob: IP bo'yicha VA hisob bo'yicha. Hisob bo'yicha
   limiter IP ni o'zgartirish yoki X-Forwarded-For ni soxtalash orqali
   chetlab o'tib bo'lmaydi — credential stuffing ning asosiy hujumi shu. */
export const RATE_LIMITS = {
  login: { max: 10, windowMs: 15 * 60 * 1000 },
  loginAccount: { max: 10, windowMs: 15 * 60 * 1000 },
  adminLogin: { max: 10, windowMs: 15 * 60 * 1000 },
  adminLoginAccount: { max: 5, windowMs: 15 * 60 * 1000 },
  register: { max: 10, windowMs: 60 * 60 * 1000 },
  forgot: { max: 5, windowMs: 15 * 60 * 1000 },
  forgotAccount: { max: 3, windowMs: 60 * 60 * 1000 },
  reset: { max: 10, windowMs: 15 * 60 * 1000 },
  media: { max: 120, windowMs: 60 * 60 * 1000 },
  write: { max: 300, windowMs: 60 * 60 * 1000 },
}

const buckets = new Map()

function sweep(now) {
  if (buckets.size < 1000) return
  for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k)
}

/* Qaytaradi: null (ruxsat) yoki qolgan soniyalar (429). */
export function rateLimit(key, limit) {
  const now = Date.now()
  sweep(now)
  const bucket = buckets.get(key)
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + limit.windowMs })
    return null
  }
  bucket.count++
  if (bucket.count > limit.max) return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
  return null
}

/* Bitta so'rovda bir nechta limitni tekshiradi. Birinchi bloklashuvchi
   qaytariladi (va qaysi biri ekani loglanadi). */
export function rateLimitAny(checks) {
  for (const [key, limit] of checks) {
    const wait = rateLimit(key, limit)
    if (wait) return { wait, key }
  }
  return null
}

/* Testlar va boshqa modullar uchun (jarayon ichidagi holatni tozalash). */
export function resetRateLimits() {
  buckets.clear()
}

/* ---------- Xavfsizlik sarlavhalari ---------- */

export function securityHeaders({ isHtml = false, isStatic = false } = {}) {
  const h = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(self), camera=(self), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  }
  if (isStatic) {
    // Build chiqarilgan fayllar — immutable, lekin index.html emas
    return h
  }
  // API hisoblagi hech qachon brauzerda render qilinmasligi kerak:
  // JSON'ni sayfaga tushsa XSS oynasi ochiladi.
  h['Content-Security-Policy'] = isHtml
    // `accounts.google.com` OLDIN skript manbai sifatida ochiq edi (GSI
    // ishlatilgan paytda). Endi mijozda Google Identity yo'q, shuning uchun
    // bu origin olib tashlandi — injeksiya qilingan Google skripti
    // yuklanmaydi. Shrift stillari `fonts.googleapis.com` dan olinadi
    // (faqat style/font, skript emas).
    ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; media-src 'self' data: blob:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
    : "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; sandbox"
  h['X-XSS-Protection'] = '0'
  return h
}

/* ---------- Boshqa kichik yordamchilar ---------- */

/* Ismdan foydalanuvchini ro'yxatdan o'tkazishda oshkor qilmaslik uchun. */
export function normalizeIdentity(value) {
  return String(value ?? '').trim().toLowerCase().slice(0, 254)
}

/* Avatar — foydalanuvchi kiritadigan erkin satr. Faqat xavfsiz shakllarga
   yo'naltiriladi: `javascript:` kabi sxemaning `<img src>` da ishlashining
   o'rniga bo'sh qaytariladi. */
export function sanitizeAvatar(value) {
  const s = String(value ?? '').trim().slice(0, 600)
  if (!s) return ''
  if (s.startsWith('/api/media/')) return s
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(s)) return s
  if (/^https:\/\//i.test(s)) return s
  return ''
}

export function safeEqual(a, b) {
  return constantTimeEqual(a, b)
}

export { crypto }
