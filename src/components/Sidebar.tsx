import { NavLink } from 'react-router-dom'
import {
  Home,
  Users,
  Play,
  Map,
  Settings,
  MessageCircle,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { Avatar } from './Avatar'
import { useMe } from '../data/useMe'

interface Item {
  to: string
  icon: LucideIcon
  label: string
}

const items: Item[] = [
  { to: '/', icon: Home, label: 'Uy' },
  { to: '/reels', icon: Play, label: 'Reels' },
  { to: '/groups', icon: Users, label: 'Guruhlar' },
  { to: '/photos', icon: Map, label: 'Fotoalbomlar' },
  { to: '/messenger', icon: MessageCircle, label: 'Xabarlar' },
  { to: '/profile', icon: UserPlus, label: 'Profil' },
  { to: '/settings', icon: Settings, label: 'Sozlamalar' },
]

export function Sidebar() {
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
            <span>{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}