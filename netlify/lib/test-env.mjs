/* Test muhiti uchun majburiy xavfsizlik sozlamalari.
   ESM importlari ko'tariladi (hoisted), shuning uchun bu fayl
   `./api-core.mjs` dan OLDIN import qilinishi kerak — `api-core.mjs`
   `ADMIN_PASSWORD`/`SESSION_SECRET` ni modul yuklanganda o'qiydi. */
process.env.SESSION_SECRET ??=
  'test-only-session-secret-0123456789abcdef0123456789abcdef'
process.env.ADMIN_USERNAME ??= 'secadmin'
process.env.ADMIN_PASSWORD ??= 'Adm1n-Security-Pass!'
process.env.NODE_ENV ??= 'test'

/* Git tarixida ochiq bo'lgan eski boshlang'ich admin paroli. Bu qiymat
   FAQAT "rad etilishi" ni tekshirish uchun testda ishlatiladi — bu haqiqiy
   hisobga tegishli credential emas. Sabab: ilgari kodda stand sifatida
   yozilgan edi, endi faqat `ADMIN_PASSWORD` env'dan olinadi. Qiymatni
   o'zgartirmaslik kerak, aks holda regression test manosini yo'qotadi. */
export const LEGACY_LEAKED_ADMIN_PASSWORD = "Admin.Do'ppi.Uzbekitan.66"
