#!/usr/bin/env node
/*
 * Git tarixidan sizib chiqqan admin parolini tozalash.
 *
 * DIQQAT: bu skriptga parolni QAT'IY YOZMAYDI. Agar parol faylning
 * ichida qolsa, skriptni commit qilish uni yana bir bor tarixga
 * kiritadi — tozalash maqsadiga zid. Parol quyidagicha beriladi:
 *
 *   Linux/macOS:  LEGACY_ADMIN_PASSWORD='...' node purge-legacy-password.mjs
 *   PowerShell:  $env:LEGACY_ADMIN_PASSWORD='...'; node purge-legacy-password.mjs
 *
 * Yoki interaktiv: node purge-legacy-password.mjs  (parol kiritish so'raydi,
 * kiritilgan qiymat hech qayerga yozilmaydi).
 *
 * Bu amal BARCHA klonlarni buzadi:
 *   1) Barcha ishchilar push qilganidan keyin ishga tushiring
 *   2) `git push --force --all` va `git push --force --tags`
 *   3) Barcha fork/klonlarni o'chirib, yangidan `clone` qilish KERAK
 *   4) Ochiq (public) repoda parol allaqachon ko'rilgan — faqat
 *      tozalash yetarli emas, parol ALMASHTIRILADI (ADMINGA).
 *
 * Avval: pip install git-filter-repo
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'

const REPLACEMENT = 'REDACTED_LEGACY_ADMIN_PASSWORD'

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, stdio: 'inherit', shell: false })
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
    child.on('error', reject)
  })
}

function capture(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'], shell: false })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.on('close', (code) => resolve({ code, out }))
    child.on('error', () => resolve({ code: 1, out: '' }))
  })
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
  return new Promise((resolve) => rl.question(question, (a) => (rl.close(), resolve(a.trim()))))
}

async function resolvePassword() {
  const fromEnv = String(process.env.LEGACY_ADMIN_PASSWORD ?? '')
  if (fromEnv) return fromEnv
  const fromArgv = process.argv[2] ?? ''
  if (fromArgv) return fromArgv
  if (!process.stdin.isTTY) {
    console.error('❌ Parol kelmadi. LEGACY_ADMIN_PASSWORD muhit o\'zgaruvchisini bering.')
    process.exit(1)
  }
  const typed = await ask('Sizib chiqqan parol (chiqishda ko\'rinmaydi, yozilmaydi): ')
  if (!typed) {
    console.error('❌ Bo\'sh parol berildi — tozalash bajarilmadi.')
    process.exit(1)
  }
  return typed
}

async function findFilterRepo() {
  // Windows'da `git filter-repo` (git subcommand), Linux'da `git-filter-repo`
  // (PATH dagi executable) ishlaydi. Lekin `pip install` ko'pincha skriptni
  // PATH'ga qo'shmaydi (Windows: %APPDATA%\Python\Python3xx\Scripts), shuning
  // uchun `python -m git_filter_repo` — PATH'ga bog'liq bo'lmagan usul —
  // oxirgi urinish sifatida qo'shiladi.
  const candidates = [
    ['git', ['filter-repo']],
    ['git-filter-repo', []],
    ['python', ['-m', 'git_filter_repo']],
    ['py', ['-m', 'git_filter_repo']],
  ]
  for (const [cmd, prefix] of candidates) {
    try {
      await run(cmd, [...prefix, '--version'], { stdio: 'ignore' })
      return [cmd, prefix]
    } catch {
      /* keyingiga o'tamiz */
    }
  }
  return null
}

async function main() {
  const password = await resolvePassword()

  console.log('=== Git tarixidan eski admin parolini tozalash ===')
  console.log(`Parol uzunligi: ${password.length} belgi (qiymat chiqarilmaydi)`)
  console.log('')
  console.log('⚠️  OGOHLANTIRISH: bu amal git tarixini o\'zgartiradi!')
  console.log('   - Barcha mavjud klonlar buziladi')
  console.log('   - Barcha ishchilar yangidan clone qilishi KERAK')
  console.log('   - Remote\'da force push kerak')
  console.log('')

  const filterRepo = await findFilterRepo()
  if (!filterRepo) {
    console.error('❌ `git-filter-repo` topilmadi. O\'rnatish: pip install git-filter-repo')
    process.exit(1)
  }
  const [frCmd, frArgs] = filterRepo

  const status = await capture('git', ['status', '--porcelain'])
  if (status.code !== 0) {
    console.error('❌ Bu git repozitoriysi emas yoki `git` ishlamadi.')
    process.exit(1)
  }
  if (status.out.trim() !== '') {
    console.error('❌ Working tree toza emas.')
    console.error('   Avval `git add -A && git commit` (yoki `git stash`) qiling,')
    console.error('   keyin qayta ishga tushiring — filter-repo bekor qilingan')
    console.error('   o\'zgarishlarni yo\'qotadi.')
    process.exit(1)
  }

  // Parol bir necha shaklda saqlangan bo'lishi mumkin: xom holda, JS
  // satrida qochirilgan (`\'`), yoki URL-kodlangan (`%27`). Faqat xom
  // shaklni almashtirsak, qolganlari o'tkazib ketadi — birinchi urinishda
  // aynan shu bo'ldi: skript "bajarildi" dedi, lekin 3 ta commitda
  // qochirilgan variant qoldi va tekshiruv buni ushladi.
  const variants = [...new Set([
    password,
    password.replace(/'/g, "\\'"),
    password.replace(/'/g, '%27'),
  ])]
  console.log(`Tekshiriladigan shakllar: ${variants.length}`)

  const allRefs = await capture('git', ['for-each-ref', '--format=%(refname)'])
  const refs = allRefs.out.split('\n').map((r) => r.trim()).filter(Boolean)
  console.log(`Ko'rib chiqiladigan ref'lar: ${refs.length}`)

  const totalHits = new Map()
  for (const v of variants) {
    const h = await capture('git', ['log', '--all', '-S', v, '--oneline'])
    const n = h.out.split('\n').filter((l) => l.trim()).length
    totalHits.set(v, n)
  }
  const hitCount = [...totalHits.values()].reduce((a, b) => a + b, 0)
  for (const [v, n] of totalHits) {
    console.log(`  ${n} ta commit: ${n ? v.slice(0, 6) + '…' + v.slice(-6) : 'yo\'q'}`)
  }
  if (hitCount === 0) {
    console.log('ℹ️  Parol topilmadi — shekilli allaqachon tozalangan. Chiqish.')
    return
  }

  // Eski matn qisqa bo'lsa, `--replace-text` regex sifatida qarishi mumkin
  // (masalan `+` yoki `(` belgilari). Shuning uchun `literal:` prefiksi
  // aniq belgilaydi.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doppi-purge-'))
  const replacementsFile = path.join(tmpDir, 'replacements.txt')
  fs.writeFileSync(
    replacementsFile,
    variants.map((v) => `literal:${v}==>${REPLACEMENT}\n`).join(''),
    'utf8',
  )

  try {
    // `--refs` ga bir necha marta argument berish xato: oxirgisi
    // oldingisini bosib ketiradi (argparse oxirgi qiymatni saqlaydi).
    // Bitta `--refs` va uning ortidan `for-each-ref` dan olingan haqiqiy
    // ref ro'yxati.
    //
    // `refs/heads/*` va `refs/tags/*` YETARLI EMAS: `refs/remotes/origin/main`
    // eski tarixda qolsa, `git log --all` uni ko'rib chiqadi va parol
    // "tozalangan" deb hisoblanmasligi kerak. Barcha ref'larni qamrab
    // olamiz, shu jumladan remote-tracking ref'lar.
    await run(frCmd, [
      ...frArgs,
      '--replace-text',
      replacementsFile,
      '--force',
      '--refs',
      ...refs,
    ])
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }

  // Har bir shakl bo'yicha alohida tekshiramiz: umumiy "0 ta qoldiq" bir
  // shaklni tozalanganligi bilan ikkinchisini yashirishi mumkin.
  let remaining = 0
  for (const v of variants) {
    const after = await capture('git', ['log', '--all', '-S', v, '--oneline'])
    const n = after.out.split('\n').filter((l) => l.trim()).length
    if (n > 0) {
      remaining += n
      console.error(`❌ Tekshiruv: ${n} ta commitda qoldi (${v.slice(0, 6)}…${v.slice(-6)})`)
    }
  }
  if (remaining > 0) {
    console.error(`   Jami ${remaining} ta qoldiq — boshqa shaklda saqlangan bo'lishi mumkin.`)
    process.exit(1)
  }

  console.log('\n✅ Tozalash bajarildi va tekshirildi (0 ta qoldiq).')
  console.log('Keyingi qadamlar:')
  console.log('  1. Parolni ALMASHTIRING (parol allaqachon ko\'rilgan — tozalash yetarli emas)')
  console.log('  2. git push --force --all')
  console.log('  3. git push --force --tags')
  console.log('  4. Barcha ishchilarga: eski klonlarni o\'chirib, yangidan clone qilish')
  console.log('  5. Ochiq repo bo\'lsa, kontakt qiling va parolni aylantiring')
}

main().catch((e) => {
  console.error('❌ Xato:', e.message)
  process.exit(1)
})
