import { MeContext } from './me-store'
import { useAuthUser } from './auth'
import type { User } from './mock'

const empty: User = { id: -1, name: '', username: '', avatar: '', online: false, about: '' }

export function MeProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthUser()
  return <MeContext.Provider value={user ?? empty}>{children}</MeContext.Provider>
}