import { Routes, Route, Navigate } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { Sidebar } from './components/Sidebar'
import BottomNav from './components/BottomNav'
import { CreatePost } from './components/CreatePost'
import { Home } from './pages/Home'
import { Reels } from './pages/Reels'
import { Photos } from './pages/Photos'
import { Profile } from './pages/Profile'
import { Groups } from './pages/Groups'
import { Pages } from './pages/Pages'
import { AdminPage } from './pages/Admin'
import { Messenger } from './pages/Messenger'
import { Settings } from './pages/Settings'
import { LoginPage } from './pages/Login'
import { RegisterPage } from './pages/Register'
import { useAuth } from './data/auth'
import { useI18n } from './i18n'

export default function App() {
  const { user, ready } = useAuth()
  const { t } = useI18n()
  if (!ready) return <div className="app-loading">{t('app.loading')}</div>
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }
  return (
    <div className="app-shell">
      <Navbar />
      <div className="app-body">
        <Sidebar />
        <main className="fn-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/reels" element={<Reels />} />
            <Route path="/photos" element={<Photos />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/pages" element={<Pages />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/messenger" element={<Messenger />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </main>
      </div>
      <BottomNav />
      <CreatePost />
    </div>
  )
}