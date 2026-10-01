import { test, expect } from '@playwright/test'

// Admin panel: foydalanuvchilar ro'yxati, parol tiklash va kaskad
// o'chirish — UI oqimi. API tekshiruvlari shu spec ichida (register/login).
// Talab: 127.0.0.1:4000 (E2E_API) + admin env; baseURL (E2E_BASE yoki 5173).

const API = process.env.E2E_API ?? 'http://127.0.0.1:4000'
const AU = process.env.ADMIN_USERNAME ?? ''
const AP = process.env.ADMIN_PASSWORD ?? ''

const suffix = Date.now().toString(36).slice(-4)
const uname = `adm${suffix}`
const user = { username: uname, password: 'E2e-parol1!', email: `${uname}@e2e.dev`, name: 'Adm Test' }
const newPw = 'YangiParol1!'

async function jreq(path, method, body, token) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}

test.describe('admin users UI', () => {
  test.skip(!AU || !AP, 'ADMIN_USERNAME/ADMIN_PASSWORD kerak (env)')

  test('ro‘yxat -> parol tiklash -> kaskad o‘chirish', async ({ page }) => {
    // 1. Scratch hisob (test oxirida o'chiriladi). /admin faqat oddiy
    // user sessiyasidan keyin ochiladi (App.tsx gate) — token seed shart.
    const reg = await jreq('/api/auth/register', 'POST', user)
    expect(reg.status, JSON.stringify(reg.json)).toBe(200)
    const tok = reg.json.token
    expect(tok).toBeTruthy()
    await page.addInitScript((t) => localStorage.setItem('doppi-token-v1', t), tok)

    page.once('dialog', (d) => void d.accept())

    // 2. Admin paneli -> admin gate -> login
    await page.goto('/admin')
    await expect(page.locator('.auth-form')).toBeVisible()
    await page.locator('.auth-field input').first().fill(AU)
    await page.locator('.auth-field input[type="password"]').fill(AP)
    await page.locator('button.auth-submit').click()
    await expect(page.locator('.dash-page')).toBeVisible({ timeout: 30_000 })

    // 3. Foydalanuvchilar panelini ochamiz
    await page.getByTestId('admin-users-toggle').click()
    await page.getByTestId(`admin-user-${uname}`).waitFor({ timeout: 30_000 })

    // Qidiruv qatorni ko'rsatadi
    await page.getByTestId('admin-user-search').fill(uname)
    await expect(page.getByTestId(`admin-user-${uname}`)).toBeVisible()
    const row = page.getByTestId(`admin-user-${uname}`)

    // 4. Parol tiklash (inline forma)
    await row.locator('button[title]').first().click() // KeyRound
    await row.locator('input[type="password"]').fill(newPw)
    await row.locator('button').filter({ hasText: /Saqlash|Save/ }).click()
    await expect(page.locator('.upload-error')).toBeVisible()
    // Eski parol ishlamaydi, yangi ishlaydi
    expect((await jreq('/api/auth/login', 'POST', { username: uname, password: user.password })).status).toBe(401)
    const login2 = await jreq('/api/auth/login', 'POST', { username: uname, password: newPw })
    expect(login2.status).toBe(200)

    // 5. Kaskad o'chirish (confirm dialog avtomatik tasdiqlanadi)
    await row.locator('button[title]').nth(1).click() // Trash2
    await expect(row).toHaveCount(0, { timeout: 15_000 })
    await expect(page.locator('.upload-error')).toContainText(uname)
    expect((await jreq('/api/auth/login', 'POST', { username: uname, password: newPw })).status).toBe(401)
    const list = await jreq('/api/admin/users', 'GET', undefined, (await jreq('/api/admin/login', 'POST', { username: AU, password: AP })).json?.token)
    expect((list.json?.users ?? []).some((x) => x.username === uname)).toBe(false)
  })
})
