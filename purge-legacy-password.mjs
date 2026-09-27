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

  const hits = await capture('git', ['log', '--all', '-S', password, '--oneline'])
  const hitCount = hits.out.split('\n').filter((l) => l.trim()).length
  console.log(`Tarixda topilgan tegishli commitlar: ${hitCount}`)
  if (hitCount === 0) {
    console.log('ℹ️  Parol topilmadi — shekilli allaqachon tozalangan. Chiqish.')
    return
  }

  // Eski matn qisqa bo'lsa, `--replace-text` regex sifatida qarishi mumkin
  // (masalan `+` yoki `(` belgilari). Shuning uchun `literal:` prefiksi
  // aniq belgilaydi.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doppi-purge-'))
  const replacementsFile = path.join(tmpDir, 'replacements.txt')
  fs.writeFileSync(replacementsFile, `literal:${password}==>${REPLACEMENT}\n`, 'utf8')

  try {
    // `--refs` ga bir necha marta argument berish xato: oxirgisi
    //oldingisini bosib ketiradi (argparse oxirgi qiymatni saqlaydi).
    // Bitta `--refs` va uning ortidan ikkala naqsh.
    await run(frCmd, [
      ...frArgs,
      '--replace-text',
      replacementsFile,
      '--force',
      '--refs',
      'refs/heads/*',
      'refs/tags/*',
    ])
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }

  const after = await capture('git', ['log', '--all', '-S', password, '--oneline'])
  const afterCount = after.out.split('\n').filter((l) => l.trim()).length
  if (afterCount > 0) {
    console.error(`❌ Tekshiruv: yana ${afterCount} ta commitda parol qoldi.`)
    console.error('   Ehtimol parol boshqa shaklda (base64, URL-kodlangan) saqlangan.')
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
