import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, MessageCircle, Share2, MoreHorizontal, Send, Link as LinkIcon, UserRound, Lock } from 'lucide-react'
import { useI18n } from '../i18n'
import type { Post, User } from '../data/mock'
import { Avatar } from './Avatar'
import { MediaGrid } from './MediaGrid'
import { ShareDialog } from './ShareDialog'
import { formatCount } from '../lib/format'
import { useMe } from '../data/useMe'
import { addPostComment, sendPostToUser, togglePostLike } from '../data/interactions'

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}`
  if (m > 0) return `${m}:${String(s).padStart(2, '0')}`
  return `${s}s`
}

export function PostCard({ post, asOf }: { post: Post; asOf?: number }) {
  const [showComments, setShowComments] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [liveNow, setLiveNow] = useState(() => Date.now())
  const me = useMe()
  const navigate = useNavigate()
  const { t } = useI18n()

  const rewound = asOf != null
  const nowMs = rewound ? asOf : liveNow
  const sealed = !!post.sealUntil && nowMs < post.sealUntil
  const [justRevealed, setJustRevealed] = useState(false)
  const wasSealedRef = useRef(sealed)

  useEffect(() => {
    if (wasSealedRef.current && !sealed && !rewound) {
      setJustRevealed(true)
      const id = window.setTimeout(() => setJustRevealed(false), 2600)
      wasSealedRef.current = sealed
      return () => window.clearTimeout(id)
    }
    wasSealedRef.current = sealed
    return
  }, [sealed, rewound])

  useEffect(() => {
    if (!sealed || rewound) return
    const id = window.setInterval(() => setLiveNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [sealed, rewound])

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
    <article className={`card post-card fade-in${justRevealed ? ' post-reveal' : ''}`}>
      {justRevealed && (
        <div className="reveal-flash">
          <span className="reveal-ic">✦</span>
          <span>{t('postCard.revealFlash')}</span>
        </div>
      )}
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

      {sealed ? (
        <div className="sealed-body">
          <div className="sealed-medallion">
            <Lock size={28} />
          </div>
          <div className="sealed-title">{t('postCard.sealedTag')}</div>
          <div className="sealed-sub">{t('postCard.sealedHint')}</div>
          <div className="sealed-countdown">
            {t('postCard.sealOpensIn', { rest: formatRemaining((post.sealUntil ?? 0) - nowMs) })}
          </div>
          {rewound && <div className="sealed-rewind-badge">{t('postCard.rewindSeal')}</div>}
        </div>
      ) : (
        <>
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
        </>
      )}
    </article>
  )
}