import { useEffect, useState } from 'react'
import {
  Users,
  Wifi,
  WifiOff,
  UserPlus,
  FileText,
  MessageSquare,
  Play,
  Film,
  FolderOpen,
  BookOpen,
  Trash2,
  FileUp,
  Repeat,
  RefreshCw,
  LogOut,
  AlertCircle,
  ShieldCheck,
  KeyRound,
} from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { api } from '../api/client'
import { useI18n } from '../i18n'

const SESSION_KEY = 'doppi-admin-v1'

interface Totals {
  users: number
  online: number
  offline: number
  posts: number
  comments: number
  reels: number
  messages: number
  threads: number
  groups: number
  albums: number
  stories: number
  follows: number
}

interface GrowthPoint {
  day: string
  count: number
}

interface UserBrief {
  id: number
  name: string
  username: string
  avatar: string
}

interface RecentUser extends UserBrief {
  lastLoginAt: string
  createdAt: string
}

interface DashboardData {
  totals: Totals
  growth: GrowthPoint[]
  lastLogout: (UserBrief & { at: number }) | null
  lastOnline: UserBrief[]
  recentUsers: RecentUser[]
}

interface AdminUserRow {
  id: number
  username: string
  name: string
  email: string
  avatar: string
  createdAt: string
  lastLoginAt: string
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function na(v: number): string {
  return v > 0 ? String(v) : '0'
}

export function AdminPage() {
  const { t } = useI18n()
  const [authed, setAuthed] = useState(() => {
    try {
      return !!localStorage.getItem(SESSION_KEY)
    } catch {
      return false
    }
  })

  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    setBusy(true)
    try {
      const res = await api<{ token: string }>('/api/admin/login', {
        method: 'POST',
        body: { username: u.trim(), password: p },
        token: null,
      })
      try {
        localStorage.setItem(SESSION_KEY, res.token)
      } catch {
        /* ignore */
      }
      setAuthed(true)
    } catch (err) {
      setLoginError(err instanceof Error ? (err.message === 'Xatolik: 401' ? t('admin.invalidCredentials') : err.message) : t('admin.invalidCredentials'))
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    const token = localStorage.getItem(SESSION_KEY)
    try {
      if (token) {
        api<{ ok: boolean }>('/api/admin/logout', { method: 'POST', body: {}, token }).catch(() => {})
      }
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
    setAuthed(false)
    setU('')
    setP('')
  }

  if (!authed) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="auth-logo">Do'ppi</div>
            <p className="auth-tag">{t('admin.loginTitle')}</p>
          </div>

          <form className="auth-form" onSubmit={login}>
            <label className="auth-field">
              <span>{t('admin.usernameLabel')}</span>
              <input value={u} onChange={(e) => setU(e.target.value)} placeholder="Admin" autoComplete="username" autoFocus disabled={busy} />
            </label>

            <label className="auth-field">
              <span>{t('admin.passwordLabel')}</span>
              <input type="password" value={p} onChange={(e) => setP(e.target.value)} placeholder="••••••••" autoComplete="current-password" disabled={busy} />
            </label>

            {loginError && (
              <div className="auth-error">
                <AlertCircle size={16} /> {loginError}
              </div>
            )}

            <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
              <ShieldCheck size={16} /> {t('admin.submit')}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return <AdminStats t={t} onLogout={logout} />
}

function AdminStats({ t, onLogout }: { t: (k: string, p?: Record<string, string | number>) => string; onLogout: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    const adminToken = localStorage.getItem(SESSION_KEY)
    api<DashboardData>('/api/dashboard', { token: adminToken })
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : 'Xatolik'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // Yashirin tabda dashboard so'rovi pauza (compute suspend uchun);
    // qaytganda visibilitychange darhol yangilaydi.
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      load()
    }, 15000)
    const onVis = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totals = data?.totals
  const maxGrowth = Math.max(1, ...(data?.growth ?? []).map((g) => g.count))

  const [gcBusy, setGcBusy] = useState(false)
  const [gcNote, setGcNote] = useState<string | null>(null)
  const [migBusy, setMigBusy] = useState(false)
  const [migNote, setMigNote] = useState<string | null>(null)

  const runMigrate = async () => {
    setMigBusy(true)
    setMigNote(null)
    try {
      const adminToken = localStorage.getItem(SESSION_KEY)
      const r = await api<{ migrated: number; skipped: number }>('/api/media/migrate?limit=50', { method: 'POST', token: adminToken })
      setMigNote(t('admin.migrateDone', { migrated: r.migrated, skipped: r.skipped }))
      load()
    } catch (e) {
      setMigNote(e instanceof Error ? e.message : 'Xatolik')
    } finally {
      setMigBusy(false)
    }
  }

  const runGc = async () => {
    setGcBusy(true)
    setGcNote(null)
    try {
      const adminToken = localStorage.getItem(SESSION_KEY)
      const r = await api<{ removed: number; kept: number }>('/api/media/gc', { method: 'POST', token: adminToken })
      setGcNote(t('admin.gcDone', { removed: r.removed, kept: r.kept }))
      load()
    } catch (e) {
      setGcNote(e instanceof Error ? e.message : 'Xatolik')
    } finally {
      setGcBusy(false)
    }
  }

  /* ---- Foydalanuvchilar boshqaruvi (api-core/Express GET admin/users) ---- */
  const [usersOpen, setUsersOpen] = useState(false)
  const [users, setUsers] = useState<AdminUserRow[] | null>(null)
  const [usersLoading, setUsersLoading] = useState(false)
  const [userQ, setUserQ] = useState('')
  const [resetFor, setResetFor] = useState<number | null>(null)
  const [newPw, setNewPw] = useState('')
  const [userBusy, setUserBusy] = useState(false)
  const [userNote, setUserNote] = useState<string | null>(null)

  const loadUsers = async () => {
    setUsersLoading(true)
    setUserNote(null)
    try {
      const adminToken = localStorage.getItem(SESSION_KEY)
      const r = await api<{ users: AdminUserRow[] }>('/api/admin/users', { token: adminToken })
      setUsers(r.users)
    } catch (e) {
      setUserNote(e instanceof Error ? e.message : 'Xatolik')
    } finally {
      setUsersLoading(false)
    }
  }

  const toggleUsers = () => {
    const open = !usersOpen
    setUsersOpen(open)
    if (open && users === null) void loadUsers()
  }

  const doResetPw = async (id: number) => {
    setUserBusy(true)
    setUserNote(null)
    try {
      const adminToken = localStorage.getItem(SESSION_KEY)
      await api<{ ok: boolean }>(`/api/admin/users/${id}/password`, { method: 'POST', body: { password: newPw }, token: adminToken })
      setUserNote(t('admin.passwordResetDone'))
      setResetFor(null)
      setNewPw('')
    } catch (e) {
      setUserNote(e instanceof Error ? e.message : 'Xatolik')
    } finally {
      setUserBusy(false)
    }
  }

  const doDeleteUser = async (u: AdminUserRow) => {
    if (!window.confirm(t('admin.deleteConfirm', { username: u.username }))) return
    setUserBusy(true)
    setUserNote(null)
    try {
      const adminToken = localStorage.getItem(SESSION_KEY)
      await api<{ ok: boolean }>(`/api/admin/users/${u.id}`, { method: 'DELETE', token: adminToken })
      setUserNote(t('admin.userDeleted', { username: u.username }))
      setUsers((prev) => prev?.filter((x) => x.id !== u.id) ?? null)
      setResetFor(null)
      load() // dashboard jami sonlarini yangilash
    } catch (e) {
      setUserNote(e instanceof Error ? e.message : 'Xatolik')
    } finally {
      setUserBusy(false)
    }
  }

  const filteredUsers = (users ?? []).filter((u) => {
    const q = userQ.trim().toLowerCase()
    if (!q) return true
    return `${u.username} ${u.name} ${u.email}`.toLowerCase().includes(q)
  })

  return (
    <div className="fade-in dash-page">
      <div className="dash-head">
        <div>
          <h1 className="page-head">{t('admin.pageTitle')}</h1>
          <p className="page-sub">{t('admin.pageSub')}</p>
        </div>
        <div className="dash-head-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={runMigrate} disabled={migBusy}>
            <FileUp size={15} /> {t('admin.migrateMedia')}
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={runGc} disabled={gcBusy}>
            <Trash2 size={15} /> {t('admin.gcMedia')}
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} /> {t('dashboard.refresh')}
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={onLogout}>
            <LogOut size={15} /> {t('admin.logout')}
          </button>
        </div>
      </div>
      {gcNote && <div className="upload-error">{gcNote}</div>}
      {migNote && <div className="upload-error">{migNote}</div>}

      {error && <div className="dash-error">{error}</div>}

      {!totals ? (
        !error && <div className="card empty-state">{t('app.loading')}</div>
      ) : (
        <>
          <div className="dash-kpis">
            <div className="dash-kpi kpi-main">
              <Users size={18} />
              <span className="k-value">{na(totals.users)}</span>
              <span className="k-label">{t('dashboard.usersTotal')}</span>
            </div>
            <div className="dash-kpi kpi-ok">
              <Wifi size={18} />
              <span className="k-value">{na(totals.online)}</span>
              <span className="k-label">{t('dashboard.usersOnline')}</span>
            </div>
            <div className="dash-kpi kpi-grey">
              <WifiOff size={18} />
              <span className="k-value">{na(totals.offline)}</span>
              <span className="k-label">{t('dashboard.usersOffline')}</span>
            </div>
            <div className="dash-kpi">
              <UserPlus size={18} />
              <span className="k-value">{na(totals.posts)}</span>
              <span className="k-label">{t('dashboard.postsTotal')}</span>
            </div>
            <div className="dash-kpi">
              <MessageSquare size={18} />
              <span className="k-value">{na(totals.comments)}</span>
              <span className="k-label">{t('dashboard.commentsTotal')}</span>
            </div>
            <div className="dash-kpi">
              <Play size={18} />
              <span className="k-value">{na(totals.reels)}</span>
              <span className="k-label">{t('dashboard.reelsTotal')}</span>
            </div>
            <div className="dash-kpi">
              <FileText size={18} />
              <span className="k-value">{na(totals.messages)}</span>
              <span className="k-label">{t('dashboard.messagesTotal')}</span>
            </div>
            <div className="dash-kpi">
              <Film size={18} />
              <span className="k-value">{na(totals.threads)}</span>
              <span className="k-label">{t('dashboard.threadsTotal')}</span>
            </div>
            <div className="dash-kpi">
              <Users size={18} />
              <span className="k-value">{na(totals.groups)}</span>
              <span className="k-label">{t('dashboard.groupsTotal')}</span>
            </div>
            <div className="dash-kpi">
              <FolderOpen size={18} />
              <span className="k-value">{na(totals.albums)}</span>
              <span className="k-label">{t('dashboard.albumsTotal')}</span>
            </div>
            <div className="dash-kpi">
              <BookOpen size={18} />
              <span className="k-value">{na(totals.stories)}</span>
              <span className="k-label">{t('dashboard.storiesTotal')}</span>
            </div>
            <div className="dash-kpi">
              <Repeat size={18} />
              <span className="k-value">{na(totals.follows)}</span>
              <span className="k-label">{t('dashboard.followsTotal')}</span>
            </div>
          </div>

          <div className="dash-grid">
            <div className="card dash-card">
              <h4 className="dash-card-title">{t('dashboard.growthTitle')}</h4>
              <p className="page-sub">{t('dashboard.growthSub')}</p>
              <div className="dash-chart">
                {(data?.growth ?? []).map((g) => (
                  <div key={g.day} className="dash-col" title={`${g.day}: ${g.count}`}>
                    <div className="dash-bar" style={{ height: `${Math.max(2, (g.count / maxGrowth) * 100)}%` }} />
                  </div>
                ))}
              </div>
              <div className="dash-axis">
                {(data?.growth ?? []).map((g, i) => (
                  <span key={g.day} className={i % 3 !== 0 ? 'axis-empty' : ''}>
                    {g.day.slice(5)}
                  </span>
                ))}
              </div>
            </div>

            <div className="card dash-card">
              <h4 className="dash-card-title">{t('dashboard.lastLogoutTitle')}</h4>
              {data?.lastLogout ? (
                <div className="dash-user-row">
                  <Avatar user={{ id: data.lastLogout.id, name: data.lastLogout.name, username: data.lastLogout.username, avatar: data.lastLogout.avatar, online: false }} size={40} />
                  <div>
                    <div className="dash-user-name">{data.lastLogout.name}</div>
                    <div className="dash-user-sub">@{data.lastLogout.username} · {shortDate(new Date(data.lastLogout.at).toISOString())}</div>
                  </div>
                </div>
              ) : (
                <div className="dash-empty">{t('dashboard.lastLogoutEmpty')}</div>
              )}

              <h4 className="dash-card-title" style={{ marginTop: 18 }}>
                {t('dashboard.onlineNowTitle')}
              </h4>
              {(data?.lastOnline?.length ?? 0) > 0 ? (
                <div className="dash-online-list">
                  {data?.lastOnline.map((u) => (
                    <div key={u.id} className="dash-user-row">
                      <Avatar user={{ id: u.id, name: u.name, username: u.username, avatar: u.avatar, online: true }} size={36} showOnline />
                      <div>
                        <div className="dash-user-name">{u.name}</div>
                        <div className="dash-user-sub">@{u.username}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="dash-empty">{t('dashboard.onlineNowEmpty')}</div>
              )}
            </div>

            <div className="card dash-card dash-card-full">
              <h4 className="dash-card-title">{t('dashboard.recentUsersTitle')}</h4>
              {(data?.recentUsers?.length ?? 0) > 0 ? (
                <div className="dash-online-list dash-recent-grid">
                  {data?.recentUsers.map((u) => (
                    <div key={u.id} className="dash-user-row">
                      <Avatar user={{ id: u.id, name: u.name, username: u.username, avatar: u.avatar, online: true }} size={36} showOnline />
                      <div>
                        <div className="dash-user-name">{u.name}</div>
                        <div className="dash-user-sub">
                          @{u.username} · {shortDate(u.lastLoginAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="dash-empty">{t('dashboard.recentUsersEmpty')}</div>
              )}
            </div>
          </div>

          <div className="card dash-card dash-card-full" style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h4 className="dash-card-title" style={{ marginTop: 0 }}>
                  {t('admin.usersTitle')}
                </h4>
                <p className="page-sub" style={{ margin: 0 }}>
                  {t('admin.usersSub')}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input className="form-input" style={{ maxWidth: 200 }} data-testid="admin-user-search" placeholder={t('admin.userSearch')} value={userQ} onChange={(e) => setUserQ(e.target.value)} disabled={!usersOpen} />
                <button type="button" className="btn btn-outline btn-sm" data-testid="admin-users-toggle" onClick={toggleUsers}>
                  {usersOpen ? '−' : '+'} {t('admin.usersShow')}
                </button>
                {usersOpen && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => void loadUsers()} disabled={usersLoading}>
                    <RefreshCw size={15} className={usersLoading ? 'spin' : ''} />
                  </button>
                )}
              </div>
            </div>
            {userNote && <div className="upload-error">{userNote}</div>}
            {usersOpen &&
              (users === null || usersLoading ? (
                <div className="dash-empty">{t('app.loading')}</div>
              ) : filteredUsers.length === 0 ? (
                <div className="dash-empty">{t('admin.noUsers')}</div>
              ) : (
                <div className="dash-online-list" style={{ marginTop: 10 }}>
                  {filteredUsers.map((u) => (
                    <div key={u.id} className="dash-user-row" data-testid={`admin-user-${u.username}`} style={{ borderTop: '1px solid rgba(127,127,127,.15)', paddingTop: 10 }}>
                      <Avatar user={{ id: u.id, name: u.name, username: u.username, avatar: u.avatar, online: false }} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="dash-user-name">{u.name}</div>
                        <div className="dash-user-sub">
                          @{u.username} · {u.email} · {u.createdAt ? shortDate(u.createdAt) : ''}
                        </div>
                        {resetFor === u.id && (
                          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                            <input
                              className="form-input"
                              type="password"
                              style={{ maxWidth: 200 }}
                              placeholder={t('admin.newPassword')}
                              value={newPw}
                              onChange={(e) => setNewPw(e.target.value)}
                              disabled={userBusy}
                              autoFocus
                            />
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => void doResetPw(u.id)} disabled={userBusy || newPw.trim().length < 8}>
                              {t('admin.save')}
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => {
                                setResetFor(null)
                                setNewPw('')
                              }}
                              disabled={userBusy}
                            >
                              {t('admin.cancel')}
                            </button>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          title={t('admin.resetPassword')}
                          disabled={userBusy}
                          onClick={() => {
                            setResetFor(resetFor === u.id ? null : u.id)
                            setNewPw('')
                          }}
                        >
                          <KeyRound size={15} />
                        </button>
                        <button type="button" className="btn btn-outline btn-sm" title={t('admin.deleteUser')} disabled={userBusy} onClick={() => void doDeleteUser(u)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  )
}