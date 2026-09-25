import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { useI18n } from '../i18n'
import type { Story } from '../data/mock'
import { updateData, useData } from '../data/store'
import { useMe } from '../data/useMe'
import { Lightbox } from './Lightbox'
import { markStoryViewed } from '../data/interactions'

export function StoriesRow() {
  const me = useMe()
  const stories = useData((d) => d.stories)
  const [openUrl, setOpenUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { t } = useI18n()

  const pick = () => fileRef.current?.click()

  const openStory = (s: Story) => {
    setOpenUrl(s.image)
    if (!s.viewed) {
      updateData((d) => {
        d.stories = d.stories.map((st) => (st.id === s.id ? { ...st, viewed: true } : st))
      })
      void markStoryViewed(s.id)
    }
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      const story: Story = {
        id: Date.now(),
        author: me,
        image: String(reader.result),
        viewed: false,
      }
      updateData((d) => {
        d.stories = [story, ...d.stories]
      })
    }
    reader.readAsDataURL(f)
    e.target.value = ''
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="stories">
        <button type="button" className="story story-add" aria-label={t('stories.add')} onClick={pick}>
          <span className="story-medallion">
            <span className="plus">
              <Plus size={22} strokeWidth={3} />
            </span>
          </span>
          <span className="story-name">{t('stories.add')}</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />

        {stories.map((s, i) => (
          <button
            type="button"
            className="story"
            key={s.id}
            style={{ animationDelay: `${Math.min(i * 60, 720)}ms` }}
            aria-label={t('stories.storyAriaLabel', { name: s.author.name })}
            onClick={() => openStory(s)}
          >
            <span className={`story-medallion${s.viewed ? ' ring-viewed' : ' ring-unseen'}`}>
              <img src={s.image} alt="" loading="lazy" />
            </span>
            <span className="story-name">{s.author.name}</span>
          </button>
        ))}

        {stories.length === 0 && <span className="story-empty">{t('stories.empty')}</span>}
      </div>

      {openUrl && (
        <Lightbox
          images={[openUrl]}
          index={0}
          onClose={() => setOpenUrl(null)}
          onIndex={() => undefined}
        />
      )}
    </div>
  )
}