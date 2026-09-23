import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from './mock'
import { api, getToken, setToken } from '../api/client'

export interface Account {
  id: number
  name: string
  username: string
  email: string
  password?: string
  avatar: string
  about: string
  googleId?: string
  createdAt: string
}

interface AuthContextValue {
  user: Account | null
  accounts: Account[]
  ready: boolean
  login: (username: string, password: string) => Promise<string | null>
  register: (data: Omit<Account, 'id' | 'createdAt' | 'avatar' | 'about'>) => Promise<string | null>
  logout: () => Promise<void>
  updateProfile: (patch: Partial<Pick<Account, 'name' | 'avatar' | 'about'>>) => Promise<void>
  refreshAccounts: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface LegacyAccount {
  id: number
  name: string
  username: string
  email: string
  password: string
  avatar: string
  about: string
  googleId?: string
  createdAt: string
}

async function migrateLegacyUsers(): Promise<{ username: string; password: string } | null> {
  const FLAG = 'doppi-migrated-v2'
  if (localStorage.getItem(FLAG)) return null
  localStorage.setItem(FLAG, '1')

  let legacy: LegacyAccount[] = []
  try {
    const raw = localStorage.getItem('doppi-accounts-v1')
    if (raw) legacy = JSON.parse(raw) as LegacyAccount[]
  } catch {
    legacy = []
  }
  if (legacy.length === 0) return null

  try {
    const { users } = await api<{ users: Account[] }>('/api/users')
    if (users.length > 0) return null
  } catch {
    return null
  }

  let active: { username: string; password: string } | null = null
  await Promise.all(
    legacy.map(async (u) => {
      try {
        await api<{ token: string; user: Account }>('/api/auth/register', {
          method: 'POST',
          body: {
            name: u.name,
            username: u.username,
            email: u.email,
            password: u.password,
          },
        })
      } catch {
        /* conflicting entry — skip */
      }
    }),
  )

  try {
    const activeId = localStorage.getItem('doppi-session-v1')
    const current = legacy.find((u) => u.id === Number(activeId))
    if (current) active = { username: current.username, password: current.password }
  } catch {
    active = null
  }

  try {
    localStorage.removeItem('doppi-accounts-v1')
    localStorage.removeItem('doppi-session-v1')
  } catch {
    /* ignore */
  }
  return active
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Account | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      void (async () => {
        const active = await migrateLegacyUsers()
        if (active) {
          try {
            const { token: t, user } = await api<{ token: string; user: Account }>('/api/auth/login', {
              method: 'POST',
              body: active,
            })
            setToken(t)
            setSession(user)
          } catch {
            /* ignore */
          }
        }
        setReady(true)
      })()
      return
    }
    ;(async () => {
      try {
        const { user } = await api<{ user: Account }>('/api/auth/me')
        setSession(user)
      } catch {
        setToken(null)
      } finally {
        setReady(true)
      }
    })()
  }, [])

  const refreshAccounts = async () => {
    try {
      const { users } = await api<{ users: Account[] }>('/api/users')
      setAccounts(users)
    } catch {
      /* noop */
    }
  }

  useEffect(() => {
    if (session) void refreshAccounts()
  }, [session])

  const login = async (username: string, password: string): Promise<string | null> => {
    try {
      const { token, user } = await api<{ token: string; user: Account }>('/api/auth/login', {
        method: 'POST',
        body: { username, password },
      })
      setToken(token)
      setSession(user)
      return null
    } catch (e) {
      return e instanceof Error ? e.message : 'Xatolik yuz berdi.'
    }
  }

  const register = async (data: Omit<Account, 'id' | 'createdAt' | 'avatar' | 'about'>): Promise<string | null> => {
    try {
      const { token, user } = await api<{ token: string; user: Account }>('/api/auth/register', {
        method: 'POST',
        body: data,
      })
      setToken(token)
      setSession(user)
      return null
    } catch (e) {
      return e instanceof Error ? e.message : 'Xatolik yuz berdi.'
    }
  }

  const logout = async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } catch {
      /* ignore */
    }
    setToken(null)
    setSession(null)
    setAccounts([])
  }

  const updateProfile = async (patch: Partial<Pick<Account, 'name' | 'avatar' | 'about'>>) => {
    if (!session) return
    try {
      const { user } = await api<{ user: Account }>('/api/auth/me', { method: 'PATCH', body: patch })
      setSession(user)
      await refreshAccounts()
    } catch {
      /* ignore */
    }
  }

  const value = useMemo<AuthContextValue>(
    () => ({ user: session, accounts, ready, login, register, logout, updateProfile, refreshAccounts }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, accounts, ready],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth AuthProvider ichida ishlatilishi kerak')
  return ctx
}

export function useAuthUser(): User | null {
  const { user } = useAuth()
  return useMemo<User | null>(
    () =>
      user
        ? { id: user.id, name: user.name, username: user.username, avatar: user.avatar, online: true, about: user.about }
        : null,
    [user],
  )
}