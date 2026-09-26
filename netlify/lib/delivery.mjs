/* Do'ppi — yetkazib berish kanallari.
 *
 * Parol tiklash kodi avval faqat server logiga yozilardi, ya'ni foydalanuvchi
 * uni ololmasdi. Bu modul kodni haqiqiy kanal orqali yuboradi.
 *
 * Kanal MAIL_MODE orqali tanlanadi:
 *   resend   RESEND_API_KEY + MAIL_FROM  -> https://api.resend.com/emails
 *   webhook  DELIVERY_WEBHOOK_URL       -> {to, subject, text, html, code, username}
 *   log      (sukut bo'yicha, dev)      -> faqat server logi
 *   off      butunlay o'chirish
 *
 * Ataylab SMTP ishlatilmaydi: Netlify/serverless muhitlarida 25/465/587
 * portlari odatda bloklangan. Shu sababli kanallar HTTP asosida.
 *
 * Muhim: bu modul hech qachon kodni API javobiga qo'shmaydi va mavjud
 * foydalanuvchini oshkor qilmaydi — yetkazish muvaffaqiyatsiz bo'lsa ham
 * `forgot` so'rovi bir xil `{ok:true, sent:true}` qaytaradi.
 */

const DEFAULT_FROM = "Do'ppi <no-reply@doppi.app>"

function env(name) {
  return String(process.env[name] ?? '').trim()
}

export function mailMode() {
  const explicit = env('MAIL_MODE').toLowerCase()
  if (explicit === 'resend' || explicit === 'webhook' || explicit === 'log' || explicit === 'off') return explicit
  if (env('RESEND_API_KEY')) return 'resend'
  if (env('DELIVERY_WEBHOOK_URL')) return 'webhook'
  return 'log'
}

/* Foydalanuvchining email manzilini tekshiramiz: bo'sh yoki noto'g'ri
 * shaklda bo'lsa xabar yuborilmaydi (server logida sabab qoladi). */
export function isDeliverableEmail(value) {
  const email = String(value ?? '').trim()
  if (!email || email.length > 254) return false
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) return false
  if (email.includes('..')) return false
  return true
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* Bitta xabar: `{to, subject, text}` -> `{ok, provider, error?}`.
 * Hech qachon istisno tashlamaydi — yetkazib berish muvaffaqiyatsizligi
 * asosiy oqimni (kodning saqlanishi, API javobi) buzmasligi kerak. */
export async function sendMail({ to, subject, text, html, code, username } = {}) {
  const mode = mailMode()
  const toAddr = String(to ?? '').trim()

  if (mode === 'off') return { ok: false, provider: 'off', error: 'yetkazish o‘chirilgan' }
  if (!isDeliverableEmail(toAddr)) {
    console.warn(`[yetkazish] manzil yaroqsiz: ${toAddr ? toAddr.slice(0, 40) : '(bo‘sh)'}`)
    return { ok: false, provider: mode, error: 'noto‘g‘ri manzil' }
  }

  if (mode === 'log') {
    console.log(`[yetkazish:log] -> ${toAddr} | ${subject} | ${String(text ?? '').replace(/\n+/g, ' ').slice(0, 120)}`)
    return { ok: true, provider: 'log' }
  }

  if (mode === 'resend') {
    const key = env('RESEND_API_KEY')
    if (!key) return { ok: false, provider: 'resend', error: 'RESEND_API_KEY yo‘q' }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env('MAIL_FROM') || DEFAULT_FROM,
          to: [toAddr],
          subject: String(subject ?? ''),
          text: String(text ?? ''),
          ...(html ? { html: String(html) } : {}),
        }),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        console.error(`[yetkazish] resend ${res.status}: ${detail.slice(0, 200)}`)
        return { ok: false, provider: 'resend', error: `resend ${res.status}` }
      }
      return { ok: true, provider: 'resend' }
    } catch (e) {
      console.error('[yetkazish] resend xatosi:', e.message)
      return { ok: false, provider: 'resend', error: e.message }
    }
  }

  // webhook: Telegram bot, Mailgun, ichki microservice — hammasi shu shaklda
  const url = env('DELIVERY_WEBHOOK_URL')
  if (!url) return { ok: false, provider: 'webhook', error: 'DELIVERY_WEBHOOK_URL yo‘q' }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env('DELIVERY_WEBHOOK_TOKEN') ? { Authorization: `Bearer ${env('DELIVERY_WEBHOOK_TOKEN')}` } : {}),
      },
      /* Telegram-botga mos webhook shu maydonlarni to'g'ridan-to'g'ri ishlatadi:
       `code` — 6 raqamli kod, `username` — kimga yuborilgani, `text` — tayyor xabar. */
    body: JSON.stringify({
      to: toAddr,
      subject: String(subject ?? ''),
      text: String(text ?? ''),
      html: html ?? null,
      ...(code ? { code: String(code) } : {}),
      ...(username ? { username: String(username) } : {}),
    }),
    })
    if (!res.ok) {
      console.error(`[yetkazish] webhook ${res.status}`)
      return { ok: false, provider: 'webhook', error: `webhook ${res.status}` }
    }
    return { ok: true, provider: 'webhook' }
  } catch (e) {
    console.error('[yetkazish] webhook xatosi:', e.message)
    return { ok: false, provider: 'webhook', error: e.message }
  }
}

export function appName() {
  return env('APP_NAME') || "Do'ppi"
}

export function appUrl() {
  return env('APP_URL') || env('PUBLIC_URL') || ''
}

/* Parol tiklash xabari. `url` — kodni kiritish sahifasi (bo'lsa havola
 * qo'shiladi, aks holda foydalanuvchi kodni qo'lda kiritadi). */
export function resetCodeMessage({ code, username, url, minutes = 10 } = {}) {
  const app = appName()
  const minutesText = String(minutes)
  const link = url ? `\n\n${url}` : ''
  const subject = `${app}: parol tiklash kodi`
  const text =
    `Salom${username ? ', ' + username : ''}!\n\n` +
    `Parol tiklash kodingiz: ${code}\n` +
    `Kod ${minutesText} daqiqa amal qiladi va bir marta ishlatiladi.\n` +
    `Bu so'rovni siz qilmagan bo'lsangiz kodni hech kimga bermang — ` +
    `parolni o'zgartirish shart emas.` +
    link
  const html =
    `<p>Salom${username ? ', ' + escapeHtml(username) : ''}!</p>` +
    `<p>Parol tiklash kodingiz: <b style="font-size:20px;letter-spacing:2px">${escapeHtml(code)}</b></p>` +
    `<p>Kod ${minutesText} daqiqa amal qiladi va bir marta ishlatiladi.</p>` +
    `<p>Bu so'rovni siz qilmagan bo'lsangiz kodni hech kimga bermang — parolni o'zgartirish shart emas.</p>` +
    (url ? `<p><a href="${escapeHtml(url)}">Parolni tiklash</a></p>` : '')
  return { subject, text, html, code: String(code ?? ''), username: String(username ?? '') }
}
