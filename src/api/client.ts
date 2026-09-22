const TOKEN_KEY = 'doppi-token-v1'

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

  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  const text = await res.text()
  const data = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T)

  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Xatolik: ${res.status}`)
  }
  return data
}