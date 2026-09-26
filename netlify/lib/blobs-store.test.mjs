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
process.exit(failed > 0 ? 1 : 0)
