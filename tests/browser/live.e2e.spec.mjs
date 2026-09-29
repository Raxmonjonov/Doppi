import { test, expect } from '@playwright/test'

// Brauzer WebRTC E2E: e'lonchi + tomoshabin (2 ta izolyatsiyalangan context).
// Talab: 127.0.0.1:4000 da Express server, 127.0.0.1:5173 da vite dev (proxy /api).

const API = process.env.E2E_API ?? 'http://127.0.0.1:4000'
const suffix = Date.now().toString(36).slice(-4)
const title = `E2E Jonli ${suffix}`
const A = { username: 'e2eA', password: 'E2e-parol1!', email: 'e2e-a@e2e.dev', name: 'E2E A' }
const B = { username: 'e2eB', password: 'E2e-parol1!', email: 'e2e-b@e2e.dev', name: 'E2E B' }

async function jreq(path, method, body, token) {
  // Netlify edge o'z-o'zidan intervalgacha tarmoq uzilishlari beradi.
  // Faqat FETCH darajasidagi (bog'lanish) xatolar qayta uriniladi — request
  // serverga yetib bormagani uchun dublikat xavfsiz; HTTP xatolar (5xx)
  // qayta urinilMAYDI (ular haqiqiy server javobi).
  let lastErr
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${API}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      })
      return { status: r.status, json: await r.json().catch(() => ({})) }
    } catch (e) {
      lastErr = e
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)))
    }
  }
  throw lastErr
}

// Hisob bor bo'lsa login, yo'q bo'lsa register (register IP-limiti tufayli bajariladi bir marta).
async function ensureUser(u) {
  const login = await jreq('/api/auth/login', 'POST', { username: u.username, password: u.password })
  if (login.status === 200 && login.json?.token) {
    return { token: login.json.token, id: login.json.user?.id }
  }
  const reg = await jreq('/api/auth/register', 'POST', u)
  if (reg.status !== 200 || !reg.json?.token) throw new Error(`register ${u.username} -> ${reg.status} ${JSON.stringify(reg.json)}`)
  return { token: reg.json.token, id: reg.json.user?.id }
}

async function seedToken(context, token) {
  await context.addInitScript((t) => localStorage.setItem('doppi-token-v1', t), token)
}

test('jonli efir: ikki hisob, WebRTC oqim, tugatish va replay', async ({ browser }) => {
  const me = await ensureUser(A)
  const tokA = me.token
  const meId = me.id
  const tokB = (await ensureUser(B)).token

  // Oldingi muvaffaqiyatsiz run'lar qoldirgan 'live' holatdagi efirlarni yopamiz
  // (faqat o'zimiznikilarni), aks holda Live sahifasida eski kartalar qoladi.
  const dataAll = await jreq('/api/data', 'GET', undefined, tokA)
  for (const l of dataAll.json.lives ?? []) {
    if (l.status === 'live' && meId && l.owner?.id === meId) {
      await jreq(`/api/lives/${l.id}/end`, 'POST', { video: '', duration: 0, title: l.title }, tokA)
    }
  }

  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  await seedToken(ctxA, tokA)
  await seedToken(ctxB, tokB)

  const pageA = await ctxA.newPage()
  const pageB = await ctxB.newPage()

  if (process.env.E2E_DEBUG) {
    const logSig = (who) => async (res) => {
      const u = res.url()
      if (/\/api\/lives\/\d+\/signals/.test(u)) {
        try {
          const b = await res.json()
          console.log(`[E2E-DEBUG:${who}]`, res.status(), JSON.stringify({ sigs: (b.signals ?? []).map((s) => `${s.kind}:${s.from}`), v: b.viewers }))
        } catch (e) {
          console.log(`[E2E-DEBUG:${who}]`, res.status(), 'n/a')
        }
      } else if (/\/api\/auth\/me/.test(u)) {
        const b = await res.json().catch(() => ({}))
        console.log(`[E2E-DEBUG:${who}]`, 'me', res.status(), JSON.stringify(b).slice(0, 200))
      } else if (/\/api\/data/.test(u)) {
        const b = await res.text().catch(() => '')
        console.log(`[E2E-DEBUG:${who}]`, 'data', res.status(), String(b).slice(0, 120))
      }
    }
    pageA.on('response', logSig('A'))
    pageB.on('response', logSig('B'))
  }

  // --- E'lonchi efir boshlaydi ---
  await pageA.goto('/live')
  await expect(pageA.locator('.live-head .btn').first()).toBeVisible()
  await pageA.locator('.live-head .btn').first().click()
  await expect(pageA.locator('.live-start-panel')).toBeVisible()
  await pageA.locator('.live-start-panel .form-input').fill(title)
  await pageA.locator('.live-start-panel button.btn-primary').click()
  // BroadcastRoom (egasi) — URL /live/<id>, kamera ona
  await expect(pageA).toHaveURL(/\/live\/\d+$/, { timeout: 20_000 })
  await expect(pageA.locator('.live-room video')).toBeVisible()
  await expect(pageA.locator('.live-room .live-viewers')).toBeVisible()
  await pageA.waitForTimeout(3000) // MediaRecorder chunklar to'planishi

  // --- Tomoshabin efirni ochadi ---
  await pageB.goto('/live')
  const card = pageB.locator('.live-card-main', { hasText: title })
  await expect(card.first()).toBeVisible({ timeout: 20_000 })
  await card.first().click()
  await expect(pageB).toHaveURL(/\/live\/\d+$/)
  await expect(pageB.locator('.live-room video')).toBeVisible()

  // E'lonchi tomoshabinni ko'radi (viewers=1)
  await expect(pageA.locator('.live-room .live-viewers')).toHaveText(/\b1\b/, { timeout: 30_000 })

  // WebRTC oqim tomoshabinda: video haqiqiy o'lchamga ega bo'ladi
  await expect
    .poll(
      () => pageB.locator('.live-room video').evaluate((el) => el.videoWidth),
      { timeout: 45_000, intervals: [250, 500, 1000, 2000] },
    )
    .toBeGreaterThan(0)
  // Ovoz oqimi ham kelgan bo'lishi kerak (video+audio translyatsiya)
  await expect
    .poll(
      () =>
        pageB.locator('.live-room video').evaluate((el) => el.srcObject?.getAudioTracks?.().length ?? 0),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0)

  // --- Tugatish --> replay /videos da ---
  await pageA.locator('.live-room .btn-danger').click()
  await expect(pageA).toHaveURL(/\/videos/, { timeout: 30_000 })
  const replay = pageA.locator('.videos-grid .video-card', { hasText: title }).first()
  await expect(replay).toBeVisible({ timeout: 30_000 })
  await expect(replay.locator('.live-badge.stale-badge')).toBeVisible()

  // Tomoshabin "efir tugadi" holatini ko'radi (store sync -> LiveRoom ended tarmog'i)
  await expect(pageB.locator('.live-room-finished')).toBeVisible({ timeout: 30_000 })
  await expect(pageB.locator('.live-room-finished')).toContainText('yakunlandi')

  await ctxA.close()
  await ctxB.close()
})