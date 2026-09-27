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

const { failed } = await runSuite(makeStore(), 'postgres-store (real Postgres via neon-shim)')

await client.query('DROP TABLE IF EXISTS doppi_doc')
await client.query('DROP TABLE IF EXISTS doppi_media')
await client.end()
process.exit(failed > 0 ? 1 : 0)
