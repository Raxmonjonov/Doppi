# Do'ppi

Do'ppi — O'zbekistonda yaratilgan, vaqt asosidagi ijtimoiy tarmoq. Instagram va Facebook'dan
butunlay boshqacha: kontent vaqtga bog'lanadi, ochiladi, so'ng uchib ketadi.

**Hozirgi holat: production-ready emas — bu kod demonstratsiya prototipi.**

## ⚠️ Muhim ogohlantirish (avval o'qing)

Bu kod hech qanday ma'muriy xavfsizlik choralari **boshqarilmagan** holatda yozilgan.
Ishlatishdan oldin kamida quyidagilarni qo'shing:

| # | Xavf | Nimaga |
|---|------|--------|
| 1 | **Parol saqlash** | `netlify/lib/api-core.mjs` (hashPassword) va `server/index.js` da parollar `scrypt` bilan hash qilinadi, lekin **ishlaydigan rate-limit/session rotation** yo'q. Brute-force mumkin. |
| 2 | **Rate limiting** | Hech qanday endpoint rate-limit qilinmagan — login, register, post yaratish, xabar yuborish. Bot/DoS ga ochiq. |
| 3 | **Parol tiklash** | Yo'q. |
| 4 | **2FA / sessiya boshqaruvi** | Minimal. |
| 5 | **Google Identity skripti** | `index.html` da `accounts.google.com/gsi/client` yuklanadi, lekin login/registerda ishlatilmaydi (foydasiz yuk). |
| 6 | **Media saqlash** | Rasmlar/video `data:` URL (base64) sifatida butun JSON dokument ichida saqlanadi — 33% kattalashuv va katta payload; brauzer ham, Postgres ham, Blobs ham cheklangan. Ishlab chiqarish uchun haqiqiy fayl ombori + CDN kerak. |
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
npm run test:netlify   # 23 test: api-core business logikasi (fayl store, Blobs kabi)
npm run test:pg-store # 23 test: postgres-store — haqiqiy Postgres'da doppi_doc SQL'i
npm run test:all      # ikkalasi
npm run build         # tsc + vite
npm run lint          # oxlint
```

Ikkala test ham bitta suite'ni (`netlify/lib/test-suite.mjs`) ishlatadi va haqiqiy
`handleRequest` eksporti orqali oqimni yuritadi: auth → data (muhrlangan post + albom) →
qalqon (+30m / takror→409 / o'z posti→403) → like/comment/share → muhrlangan DM → muhrlangan
guruh xabari → admin dashboard → "qayta ishga tushgandan keyin saqlanish".

`test:pg-store` Neon HTTP'ni bevosita emulyatsiya qilolmaydi (neon faqat HTTP ishlaydi), shuning
uchun `neon()` o'rniga neon semantikasidagi `sql` shim qo'yiladi va SQL haqiqiy Postgres'da
bajariladi — shu bilan `doppi_doc` jadvali, `jsonb` cast va `ON CONFLICT` tekshiriladi.

## Tuzilma

```
src/
  pages/        Home, Reels, Messenger, Groups, Profile, Photos, SealWall, Settings, Admin, Pages…
  components/   PostCard, OrbitView, MsgBubble, StoriesRow, CreatePost, LiveClock…
  data/         store, interactions, mock (tiplar), auth
  i18n/         69 til, `translate()` bilan fallback (missing kalit → base)
  styles/       components, layout, orbit
server/         index.js, schema.sql
netlify/        functions/api.mjs, lib/api-core.mjs (business logika), lib/postgres-store.mjs,
                lib/api-core.test.mjs + lib/postgres-store.test.mjs + lib/test-suite.mjs
```
