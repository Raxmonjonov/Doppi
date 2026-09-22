import { getStore } from '@netlify/blobs'
import { emptyDoc, handleRequest } from '../lib/api-core.mjs'
import { createPostgresStore } from '../lib/postgres-store.mjs'

const STORE_NAME = 'doppi-data-v1'
const KEY = 'db'

// Start with an EMPTY store: users self-register on first login (Admin.dev NOT preloaded).
// To seed demo data instead: import { loadSeedDoc } from './seed-loader.mjs' and
// set `emptyDocPromise = loadSeedDoc()` below.
const emptyDocPromise = Promise.resolve(emptyDoc(Date.now()))

// Primary persistence: Neon PostgreSQL (set DATABASE_URL env var in Netlify).
// Fallback: Netlify Blobs when DATABASE_URL is not configured.
const store =
  process.env.DATABASE_URL
    ? createPostgresStore(process.env.DATABASE_URL, () => emptyDocPromise)
    : (() => {
        const blob = getStore(STORE_NAME)
        return {
          async getDoc() {
            const doc = await blob.get(KEY, { type: 'json' })
            if (doc) return doc
            const seed = await emptyDocPromise
            await blob.setJSON(KEY, seed)
            return seed
          },
          async saveDoc(doc) {
            await blob.setJSON(KEY, doc)
          },
        }
      })()

export default async (req) => {
  const url = req.url || ''
  let pathname = url.startsWith('http') ? new URL(url).pathname : url.split('?')[0]
  if (pathname.startsWith('/.netlify/functions/')) {
    pathname = '/' + pathname.split('/').filter(Boolean).slice(2).join('/')
  }
  const query = Object.fromEntries(new URLSearchParams(url.split('?')[1] ?? ''))

  const res = await handleRequest(req.method || 'GET', pathname, query, req, store)

  return new Response(JSON.stringify(res.json), {
    status: res.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}