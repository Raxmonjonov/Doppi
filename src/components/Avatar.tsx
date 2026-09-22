import type { User } from '../data/mock'

interface AvatarProps {
  user: User
  size?: number
  showOnline?: boolean
  className?: string
}

export function Avatar({ user, size = 40, showOnline = false, className }: AvatarProps) {
  const inner = user.avatar ? (
    <img
      className={`avatar ${className ?? ''}`}
      src={user.avatar}
      alt={user.name}
      width={size}
      height={size}
      loading="lazy"
    />
  ) : (
    <span
      className={`avatar avatar-fallback ${className ?? ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {user.name.split(' ').filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
    </span>
  )
  if (!showOnline) return inner
  return (
    <span className="avatar-wrap" style={{ width: size, height: size }}>
      {inner}
      {user.online && <span className="online-dot" />}
    </span>
  )
}