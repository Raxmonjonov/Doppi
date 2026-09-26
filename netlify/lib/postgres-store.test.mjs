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
