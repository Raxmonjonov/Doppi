/* Yetkazib berish kanallari (parol tiklash kodi va kelajakdagi xabarlar).
 *
 * Oldin kod faqat server logiga yozilardi — foydalanuvchi uni ololmasdi.
 * Bu test kanal tanlash, so'rov yuborish va xatolarni tekshiradi: kanal
 * muvaffaqiyatsiz bo'lsa ham `sendMail` hech qachon istisno tashlamaydi
 * (parol tiklash oqimi bu javobga bog'liq). */
import http from 'node:http'
import { sendMail, resetCodeMessage, mailMode, isDeliverableEmail } from './delivery.mjs'

let passed = 0
let failed = 0
const ok = (name, cond, detail = '') => {
  if (cond) {
    passed++
    console.log(`  ok   ${name}`)
  } else {
    failed++
    console.log(`  FAIL ${name}${detail ? ` (${detail})` : ''}`)
  }
}

/* Mahalliy webhook server: so'rovni ushlab turadi va javobni o'zgartiradi. */
async function withServer(handler, fn) {
  const got = []
  const srv = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => {
      body += c
    })
    req.on('end', () => {
      got.push({
        url: req.url,
        auth: req.headers.authorization ?? '',
        body: body ? JSON.parse(body) : {},
      })
      handler(res)
    })
  })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${srv.address().port}/hook`
  try {
    return await fn(url, got)
  } finally {
    await new Promise((r) => srv.close(r))
  }
}

const ok200 = (res) => res.writeHead(200).end('{"ok":true}')
const err500 = (res) => res.writeHead(500).end('nope')

// 1) kanal tanlash
const savedMode = process.env.MAIL_MODE
const savedKey = process.env.RESEND_API_KEY
const savedUrl = process.env.DELIVERY_WEBHOOK_URL
const savedToken = process.env.DELIVERY_WEBHOOK_TOKEN
delete process.env.MAIL_MODE
delete process.env.RESEND_API_KEY
delete process.env.DELIVERY_WEBHOOK_URL
ok('mode defaults to log', mailMode() === 'log', mailMode())
process.env.RESEND_API_KEY = 're_test'
ok('resend key selects resend', mailMode() === 'resend', mailMode())
delete process.env.RESEND_API_KEY
process.env.DELIVERY_WEBHOOK_URL = 'http://example.invalid/hook'
ok('webhook url selects webhook', mailMode() === 'webhook', mailMode())
process.env.MAIL_MODE = 'resend'
ok('explicit MAIL_MODE wins', mailMode() === 'resend', mailMode())

// 2) manzil tekshiruvi
ok('valid email', isDeliverableEmail('alisher@example.com'))
ok('empty email rejected', !isDeliverableEmail(''))
ok('no domain rejected', !isDeliverableEmail('alisher@localhost'))
ok('double dot rejected', !isDeliverableEmail('a..b@example.com'))
ok('no at rejected', !isDeliverableEmail('alisher.example.com'))
ok('too long rejected', !isDeliverableEmail(`${'a'.repeat(250)}@example.com`))

// 3) xabar matni
const msg = resetCodeMessage({ code: '482913', username: 'Alisher', url: 'https://doppi.app/reset?username=Alisher', minutes: 10 })
ok('subject mentions app', /parol tiklash kodi/.test(msg.subject), msg.subject)
ok('text contains code', msg.text.includes('482913'))
ok('text contains reset url', msg.text.includes('https://doppi.app/reset?username=Alisher'))
ok('text mentions expiry', msg.text.includes('10 daqiqa'))
ok('html contains code', msg.html.includes('482913'))
const noUrl = resetCodeMessage({ code: '111111' })
ok('no url -> no dangling link', !noUrl.text.includes('undefined') && !noUrl.html.includes('undefined'))

// 4) webhook yetkazish
process.env.MAIL_MODE = 'webhook'
process.env.DELIVERY_WEBHOOK_TOKEN = 'sekret'
await withServer(ok200, async (url, got) => {
  process.env.DELIVERY_WEBHOOK_URL = url
  const r = await sendMail({ to: 'alisher@example.com', ...msg })
  ok('webhook send ok', r.ok && r.provider === 'webhook', JSON.stringify(r))
  ok('webhook received one request', got.length === 1, `got=${got.length}`)
  ok('webhook got recipient', got[0]?.body?.to === 'alisher@example.com', got[0]?.body?.to)
  ok('webhook got code', String(got[0]?.body?.text ?? '').includes('482913'))
  ok('webhook code field for bots', got[0]?.body?.code === '482913', got[0]?.body?.code)
  ok('webhook username field for bots', got[0]?.body?.username === 'Alisher', got[0]?.body?.username)
  ok('webhook bearer token sent', got[0]?.auth === 'Bearer sekret', got[0]?.auth)
})

// 5) xatolar istisno tashlatmasin
await withServer(err500, async (url) => {
  process.env.DELIVERY_WEBHOOK_URL = url
  const r = await sendMail({ to: 'alisher@example.com', ...msg })
  ok('webhook 500 reported, no throw', r.ok === false && /500/.test(String(r.error)), JSON.stringify(r))
})
process.env.DELIVERY_WEBHOOK_URL = 'http://127.0.0.1:1/unreachable'
const unreachable = await sendMail({ to: 'alisher@example.com', ...msg })
ok('unreachable webhook reported, no throw', unreachable.ok === false, JSON.stringify(unreachable))

// 6) noto'g'ri manzil hech qachon tarmoqqa chiqmaydi
await withServer(ok200, async (url, got) => {
  process.env.DELIVERY_WEBHOOK_URL = url
  const bad = await sendMail({ to: 'buzilgan@@manzil', ...msg })
  ok('invalid email refused', bad.ok === false, JSON.stringify(bad))
  const empty = await sendMail({ to: '', ...msg })
  ok('empty email refused', empty.ok === false)
  ok('no request made for invalid email', got.length === 0, `got=${got.length}`)
})

// 7) off rejimi
process.env.MAIL_MODE = 'off'
const off = await sendMail({ to: 'alisher@example.com', ...msg })
ok('off mode sends nothing', off.ok === false && off.provider === 'off', JSON.stringify(off))
process.env.MAIL_MODE = 'log'
const logged = await sendMail({ to: 'alisher@example.com', ...msg })
ok('log mode counts as delivered', logged.ok && logged.provider === 'log', JSON.stringify(logged))

// env ni tiklash (boshqa testlar uchun)
if (savedMode === undefined) delete process.env.MAIL_MODE
else process.env.MAIL_MODE = savedMode
if (savedKey === undefined) delete process.env.RESEND_API_KEY
else process.env.RESEND_API_KEY = savedKey
if (savedUrl === undefined) delete process.env.DELIVERY_WEBHOOK_URL
else process.env.DELIVERY_WEBHOOK_URL = savedUrl
if (savedToken === undefined) delete process.env.DELIVERY_WEBHOOK_TOKEN
else process.env.DELIVERY_WEBHOOK_TOKEN = savedToken

console.log(`\nRESULT [delivery channels]: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
