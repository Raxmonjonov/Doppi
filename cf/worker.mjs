/* Cloudflare Worker kirish nuqtasi.
   Netlify funksiyasi (`netlify/functions/api.mjs`) bilan bir xil handleRequest'dan
   foydalanadi, lekin:
   - `@netlify/blobs` yo'q — asosiy ombor Postgres (DATABASE_URL majburiy);
   - env binding `process.env` ga fetch boshida ko'chiriladi (lib kodiga tegmasdan);
   - statik fayllar wrangler.jsonc assets bo'limidan keladi (run_worker_first /api/*). */
import { emptyDoc, handleRequest } from '../netlify/lib/api-core.mjs'
import { createPostgresStore } from '../netlify/lib/postgres-store.mjs'
import { securityHeaders, serverSecret, isProdLike } from '../netlify/lib/security.mjs'

const emptyDocPromise = Promise.resolve(emptyDoc(Date.now()))

let store = null
let preflightDone = false

function applyEnv(env) {
  for (const [k, v] of Object.entries(env ?? {})) {
    if (typeof v === 'string') process.env[k] = v
  }
}

function preflight() {
  if (preflightDone) return
  preflightDone = true
  if (isProdLike()) {
    try {
      serverSecret()
    } catch (e) {
      console.error(`[xavfsizlik] ${e.message}`)
    }
    if (!process.env.ADMIN_PASSWORD) {
      console.error('[xavfsizlik] ADMIN_PASSWORD belgilanmagan — admin panel o‘chirilgan.')
    }
  }
}

export default {
  async fetch(req, env, ctx) {
    applyEnv(env)
    preflight()
    if (!env.DATABASE_URL) {
      return new Response(JSON.stringify({ error: 'Server sozlanmagan.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      })
    }
    if (!store) store = createPostgresStore(env.DATABASE_URL, () => emptyDocPromise)

    const url = req.url || ''
    const pathname = new URL(url).pathname
    const query = Object.fromEntries(new URLSearchParams(new URL(url).search))

    let res
    try {
      res = await handleRequest(req.method || 'GET', pathname, query, req, store)
    } catch (e) {
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
          'Cache-Control': 'private, no-store',
          'Content-Disposition': 'inline; filename="media"',
          'X-Content-Type-Options': 'nosniff',
          'X-Download-Options': 'noopen',
        },
      })
    }

    const headers = {
      ...base,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(res.headers ?? {}),
    }
    if (res.status === 429 && res.json?.retryAfter) {
      headers['Retry-After'] = String(res.json.retryAfter)
    }
    if (res.status === 401) headers['WWW-Authenticate'] = 'Bearer realm="doppi"'
    if (res.status === 304) return new Response(null, { status: 304, headers })
    return new Response(JSON.stringify(res.json), { status: res.status, headers })
  },
}
