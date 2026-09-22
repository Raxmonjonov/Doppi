import { NavLink } from 'react-router-dom'
import { Home, Play, Plus, MessageCircle, User } from 'lucide-react'

function BottomNav() {
  return (
    <nav className="fn-bottomnav">
      <BnItem to="/" icon={Home} label="Uy" />
      <BnItem to="/reels" icon={Play} label="Reels" />
      <NavLink to="/" className="bottom-post" onClick={() => window.dispatchEvent(new CustomEvent('fn:open-post'))}>
        <Plus size={22} />
      </NavLink>
      <BnItem to="/messenger" icon={MessageCircle} label="Xabarlar" />
      <BnItem to="/profile" icon={User} label="Profil" />
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