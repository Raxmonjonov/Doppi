import { getStore } from '@netlify/blobs'
import { emptyDoc, handleRequest } from '../lib/api-core.mjs'

const STORE_NAME = 'doppi-data-v1'
const KEY = 'db'

// Start with an EMPTY store: users self-register on first login (Admin.dev NOT preloaded).
// To seed demo data instead: import { loadSeedDoc } from './seed-loader.mjs' and
// set `emptyDocPromise = loadSeedDoc()` below.
const emptyDocPromise = Promise.resolve(emptyDoc(Date.now()))

export default async (req) => {
  const store = getStore(STORE_NAME)
  const url = req.url || ''
  let pathname = url.startsWith('http') ? new URL(url).pathname : url.split('?')[0]
  if (pathname.startsWith('/.netlify/functions/')) {
    pathname = '/' + pathname.split('/').filter(Boolean).slice(2).join('/')
  }
  const query = Object.fromEntries(new URLSearchParams(url.split('?')[1] ?? ''))

  const res = await handleRequest(
    req.method || 'GET',
    pathname,
    query,
    req,
    {
      async getDoc() {
        const doc = await store.get(KEY, { type: 'json' })
        if (doc) return doc
        const seed = await emptyDocPromise
        await store.setJSON(KEY, seed)
        return seed
      },
      async saveDoc(doc) {
        await store.setJSON(KEY, doc)
      },
    },
  )

  return new Response(JSON.stringify(res.json), {
    status: res.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
