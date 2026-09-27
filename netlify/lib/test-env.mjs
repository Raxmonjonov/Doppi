/* Test muhiti uchun majburiy xavfsizlik sozlamalari.
   ESM importlari ko'tariladi (hoisted), shuning uchun bu fayl
   `./api-core.mjs` dan OLDIN import qilinishi kerak — `api-core.mjs`
   `ADMIN_PASSWORD`/`SESSION_SECRET` ni modul yuklanganda o'qiydi. */
process.env.SESSION_SECRET ??=
  'test-only-session-secret-0123456789abcdef0123456789abcdef'
process.env.ADMIN_USERNAME ??= 'secadmin'
process.env.ADMIN_PASSWORD ??= 'Adm1n-Security-Pass!'
process.env.NODE_ENV ??= 'test'

/* Eski boshlang'ich admin paroli (tarixda ochiq bo'lgan) endi BU KODDA
   saqlanmaydi. Sabab: parol ochiq repoda ko'rinib turganda, "faqat testda
   ishlatiladi" degan izoh uni yashirmaydi — u har kimga o'qishga ochiq.

   `ADMIN_PASSWORD` allaqachon faqat env'dan olinadi (kod ichida default
   credential yo'q), shuning uchun "boshlang'ich parol rad etiladi"
   regressiya tekshiruvi quyidagicha yoziladi.

   DIQQAT: probe SOZLANGAN admin foydalanuvchi nomini ishlatishi shart.
   Aks holda 401 foydalanuvchi nomi tufayli keladi va parol umuman
   tekshirilmaydi — test yashirincha bo'sh qoladi (bu xato bir marta
   sodir bo'lgandi). Ikkala holat ham tekshiriladi.

   Aniq eski parolni tekshirish kerak bo'lsa, uni HECH QACHON repo'ga
   yozmang: `LEGACY_ADMIN_PASSWORD` orqali mahalliy vaqtincha bering
   (faqat shell muhitida, hech qayerga yozilmaydi). */
export const ADMIN_LOGIN_PROBES = [
  {
    label: 'configured admin username + non-env password',
    username: process.env.ADMIN_USERNAME,
    password: 'No-Default-Credential-1!',
  },
  {
    label: 'documented default admin username + non-env password',
    username: 'Admin',
    password: 'No-Default-Credential-1!',
  },
]
