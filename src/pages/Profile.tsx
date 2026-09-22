import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { UserCheck, UserPlus, Bell, MoreHorizontal, MessageCircle } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { PostCard } from '../components/PostCard'
import { Lightbox } from '../components/Lightbox'
import { useMe } from '../data/useMe'
import { useData, readUserData } from '../data/store'
import { toggleFollow } from '../data/interactions'
import { useAuth } from '../data/auth'
import type { User } from '../data/mock'

type Tab = 'posts' | 'photos' | 'friends' | 'about'

export function Profile() {
  const me = useMe()
  const { accounts } = useAuth()
  const [params] = useSearchParams()
  const viewedId = Number(params.get('user')) || 0

  const isOther = viewedId > 0 && viewedId !== me.id
  const other = accounts.find((a) => a.id === viewedId)
  const viewed: User = isOther && other
    ? { id: other.id, name: other.name, username: other.username, avatar: other.avatar, online: other.googleId ? true : false, about: other.about }
    : me

  const [tab, setTab] = useState<Tab>('posts')
  const [albumOpen, setAlbumOpen] = useState<number | null>(null)

  const ownPosts = useData((d) => d.posts)
  const ownAlbums = useData((d) => d.albums)
  const following = useData((d) => d.following)
  const isFollowing = isOther && following.includes(viewedId)

  const posts = isOther && other ? readUserData(other.id).posts : ownPosts
  const albums = isOther && other ? readUserData(other.id).albums : ownAlbums
  const mine = posts.filter((p) => p.author.id === viewed.id)
  const openAlbum = albumOpen !== null ? albums[albumOpen] : undefined

  return (
    <div className="fade-in">
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="profile-cover">
          <div className="overlay" />
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
                    {isFollowing ? 'Kuzatilmoqda' : 'Kuzatish'}
                  </button>
                  <button type="button" className="btn btn-outline">
                    <MessageCircle size={17} /> Xabar
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn-primary">
                    <UserPlus size={17} /> Do'stlik so'rovi
                  </button>
                  <button type="button" className="btn btn-outline">
                    <Bell size={17} /> Follow
                  </button>
                </>
              )}
              <button type="button" className="btn btn-outline" aria-label="Ko'proq">
                <MoreHorizontal size={17} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="profile-tabs">
        {(['posts', 'photos', 'friends', 'about'] as Tab[]).map((t) => (
          <button key={t} type="button" className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'posts' ? 'Postlar' : t === 'photos' ? 'Fotosuratlar' : t === 'friends' ? 'Do' + '\u2018stlar' : 'Ma' + '\u2018lumot'}
          </button>
        ))}
      </div>

      {tab === 'posts' && (
        <div>
          {mine.length === 0 ? (
            <div className="card empty-state">
              <div className="empty-state-title">{isOther ? 'Hozircha postlar yo\'q' : 'Hozircha postlaringiz yo\'q'}</div>
              <div className="empty-state-sub">
                {isOther ? '@' + viewed.username + ' hali post joylamagan.' : 'O\'z rasmingiz yoki videongizni yuklab, birinchi postingizni yarating.'}
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
              <div className="empty-state-title">Fotoalbomlar hozircha bo'sh</div>
              <div className="empty-state-sub">Fotoalbomlar sahifasidan rasmlaringizni yuklang.</div>
            </div>
          ) : (
            albums.map((a, idx) => (
              <div className="card album-card" key={a.id}>
                <div className="album-cover-wrap" onClick={() => setAlbumOpen(idx)}>
                  <img src={a.photos[0].url} alt={a.title} loading="lazy" />
                </div>
                <div className="album-meta">
                  <div className="title">{a.title}</div>
                  <div className="sub">{a.count} ta rasm</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'friends' && (
        <div className="fr-stack">
          <div className="card empty-state">
            <div className="empty-state-title">Do'stlar ro'yxati bo'sh</div>
            <div className="empty-state-sub">Hozircha do'stlar yo'q.</div>
          </div>
        </div>
      )}

      {tab === 'about' && (
        <div className="card settings-card">
          <div className="setting-row">
            <div>
              <div className="setting-label">Ism</div>
              <div className="setting-desc">{viewed.name}</div>
            </div>
          </div>
          <div className="setting-row">
            <div>
              <div className="setting-label">Foydalanuvchi nomi</div>
              <div className="setting-desc">@{viewed.username}</div>
            </div>
          </div>
          <div className="setting-row">
            <div>
              <div className="setting-label">Haqida</div>
              <div className="setting-desc">{viewed.about}</div>
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