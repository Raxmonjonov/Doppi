import { useEffect, useRef } from 'react'
import { GOOGLE_CLIENT_ID } from '../config'
import { useAuth } from '../data/auth'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string
            callback: (res: { credential: string }) => void
            auto_select?: boolean
          }) => void
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void
          prompt: () => void
        }
      }
    }
  }
}

function decodeJwt(token: string): Record<string, unknown> {
  const parts = token.split('.')
  if (parts.length < 2) return {}
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
  try {
    return JSON.parse(decodeURIComponent(atob(padded).replace(/(.)/g, (m) => '%' + m.charCodeAt(0).toString(16).padStart(2, '0'))))
  } catch {
    return {}
  }
}

export function GoogleAuthButton() {
  const { googleSignIn } = useAuth()
  const btnRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const g = window.google?.accounts?.id
    if (!g) return

    g.initialize({
      client_id: GOOGLE_CLIENT_ID,
      auto_select: false,
      callback: (res) => {
        const data = decodeJwt(res.credential)
        const profile = {
          sub: String(data.sub || ''),
          email: String(data.email || ''),
          name: String(data.name || ''),
          picture: String(data.picture || ''),
        }
        googleSignIn(profile)
      },
    })

    if (btnRef.current) {
      g.renderButton(btnRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleSignIn, GOOGLE_CLIENT_ID])

  return <div className="google-btn-wrap" ref={btnRef} />
}