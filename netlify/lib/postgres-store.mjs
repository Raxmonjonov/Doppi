import { neon } from '@neondatabase/serverless'

/* `fallback` — kiritilgan EMAS, lazily-migrating holda eski ombor. Agar
   Netlify'da oldin Blobs store ishlatilgan bo'lsa va endi DATABASE_URL
   Postgres'ga o'tilsa, postgres bo'sh bo'lganida hujjat/media avtomatik
   eski Blobs'dan ko'chiriladi (bir marta; so'ng Postgres asosiy ombor bo'ladi). */
export function createPostgresStore(databaseUrl, seedProvider, sqlClient, fallback = null) {
  const sql = sqlClient ?? neon(databaseUrl)
  const docKey = 'doppi-doc-v1'

  async function ensureTable() {
    await sql`CREATE TABLE IF NOT EXISTS doppi_doc (
      doc_key text PRIMARY KEY,
      doc jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`
  }

  async function getDoc() {
    await ensureTable()
    const rows = await sql`SELECT doc FROM doppi_doc WHERE doc_key = ${docKey}`
    if (!rows || rows.length === 0) {
      // Migratsiya: eski omborda hujjat bormi? Bo'lsa ko'chirib, Postgres'ga
      // yozamiz. `ON CONFLICT DO NOTHING` parallel sovuq start'larga xavfsiz:
      // ikkalasi ham bir xil hujjatni qaytaradi, bitta yozuv yoziladi.
      if (fallback) {
        const legacy = await fallback.getDoc()
        await sql`INSERT INTO doppi_doc (doc_key, doc)
          VALUES (${docKey}, ${JSON.stringify(legacy)}::jsonb)
          ON CONFLICT (doc_key) DO NOTHING`
        return legacy
      }
      const seed = await seedProvider()
      await sql`INSERT INTO doppi_doc (doc_key, doc, updated_at)
        VALUES (${docKey}, ${JSON.stringify(seed)}::jsonb, now())
        ON CONFLICT (doc_key) DO NOTHING`
      return seed
    }
    const raw = rows[0].doc
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  }

  async function saveDoc(doc) {
    await ensureTable()
    await sql`INSERT INTO doppi_doc (doc_key, doc, updated_at)
      VALUES (${docKey}, ${JSON.stringify(doc)}::jsonb, now())
      ON CONFLICT (doc_key) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`
  }

  async function ensureMediaTable() {
    await sql`CREATE TABLE IF NOT EXISTS doppi_media (
      id text PRIMARY KEY,
      mime text NOT NULL,
      size integer NOT NULL,
      bytes bytea NOT NULL,
      scope text NOT NULL DEFAULT 'public',
      ref_id text NOT NULL DEFAULT '',
      owner_id text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now()
    )`
    // Eski jadvallar uchun idempotent qo'shimcha ustunlar
    await sql`ALTER TABLE doppi_media ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'public'`
    await sql`ALTER TABLE doppi_media ADD COLUMN IF NOT EXISTS ref_id text NOT NULL DEFAULT ''`
    await sql`ALTER TABLE doppi_media ADD COLUMN IF NOT EXISTS owner_id text NOT NULL DEFAULT ''`
  }

  /* `meta.scope` ('public' | 'dm' | 'group') fayl kimga ko'rinishini
     belgilaydi: shaxsiy suhbat/guruh media faqat a'zo sessiyasi bilan
     o'qiladi. */
  async function putMedia(id, mime, bytes, meta = {}) {
    await ensureMediaTable()
    const buf = Buffer.from(bytes)
    const hex = '\\x' + buf.toString('hex')
    const scope = String(meta?.scope ?? 'public')
    const refId = String(meta?.refId ?? '')
    const ownerId = String(meta?.ownerId ?? '')
    await sql`INSERT INTO doppi_media (id, mime, size, bytes, scope, ref_id, owner_id)
      VALUES (${id}, ${mime}, ${buf.length}, ${hex}::bytea, ${scope}, ${refId}, ${ownerId})
      ON CONFLICT (id) DO UPDATE SET mime = EXCLUDED.mime, size = EXCLUDED.size,
        bytes = EXCLUDED.bytes, scope = EXCLUDED.scope, ref_id = EXCLUDED.ref_id,
        owner_id = EXCLUDED.owner_id`
  }

  /* Faqat ko'rinish chegarasini yangilaydi (bajtalarni qayta yozmaydi).
     DM/guruh xabariga biriktirilganda media shaxsiy deb belgilanadi. */
  async function setMediaMeta(id, meta = {}) {
    await ensureMediaTable()
    const scope = String(meta?.scope ?? 'public')
    const refId = String(meta?.refId ?? '')
    const ownerId = String(meta?.ownerId ?? '')
    const rows = await sql`UPDATE doppi_media SET scope = ${scope}, ref_id = ${refId}, owner_id = ${ownerId}
      WHERE id = ${id} RETURNING id`
    return (rows ?? []).length > 0
  }

  /* Faqat metadata (baytni YUKLAMAYDI) — egalik tekshiruvi uchun.
     `getMedia` butun `bytea` ni tortib kelardi. */
  async function getMediaMeta(id) {
    await ensureMediaTable()
    const rows = await sql`SELECT scope, ref_id, owner_id FROM doppi_media WHERE id = ${id}`
    if (rows && rows.length > 0) {
      const row = rows[0]
      return {
        scope: String(row.scope ?? 'public'),
        refId: String(row.ref_id ?? ''),
        ownerId: String(row.owner_id ?? ''),
      }
    }
    // Migratsiya: fayl hali Postgres'ga ko'chmagan bo'lsa eski ombordan o'qiymiz.
    if (fallback) return fallback.getMediaMeta(id)
    return null
  }

  async function getMedia(id) {
    await ensureMediaTable()
    const rows = await sql`SELECT mime, size, bytes, scope, ref_id, owner_id FROM doppi_media WHERE id = ${id}`
    if (!rows || rows.length === 0) {
      // Migratsiya: eski omborda fayl bo'lsa, o'zi ko'chirilib qaytariladi.
      if (fallback) {
        const fb = await fallback.getMedia(id)
        if (fb) {
          await putMedia(id, fb.mime, fb.bytes, { scope: fb.scope, refId: fb.refId, ownerId: fb.ownerId })
        }
        return fb
      }
      return null
    }
    const row = rows[0]
    const bytes = typeof row.bytes === 'string' ? Buffer.from(row.bytes.replace(/^\\x/, ''), 'hex') : Buffer.from(row.bytes)
    return {
      bytes,
      mime: row.mime || 'application/octet-stream',
      scope: String(row.scope ?? 'public'),
      refId: String(row.ref_id ?? ''),
      ownerId: String(row.owner_id ?? ''),
    }
  }

  async function listMedia() {
    await ensureMediaTable()
    const rows = await sql`SELECT id FROM doppi_media`
    const ids = (rows ?? []).map((r) => r.id)
    if (!fallback) return ids
    // Migratsiya paytida faqat eski omborda qolgan fayllarni ham ro'yxatga qo'shamiz.
    const legacy = await fallback.listMedia()
    const have = new Set(ids)
    for (const id of legacy) if (!have.has(id)) ids.push(id)
    return ids
  }

  async function setMediaMeta(id, meta = {}) {
    await ensureMediaTable()
    const scope = String(meta?.scope ?? 'public')
    const refId = String(meta?.refId ?? '')
    const ownerId = String(meta?.ownerId ?? '')
    const rows = await sql`UPDATE doppi_media SET scope = ${scope}, ref_id = ${refId}, owner_id = ${ownerId}
      WHERE id = ${id} RETURNING id`
    if ((rows ?? []).length > 0) return true
    // Hali ko'chmagan fayl chegarasini eski omborda yangilaymiz.
    if (fallback) return fallback.setMediaMeta(id, meta) !== false
    return false
  }

  async function deleteMedia(ids) {
    if (!ids || ids.length === 0) return 0
    await ensureMediaTable()
    let removed = 0
    const safe = ids.filter((id) => typeof id === 'string' && !id.includes('..'))
    if (safe.length > 0) {
      const rows = await sql`DELETE FROM doppi_media WHERE id = ANY(${safe}) RETURNING id`
      removed += (rows ?? []).length
    }
    if (fallback) removed += await fallback.deleteMedia(safe)
    return removed
  }

  /* ---------- Jonli efir signallari (alohida qator) ----------
     Doc ichida signals saqlash parallel yo'zuvlarda read-modify-write
     race'iga uchraydi (12 ta parallel signal dan 11 tishi yo'qotilgan edi:
     WebRTC answer signal yo'qolib, media oqimi ulanmasdi). Shu jadvalda
     INSERT ... ON CONFLICT DO UPDATE atomik append — qator kilofi
     parallel yozuvlarni navbatma-navbat joylashtiradi (yechilgan).
     id = mikrosekund (monotonik; 600+ elementda oxirgi 500 ni kesish
     ham id kamaytirmaydi, shuning uchun `since` kursori uzilmaydi). */
  async function ensureLiveSigTable() {
    await sql`CREATE TABLE IF NOT EXISTS doppi_live_sig (
      live_id bigint PRIMARY KEY,
      signals jsonb NOT NULL DEFAULT '[]'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`
  }

  async function appendLiveSignal(liveId, sig) {
    await ensureLiveSigTable()
    const from = Number(sig.from) || 0
    const to = Number(sig.to) || 0
    const kind = String(sig.kind ?? '')
    const dataJson = JSON.stringify(sig.data ?? null)
    const rows = await sql`
      INSERT INTO doppi_live_sig (live_id, signals)
      VALUES (${Number(liveId)}, jsonb_build_array(jsonb_build_object(
        'id', (EXTRACT(EPOCH FROM clock_timestamp()) * 1000000)::bigint,
        'from', ${from}::bigint, 'to', ${to}::bigint,
        'kind', ${kind}::text, 'data', ${dataJson}::jsonb
      )))
      ON CONFLICT (live_id) DO UPDATE SET
        signals = CASE
          WHEN jsonb_array_length(doppi_live_sig.signals || EXCLUDED.signals) > 600
          THEN (SELECT jsonb_agg(el ORDER BY (el->>'id')::bigint)
                  FROM (SELECT j.el FROM jsonb_array_elements(doppi_live_sig.signals || EXCLUDED.signals) j(el)
                        ORDER BY (j.el->>'id')::bigint DESC LIMIT 500) t(el))
          ELSE doppi_live_sig.signals || EXCLUDED.signals
        END,
        updated_at = now()
      RETURNING (signals -> (jsonb_array_length(signals) - 1) ->> 'id')::bigint AS id`
    return rows && rows.length ? Number(rows[0].id) : 0
  }

  async function getLiveSignals(liveId) {
    await ensureLiveSigTable()
    const rows = await sql`SELECT signals FROM doppi_live_sig WHERE live_id = ${Number(liveId)}`
    if (!rows || rows.length === 0) return []
    const raw = rows[0].signals
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(arr) ? arr : []
  }

  async function deleteLiveSignals(liveId) {
    await ensureLiveSigTable()
    await sql`DELETE FROM doppi_live_sig WHERE live_id = ${Number(liveId)}`
  }

  return { getDoc, saveDoc, putMedia, setMediaMeta, getMediaMeta, getMedia, listMedia, deleteMedia, appendLiveSignal, getLiveSignals, deleteLiveSignals }
}