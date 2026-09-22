import { emptyDoc } from './api-core.mjs'

export async function loadSeedDoc() {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') return emptyDoc()
  try {
    const fs = await import('node:fs')
    const raw = fs.readFileSync(new URL('./seed.json', import.meta.url), 'utf8')
    return JSON.parse(raw)
  } catch {
    return emptyDoc()
  }
}