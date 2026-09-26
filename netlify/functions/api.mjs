import { getStore } from '@netlify/blobs'
import { emptyDoc, handleRequest } from '../lib/api-core.mjs'
import { createPostgresStore } from '../lib/postgres-store.mjs'
import { createBlobsStore } from '../lib/blobs-store.mjs'
import { securityHeaders, serverSecret } from '../lib/security.mjs'

// Start with an EMPTY store: users self-register on first login (no demo accounts preloaded).
// To seed demo data instead: import { loadSeedDoc } from './seed-loader.mjs' and
// set `emptyDocPromise = loadSeedDoc()` below.
const emptyDocPromise = Promise.resolve(emptyDoc(Date.now()))

// Primary persistence: Neon PostgreSQL (set DATABASE_URL env var in Netlify).
// Fallback: Netlify Blobs when DATABASE_URL is not configured.
const store = process.env.DATABASE_URL
  ? createPostgresStore(process.env.DATABASE_URL, () => emptyDocPromise)
  : createBlobsStore(getStore('doppi-data-v1'), () => emptyDocPromise)

// Fail fast in production instead of silently running with a throwaway key.
if (process.env.NODE_ENV === 'production') {
  try {
    serverSecret()
  } catch (e) {
    console.error(`[xavfsizlik] ${e.message}`)
  }
  if (!process.env.ADMIN_PASSWORD) {
    console.error('[xavfsizlik] ADMIN_PASSWORD belgilanmagan — admin panel o‘chirilgan.')
  }
}

export default async (req) => {
  const url = req.url || ''
  let pathname = url.startsWith('http') ? new URL(url).pathname : url.split('?')[0]
  if (pathname.startsWith('/.netlify/functions/')) {
    pathname = '/' + pathname.split('/').filter(Boolean).slice(2).join('/')
  }
  const query = Object.fromEntries(new URLSearchParams(url.split('?')[1] ?? ''))

  let res
  try {
    res = await handleRequest(req.method || 'GET', pathname, query, req, store)
  } catch (e) {
    // Stack trace mijozga uzatilmaydi (manzil/xatolik yo'lini oshkor qilmaslik uchun)
    console.error('[api] kutilmagan xato:', e)
    res = { status: 500, json: { error: 'Server xatosi.' } }
  }

  const base = securityHeaders()

  if (res.binary) {
    const body = res.binary.body instanceof Uint8Array ? res.binary.body : new Uint8Array(res.binary.body)
    return new Response(body, {
      status: res.status,
      headers: {
        ...base,
        'Content-Type': res.binary.type || 'application/octet-stream',
        'Content-Length': String(body.length),
        // Shaxsiy media (DM/guruh) keshlanmasin: boshqa qurilmada ochilsa
        // ham ko'rinmasin, faqat a'zo sessiyasi bilan ochilsin.
        'Cache-Control': 'private, no-store',
      },
    })
  }

  const headers = {
    ...base,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }
  if (res.status === 429 && res.json?.retryAfter) {
    // Mijoz va orasidagi proksi kutish vaqtini HTTP sarlavhasidan o'qiydi
    headers['Retry-After'] = String(res.json.retryAfter)
  }
  if (res.status === 401) headers['WWW-Authenticate'] = 'Bearer realm="doppi"'

  return new Response(JSON.stringify(res.json), { status: res.status, headers })
}
