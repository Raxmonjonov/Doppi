/* api-core functional test — file-backed store.
   Doc is emulated by a JSON file; media by binary files under a directory,
   which is the closest local equivalent of Netlify Blobs (keyed binary). */
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { emptyDoc } from './api-core.mjs'
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
  }
}

const store = makeStore()
store.relaunch = async () => makeStore()

const { failed } = await runSuite(store, 'api-core (file store)')
rmSync(FILE, { force: true })
rmSync(MEDIA_DIR, { recursive: true, force: true })
process.exit(failed > 0 ? 1 : 0)
