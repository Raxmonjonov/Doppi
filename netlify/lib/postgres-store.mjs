import { neon } from '@neondatabase/serverless'

export function createPostgresStore(databaseUrl, seedProvider, sqlClient) {
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
      const seed = await seedProvider()
      await sql`INSERT INTO doppi_doc (doc_key, doc) VALUES (${docKey}, ${JSON.stringify(seed)}::jsonb)`
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
      created_at timestamptz NOT NULL DEFAULT now()
    )`
  }

  async function putMedia(id, mime, bytes) {
    await ensureMediaTable()
    const buf = Buffer.from(bytes)
    const hex = '\\x' + buf.toString('hex')
    await sql`INSERT INTO doppi_media (id, mime, size, bytes)
      VALUES (${id}, ${mime}, ${buf.length}, ${hex}::bytea)
      ON CONFLICT (id) DO UPDATE SET mime = EXCLUDED.mime, size = EXCLUDED.size, bytes = EXCLUDED.bytes`
  }

  async function getMedia(id) {
    await ensureMediaTable()
    const rows = await sql`SELECT mime, size, bytes FROM doppi_media WHERE id = ${id}`
    if (!rows || rows.length === 0) return null
    const row = rows[0]
    const bytes = typeof row.bytes === 'string' ? Buffer.from(row.bytes.replace(/^\\x/, ''), 'hex') : Buffer.from(row.bytes)
    return { bytes, mime: row.mime || 'application/octet-stream' }
  }

  return { getDoc, saveDoc, putMedia, getMedia }
}