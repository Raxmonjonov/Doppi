/* api-core functional test — file-backed store (mimics Netlify Blobs document). */
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { emptyDoc } from './api-core.mjs'
import { runSuite } from './test-suite.mjs'

const FILE = process.env.HARNESS_FILE || join(tmpdir(), 'doppi-api-core-test-store.json')

if (existsSync(FILE)) rmSync(FILE)
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
  }
}

const store = makeStore()
store.relaunch = async () => makeStore()

const { failed } = await runSuite(store, 'api-core (file store)')
rmSync(FILE, { force: true })
process.exit(failed > 0 ? 1 : 0)
