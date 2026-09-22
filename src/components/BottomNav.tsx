import { NavLink } from 'react-router-dom'
import { Home, Play, Plus, MessageCircle, User } from 'lucide-react'
import { useI18n } from '../i18n'

function BottomNav() {
  const { t } = useI18n()
  return (
    <nav className="fn-bottomnav">
      <BnItem to="/" icon={Home} label={t('bottomNav.labelHome')} />
      <BnItem to="/reels" icon={Play} label={t('bottomNav.labelReels')} />
      <NavLink to="/" className="bottom-post" onClick={() => window.dispatchEvent(new CustomEvent('fn:open-post'))}>
        <Plus size={22} />
      </NavLink>
      <BnItem to="/messenger" icon={MessageCircle} label={t('bottomNav.labelMessages')} />
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