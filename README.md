# Do'ppi

Do'ppi — O'zbekistonda yaratilgan, vaqt asosidagi ijtimoiy tarmoq. Instagram va Facebook'dan
butunlay boshqacha: kontent vaqtga bog'lanadi, ochiladi, so'ng uchib ketadi.

**Hozirgi holat: production-ready emas — bu kod demonstratsiya prototipi.**

## ⚠️ Muhim ogohlantirish (avval o'qing)

Bu kod hech qanday ma'muriy xavfsizlik choralari **boshqarilmagan** holatda yozilgan.
Ishlatishdan oldin kamida quyidagilarni qo'shing:

| # | Xavf | Nimaga |
|---|------|--------|
| 1 | **Parol saqlash** | `netlify/lib/api-core.mjs` (hashPassword) va `server/index.js` da parollar `scrypt` bilan hash qilinadi. Login/register/admin-login/media uchun **rate-limit** bor (10 urinish/15 daqiqa, register 10/soat, media 120/soat, `Retry-After` bilan 429). Chegara jarayon xotirasida saqlanadi — serverless'da bir necha soatga yoyilishi, ko'p instance'li da tayyor himoya bo'lmasligi mumkin. |
| 2 | **Rate limiting** | Login (10/15 daqiqa, IP+login bo'yicha), register (10/soat), admin-login (10/15 daqiqa), parol tiklash (5/15 daqiqa + 10/15 daqiqa) va media yuklash (120/soat) chegaralangan — `Retry-After` bilan 429. Post yaratish, xabar yuborish, ping va ma'lumotni saqlash (`PUT /api/data`) **chegaralanmagan**. Chegara jarayon xotirasida, ko'p instance'li serverless'da to'liq ishlaydi. |
| 3 | **Parol tiklash** | `POST /api/auth/forgot` 6 raqamli kod beradi (10 daqiqa, 5 urinish, eski kod bekor qilinadi), `POST /api/auth/reset` parolni yangilaydi va **barcha sessiyalarni bekor qiladi**. Yetkazib berish kanali (email/Telegram bot) **hali ulanmagan**: kod faqat server logiga yoziladi va `NODE_ENV=production` da javobda qaytarilmaydi — ya'ni ishlab chiqarishda bu oqim hali ishlatilmaydi. |
| 4 | **2FA / sessiya boshqaruvi** | Sessiyalar 30 kunlik **sliding TTL** bilan ishlaydi (faol bo'lganda yangilanadi, muddati o'tgani `401` bilan rad etiladi va tozalanadi). Parol tiklanganda yoki `POST /api/auth/logout-all` da **barcha qurilmalardagi sessiyalar** yopiladi; Settings'da faol sessiyalar ro'yxati ko'rinadi (brauzer, oxirgi faollik, muddati). 2FA va qurilma tanib olish (IP/geolokatsiya) **yo'q**. |
| 5 | **Google Identity skripti** | `index.html` da `accounts.google.com/gsi/client` yuklanadi, lekin login/registerda ishlatilmaydi (foydasiz yuk). |
| 6 | **Media** | Rasmlar/video alohida `POST /api/media` orqali **haqiqiy fayl** sifatida saqlanadi (Postgres `bytea` yoki Blobs), hujjatda faqat URL turadi. Rasm brauzerda 1600px/WebP'gacha siqiladi. Qoldiqlar: CDN/thumbnail yo'q, video siqilmaydi, media URL'i tokensiz ochiq (faqat tasodifiy 12-baytli id bilan). Eski `data:` URL lar admin panelidan bir tugma bilan faylga ko'chiriladi. |
| 7 | **To'lov (premium)** | UI mavjud, backend yo'q. |
| 8 | **Qonuniy tomon** | Ma'lumotlarni saqlash shartlari, cookie/bildirishnoma siyosati, `delete account` oqili yo'q. |

> Bu ro'yxatni kamaytirmasdan **real foydalanuvchilarga ochish** — xato qaror. Do'ppi'ni
> do'stlarga ko'rsatish uchun yetarli, jamoatga ochish uchun hali emas.

## Nima qilgani (xususiyatlar)

**Tarmoq asosi:** postlar (rasm/video), reels, stories (24 soatda "so'nadi"), guruhlar, DM,
fotoalbomlar, profil/likes/comments/shares/follow, admin panel, **69 tilda** i18n (O'zbekcha
asosiy, `translate()` bilan missing kalit → base fallback), Do'ppi milliy identiteti
(kumush-zaytun ranglar, medallion naqshlari, "dil" brendi).

**"To'lqinlar" (waves) — vaqt asosidagi feed:** har post 1 soat "yangi" (yashil pulsatsiya),
24 soatdan keyin "so'nadi" va "Ufqqa" (gorizont arxiviga) ketadi. Vaqt o'tishi bilan butun feed
o'z-o'zidan o'zgaradi — bu Instagram'da yo'q mexanika.

**Vaqt mashinasi (Time machine):** Home'da slayder — hamjamiyat o'tmishidagi to'lqinlarga
sayohat. Hozirgi vaqtga qaytish mumkin.

**Do'ppi soati (seals) — vaqtga bog'langan kontent:** muhrlangan kontent ochilishgacha
hech kim ko'ra olmaydi (muallimi ham). Vaqt kelganda u "marosim" bilan ochiladi va
To'lqinlarga qo'shiladi.

- **Postlar va albomlar:** Ochiq / 1 soat / 1 kun / 7 kun
- **DM va guruh xabarlari:** qumlash tugmasi — 1 soat → 1 kun → ochiq
- **Qalqon (shield):** boshqa foydalanuvchilar muhrni **+30 daqiqa** uzaytiradi
  (har post maks **3 qalqon**, har odam bittadan). O'z postini himoya qilolmaysan.

**Media tizimi:** rasm/video `POST /api/media` orqali haqiqiy faylga saqlanadi
(`doppi_media` yoki Netlify Blobs) — hujjatda faqat `/api/media/...` URL qoladi, shuning uchun
butun data hujjati kichik va tez sinxronlanadi. Rasm brauzerda avtomatik **1600px / WebP**
gacha siqiladi (12 MB telefon rasmi ~300 KB). Yuklash `multipart` emas, `data:` URL orqali;
server MIME ro'yxatini (jpeg/png/webp/gif/mp4/webm) va hajm chegarasini (rasm 8 MB, video 40 MB)
tekshiradi. Admin panelida ikki xil xizmat bor:
**"Eski rasmlarni faylga ko'chirish"** (`POST /api/media/migrate`, `?limit=`) — eski `data:` URL larni
haqiqiy fayllarga o'tkazadi (bir xil rasm bir necha joyda bo'lsa bitta fayl sifatida saqlanadi),
**"Ishlatilmay qolgan medialarni tozalash"** (`POST /api/media/gc`) — hujjatda havolasi qolmagan
fayllarni o'chiradi. Ikkalasi ham faqat admin tokeni bilan ishlaydi.

**Muhrlanadi:** postlar, DM xabarlari, guruh xabarlari, fotoalbomlar.

**Muhr devori (Seal Wall):** kelgusi va ochilgan muhrlar, jonli countdown.

**Orbit:** Home/Reels — kontent yulduz-turkum orbitida, markazida jonli Do'ppi soati.

## Arxitektura

Ikki xil backend, **ikkalasi ham to'liq ishlaydi** va bir xil API'ni beradi:

| | `server/` (Node + Postgres) | `netlify/` (Blobs/Neon) |
|---|---|---|
| ishga tushirish | `node server/index.js` (4000-port) | Netlify deploy (Functions) |
| saqlash | PostgreSQL (`Do'ppi` bazasi, `schema.sql`) | Netlify Blobs, yoki Neon (`DATABASE_URL`) |
| rol | To'g'ridan-to'g'ri, schema bilan tez | Butun dokument blob'da, sodda |

Paritet qoida: **yangi backend xususiyati ikkala joyga ham yoziladi.** (Netlify o'zgarishlari
faqat `node --check` bilan emas, `npm run test:netlify` bilan tekshiriladi.)

## Ishga tushirish

```bash
npm install
psql -U postgres -d postgres -f server/schema.sql   # Postgres kerak
node server/index.js                                # http://localhost:4000
npm run dev                                         # http://localhost:5173
```

Netlify uchun: `netlify.toml` `dist` publish qiladi, `/api/*` → Function. `DATABASE_URL` berilsa
Neon, aks holda Blobs ishlatiladi.

Sinov foydalanuvchilari: `demo1/demo1`, `demo2/demo2`. Admin panel: `/admin` →
`Admin` / `Admin.Do'ppi.Uzbekitan.66` (faqat lokal; `ADMIN_USERNAME`/`ADMIN_PASSWORD` bilan
 almashtirilishi shart).

## Testlar

```bash
npm run test:netlify   # 66 test: api-core business logikasi (fayl store) + 7 sessiya-muddati tekshiruvi
npm run test:blobs     # 66 test: blobs-store adapter (fake @netlify/blobs)
npm run test:pg-store  # 66 test: postgres-store — haqiqiy Postgres'da doppi_doc + doppi_media
npm run test:all       # uchalasi (198 test)
npm run build          # tsc + vite
npm run lint           # oxlint
```

Uchala test ham bitta suite'ni (`netlify/lib/test-suite.mjs`) ishlatadi va haqiqiy
`handleRequest` eksporti orqali oqimni yuritadi: auth → data (muhrlangan post + albom) →
qalqon (+30m / takror→409 / o'z posti→403) → like/comment/share → muhrlangan DM → muhrlangan
guruh xabari → admin dashboard → **media yuklash (bayt darajasida round-trip, 415/413/401 va
path traversal himoyasi) → media GC (faqat admin, orphan o'chadi, havolali fayl qoladi) →
`data:` URL migratsiyasi (URL faylga aylanadi, `data:` iz qolmaydi)** →
**rate-limit (brute force 11-urishda 429 + `Retry-After`, to'g'ri parol ham bloklanadi)** →
**parol tiklash (6 raqamli kod → eski parol 401 → yangi parol 200 → eski sessiya o'lgan)** →
**sessiya muddati (30 kun sliding TTL, o'tgani 401) + "hamma qurilmalardan chiqish"** →
"qayta ishga tushgandan keyin saqlanish".

`test:pg-store` Neon HTTP'ni bevosita emulyatsiya qilolmaydi (neon faqat HTTP ishlaydi), shuning
uchun `neon()` o'rniga neon semantikasidagi `sql` shim qo'yiladi va SQL haqiqiy Postgres'da
bajariladi — shu bilan `doppi_doc`, `doppi_media` (bytea), `jsonb` cast va `ON CONFLICT`
tekshiriladi. `test:blobs` esa `@netlify/blobs` v11 semantikasini takrorlaydi (metadata orqali
mime); haqiqiy Blobs tarmog'i faqat live deploy'da tekshiriladi.

## Tuzilma

```
src/
  pages/        Home, Reels, Messenger, Groups, Profile, Photos, SealWall, Settings, Admin, Pages…
  components/   PostCard, OrbitView, MsgBubble, StoriesRow, CreatePost, LiveClock…
  data/         store, interactions, mock (tiplar), auth
  i18n/         69 til, `translate()` bilan fallback (missing kalit → base)
  styles/       components, layout, orbit
netlify/        functions/api.mjs, lib/api-core.mjs (business logika), lib/blobs-store.mjs,
                lib/postgres-store.mjs, lib/test-suite.mjs + uchta *.test.mjs
server/         index.js, schema.sql (doppi_doc, doppi_media, …)
```
