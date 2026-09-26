import { translate } from '../i18n'
import { getToken, apiUrl } from '../api/client'

const tr = (key: string, params?: Record<string, string | number>) => {
  let lang = 'uz'
  try {
    lang = localStorage.getItem('doppi-lang-v1') ?? 'uz'
  } catch {
    /* ignore */
  }
  return translate(lang, key, params)
}

export const MAX_IMAGE_MB = 8
export const MAX_VIDEO_MB = 40

/* Rasmlarni brauzerda siqamiz: 1600px + WebP (JPEG fallback).
   Sababi: 12MB telefon rasmi 300-500KB ga tushadi — yuklash tez, server yengil. */
const MAX_DIM = 1600
const QUALITY = 0.82

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image decode failed'))
    img.src = dataUrl
  })
}

function supportsWebp(): boolean {
  try {
    const c = document.createElement('canvas')
    c.width = 1
    c.height = 1
    return c.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    return false
  }
}

export interface PreparedImage {
  dataUrl: string
  width: number
  height: number
  bytes: number
}

/* Rasimni siqib data URL qaytaradi. GIF (animatsiya) va juda kichik rasm
   o'zgartirilmaydi. */
export async function prepareImage(file: File, maxDim = MAX_DIM): Promise<PreparedImage> {
  const original = await readAsDataUrl(file)
  const bytes = Math.ceil((original.length - original.indexOf(',') - 1) * 0.75)
  if (file.type === 'image/gif' || bytes < 220 * 1024) {
    const img = await loadImage(original).catch(() => null)
    return { dataUrl: original, width: img?.naturalWidth ?? 0, height: img?.naturalHeight ?? 0, bytes }
  }

  const img = await loadImage(original)
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return { dataUrl: original, width: img.naturalWidth, height: img.naturalHeight, bytes }
  ctx.drawImage(img, 0, 0, w, h)

  const webp = supportsWebp() ? canvas.toDataURL('image/webp', QUALITY) : ''
  const jpeg = canvas.toDataURL('image/jpeg', QUALITY)
  const candidates = [webp, jpeg].filter(Boolean) as string[]
  let best = original
  for (const c of candidates) {
    if (c.length < best.length) best = c
  }
  return { dataUrl: best, width: w, height: h, bytes: Math.ceil((best.length - best.indexOf(',') - 1) * 0.75) }
}

/* data URL -> /api/media/<id> (serverda haqiqiy fayl saqlanadi).
   Backend media endpointini qo'llab-quvvatlamasa (404/501) yoki tarmoq
   uzilsa, data URL qaytariladi — post yana ko'rinadi, keyinroq sinxronlanadi. */
export async function uploadDataUrl(dataUrl: string, kind: 'image' | 'video'): Promise<string> {
  const maxBytes = (kind === 'video' ? MAX_VIDEO_MB : MAX_IMAGE_MB) * 1024 * 1024
  const approx = Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75)
  if (approx > maxBytes) throw new Error(tr('upload.fileTooLarge', { max: kind === 'video' ? MAX_VIDEO_MB : MAX_IMAGE_MB }))

  if (!getToken()) return dataUrl

  const res = await fetch(`${apiUrl('/api/media')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ dataUrl }),
  })
  if (res.status === 413) throw new Error(tr('upload.fileTooLarge', { max: kind === 'video' ? MAX_VIDEO_MB : MAX_IMAGE_MB }))
  if (res.status === 415) throw new Error(tr('upload.unsupportedType'))
  if (!res.ok) return dataUrl
  const out = (await res.json()) as { url?: string }
  return out.url ?? dataUrl
}

export interface UploadedMedia {
  url: string
  width: number
  height: number
  bytes: number
  local: boolean
}

/* Rasm: siqish -> serverga yuklash */
export async function uploadImage(file: File, onError?: (msg: string) => void): Promise<UploadedMedia | null> {
  try {
    const prepared = await prepareImage(file)
    const url = await uploadDataUrl(prepared.dataUrl, 'image')
    return { url, width: prepared.width, height: prepared.height, bytes: prepared.bytes, local: url.startsWith('data:') }
  } catch (e) {
    onError?.(e instanceof Error ? e.message : tr('upload.readError'))
    return null
  }
}

/* Video: siqilmaydi (brauzerda qimmat), faqat hajm tekshiriladi va yuklanadi */
export async function uploadVideo(file: File, onError?: (msg: string) => void): Promise<UploadedMedia | null> {
  try {
    if (!file.type.startsWith('video/')) {
      onError?.(tr('upload.unsupportedType'))
      return null
    }
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      onError?.(tr('upload.fileTooLarge', { max: MAX_VIDEO_MB }))
      return null
    }
    const dataUrl = await readAsDataUrl(file)
    const url = await uploadDataUrl(dataUrl, 'video')
    return { url, width: 0, height: 0, bytes: file.size, local: url.startsWith('data:') }
  } catch (e) {
    onError?.(e instanceof Error ? e.message : tr('upload.readError'))
    return null
  }
}

/* Ro'yxatdan o'tishda token yo'q — avatar siqilgan data URL sifatida qoladi
   (128px, bir necha KB). Keyin profilga media yuklash mumkin. */
export async function prepareAvatar(file: File): Promise<string | null> {
  try {
    const prepared = await prepareImage(file, 320)
    return prepared.dataUrl
  } catch {
    return null
  }
}

export function fileToDataUrl(file: File, maxMB: number, onError?: (msg: string) => void): Promise<string | null> {
  return new Promise((resolve) => {
    if (file.size > maxMB * 1024 * 1024) {
      onError?.(tr('upload.fileTooLarge', { max: maxMB }))
      resolve(null)
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => {
      onError?.(tr('upload.readError'))
      resolve(null)
    }
    reader.readAsDataURL(file)
  })
}
