/* Netlify Blobs store adapter.
   Doc is kept as a single JSON blob (key 'db'); media is stored as separate
   binary entries under 'media/<id>'. Blobs does not expose the content type on
   read, so the mime travels in the entry metadata.

   Ko'rinish chegarasi (scope/refId/ownerId) alohida KICHIK blob'da
   ('media-meta/<id>') saqlanadi. Sabab: @netlify/blobs v11 da metadata'ni
   YANGILASH metodi yo'q - `setMetadata` mavjud emas. Faqat `set` bor va u
   butun tanani qayta yazadi, ya'ni scope'ni o'zgartirish 8 MB rasm/13 MB
   ovozni har bir xabar yuborilgida qayta yuklashni talab qilardi. Bu
   o'zgaruvchan, mayda o'lchamli ma'lumot shuning uchun u tanasiz
   (body-less) alohida joyda turadi - `setJSON` bilan yoziladi, `get` bilan
   o'qiladi (metadata `getMetadata` ham mavjud, lekin u `type: 'json'`
   qanday o'qilishidan farq qilmasligi uchun bitta yo'l ishlatiladi). */

export function createBlobsStore(blob, seedProvider) {
  const KEY = 'db'
  const MEDIA_PREFIX = 'media/'
  const META_PREFIX = 'media-meta/'

  const MIME_BY_EXT = {
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    mp4: 'video/mp4',
    webm: 'video/webm',
  }
  const mimeFromId = (id) => MIME_BY_EXT[String(id).split('.').pop()] ?? 'application/octet-stream'

  const validId = (id) => /^[A-Za-z0-9][\w.-]*$/.test(String(id)) && !String(id).includes('..')
  const normMeta = (m) => ({
    scope: String(m?.scope ?? 'public'),
    refId: String(m?.refId ?? ''),
    ownerId: String(m?.ownerId ?? ''),
  })
  const readMetaBlob = async (id) => {
    try {
      return await blob.get(META_PREFIX + id, { type: 'json', consistency: 'strong' })
    } catch {
      return null
    }
  }
  const writeMetaBlob = async (id, meta) => {
    await blob.setJSON(META_PREFIX + id, normMeta(meta))
  }
  /* Chegara o'qish: avval kichik blob, so'ng ESKI ma'lumot uchun tananing
     metadata'si (joriy bo'lishidan oldin yuklangan fayllar). Tana
     YUKLANMAYDI. */
  const readScope = async (id) => {
    const own = await readMetaBlob(id)
    if (own) return normMeta(own)
    try {
      const res = await blob.getMetadata(MEDIA_PREFIX + id, { consistency: 'strong' })
      if (!res) return null
      return normMeta(res.metadata ?? {})
    } catch {
      return null
    }
  }

  return {
    async getDoc() {
      // `consistency: 'strong'` — RO'YXATDAN O'TISH/LOGIN'dan keyingi darhol
      // o'qish session hali ko'rinmayotgani uchun muvaffaqiyatsiz bo'lmasin.
      // Blobs 'eventual' rejimida yozilgan sessiya bir necha soniya boshqa
      // lambda'ga ko'rinmasdan qoladi: foydalanuvchi ro'yxatdan o'tib, keyingi
      // sahifada "yana ro'yxatdan o't" ko'radi — tasodifiy SESSION_SECRET'ga
      // o'xshab ko'ringan hodisa, asl manbasi kutilgan emas.
      const doc = await blob.get(KEY, { type: 'json', consistency: 'strong' })
      if (doc) return doc
      const seed = await seedProvider()
      await blob.setJSON(KEY, seed)
      return seed
    },
    async saveDoc(doc) {
      await blob.setJSON(KEY, doc)
    },
    /* `meta.scope` ('public' | 'dm' | 'group') fayl kimga ko'rinishini
       belgilaydi: shaxsiy suhbat/guruh media faqat a'zo sessiyasi bilan
       o'qiladi. */
    async putMedia(id, mime, bytes, meta = {}) {
      // Boshqa metodlar kabi id tekshiruvi: yozuv faqat `media/` prefiksi
      // ichida va xavfsiz belgilar bilan qo'yiladi (path traversal .
      // istalgan kelajakdagi chaqiruv uchun ham).
      if (!validId(id)) return false
      await blob.set(MEDIA_PREFIX + id, new Blob([bytes], { type: mime }), {
        metadata: { mime, size: String(bytes.length) },
      })
      await writeMetaBlob(id, meta)
      return true
    },
    /* Faqat ko'rinish chegarasini yangilaydi (bajtalarni qayta yozmaydi).
       DM/guruh xabariga biriktirilganda media shaxsiy deb belgilanadi.

       Xato JIMGINA yutilmaydi: avval `catch { return false }` edi, ya'ni
       yozish muvaffaqiyatsiz bo'lsa ham media `public` da qolardi va hech
       kim log ko'rmardi. Endi xato yuqoriga ko'tariladi — `scopePrivateMedia`
       uni media id bilan loglaydi. */
    async setMediaMeta(id, meta = {}) {
      if (!validId(id)) return false
      // Kichik blob — metadata yozish mumkin emas, lekin `setJSON` bor.
      await writeMetaBlob(id, meta)
      return true
    },
    /* Faqat chegara (fayl tanasi YUKLANMAYDI) — egalik tekshiruvi uchun.
       `getMedia` baytni tortib kelardi, ya'ni har bir media havolasi
       tekshirilganda 8 MB rasm/13 MB ovoz xotiraga tushardi. */
    async getMediaMeta(id) {
      if (!validId(id)) return null
      // ESKI ma'lumot: 'media-meta/' joriy bo'lishidan OLDIN yuklangan
      // fayllarda chegara tananing metadata'sida turadi — `readScope` uni
      // ham o'qiydi. Aks holda eski media "egasi yo'q" deb hisoblanib,
      // begona tomonidan tortib olinishi mumkin edi.
      return readScope(id)
    },
    async getMedia(id) {
      if (!validId(id)) return null
      const res = await blob.getWithMetadata(MEDIA_PREFIX + id, { type: 'arrayBuffer', consistency: 'strong' })
      if (!res || !res.data) return null
      // FAIL-CLOSED: fayl bor, lekin chegara o'qib bo'lmadi (vaqtincha
      // xato yoki bo'sh metadata). Chegara noma'lum bo'lsa `public` deb
      // taxmin qilish XAVFSIZ EMAS — shunda shaxsiy DM rasmni har kim
      // o'qiy olardi. `readScope` legacy'ni ham qamrab olgani uchun
      // null bu yerda "aniqlab bo'lmadi" degani, demak rad etamiz.
      const scope = await readScope(id)
      if (!scope) {
        console.error(`[blobs] chegara o'qib bo'lmadi, rad etildi (${id})`)
        return null
      }
      return {
        bytes: new Uint8Array(res.data),
        mime: res.metadata?.mime || mimeFromId(id),
        ...scope,
      }
    },
    async listMedia() {
      // `media-meta/` prefiksi `media/` bilan mos kelmaydi ('media-'
      // boshlanadi), shuning uchun chegara blob'lari ro'yxatga tushmaydi.
      const { blobs } = await blob.list({ prefix: MEDIA_PREFIX })
      return blobs.map((b) => String(b.key).slice(MEDIA_PREFIX.length))
    },
    async deleteMedia(ids) {
      let removed = 0
      for (const id of ids) {
        if (!validId(id)) continue
        await blob.delete(MEDIA_PREFIX + id)
        await blob.delete(META_PREFIX + id).catch(() => {})
        removed++
      }
      return removed
    },
  }
}
