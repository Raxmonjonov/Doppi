import { NavLink } from 'react-router-dom'
import {
  Home,
  Users,
  Play,
  Map,
  Settings,
  MessageCircle,
  UserPlus,
  Shield,
  Hourglass,
  type LucideIcon,
} from 'lucide-react'
import { Avatar } from './Avatar'
import { useMe } from '../data/useMe'
import { useI18n } from '../i18n'

interface Item {
  to: string
  icon: LucideIcon
  label: string
}

const items: Item[] = [
  { to: '/', icon: Home, label: 'sidebar.labelHome' },
  { to: '/reels', icon: Play, label: 'sidebar.labelReels' },
  { to: '/seals', icon: Hourglass, label: 'sidebar.labelSeals' },
  { to: '/groups', icon: Users, label: 'sidebar.labelGroups' },
  { to: '/photos', icon: Map, label: 'sidebar.labelAlbums' },
  { to: '/messenger', icon: MessageCircle, label: 'sidebar.labelMessages' },
  { to: '/profile', icon: UserPlus, label: 'sidebar.labelProfile' },
  { to: '/admin', icon: Shield, label: 'sidebar.labelAdmin' },
  { to: '/settings', icon: Settings, label: 'sidebar.labelSettings' },
]

export function Sidebar() {
  const { t } = useI18n()
  const me = useMe()
  return (
    <nav className="fn-sidebar">
      <NavLink to="/profile" className="side-link">
        <Avatar user={me} size={28} />
        <span>{me.name}</span>
      </NavLink>
      {items.map((item) => {
        const Icon = item.icon
        return (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
            <Icon size={22} />
            <span>{t(item.label)}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}