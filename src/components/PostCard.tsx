import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, MessageCircle, Share2, MoreHorizontal, Send, Link as LinkIcon, UserRound } from 'lucide-react'
import { useI18n } from '../i18n'
import type { Post, User } from '../data/mock'
import { Avatar } from './Avatar'
import { MediaGrid } from './MediaGrid'
import { ShareDialog } from './ShareDialog'
import { formatCount } from '../lib/format'
import { useMe } from '../data/useMe'
import { addPostComment, sendPostToUser, togglePostLike } from '../data/interactions'

export function PostCard({ post }: { post: Post }) {
  const [showComments, setShowComments] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const me = useMe()
  const navigate = useNavigate()
  const { t } = useI18n()

  const addComment = () => {
    const text = commentText.trim()
    if (!text) return
    const comment = { id: Date.now(), author: me, text, time: t('common.now') }
    void addPostComment(post, comment)
    setCommentText('')
  }

  const pickShare = (user: User) => {
    setShareOpen(false)
    void sendPostToUser(post, user.id)
  }

  const copyLink = async () => {
    setMoreOpen(false)
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?post=${post.id}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <article className="card post-card fade-in">
      <div className="post-head">
        <Avatar user={post.author} size={42} />
        <div className="meta" style={{ flex: 1 }}>
          <div className="author">
            <button type="button" className="author-link" onClick={() => navigate(`/profile?user=${post.author.id}`)}>
              {post.author.name}
            </button>
            {post.live && <span className="live-badge">{t('postCard.liveBadge')}</span>}
          </div>
          <div className="time">{post.time} · {t('postCard.audiencePublic')}</div>
        </div>
        <div className="post-more">
          <button type="button" className="icon-btn" onClick={() => setMoreOpen((s) => !s)} aria-label={t('postCard.more')}>
            <MoreHorizontal size={20} />
          </button>
          {moreOpen && (
            <div className="post-more-menu">
              <button type="button" onClick={() => navigate(`/profile?user=${post.author.id}`)}>
                <UserRound size={16} /> {t('common.profile')}
              </button>
              <button type="button" onClick={() => void copyLink()}>
                <LinkIcon size={16} /> {t('postCard.copyLink')}
              </button>
            </div>
          )}
          {copied && <div className="post-more-toast">{t('postCard.linkCopied')}</div>}
        </div>
      </div>

      {post.text && <p className="post-text" style={{ fontStretch: 'normal' }}>{post.text}</p>}
      <MediaGrid images={post.images} video={post.video} />

      <div className="post-stats">
        <span className="likes">
          <span className="like-mini">
            <Heart size={11} fill="#fff" />
          </span>
          {formatCount(post.likes)}
        </span>
        <span>
          {t('postCard.statsComments', { count: post.comments.length })} · {t('postCard.statsShares', { count: post.shared ?? 0 })}
        </span>
      </div>

      <div className="post-bar">
        <button type="button" className={`pb-action${post.likedByMe ? ' liked' : ''}`} onClick={() => void togglePostLike(post)}>
          <Heart size={19} fill={post.likedByMe ? 'currentColor' : 'none'} />
          {t('postCard.like')}
        </button>
        <button type="button" className="pb-action" onClick={() => setShowComments((v) => !v)}>
          <MessageCircle size={19} />
          {t('postCard.comment')}
        </button>
        <button type="button" className="pb-action" onClick={() => setShareOpen(true)}>
          <Share2 size={19} />
          {t('postCard.share')}
        </button>
      </div>

      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} onPick={pickShare} />

      <div className={`comments${showComments ? ' open' : ''}`}>
        {post.comments.map((c) => (
          <div className="comment" key={c.id}>
            <Avatar user={c.author} size={32} />
            <div>
              <div className="c-body">
                <div className="c-author">{c.author.name}</div>
                <div className="c-text">{c.text}</div>
              </div>
              <div className="comment-reply">
                {c.time} · {t('postCard.likedShort')} · {t('postCard.reply')}
              </div>
            </div>
          </div>
        ))}
        <div className="comment">
          <Avatar user={me} size={32} />
          <div style={{ display: 'flex', gap: 8, flex: 1 }}>
            <input
              className="comment-input"
              placeholder={t('postCard.commentPlaceholder')}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addComment()
              }}
            />
            <button type="button" className="icon-btn" onClick={addComment} aria-label={t('common.send')}>
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}