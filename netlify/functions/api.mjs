import { getStore } from '@netlify/blobs'
import { emptyDoc, handleRequest } from '../lib/api-core.mjs'
import { createPostgresStore } from '../lib/postgres-store.mjs'
import { createBlobsStore } from '../lib/blobs-store.mjs'

// Start with an EMPTY store: users self-register on first login (Admin.dev NOT preloaded).
// To seed demo data instead: import { loadSeedDoc } from './seed-loader.mjs' and
// set `emptyDocPromise = loadSeedDoc()` below.
const emptyDocPromise = Promise.resolve(emptyDoc(Date.now()))

// Primary persistence: Neon PostgreSQL (set DATABASE_URL env var in Netlify).
// Fallback: Netlify Blobs when DATABASE_URL is not configured.
const store = process.env.DATABASE_URL
  ? createPostgresStore(process.env.DATABASE_URL, () => emptyDocPromise)
  : createBlobsStore(getStore('doppi-data-v1'), () => emptyDocPromise)

export default async (req) => {
  const url = req.url || ''
  let pathname = url.startsWith('http') ? new URL(url).pathname : url.split('?')[0]
  if (pathname.startsWith('/.netlify/functions/')) {
    pathname = '/' + pathname.split('/').filter(Boolean).slice(2).join('/')
  }
  const query = Object.fromEntries(new URLSearchParams(url.split('?')[1] ?? ''))

  const res = await handleRequest(req.method || 'GET', pathname, query, req, store)

  if (res.binary) {
    const body = res.binary.body instanceof Uint8Array ? res.binary.body : new Uint8Array(res.binary.body)
    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': res.binary.type || 'application/octet-stream',
        'Content-Length': String(body.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  }

  return new Response(JSON.stringify(res.json), {
    status: res.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
