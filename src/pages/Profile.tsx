import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { UserCheck, UserPlus, Bell, MoreHorizontal, MessageCircle, Pencil, LogOut, X, Image as ImageIcon } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { PostCard } from '../components/PostCard'
import { Lightbox } from '../components/Lightbox'
import { useMe } from '../data/useMe'
import { useData, readUserData } from '../data/store'
import { toggleFollow } from '../data/interactions'
import { useAuth } from '../data/auth'
import type { User } from '../data/mock'
import { useI18n } from '../i18n'

type Tab = 'posts' | 'photos' | 'friends' | 'about'

export function Profile() {
  const { t } = useI18n()
  const me = useMe()
  const { accounts, updateProfile, logout } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const viewedId = Number(params.get('user')) || 0

  const isOther = viewedId > 0 && viewedId !== me.id
  const other = accounts.find((a) => a.id === viewedId)
  const viewed: User = isOther && other
    ? { id: other.id, name: other.name, username: other.username, avatar: other.avatar, online: true, about: other.about }
    : me

  const [tab, setTab] = useState<Tab>('posts')
  const [albumOpen, setAlbumOpen] = useState<number | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState(me.name)
  const [editAbout, setEditAbout] = useState(me.about ?? '')

  const ownPosts = useData((d) => d.posts)
  const ownAlbums = useData((d) => d.albums)
  const following = useData((d) => d.following)
  const isFollowing = isOther && following.includes(viewedId)

  const posts = isOther && other ? readUserData(other.id).posts : ownPosts
  const albums = isOther && other ? readUserData(other.id).albums : ownAlbums
  const mine = posts.filter((p) => p.author.id === viewed.id)
  const openAlbum = albumOpen !== null ? albums[albumOpen] : undefined

  const saveEdit = () => {
    void updateProfile({ name: editName.trim() || me.name, about: editAbout })
    setEditOpen(false)
  }

  const startChat = () => {
    if (!other) return
    navigate(`/messenger?user=${other.id}`)
  }

  return (
    <div className="fade-in">
      <div className="card">
        <div className="profile-cover" />
        <div className="profile-meta">
          <span className="avatar-wrap">
            <Avatar user={viewed} size={130} />
          </span>
          <div className="p-text">
            <div className="p-name">{viewed.name}</div>
            <div className="p-sub">@{viewed.username} · {viewed.about}</div>
          </div>
          <div className="p-actions">
            {isOther ? (
              <>
                <button
                  type="button"
                  className={`btn ${isFollowing ? 'btn-outline' : 'btn-primary'}`}
                  onClick={() => void toggleFollow(viewedId)}
                >
                  {isFollowing ? <UserCheck size={17} /> : <UserPlus size={17} />}
                  {isFollowing ? t('profile.following') : t('profile.follow')}
                </button>
                <button type="button" className="btn btn-outline" onClick={startChat}>
                  <MessageCircle size={17} /> {t('profile.message')}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-primary" onClick={() => setEditOpen(true)}>
                  <Pencil size={17} /> {t('profile.edit')}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setMoreOpen((s) => !s)}>
                  <MoreHorizontal size={17} />
                </button>
                {moreOpen && (
                  <div className="profile-more-menu">
                    <button type="button" onClick={() => { setMoreOpen(false); navigate('/settings') }}>
                      <Bell size={16} /> {t('profile.menuSettings')}
                    </button>
                    <button type="button" className="danger" onClick={() => { setMoreOpen(false); void logout() }}>
                      <LogOut size={16} /> {t('profile.menuLogout')}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="profile-tabs">
        {(['posts', 'photos', 'friends', 'about'] as Tab[]).map((tabId) => (
          <button key={tabId} type="button" className={tab === tabId ? 'active' : ''} onClick={() => setTab(tabId)}>
            {tabId === 'posts' ? t('profile.tabPosts') : tabId === 'photos' ? t('profile.tabPhotos') : tabId === 'friends' ? t('profile.tabFriends') : t('profile.tabAbout')}
          </button>
        ))}
      </div>

      {tab === 'posts' && (
        <div>
          {mine.length === 0 ? (
            <div className="card empty-state">
              <div className="empty-state-title">{isOther ? t('profile.emptyPostsOther') : t('profile.emptyPostsMine')}</div>
              <div className="empty-state-sub">
                {isOther ? t('profile.emptyPostsOtherSub', { name: viewed.username }) : t('profile.emptyPostsMineSub')}
              </div>
            </div>
          ) : (
            mine.map((p) => <PostCard key={p.id} post={p} />)
          )}
        </div>
      )}

      {tab === 'photos' && (
        <div className="albums-grid">
          {albums.length === 0 ? (
            <div className="card empty-state">
              <div className="empty-state-title">{t('profile.emptyAlbumsTitle')}</div>
              <div className="empty-state-sub">{t('profile.emptyAlbumsSub')}</div>
            </div>
          ) : (
            albums.map((a, idx) => (
              <div className="card album-card" key={a.id}>
                <div className="album-cover-wrap" onClick={() => a.photos.length > 0 && setAlbumOpen(idx)}>
                  {a.photos[0] ? (
                    <img src={a.photos[0].url} alt={a.title} loading="lazy" />
                  ) : (
                    <div className="album-cover-empty">
                      <ImageIcon size={34} />
                    </div>
                  )}
                </div>
                <div className="album-meta">
                  <div className="title">{a.title}</div>
                  <div className="sub">{t('profile.photoCount', { count: a.count })}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'friends' && (
        <div className="fr-stack">
          <div className="card empty-state">
            <div className="empty-state-title">{t('profile.emptyFriendsTitle')}</div>
            <div className="empty-state-sub">{t('profile.emptyFriendsSub')}</div>
          </div>
        </div>
      )}

      {tab === 'about' && (
        <div className="card settings-card">
          <div className="setting-row">
            <div>
              <div className="setting-label">{t('profile.aboutName')}</div>
              <div className="setting-desc">{viewed.name}</div>
            </div>
          </div>
          <div className="setting-row">
            <div>
              <div className="setting-label">{t('profile.aboutUsername')}</div>
              <div className="setting-desc">@{viewed.username}</div>
            </div>
          </div>
          <div className="setting-row">
            <div>
              <div className="setting-label">{t('profile.aboutBio')}</div>
              <div className="setting-desc">{viewed.about}</div>
            </div>
          </div>
        </div>
      )}

      {editOpen && (
        <div className="fn-overlay" onClick={() => setEditOpen(false)}>
          <div className="fn-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fn-modal-head">
              <h3>{t('profile.editTitle')}</h3>
              <button type="button" className="icon-btn" onClick={() => setEditOpen(false)} aria-label={t('common.close')}>
                <X size={20} />
              </button>
            </div>
            <div className="post-form">
              <div>
                <label className="form-label">{t('profile.editName')}</label>
                <input type="text" className="form-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div>
                <label className="form-label">{t('profile.editAbout')}</label>
                <textarea className="form-input" rows={3} value={editAbout} onChange={(e) => setEditAbout(e.target.value)} />
              </div>
              <div className="post-form-footer">
                <button type="button" className="btn btn-outline" onClick={() => setEditOpen(false)}>
                  {t('common.cancel')}
                </button>
                <button type="button" className="btn btn-primary" onClick={saveEdit}>
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {openAlbum && (
        <Lightbox
          images={openAlbum.photos.map((p) => p.url)}
          index={0}
          onClose={() => setAlbumOpen(null)}
          onIndex={() => undefined}
        />
      )}
    </div>
  )
}