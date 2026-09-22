export function fileToDataUrl(file: File, maxMB: number, onError?: (msg: string) => void): Promise<string | null> {
  return new Promise((resolve) => {
    const limit = maxMB * 1024 * 1024
    if (file.size > limit) {
      onError?.(`Fayl juda katta (maksimal ${maxMB} MB)`)
      resolve(null)
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => {
      onError?.("Faylni o'qishda xatolik yuz berdi")
      resolve(null)
    }
    reader.readAsDataURL(file)
  })
}