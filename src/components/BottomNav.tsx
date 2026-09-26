import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { Home, Play, Plus, User, Shield, Bell } from 'lucide-react'
import { useI18n } from '../i18n'
import { useNotifications } from '../data/notifications'

function BottomNav() {
  const { t } = useI18n()
  const { unread, setJoinRequest } = useNotifications()
  const openBell = () => window.dispatchEvent(new CustomEvent('fn:open-notifications'))

  useEffect(() => {
    const onOpen = () => openBell()
    window.addEventListener('fn:open-notifications', onOpen)
    return () => window.removeEventListener('fn:open-notifications', onOpen)
  }, [])

  return (
    <nav className="fn-bottomnav">
      <BnItem to="/" icon={Home} label={t('bottomNav.labelHome')} />
      <BnItem to="/reels" icon={Play} label={t('bottomNav.labelReels')} />
      <NavLink to="/" className="bottom-post" onClick={() => window.dispatchEvent(new CustomEvent('fn:open-post'))}>
        <Plus size={22} />
      </NavLink>
      <NavLink to="/messenger" className="fn-bottom-bell" title={t('notif.title')} aria-label={t('notif.title')} onClick={() => void setJoinRequest(null)}>
        <Bell size={24} />
        {unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
      </NavLink>
      <BnItem to="/admin" icon={Shield} label={t('bottomNav.labelAdmin')} />
      <BnItem to="/profile" icon={User} label={t('bottomNav.labelProfile')} />
    </nav>
  )
}

function BnItem({ to, icon: Icon, label }: { to: string; icon: typeof Home; label: string }) {
  return (
    <NavLink to={to} className={({ isActive }) => (isActive ? 'active' : '')} title={label} aria-label={label}>
      <Icon size={24} />
    </NavLink>
  )
}

export default BottomNav