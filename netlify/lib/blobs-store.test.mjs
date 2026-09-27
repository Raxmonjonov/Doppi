/* Netlify API routes over the Blobs store adapter.
   A fake blob store with the same semantics as @netlify/blobs v11 is used so the
   Blobs path runs against the same functional suite as the file and Postgres
   stores (real Blobs network calls are covered by a live deploy check). */
import './test-env.mjs'
import { emptyDoc } from './api-core.mjs'
import { createBlobsStore } from './blobs-store.mjs'
import { runSuite } from './test-suite.mjs'

function fakeBlobStore() {
  const entries = new Map() // key -> { data: Uint8Array | string, metadata }

  const toBytes = async (data) => {
    if (data instanceof Uint8Array) return data
    if (data instanceof ArrayBuffer) return new Uint8Array(data)
    if (typeof data === 'string') return new TextEncoder().encode(data)
    if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer())
    return new Uint8Array(0)
  }

  const blob = {
    entries,
    async set(key, data, options = {}) {
      entries.set(key, { data: await toBytes(data), metadata: options.metadata ?? {} })
      return { etag: `etag-${entries.size}`, modified: true }
    },
    async setJSON(key, value) {
      entries.set(key, { data: new TextEncoder().encode(JSON.stringify(value)), metadata: {} })
    },
    async get(key, options = {}) {
      const e = entries.get(key)
      if (!e) return null
      if (options.type === 'json') return JSON.parse(new TextDecoder().decode(e.data))
      if (options.type === 'arrayBuffer') return e.data.buffer.slice(e.data.byteOffset, e.data.byteOffset + e.data.byteLength)
      return new TextDecoder().decode(e.data)
    },
    async getWithMetadata(key, options = {}) {
      const e = entries.get(key)
      if (!e) return null
      const data = options.type === 'arrayBuffer'
        ? e.data.buffer.slice(e.data.byteOffset, e.data.byteOffset + e.data.byteLength)
        : new TextDecoder().decode(e.data)
      return { data, etag: `etag-${key}`, metadata: e.metadata }
    },
      async setMetadata() {
        // @netlify/blobs v11 da bunday metodi YO'Q. Bu fake ham uni
        // taqlid qilmasligi kerak edi: aks holda code yangi, mavjud bo'lmagan
        // API'ni chaqirsa, `try/catch` xatoni yutib testlar yashiringicha
        // "o'tar" edi (privacy yo'li umuman tekshirilmas edi).
        throw new Error('setMetadata mavjud emas (@netlify/blobs v11)')
      },
      async getMetadata(key) {
        const e = entries.get(key)
        if (!e) return null
        return { etag: `etag-${key}`, metadata: e.metadata }
      },
      async list({ prefix = '' } = {}) {
      const keys = [...entries.keys()].filter((k) => k.startsWith(prefix))
      return {
        blobs: keys.map((key) => ({ key, etag: `etag-${key}`, size: entries.get(key).data.length })),
        directories: [],
      }
    },
    async delete(key) {
      entries.delete(key)
    },
  }
  return blob
}

/* "Cold start" reuses the same remote store, like a new function instance. */
const remote = fakeBlobStore()
const makeStore = () => createBlobsStore(remote, () => Promise.resolve(emptyDoc(Date.now())))

const store = makeStore()
store.relaunch = async () => makeStore()

const { failed } = await runSuite(store, 'blobs store (fake @netlify/blobs)')

/* --- 'media-meta/' joriy bo'lishidan OLDIN yuklangan (legacy) media -----
   Ular chegara/egani TANANING metadata'sida turadi. `getMediaMeta` buni
   ham o'qishi kerak, aks holda eski fayl "egasi yo'q" deb hisoblanib
   egalik tekshiruvidan o'tib ketar edi (begona foydalanuvchi uni o'z
   suhbatiga torta olardi). */
let legacyFailed = 0
const check = (name, cond, extra = '') => {
  if (cond) console.log(`    PASS ${name}`)
  else {
    legacyFailed++
    console.log(`    FAIL ${name}${extra ? ` (${extra})` : ''}`)
  }
}
const legacyId = 'legacyowner.png'
await remote.set('media/' + legacyId, new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), {
  metadata: { mime: 'image/png', size: '3', scope: 'dm', refId: '42', ownerId: 'user-A' },
})
const lmeta = await store.getMediaMeta(legacyId)
check('legacy media: ownerId o\'qiladi (media-meta/ yo\'q)', lmeta?.ownerId === 'user-A', `ownerId=${lmeta?.ownerId}`)
check('legacy media: scope/refId o\'qiladi', lmeta?.scope === 'dm' && lmeta?.refId === '42', `scope=${lmeta?.scope} refId=${lmeta?.refId}`)
check('legacy media: boshqa id null qaytaradi', (await store.getMediaMeta('yoqolgan.png')) === null)
const lbytes = await store.getMedia(legacyId)
check('legacy media: getMedia tanani ham, chegarani ham beradi', lbytes?.bytes?.length === 3 && lbytes?.ownerId === 'user-A' && lbytes?.mime === 'image/png')
/* Yangi yozilgan media esa 'media-meta/' ga tushishi kerak. */
const newId = 'newscoped.png'
await store.putMedia(newId, 'image/png', new Uint8Array([9, 9]), { scope: 'public', refId: '', ownerId: 'user-B' })
await store.setMediaMeta(newId, { scope: 'group', refId: '7', ownerId: 'user-B' })
const nmeta = await store.getMediaMeta(newId)
check('yangi media: scope media-meta/ da yangilandi', nmeta?.scope === 'group' && nmeta?.refId === '7' && nmeta?.ownerId === 'user-B', JSON.stringify(nmeta))
const listed = await store.listMedia()
check('media-meta/ blob\'lari listMedia() ga tushmaydi', listed.includes(newId) && !listed.includes('media-meta/' + newId), listed.join(','))
await store.deleteMedia([newId])
check('yangi media o\'chirildi', (await store.getMedia(newId)) === null)
check('meta blob ham tozalandi', !remote.entries.has('media-meta/' + newId))

process.exit(failed + legacyFailed > 0 ? 1 : 0)
