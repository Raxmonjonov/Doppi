import { useContext } from 'react'
import { MeContext } from './me-store'

export function useMe() {
  return useContext(MeContext)
}