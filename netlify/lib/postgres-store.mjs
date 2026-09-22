import { neon } from '@neondatabase/serverless'

export function createPostgresStore(databaseUrl, seedProvider) {
  const sql = neon(databaseUrl)
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

  return { getDoc, saveDoc }
}