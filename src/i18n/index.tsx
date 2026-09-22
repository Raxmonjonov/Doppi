import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { translations, inheritMap } from './translations'

export function translate(code: string, key: string, params?: Record<string, string | number>): string {
  let table = translations[code]
  if (!table) {
    const base = inheritMap[code]
    table = base ? translations[base] : translations.en
  }
  let text = table?.[key]
  if (!text) {
    text = translations.en[key] ?? translations.uz[key] ?? key
  }
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (_, name) => (params[name] !== undefined ? String(params[name]) : `{${name}}`))
}

interface I18nValue {
  lang: string
  setLang: (code: string) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nValue>({
  lang: 'uz',
  setLang: () => {},
  t: (key) => key,
})

const STORAGE_KEY = 'doppi-lang-v1'

export const langCodes: string[] = [
  'uz', 'en', 'en-GB', 'es', 'es-419', 'fr', 'de', 'it', 'pt', 'pt-BR', 'ru', 'tr', 'az', 'kk', 'ky', 'tk', 'tg',
  'mn', 'ar', 'fa', 'ur', 'hi', 'bn', 'pa', 'mr', 'te', 'ta', 'ml', 'kn', 'gu', 'si', 'ne', 'th', 'vi', 'id', 'ms',
  'fil', 'km', 'lo', 'my', 'zh-CN', 'zh-TW', 'ja', 'ko', 'nl', 'sv', 'no', 'da', 'fi', 'pl', 'cs', 'sk', 'hu', 'ro',
  'bg', 'sr', 'hr', 'sl', 'el', 'uk', 'be', 'ka', 'hy', 'he', 'sw', 'am', 'ha', 'yo', 'zu', 'af', 'eo',
]

const savedLangCodes = langCodes.filter((c) => Object.prototype.hasOwnProperty.call(translations, c) || Object.prototype.hasOwnProperty.call(inheritMap, c))

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? 'uz'
    } catch {
      return 'uz'
    }
  })

  const setLang = (code: string) => {
    setLangState(code)
    try {
      localStorage.setItem(STORAGE_KEY, code)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const t = (key: string, params?: Record<string, string | number>) => translate(lang, key, params)

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  return useContext(I18nContext)
}

export { savedLangCodes }

export function languageName(code: string): string {
  const native: Record<string, string> = {
    uz: "O'zbekcha (O'zbekiston)",
    en: 'English (US)',
    'en-GB': 'English (UK)',
    es: 'Español',
    'es-419': 'Español (Latinoamérica)',
    fr: 'Français',
    de: 'Deutsch',
    it: 'Italiano',
    pt: 'Português',
    'pt-BR': 'Português (Brasil)',
    ru: 'Русский',
    tr: 'Türkçe',
    az: 'Azərbaycan dili',
    kk: 'Қазақ тілі',
    ky: 'Кыргызча',
    tk: 'Türkmençe',
    tg: 'Тоҷикӣ',
    mn: 'Монгол хэл',
    ar: 'العربية',
    fa: 'فارسی',
    ur: 'اردو',
    hi: 'हिन्दी',
    bn: 'বাংলা',
    pa: 'ਪੰਜਾਬੀ',
    mr: 'मराठी',
    te: 'తెలుగు',
    ta: 'தமிழ்',
    ml: 'മലയാളം',
    kn: 'ಕನ್ನಡ',
    gu: 'ગુજરાતી',
    si: 'සිංහල',
    ne: 'नेपाली',
    th: 'ไทย',
    vi: 'Tiếng Việt',
    id: 'Bahasa Indonesia',
    ms: 'Bahasa Melayu',
    fil: 'Filipino',
    km: 'ខ្មែរ',
    lo: 'ລາວ',
    my: 'မြန်မာ',
    'zh-CN': '中文（简体）',
    'zh-TW': '中文（繁體）',
    ja: '日本語',
    ko: '한국어',
    nl: 'Nederlands',
    sv: 'Svenska',
    no: 'Norsk',
    da: 'Dansk',
    fi: 'Suomi',
    pl: 'Polski',
    cs: 'Čeština',
    sk: 'Slovenčina',
    hu: 'Magyar',
    ro: 'Română',
    bg: 'Български',
    sr: 'Српски',
    hr: 'Hrvatski',
    sl: 'Slovenščina',
    el: 'Ελληνικά',
    uk: 'Українська',
    be: 'Беларуская',
    ka: 'ქართული',
    hy: 'Հայերեն',
    he: 'עברית',
    sw: 'Kiswahili',
    am: 'አማርኛ',
    ha: 'Hausa',
    yo: 'Yorùbá',
    zu: 'isiZulu',
    af: 'Afrikaans',
    eo: 'Esperanto',
  }
  return native[code] ?? code
}