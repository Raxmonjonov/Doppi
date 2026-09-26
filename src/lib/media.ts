import { useEffect, useState } from 'react'
import { apiUrl, getToken } from '../api/client'

/* Serverdagi media endi autentifikatsiya talab qiladi: DM/guruh fayllari
   faqat suhbat a'zolari ochishi mumkin. `<img src>` / `<audio src>` esa
   `Authorization` sarlavhasini yubora olmaydi, shuning uchun faylni
   `fetch` + blob orqali yuklab, vaqtinchalik `blob:` URL yaratamiz.

   Ochiq (imzosi) havolalar `?s=...` imzosi bilan keladi — ular to'g'ridan
   to'g'ri `<img src>` ga qo'yilishi mumkin, lekin shifoxona xavfsizligi
   uchun barcha `/api/media/` yo'llari shu yo'l orqali o'tadi (imzo tekshiruvi
   serverda bajariladi, imzo bo'lmasa 401 qaytadi). */

/* data: va tashqi https:// URL'lariga tegilmaydi — ular allaqachon ochiq. */
function isDirectUrl(src: string): boolean {
  return /^(data:|blob:|https?:\/\/)/i.test(src)
}

export function useMediaObjectUrl(src: string | null | undefined): string {
  const [url, setUrl] = useState(() => (src && isDirectUrl(src) ? src : ''))

  useEffect(() => {
    const raw = String(src ?? '')
    if (!raw || isDirectUrl(raw)) {
      setUrl(raw)
      return
    }
    /* Ruxsat yo'q bo'lsa (401) bo'sh qolamiz — rasm buzilib ko'rinmasin. */
    if (!getToken()) {
      setUrl('')
      return
    }
    let revoked = false
    let objectUrl = ''
    const ctrl = new AbortController()
    void (async () => {
      try {
        const res = await fetch(apiUrl(raw), {
          headers: { Authorization: `Bearer ${getToken()}` },
          signal: ctrl.signal,
        })
        if (!res.ok) return
        const blob = await res.blob()
        if (revoked) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      } catch {
        /* tarmoq uzildi yoki bekor qilindi */
      }
    })()
    return () => {
      revoked = true
      ctrl.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src])

  return url
}

/* data: URL'lar juda katta bo'lishi mumkin — ularni o'zgartirmaydi. */
export function mediaDisplayUrl(src: string | null | undefined): string {
  const raw = String(src ?? '')
  return isDirectUrl(raw) ? raw : ''
}
