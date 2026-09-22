import { translate } from '../i18n'

const tr = (key: string, params?: Record<string, string | number>) => {
  let lang = 'uz'
  try {
    lang = localStorage.getItem('doppi-lang-v1') ?? 'uz'
  } catch {
    /* ignore */
  }
  return translate(lang, key, params)
}

export function fileToDataUrl(file: File, maxMB: number, onError?: (msg: string) => void): Promise<string | null> {
  return new Promise((resolve) => {
    const limit = maxMB * 1024 * 1024
    if (file.size > limit) {
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