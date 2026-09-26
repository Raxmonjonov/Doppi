/* Demo/seed ma'lumotini PostgreSQL'dan chiqaradi.
   XAVFSIZLIK: bu skript ilgari (a) parol hash+salt, (b) LIVE sessiya
   tokenlari va (c) email'larni faylga yozib, uni `netlify/functions/` ichiga
   qo'yar edi — ya'ni fayl Netlify bundle'ga tushib, `git`ga ham kiritilgan
   bo'lishi mumkin edi. Sessiya tokeni bilan kuzatilgan fayl = to'liq
   hisobni egallash.

   YANGI: sessiyalar va parol hech qachon eksport qilinmaydi, fayl
   `.gitignore` dagi `seed.local.json` ga yoziladi, ulanish `DATABASE_URL`
   dan olinadi va production'da skript to'liq rad etiladi. */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

if (process.env.NODE_ENV === 'production') {
  console.error('[xavfsizlik] Seed eksporti production muhitida taqiqlangan.')
  process.exit(1)
}

const { Pool, types } = pg
types.setTypeParser(types.builtins.INT8, (v) => (v === null ? null : Number(v)))
types.setTypeParser(types.builtins.INT4, (v) => (v === null ? null : Number(v)))
types.setTypeParser(types.builtins.BOOL, (v) => (v === null ? null : v === true || v === 't'))

const DATABASE_URL = String(process.env.DATABASE_URL ?? '').trim()
if (!DATABASE_URL) {
  console.error('[xavfsizlik] DATABASE_URL belgilanmagan (localhost uchun PG boshqa o‘zgaruvchilar).')
  process.exit(1)
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: false } : undefined,
})

const q = async (sql, params = []) => {
  const { rows } = await pool.query(sql, params)
  return rows
}

const doc = {
  users: [],
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

/* `salt`/`hash` ataylab chiqariladi: seed fayli hech qachon parol
   qaytarib bermasligi kerak. Demo foydalanuvchilar `ALLOW_SEED=1` bilan
   alohida qo'lda yaratiladi. */
doc.users = await q(`SELECT id, name, username, email, avatar, about,
  created_at AS "createdAt" FROM users ORDER BY id`)
doc.posts = await q(`SELECT id, author_id AS "authorId", time, text, images, video, live FROM posts ORDER BY id`)
doc.postLikes = await q(`SELECT post_id AS "postId", user_id AS "userId" FROM post_likes`)
doc.postComments = await q(`SELECT id, post_id AS "postId", author_id AS "authorId", text, time FROM post_comments ORDER BY id`)
doc.postShares = await q(`SELECT post_id AS "postId", user_id AS "userId" FROM post_shares`)
doc.reelShares = await q(`SELECT reel_id AS "reelId", user_id AS "userId" FROM reel_shares`)

const uniqueBy = (arr, key) => {
  const seen = new Set()
  return arr.filter((x) => {
    const k = key(x)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
doc.postShares = uniqueBy(doc.postShares, (x) => `${x.postId}:${x.userId}`)
doc.reelShares = uniqueBy(doc.reelShares, (x) => `${x.reelId}:${x.userId}`)
doc.storyViews = uniqueBy(doc.storyViews, (x) => `${x.storyId}:${x.userId}`)
doc.stories = await q(`SELECT id, author_id AS "authorId", image FROM stories ORDER BY id`)
doc.storyViews = await q(`SELECT story_id AS "storyId", user_id AS "userId" FROM story_views`)
doc.reels = await q(`SELECT id, author_id AS "authorId", image, caption, sound, view_mode AS "viewMode" FROM reels ORDER BY id`)
doc.reelLikes = await q(`SELECT reel_id AS "reelId", user_id AS "userId" FROM reel_likes`)
doc.reelComments = await q(`SELECT id, reel_id AS "reelId", author_id AS "authorId", text, time FROM reel_comments ORDER BY id`)
doc.reelShares = await q(`SELECT reel_id AS "reelId", user_id AS "userId" FROM reel_shares`)
doc.albums = await q(`SELECT id, title, photos FROM albums ORDER BY id`)
doc.albumLikes = await q(`SELECT album_id AS "albumId", user_id AS "userId" FROM album_likes`)
doc.threads = await q(`SELECT id, member_a AS "memberA", member_b AS "memberB" FROM threads ORDER BY id`)
doc.messages = await q(`SELECT id, thread_id AS "threadId", sender_id AS "senderId", text, time FROM messages ORDER BY id`)
doc.groups = await q(`SELECT id, name, cover, joined, created_by AS "createdBy" FROM groups ORDER BY id`)
doc.follows = await q(`SELECT follower_id AS "followerId", followee_id AS "followeeId" FROM follows`)

await pool.end()

/* Natija `netlify/functions/` ga EMAS, gitignore qilingan lokal faylga
   yoziladi — avvalgi manzil faylni Netlify bundle'iga kiritib yuborardi. */
const outPath = process.env.SEED_OUT
  ? path.resolve(process.env.SEED_OUT)
  : path.join(__dirname, '..', 'netlify', 'lib', 'seed.local.json')
const dir = path.dirname(outPath)
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(doc, null, 2), 'utf8')

const total = Object.entries(doc).reduce((sum, [, arr]) => sum + arr.length, 0)
console.log(`Seed yozildi: ${outPath} (${total} satr)`)
for (const [k, arr] of Object.entries(doc)) {
  if (arr.length > 0) console.log(`  ${k}: ${arr.length}`)
}