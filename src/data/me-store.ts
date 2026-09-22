import { createContext } from 'react'
import type { User } from './mock'

export const MeContext = createContext<User>({
  id: -1,
  name: '',
  username: '',
  avatar: '',
  online: true,
  about: '',
})