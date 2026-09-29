/* postgres-store functional test.
   Netlify'da DATABASE_URL bo'lsa shu store ishlatiladi (Neon HTTP). Neon faqat HTTP
   ishlaydi, shuning uchun neon() o'rniga shu yerda local Postgres'ga ulanuvchi
   `sql` shim qo'llanadi: neon'ning tegma-template semantikasi (qatorlar + $n
   qiymatlar -> natija massivi) emulyatsiya qilinadi, SQL esa haqiqiy Postgres'da
   bajariladi. Shu bilan doppi_doc jadvali, jsonb cast va ON CONFLICT SQL'i
   tekshiriladi. */
import './test-env.mjs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { emptyDoc } from './api-core.mjs'
import { createPostgresStore } from './postgres-store.mjs'
import { createBlobsStore } from './blobs-store.mjs'
import { runSuite } from './test-suite.mjs'

/* pg lives in server/node_modules — load it from the server context (no new deps) */
const here = dirname(fileURLToPath(import.meta.url))
let Client
try {
  const require = createRequire(join(here, '..', '..', 'server', 'index.js'))
  Client = require('pg').Client
} catch (e) {
  console.log('\n=== postgres-store ===\nSKIP: pg topilmadi (server/node_modules ga qarang):', e.message)
  process.exit(0)
}

const CONN = {
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || "Do'ppi",
}

const client = new Client(CONN)

/* neon()-compatible tagged template over node-postgres */
function makeSql() {
  return async function sql(strings, ...values) {
    const text = strings.reduce((acc, part, i) => {
      const chunk = i === 0 ? part : `$${i}${part}`
      return acc + chunk
    }, '')
    const res = await client.query(text, values)
    return res.rows
  }
}

try {
  await client.connect()
} catch (e) {
  console.log(`\n=== postgres-store ===\nSKIP: Postgresga ulanib bo'lmadi (${e.message})`)
  process.exit(0)
}

/* Xavfsizlik: bu test HAQIQIY baza jadvallarini DROP qiladi, va `PGDATABASE`
   berilmasa sukut bo'yicha "Do'ppi" (loyihaning mahalliy ishlab chiqarish
   bazasi) ochiladi. Ya'ni `npm run test:pg-store` odatda ishlab chiqarish
   ma'lumotini o'chiradi.

   Shuning uchun avval jadvallar mavjudligi va satrlar sonini tekshiramiz.
   Agar baza bo'sh bo'lmasa, testni to'xtatamiz: foydalanuvchi ma'lumotini
   o'chirmaslik testdan ko'ra muhimroq. Yo'lni o'zi bo'sh test bazaga
   ko'rsatish mumkin (masalan `PGDATABASE=doppi_test`). */
const REFUSE_MESSAGE =
  `XAVFSIZLIK: "${CONN.database}" bazasi bo'sh emas — bu test jadvallarni ` +
  `DROP qiladi va sizning ma'lumotiringizni o'chirib yuboradi.\n` +
  `  TESTNI TO'XTATDI. Bo'sh test bazasi ko'rsating, masalan:\n` +
  `    $env:PGDATABASE=doppi_test    # PowerShell\n` +
  `    PGDATABASE=doppi_test npm run test:pg-store   # bash\n` +
  `  (yoki haqiqiy ravishda o'chirmoqchi bo'lsangiz, avval zaxira oling.)`

async function assertDatabaseIsSafeToDrop() {
  const exists = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('doppi_doc','doppi_media')`,
  )
  if (exists.rows.length === 0) return // jadvallar yo'q — DROP xavfsiz

  for (const { table_name: table } of exists.rows) {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${table}`)
    if (rows[0].n > 0) {
      console.error(`\n❌ ${REFUSE_MESSAGE}\n   (${table} jadvalida ${rows[0].n} ta qator bor)`)
      await client.end()
      process.exit(1)
    }
  }
}

await assertDatabaseIsSafeToDrop()

await client.query('DROP TABLE IF EXISTS doppi_doc')
await client.query('DROP TABLE IF EXISTS doppi_media')

const makeStore = () => {
  const store = createPostgresStore('unused-by-test', () => Promise.resolve(emptyDoc(Date.now())), makeSql())
  store.relaunch = async () =>
    createPostgresStore('unused-by-test', () => Promise.resolve(emptyDoc(Date.now())), makeSql())
  return store
}

/* @netlify/blobs v11 fake — xuddi blobs-store.test.mjs'dagi siymologiya.
   Memradagi xotira Map, createBlobsStore'da ishlatiladi. */
function fakeBlobStore() {
  const entries = new Map() // key -> { data: Uint8Array | string, metadata }
  const toBytes = async (data) => {
    if (data instanceof Uint8Array) return data
    if (data instanceof ArrayBuffer) return new Uint8Array(data)
    if (typeof data === 'string') return new TextEncoder().encode(data)
    if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer())
    return new Uint8Array(0)
  }
  return {
    entries,
    async set(key, data, options = {}) {
      entries.set(key, { data: await toBytes(data), metadata: options.metadata ?? {} })
      return { etag: `etag-${entries.size}`, modified: true }
    },
    async setJSON(key, value) {
      entries.set(key, { data: new TextEncoder().encode(JSON.stringify(value)), metadata: {} })
    },
    async get(key, options = {}) {
      const e = entries.get(key)
      if (!e) return null
      if (options.type === 'json') return JSON.parse(new TextDecoder().decode(e.data))
      if (options.type === 'arrayBuffer') return e.data.buffer.slice(e.data.byteOffset, e.data.byteOffset + e.data.byteLength)
      return new TextDecoder().decode(e.data)
    },
    async getWithMetadata(key, options = {}) {
      const e = entries.get(key)
      if (!e) return null
      const data = options.type === 'arrayBuffer'
        ? e.data.buffer.slice(e.data.byteOffset, e.data.byteOffset + e.data.byteLength)
        : new TextDecoder().decode(e.data)
      return { data, etag: `etag-${key}`, metadata: e.metadata }
    },
    async getMetadata(key) {
      const e = entries.get(key)
      if (!e) return null
      return { etag: `etag-${key}`, metadata: e.metadata }
    },
    async list({ prefix = '' } = {}) {
      const keys = [...entries.keys()].filter((k) => k.startsWith(prefix))
      return {
        blobs: keys.map((key) => ({ key, etag: `etag-${key}`, size: entries.get(key).data.length })),
        directories: [],
      }
    },
    async delete(key) {
      entries.delete(key)
    },
  }
}

const { failed } = await runSuite(makeStore(), 'postgres-store (real Postgres via neon-shim)')

/* ---------- Blobs'dan Postgres'ga lazy migratsiya ---------- */
await client.query('DROP TABLE IF EXISTS doppi_doc')
await client.query('DROP TABLE IF EXISTS doppi_media')

let mFailed = 0
const mcheck = (name, cond, extra = '') => {
  if (cond) console.log(`    ok   migratsiya: ${name}`)
  else {
    mFailed++
    console.log(`    FAIL migratsiya: ${name}${extra ? ` (${extra})` : ''}`)
  }
}

// Eski ombor "Blobs": foydalanuvchilari bor hujjat + faqat Blobs'da turgan media.
const legacyBlob = fakeBlobStore()
const legacyDoc = emptyDoc(Date.now())
legacyDoc.users.push({ id: 7001, name: 'Eski', username: 'legacy1', email: 'legacy1@test.dev', salt: 's', hash: 'h', avatar: '', about: '', createdAt: '2026-01-01T00:00:00.000Z' })
legacyDoc.lives.push({ id: 9001, ownerId: 7001, title: 'eski efir', status: 'live', startedAt: Date.now(), viewers: [], signals: [] })
await legacyBlob.setJSON('db', legacyDoc)
const legacyMediaId = 'legacy-media.png'
await legacyBlob.set('media/' + legacyMediaId, new Blob([new Uint8Array([10, 20, 30])], { type: 'image/png' }), {
  metadata: { mime: 'image/png', size: '3' },
})
const legacyStore = createBlobsStore(legacyBlob, () => Promise.resolve(emptyDoc(Date.now())))

// Faqat Blobs'da turgan, HECH QAYERGА yozilmagan yana bir fayl: setMediaMeta
// fallback yo'lini alohida tekshirish uchun (getMedia ko'chirishidan avval).
const metaOnlyId = 'legacy-meta-only.png'
await legacyBlob.set('media/' + metaOnlyId, new Blob([new Uint8Array([7])], { type: 'image/png' }), {
  metadata: { mime: 'image/png', size: '1' },
})

const makeMigratingStore = () => {
  const store = createPostgresStore('unused-by-test', () => Promise.resolve(emptyDoc(Date.now())), makeSql(), legacyStore)
  store.relaunch = async () => makeMigratingStore()
  return store
}

const mig = makeMigratingStore()
const mid = await mig.getDoc()
mcheck('getDoc Blobs hujjatini qaytaradi', mid.users?.[0]?.username === 'legacy1' && mid.lives?.[0]?.id === 9001, `users=${mid.users?.length} lives=${mid.lives?.length}`)
const rowsAfterMigrate = await client.query(`SELECT count(*)::int AS n FROM doppi_doc`)
mcheck('hujjat Postgresga ko`chirildi', rowsAfterMigrate.rows[0].n === 1, `n=${rowsAfterMigrate.rows[0].n}`)

// Qayta boshlanish (sovuq start) — endi Postgres'dan o'qiydi, qayta ko'chirmaydi.
const mig2 = makeMigratingStore()
const mid2 = await mig2.getDoc()
mcheck('relaunch xuddi shu hujjatni beradi', mid2.users?.[0]?.username === 'legacy1')
const rowsAfterRelaunch = await client.query(`SELECT count(*)::int AS n FROM doppi_doc`)
mcheck('relaunch qayta ko`chirmaydi (bitta yozuv)', rowsAfterRelaunch.rows[0].n === 1, `n=${rowsAfterRelaunch.rows[0].n}`)

// Faqat Blobs'da turgan media — getMedia uni Postgres'ga ko'chiradi.
const fm = await mig2.getMedia(legacyMediaId)
mcheck('getMedia Blobs media`ni qaytaradi', fm?.bytes?.length === 3 && fm?.mime === 'image/png', `bytes=${fm?.bytes?.length} mime=${fm?.mime}`)
const pgMedia = await client.query(`SELECT id FROM doppi_media WHERE id = $1`, [legacyMediaId])
mcheck('media Postgresga ko`chirildi', pgMedia.rows.length === 1)
const fm2 = await mig2.getMediaMeta(legacyMediaId)
mcheck('getMediaMeta migratsiyada ham ishlaydi', fm2?.scope === 'public', JSON.stringify(fm2))

// Postgres'da HECH QACHON bo'lmagan fayl: setMediaMeta fallback orqali Blobs'ga tushadi.
const scopeRes = await mig2.setMediaMeta(metaOnlyId, { scope: 'group', refId: '5', ownerId: '7001' })
const legacyMeta = await legacyStore.getMediaMeta(metaOnlyId)
mcheck('setMediaMeta Blobs-only media`ga tushadi', scopeRes === true && legacyMeta?.scope === 'group', `res=${scopeRes} scope=${legacyMeta?.scope}`)
const pgMetaOnly = await client.query(`SELECT id FROM doppi_media WHERE id = $1`, [metaOnlyId])
mcheck('setMediaMeta faqat Blobs`da (Postgresga yozmaydi)', pgMetaOnly.rows.length === 0)

// listMedia ikkala ombor fayllarini birlashtiradi.
const allMedia = await mig2.listMedia()
mcheck('listMedia Blobs-only id`larni ham ko`rsatadi', allMedia.includes(legacyMediaId) && allMedia.includes(metaOnlyId), allMedia.join(','))

// deleteMedia ham Postgres, ham Blobs'dan o'chiradi.
const removed = await mig2.deleteMedia([legacyMediaId, metaOnlyId])
mcheck('deleteMedia ikki ombordan ham o`chiradi', removed >= 2 && !legacyBlob.entries.has('media/' + legacyMediaId) && !legacyBlob.entries.has('media/' + metaOnlyId), `removed=${removed}`)

// Butun API suite migratsiya rejimida ham o'tishi kerak (fallback bor).
const { failed: migSuiteFailed } = await runSuite(makeMigratingStore(), 'postgres-store (migration-from-blobs mode)')

await client.query('DROP TABLE IF EXISTS doppi_doc')
await client.query('DROP TABLE IF EXISTS doppi_media')
await client.end()
process.exit(failed + mFailed + migSuiteFailed > 0 ? 1 : 0)
