import { translate } from '../i18n'

const tr = (key: string, params?: Record<string, string | number>) => {
  let lang = 'uz'
  try {
    lang = localStorage.getItem('doppi-lang-v1') ?? 'uz'
  } catch {
    /* ignore */
  }
  return translate(lang, key, params)
}

const TOKEN_KEY = 'doppi-token-v1'

// Backend bazasi: Netlify'da VITE_API_URL env'idа ko'rsatiladi.
// Rivojlanishda (vite proxy) va bir xil hostda bo'lganda — bo'sh qoladi.
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ?? ''

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = {}
  const token = options.token === undefined ? getToken() : options.token
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  const text = await res.text()
  let data: T & { error?: string } = {} as T & { error?: string }
  if (text) {
    // Netlify kabi statik hostda API mavjud bo'lmasa /api -> index.html qaytishi mumkin:
    if (!res.ok && text.trimStart().startsWith('<!')) {
      throw new Error(tr('api.backendUnreachable'))
    }
    data = JSON.parse(text) as T & { error?: string }
  }

  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Xatolik: ${res.status}`)
  }
  return data
}