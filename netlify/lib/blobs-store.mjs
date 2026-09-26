/* Netlify Blobs store adapter.
   Doc is kept as a single JSON blob (key 'db'); media is stored as separate
   binary entries under 'media/<id>'. Blobs does not expose the content type on
   read, so the mime travels in the entry metadata. */

export function createBlobsStore(blob, seedProvider) {
  const KEY = 'db'
  const MEDIA_PREFIX = 'media/'

  const MIME_BY_EXT = {
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    mp4: 'video/mp4',
    webm: 'video/webm',
  }
  const mimeFromId = (id) => MIME_BY_EXT[String(id).split('.').pop()] ?? 'application/octet-stream'

  return {
    async getDoc() {
      const doc = await blob.get(KEY, { type: 'json' })
      if (doc) return doc
      const seed = await seedProvider()
      await blob.setJSON(KEY, seed)
      return seed
    },
    async saveDoc(doc) {
      await blob.setJSON(KEY, doc)
    },
    async putMedia(id, mime, bytes) {
      await blob.set(MEDIA_PREFIX + id, new Blob([bytes], { type: mime }), {
        metadata: { mime, size: String(bytes.length) },
      })
    },
    async getMedia(id) {
      if (!/^[A-Za-z0-9][\w.-]*$/.test(id) || id.includes('..')) return null
      const res = await blob.getWithMetadata(MEDIA_PREFIX + id, { type: 'arrayBuffer' })
      if (!res || !res.data) return null
      return { bytes: new Uint8Array(res.data), mime: res.metadata?.mime || mimeFromId(id) }
    },
  }
}
