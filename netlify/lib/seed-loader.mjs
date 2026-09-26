import { emptyDoc } from './api-core.mjs'

/* Seed fayli avval `netlify/lib/seed.json` dan `JSON.parse` qilib avtomatik
   yuklanardi — ya'ni `git`ga tushgan fayldan kelgan haqiqiy foydalanuvchilar
   (hash/salt va sessiya tokenlari bilan) production'ga avtomatik o'tib borardi.

   YANGI: seed faqat aniq so'ralganda va production'da EMAS yuklanadi.
   `SEED_FILE` — yo'l, `ALLOW_SEED=1` — tasdiq. Ikkalasi ham kerak. */
export async function loadSeedDoc() {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') return emptyDoc()
  if (String(process.env.ALLOW_SEED ?? '') !== '1') return emptyDoc()
  if (String(process.env.NODE_ENV ?? '') === 'production') {
    console.error('[xavfsizlik] Production muhitida seed yuklanmaydi (ALLOW_SEED=1 ham yetarli emas).')
    return emptyDoc()
  }
  const file = String(process.env.SEED_FILE ?? '').trim()
  if (!file) return emptyDoc()
  try {
    const fs = await import('node:fs')
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    console.error(`[seed] ${file} yuklanmadi:`, e?.message ?? e)
    return emptyDoc()
  }
}
