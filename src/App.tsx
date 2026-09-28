import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { Sidebar } from './components/Sidebar'
import BottomNav from './components/BottomNav'
import { CreatePost } from './components/CreatePost'
import { useAuth } from './data/auth'
import { useI18n } from './i18n'
import { NotificationsProvider } from './data/notifications'

/* Sahifalar faqat kerak bo'lganda yuklanadi (bitta katta chunk o'rniga):
   Messenger/Groups eng og'irlari — ular bo'lim ochilgandagina keladi. */
const Home = lazy(() => import('./pages/Home').then((m) => ({ default: m.Home })))
const Reels = lazy(() => import('./pages/Reels').then((m) => ({ default: m.Reels })))
const SealWall = lazy(() => import('./pages/SealWall'))
const Photos = lazy(() => import('./pages/Photos').then((m) => ({ default: m.Photos })))
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })))
const Groups = lazy(() => import('./pages/Groups').then((m) => ({ default: m.Groups })))
const Pages = lazy(() => import('./pages/Pages').then((m) => ({ default: m.Pages })))
const AdminPage = lazy(() => import('./pages/Admin').then((m) => ({ default: m.AdminPage })))
const Messenger = lazy(() => import('./pages/Messenger').then((m) => ({ default: m.Messenger })))
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })))
const LoginPage = lazy(() => import('./pages/Login').then((m) => ({ default: m.LoginPage })))
const RegisterPage = lazy(() => import('./pages/Register').then((m) => ({ default: m.RegisterPage })))
const Live = lazy(() => import('./pages/Live'))
const LiveRoom = lazy(() => import('./pages/LiveRoom'))
const Videos = lazy(() => import('./pages/Videos'))

function PageLoader() {
  return <div className="app-loading page-suspense" aria-busy="true" />
}

export default function App() {
  const { user, ready } = useAuth()
  const { t } = useI18n()
  const location = useLocation()
  if (!ready) return <div className="app-loading">{t('app.loading')}</div>
  if (!user) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    )
  }
  return (
    <NotificationsProvider enabled={!!user}>
      <div className="app-shell">
        <Navbar />
        <div className="app-body">
          <Sidebar />
          <main className="fn-content">
            <div key={location.pathname} className="fn-route">
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/reels" element={<Reels />} />
                  <Route path="/seals" element={<SealWall />} />
                  <Route path="/photos" element={<Photos />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/groups" element={<Groups />} />
                  <Route path="/pages" element={<Pages />} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="/live" element={<Live />} />
                  <Route path="/live/:id" element={<LiveRoom />} />
                  <Route path="/videos" element={<Videos />} />
                  <Route path="/messenger" element={<Messenger />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<Home />} />
                </Routes>
              </Suspense>
            </div>
          </main>
        </div>
        <BottomNav />
        <CreatePost />
      </div>
    </NotificationsProvider>
  )
}