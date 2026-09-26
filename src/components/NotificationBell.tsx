import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellRing, Check, Mic, Image as ImageIcon, Users, Phone, Video } from 'lucide-react'
import { useNotifications, type AppNotification } from '../data/notifications'
import { useI18n } from '../i18n'
import { Avatar } from './Avatar'

function ago(ts: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (sec < 60) return '1m'
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`
  return `${Math.floor(sec / 86400)}d`
}

function KindIcon({ n }: { n: AppNotification }) {
  if (n.kind === 'call') return n.callKind === 'audio' ? <Phone size={13} /> : <Video size={13} />
  if (n.hasAudio) return <Mic size={13} />
  if (n.hasImage) return <ImageIcon size={13} />
  if (n.kind === 'group') return <Users size={13} />
  return <Bell size={13} />
}

function lineText(n: AppNotification, t: (k: string) => string): string {
  if (n.kind === 'call') return n.callKind === 'audio' ? t('notif.incomingAudio') : t('notif.incomingVideo')
  if (n.hasAudio) return t('notif.voiceMessage')
  if (n.body) return n.body
  if (n.hasImage) return t('notif.imageMessage')
  return t('notif.newMessage')
}

/* Navbar'dagi qo'ng'iroqchincha: barcha xabar va qo'ng'iroq
   bildirishnomalari, o'qilmagan badge, va qo'ng'iroqqa qo'shilish
   tugmasi. */
export function NotificationBell() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { items, unread, markRead, markAllRead, refresh, setJoinRequest } = useNotifications()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  const open_ = async (n: AppNotification) => {
    setOpen(false)
    if (!n.read) await markRead([n.id])
    if (n.threadId) navigate(`/messenger?thread=${n.threadId}`)
    else if (n.groupId) navigate(`/groups?group=${n.groupId}`)
  }

  /* Bildirishnomadagi asosiy amal: qo'ng'iroqqa qo'shilish.
     So'rov Messenger/Groups'ga uzatiladi — ular o'z WebRTC
     aloqasini responder rejimida boshlaydi. */
  const join = async (n: AppNotification) => {
    setOpen(false)
    if (!n.read) await markRead([n.id])
    if (!n.threadId && !n.groupId) return
    setJoinRequest({
      id: n.id,
      scope: n.threadId ? 'thread' : 'group',
      scopeId: (n.threadId ?? n.groupId) as number,
      from: n.actor.id,
      fromName: n.actor.name,
      callKind: n.callKind || 'video',
      at: Date.now(),
    })
    navigate(n.threadId ? `/messenger?thread=${n.threadId}` : `/groups?group=${n.groupId}`)
  }

  const list = [...items].reverse()

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        type="button"
        className="notif-bell"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('notif.title')}
        title={t('notif.title')}
      >
        {unread > 0 ? <BellRing size={20} /> : <Bell size={20} />}
        {unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label={t('notif.title')}>
          <div className="notif-head">
            <strong>{t('notif.title')}</strong>
            {unread > 0 && (
              <button type="button" className="notif-mark" onClick={() => void markAllRead()}>
                <Check size={14} />
                <span>{t('notif.markAllRead')}</span>
              </button>
            )}
          </div>

          {list.length === 0 ? (
            <div className="notif-empty">{t('notif.empty')}</div>
          ) : (
            <ul className="notif-list">
              {list.map((n) => {
                const joinable = n.kind === 'call' && !n.closed && !n.read
                return (
                  <li key={n.id} className={`notif-item${n.read ? '' : ' is-unread'}`}>
                    <Avatar user={{ ...n.actor, online: true, about: '' }} size={40} />
                    <div className="notif-body">
                      <div className="notif-line">
                        <span className="notif-kind">
                          <KindIcon n={n} />
                        </span>
                        <span className="notif-text">{lineText(n, t)}</span>
                        <span className="notif-time">{ago(n.createdAt)}</span>
                      </div>
                      <div className="notif-actions">
                        <button type="button" className="notif-open" onClick={() => void open_(n)}>
                          {n.kind === 'call' ? t('notif.open') : t('notif.openToRead')}
                        </button>
                        {joinable && (
                          <button type="button" className="notif-join" onClick={() => void join(n)}>
                            <Phone size={14} />
                            <span>{t('notif.joinCall')}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
