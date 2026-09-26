/* api-core functional test — file-backed store.
   Doc is emulated by a JSON file; media by binary files under a directory,
   which is the closest local equivalent of Netlify Blobs (keyed binary). */
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { emptyDoc, handleRequest, SESSION_TTL } from './api-core.mjs'
import { runSuite } from './test-suite.mjs'

const FILE = process.env.HARNESS_FILE || join(tmpdir(), 'doppi-api-core-test-store.json')
const MEDIA_DIR = process.env.HARNESS_MEDIA_DIR || join(tmpdir(), 'doppi-api-core-test-media')

if (existsSync(FILE)) rmSync(FILE)
rmSync(MEDIA_DIR, { recursive: true, force: true })
mkdirSync(MEDIA_DIR, { recursive: true })
writeFileSync(FILE, JSON.stringify(emptyDoc(Date.now())))

function makeStore() {
  return {
    async getDoc() {
      if (!existsSync(FILE)) return undefined
      return JSON.parse(readFileSync(FILE, 'utf8'))
    },
    async saveDoc(doc) {
      writeFileSync(FILE, JSON.stringify(doc))
    },
    async putMedia(id, mime, bytes) {
      writeFileSync(join(MEDIA_DIR, id), Buffer.from(bytes))
    },
    async getMedia(id) {
      const p = join(MEDIA_DIR, id)
      if (!/^[A-Za-z0-9][\w.-]*$/.test(id) || id.includes('..') || !existsSync(p)) return null
      return { bytes: new Uint8Array(readFileSync(p)), mime: 'image/png' }
    },
    async listMedia() {
      if (!existsSync(MEDIA_DIR)) return []
      return readdirSync(MEDIA_DIR)
    },
    async deleteMedia(ids) {
      let removed = 0
      for (const id of ids) {
        if (!/^[A-Za-z0-9][\w.-]*$/.test(id) || id.includes('..')) continue
        const p = join(MEDIA_DIR, id)
        if (!existsSync(p)) continue
        rmSync(p, { force: true })
        removed++
      }
      return removed
    },
  }
}

const store = makeStore()
store.relaunch = async () => makeStore()

const { failed } = await runSuite(store, 'api-core (file store)')

/* Sessiya muddati: hujjatga muddati o'tgan sessiya yozib, 401 olishimiz kerak
   (hujjatga to'g'ridan-to'g'ri yozish — API orqali muddatni o'zgartirib bo'lmaydi). */
let expFailed = 0
let expPassed = 0
const expOk = (cond, msg) => {
  if (cond) expPassed++
  else {
    expFailed++
    console.log(`  FAIL ${msg}`)
  }
}
{
  const s = makeStore()
  const call = async (method, pathname, body, token, ip = '10.9.9.9') => {
    const headers = { 'x-forwarded-for': ip }
    if (token) headers.authorization = `Bearer ${token}`
    return handleRequest(method, pathname, {}, { json: async () => body ?? {}, headers }, s)
  }
  const reg = await call('POST', '/api/auth/register', { username: 'expuser', password: 'pass123', name: 'Exp', email: 'e@x.dev' })
  const token = reg.json.token
  expOk((await call('GET', '/api/data', undefined, token)).status === 200, 'fresh session works')

  const doc = JSON.parse(readFileSync(FILE, 'utf8'))
  const sess = doc.sessions.find((x) => x.token === token)
  expOk(typeof sess?.expiresAt === 'number' && sess.expiresAt > Date.now(), 'session has future expiry')
  expOk(typeof sess?.createdAt === 'string', 'session records createdAt')
  sess.expiresAt = Date.now() - 1000
  writeFileSync(FILE, JSON.stringify(doc))
  expOk((await call('GET', '/api/data', undefined, token)).status === 401, 'expired session -> 401')
  expOk((await call('GET', '/api/data', undefined, token)).status === 401, 'expired session stays dead')
  // keyingi saqlash (login) eskirgan sessiyalarni tozalaydi
  await call('POST', '/api/auth/login', { username: 'expuser', password: 'pass123' })
  const after = JSON.parse(readFileSync(FILE, 'utf8'))
  expOk(!after.sessions.some((x) => x.token === token), 'expired session pruned on next save')
  expOk(SESSION_TTL === 30 * 24 * 60 * 60 * 1000, 'session ttl is 30 days')
}

console.log(`\nRESULT [api-core (file store)]: ${failed} failed, session-expiry checks: ${expPassed} passed, ${expFailed} failed`)

rmSync(FILE, { force: true })
rmSync(MEDIA_DIR, { recursive: true, force: true })
process.exit(failed > 0 || expFailed > 0 ? 1 : 0)
