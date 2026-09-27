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
| 2 | **Rate limiting** | Login (10/15 daqiqa, IP+login bo‘yicha), register (10/soat), admin-login (10/15 daqiqa), parol tiklash (5/15 daqiqa IP + 3/soat hisob) va media yuklash (120/soat) chegaralanadi — `Retry-After` bilan 429. **Yozishlar ham chegaralanadi** (600/soat, **sessiya bo‘yicha**): kontent amallari (like/comment/share/shield/follow, thread/guruh yaratish, xabar yuborish) va butun holat blobini yozadigan `PUT /api/data` (alohida `sync` hisobi). Yuqori chastotali halol amallar ataylab chetlab o‘tilgan: `stories/view` (avtomatik o‘tish), `notifications/read`, `ping`, `logout`, `push` — ularni bloklash foydalanuvchini qulflab qo‘yardi. Chegaralar jarayon xotirasida: ko‘p instanceda har bir instance alohida hisoblaydi, shuning uchun nginx `limit_req` bilan qoplash kerak (`deploy/nginx.conf.example`). |
| 3 | **Parol tiklash** | `POST /api/auth/forgot` 6 raqamli kod beradi (10 daqiqa, 5 urinish, eski kod bekor qilinadi), `POST /api/auth/reset` parolni yangilaydi va **barcha sessiyalarni bekor qiladi**. Kod **real kanal orqali yetkaziladi** (`netlify/lib/delivery.mjs`: Resend yoki Telegram-botga moslashtirilgan webhook — quyida). Ishlab chiqarishda `APP_URL` berilishi shart, aks holda havola tuzilmaydi. Bir marta so'rashda bitta kod yuboriladi (60 soniyali kutish), mavjud foydalanuvchi oshkor qilinmaydi. |
| 4 | **2FA / sessiya boshqaruvi** | Sessiyalar 30 kunlik **sliding TTL** bilan ishlaydi (faol bo'lganda yangilanadi, muddati o'tgani `401` bilan rad etiladi va tozalanadi). Parol tiklanganda yoki `POST /api/auth/logout-all` da **barcha qurilmalardagi sessiyalar** yopiladi; Settings'da faol sessiyalar ro'yxati ko'rinadi (brauzer, oxirgi faollik, muddati). 2FA va qurilma tanib olish (IP/geolokatsiya) **yo'q**. |
| 5 | **Google Identity skripti** | `index.html` da `accounts.google.com/gsi/client` yuklanadi, lekin login/registerda ishlatilmaydi (foydasiz yuk). |
| 6 | **Media** | Rasmlar/video alohida `POST /api/media` orqali **haqiqiy fayl** sifatida saqlanadi (Postgres `bytea` yoki Blobs), hujjatda faqat URL turadi. Rasm brauzerda 1600px/WebP'gacha siqiladi. Qoldiqlar: CDN/thumbnail yo'q, video siqilmaydi, ochiq media uchun URL **HMAC imzosi** bilan beriladi (/api/media/<id>?s=...), shaxsiy media esa faqat suhbat/guruh a'zolariga ochiq. Eski `data:` URL lar admin panelidan bir tugma bilan faylga ko'chiriladi. |
| 7 | **To'lov (premium)** | UI mavjud, backend yo'q. |
| 8 | **Qonuniy tomon** | Ma'lumotlarni saqlash shartlari, cookie/bildirishnoma siyosati, `delete account` oqili yo'q. |
| 9 | **Bildirishnoma tizimi** | Xabar, guruh xabari va kiruvchi qo'ng'iroq uchun server tomonda bildirishnoma yaratiladi (`GET /api/notifications?since=`, `POST /api/notifications/read`). Faqat qabul qiluvchida ko'rinadi, har bir foydalanuvchida oxirgi 200 tasi saqlanadi. SPA ochiq tursa global poll (4 s) + brauzer `Notification` API + WebAudio signal ishlaydi. **Web Push** (`/api/push/*` + `public/sw.js`) orqali brauzer yopiq bo'lganda ham yetkaziladi. **Qoldiqlar:** VAPID kaliti env'da berilmasa generatsiya qilinib `app_settings` da saqlanadi (Netlify da `doppi_doc` ichida) — kalitni almashtirsangiz obunalar qaytadan o'rnatilishi kerak; iOS'da push faqat qo'lda "Qo'shish" (Add to Home Screen) qilingan web ilovada ishlaydi. |

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

**Ovozli xabarlar:** mikrofon yozuvi (`MediaRecorder`, 12 MB chegara, webm/ogg/mp4/mp3/wav)
ham xuddi rasm/video kabi `POST /api/media` orqali haqiqiy faylga saqlanadi, xabarda esa
faqat `audio` (URL) va `audioDuration` (soniya) saqlanadi. `webm;codecs=opus` kabi MIME
parametrlari serverga yuborishdan oldin toza MIME ga aylantiriladi. Xabar puflangan player bilan
ishonchli (seeking, duration) eshitiladi. Mikrofonga ruxsat berilmasa yoki MediaRecorder
qo'llab-quvvatlanmasa UI aniq xabar ko'rsatadi (xabar yuborilmaydi).

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

**Bildirishnomalar (barcha xabarlar + qo'ng'iroq):** server tomonda DM xabari, guruh xabari
va kiruvchi `ring` signali uchun bildirishnoma yozadi — qabul qiluvchida `notifications
jadvalida, core store'da esa `doc.notifications` da (oxirgi 200 ta, `since` cursor bilan o'qiladi).
Navbar va mobil pastki panelda **qo'ng'iroqchincha** + o'qilmagan badge; ochilganida ro'yxat,
"hammasini o'qilgan" va bitta tanlashda o'qish. Yangi xabar/qo'ng'iroq uchun WebAudio
signal, ruxsat berilgan va tab yashiringan holatda esa brauzer `Notification` API.
Brauzer ruxsati Settings > Bildirishnomalar dan yoqiladi (va ovoz alohida o'chiriladi).

**Yopiq brauzerga yetkazish (Web Push + service worker):** `public/sw.js` registratsiya qilinadi
va Settings dagi "Yopiq brauzer uchun yetkazish" tugmasi yoqilganda qurilma `PushManager` orqali
obunadi. Server har bir bildirishnomani yaratganda `push_subscriptions` dagi qurilmalarga yuboradi
(404/410 bo'lgan obunalar avtomatik o'chiriladi). **Muhim:** foydalanuvchi oxirgi 60 soniyada
faol bo'lsa (sahifa ochiq, u o'zi poll qilib turgan) push yuborilmaydi — aks holda bildirishnoma
ikki marta chiqardi. Bildirishnoma `actions` bilan ko'rsatiladi, ya'ni tizim darajasidagi
"Qo'ng'iroqqa qo'shilish" tugmasi ham ishlaydi. VAPID kaliti `VAPID_PUBLIC_KEY` /
`VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` env orqali beriladi; bermasangiz kalit avtomatik
generatsiya qilinib saqlanadi (core: `doc.vapid`, server: `app_settings`).

**Parol tiklash kodini yetkazish** (`netlify/lib/delivery.mjs`) — Netlify'da SMTP port yo'q, shu
uchun faqat HTTP provayderlar qo'llaniladi. `MAIL_MODE` tanlanadi:

| `MAIL_MODE` | Nima qiladi | Kerakli env |
| --- | --- | --- |
| `resend` | Resend orqali email yuboradi (eng oddiy yo'l) | `RESEND_API_KEY`, `MAIL_FROM` |
| `webhook` | Tanlagan xizmatga `{to, subject, text, html, code, username}` JSON yuboradi — masalan Telegram bot orqali | `DELIVERY_WEBHOOK_URL`, `DELIVERY_WEBHOOK_TOKEN` (ixtiyoriy) |
| `log` | Faqat server logiga yozadi (lokal ishlash uchun) | — |
| `off` | Umuman yubormaydi | — |

Bo'sh bo'lsa `MAIL_MODE=auto`: `RESEND_API_KEY` bo'lsa `resend`, webhook URL bo'lsa `webhook`,
aks holda `log`. **Ishlab chiqarishda albatta `resend` yoki `webhook` va `APP_URL` belgilang** —
`log`/`off`da foydalanuvchi kodni olmaydi. `MAIL_FROM` bo'lmasa default `Do'ppi <no-reply@doppi.app>`.
Yetkazish xatosi javobni buzmaydi (foydalanuvchi har doim bir xil "yuborildi" javobini oladi) va
boshqa hech kimga oshkor qilinmaydi. Telegram uchun `webhook` + kichik bot proxy yetarli.

`NODE_ENV=production` da kod javobda qaytarilmaydi (`RESET_CODE_ECHO` bilan lokalda ham
o'chirilishi mumkin), faqat `xavfsiz` holatda `debugCode` maydoni to'ladi. Xabardagi havola
`/login?username=...&forgot=1` — shu oyina foydalanuvchi to'g'ridan-to'g'ri kod kiritish
qadamiga tushadi, username oldindan to'ladi.



**Bildirishnomadan qo'ng'iroqqa qo'shilish:** o'qilmagan qo'ng'iroq bildirishnomasida **"Qo'ng'iroqqa
qo'shilish"** tugmasi chiqadi. U suhbat yoki guruhni ochadi va darhol `responder` rejimini
boshlaydi — shunda **ring signali o'tib ketgan bo'lsa ham** responder o'z `offer` ini
yuborib qo'ng'iroqni tiklaydi. `hangup` yoki `decline` yuborilganda ochiq qo'ng'iroq
bildirishnomasi `closed`/`read` belgilangan holatda yopiladi, shuning uchun bell'da o'lik
qo'ng'iroq qolmaydi. Tugma faqat o'qilmagan va yopilmagan qo'ng'iroqlarda ko'rinadi.

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

O'z serveringizda (nginx + Let's Encrypt): tayyor konfiguratsiya —
[`deploy/nginx.conf.example`](deploy/nginx.conf.example). Unda HTTP→HTTPS
redirect, faqat TLS 1.2+, HSTS va API uchun `limit_req` chegaralari bor.
Ilova `127.0.0.1:4000` da turadi (default `HOST`), tashqaridan ochiq emas;
portlar va firewall qoidalari — [SECURITY.md](SECURITY.md).

### Docker Compose (nginx + Express + PostgreSQL)

To'plam to'rt konteynerdan iborat: `nginx` (80/443), `app` (4000, faqat ichki
tarmoqda), `postgres` (faqat `internal` tarmoqda), `certbot` (sertifikat
yangilash). Tashqariga faqat 80/443 ochiq.

```bash
cp .env.example .env        # POSTGRES_PASSWORD, SESSION_SECRET,
                            # ADMIN_*, ALLOWED_HOSTS, APP_URL to'ldiriladi
docker compose build
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
  -d example.uz -d www.example.uz --agree-tos -m admin@example.uz   # bir marta
docker compose up -d
```

Muhim nuanslar:

- **`deploy/nginx.conf.example` to'g'ridan-to'g'ri mount qilinadi**
  (`/etc/nginx/conf.d/default.conf`). Bu fayl to'liq `nginx.conf` emas —
  `events {}`/`http {}` bloklari uning ichida yo'q. Domen va sertifikat
  yo'llarini (`example.uz`) o'zgartiring. Bare-metal'da faqat `upstream`
  dagi `server app:4000;` ni `server 127.0.0.1:4000;` bilan almashtirib,
  faylni `/etc/nginx/conf.d/doppi.conf` ga joylang.
- **`TRUST_PROXY=1`** compose'da qat'iy: nginx boshqa konteynerda, uning IP
  loopback emas. Sukut `loopback` qolsa `X-Forwarded-Proto` e'tiborsiz
  qoladi va `FORCE_HTTPS` o'z so'roviga o'zi 308 qaytaradi (redirect loop).
- **`DATABASE_SSL=0`** compose'da qat'iy: postgres konteyneri TLS'siz, lekin
  `internal: true` tarmoqda faqat ikkita konteyner bir-borini ko'radi.
  Server bu haqda ogohlantirish chiqaradi — bu qasddan.
- **`.dockerignore` majburiy** — aks holda `.env` (kalitlar) va lokal
  `node_modules` image ichiga ko'chiriladi.
- **`GET /api/health`** — auth'siz, `{"ok":true}`. Docker healthcheck va
  nginx'ning `depends_on: service_healthy` shu endpointga uradi.
  (`/api/ping` ishlatib bo'lmaydi: u POST + sessiya talab qiladi.)
- **SPA va statikani ilova beradi** (`dist/` image ichida), nginx esa
  hammasini unga proksi qiladi.
- **Xavfsizlik sarlavhalari bitta manbadan.** Ilova ham `X-Frame-Options`,
  `Permissions-Policy`, HSTS va boshqalarini yuboradi; nginx'da
  `proxy_hide_header` bilan ilovaning qatorlari yashiriladi — aks holda
  mijoz ikki qatorni ko'rib, qaysi biri qo'llanishini tushunmay qoladi.
  `Permissions-Policy` da `geolocation=()` saqlangan (ilovadagi qat'iyroq
  qiymat), `Cross-Origin-Resource-Policy` va CSP esa o'tkazib yuboriladi
  (ular faqat bitta manbada bor).
- **80 → 443 redirect `map $host $canonical_host` orqali** — `$host`
  ishlatilsa, `Host: evil.com` yuborgan so'rov `https://evil.com/...` ga
  ketardi (ilovaning `ALLOWED_HOSTS` tekshiruvi bu yerda ishlaydi, chunki
  redirect nginx'da bo'ladi). Noma'lum Host asosiy domenga tushadi.

Tekshiruv:

```bash
docker compose ps                                    # app va nginx: healthy
curl -sI https://example.uz | grep -i strict-transport
curl -s https://example.uz/api/health               # {"ok":true}
docker compose logs app | grep xavfsizlik            # ogohlantirishlarni o'qing
```

### Xavfsizlik: majburiy muhit o'zgaruvchilari

Loyihada **ishlaydigan boshlang'ich parol yo'q** — bunday parollar xavfsizlik
nuqtasida zaif hisoblanadi va `git`ga tushib qolsa butun hisobni ochib beradi.

| O'zgaruvchi | Qayerda | Talab |
|---|---|---|
| `SESSION_SECRET` | Netlify Function + Express | **Majburiy** (production), kamida 16 belgi. Sessiya tokenlari shu kalit bilan HMAC imzolanadi. |
| `ADMIN_USERNAME` | Netlify Function + Express | Ixtiyoriy. Berilmasa admin panel yopiq. |
| `ADMIN_PASSWORD` | Netlify Function + Express | Berilsa kamida **12 belgi**. Berilmasa admin panel yopiq. |
| `DATABASE_URL` | Express (`production`) | **Majburiy** — kod ichida DB paroli yo'q. Yoki to'liq `PGUSER`+`PGPASSWORD`+`PGHOST`+`PGDATABASE` to'plami (ikkalasidan **biri** yetarli; alohida maydonlar afzal — paroldagi maxsus belgilar URL'ni buzmaydi). |
| `DATABASE_SSL` | Express | `0`/`disable` **production'da ogohlantirish** bilan o'chiradi. Faqat lokal test uchun. |
| `DATABASE_CA` | Express | O'z CA sertifikati (base64 yoki fayl yo'li) — sertifikat tekshiruvi uchun. |
| `DATABASE_SSL_NO_VERIFY=1` | Express | Sertifikat tekshiruvi o'chiriladi (MITM ogohlantirishi chiqadi). Faqat o'z-imzozali test baza. |
| `HOST` | Express | Sukut **`127.0.0.1`** — tashqi tarmoqqa ochiq emas. `0.0.0.0` faqat proxy ortida/ichki tarmoqda. |
| `TRUST_PROXY` | Express | Sukut `loopback` — `X-Forwarded-Proto` faqat lokal proxy'dan qabul qilinadi. |
| `ALLOWED_HOSTS` | Express | Host sarlavhasi chegarasi (`example.uz,www.example.uz`). Belgilanmagan bo'lsa ishlaydi, production'da **tavsiya** — aks holda `Host` kiritish orqali open redirect mumkin. |
| `FORCE_HTTPS` | Express | Production'da **yoqilgan**: HTTP → HTTPS **308** redirect. TLS yo'q joyda `FORCE_HTTPS=0`. |
| `APP_URL` | Express + Function | **Faqat `https://`** — `http://` bo'lsa tiklash havolasi tashlab qolinadi. |
| `DELIVERY_WEBHOOK_URL` | Express + Function | **Faqat `https://`** — aks holda kod yuborish rad etiladi (loopback `http` ruxsat). |

Haqiqiy qiymatlarni `.env.example` dan nusxalang (`.env` gitga kirmaydi).
Portlar, firewall va to'liq xavfsizlik holati — **[SECURITY.md](SECURITY.md)**.

Tasodifiy `SESSION_SECRET` yaratish:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Ikki holat eslab qolinadi:

- Eski (xom saqlangan) sessiyalar endi **rad etiladi** — ular `git`da ochiq
  bo'lgani uchun xavfsiz deb hisoblanmaydi. Foydalanuvchilar qayta kiring.
  Faqat lokal migratsiya uchun `ALLOW_LEGACY_SESSIONS=1`.
- Admin paroli 12 belgidan kichik bo'lsa yoki berilmasa, `/api/admin/login`
  har doim "noto'g'ri" javob beradi — sozlanmaganligini aniqlab bo'lmaydi.

`server/db.json`, `netlify/lib/seed.json` va `seed.local.json` **gitga
kiritilmaydi** (`.gitignore`). Ularda oldindan LIVE sessiya tokenlari va parol
hash/saltrlari bor edi — shuning uchun endi hech qanday seed fayl avtomatik
yuklanmaydi (`ALLOW_SEED=1` + `SEED_FILE` talab qilinadi, production'da
rad etiladi). Seed eksporti ham parol va sessiyalarni chiqarmaydi.

## Xavfsizlik qatlami — qilingan o'zgarishlar

Joriy xavfsizlik ishi (portlar, shifrlash, webhook, maxfiylar) va **hal
qilinmagan xavflar** — [SECURITY.md](SECURITY.md). Bu yerda qisqa hisobot:

| Soha | Oldin | Endi |
|---|---|---|
| **Port / bind** | `app.listen(PORT)` — `0.0.0.0`, ya'ni hamma interfeysga ochiq | Sukut **`127.0.0.1`** (`HOST`). `0.0.0.0` faqat qo'lda va ogohlantirish bilan |
| **HTTP → HTTPS** | Yo'q | `FORCE_HTTPS` (production'da **yoqilgan**) — **308** redirect; `TRUST_PROXY=loopback` bilan soxta header himoyasi |
| **HSTS** | Faqat `req.secure` da (proxy'siz hech qachon ishlamagan) | `trust proxy` bilan nginx ortida ham yuboriladi, `includeSubDomains` |
| **PostgreSQL TLS** | Opt-in (`DATABASE_SSL=1`) **+ sertifikat tekshiruvi o'chiq** (`rejectUnauthorized: false`) | Production'da **majburiy TLS**, `rejectUnauthorized: true`, `DATABASE_CA` qo'llab-quvvatlanadi, `sslmode=disable` e'tiborsiz |
| **Webhook (chiqish)** | Har qanday URL'ga kod + Bearer token yuborilardi | **Faqat `https://`** (loopback ruxsat). `http://` → `sendMail` rad etadi, tarmoqqa chiqmaydi |
| **Tiklash havolasi** | `http://` URL ham qo'shilardi | Xavfsiz bo'lsa **gina** qolinadi (havola o'zi credential) |
| **Maxfiylar** | `.env` gitignored | Shu bilan birga **`.env.example`** — barcha o'zgaruvchilar, kalsiz |
| **Kiruvchi webhook** | — | Repoda **inbound webhook yo'q** (faqat chiqish webhook) |

Testlar: `npm run test:all` — 489 tekshiruv (bunda `delivery` 42 ta:
https kirish/bandlash, webhook rad etilishi, havola tushirilishi).

## Testlar

```bash
npm run test:netlify   # 149 test: api-core business logikasi (fayl store) + 8 sessiya-muddati tekshiruvi
npm run test:blobs     # 149 test: blobs-store adapter (fake @netlify/blobs)
npm run test:pg-store  # 149 test: postgres-store — haqiqiy Postgres'da doppi_doc + doppi_media
npm run test:delivery  # 42 test: parol tiklash kodini yetkazish kanallari
npm run test:all       # barchasi birga (489 test)
npm run test:live      # 65 test: haqiqiy Express server + Postgres (audio, xabar, bildirishnoma, qo'ng'iroq, push)
npm run build          # tsc + vite
npm run lint           # oxlint
```

`test:live` server'ni **o'zi qo'lamaydi** — oldindan `node server/index.js`
4000-portda ishga tushishi kerak (yuqoridagi "Ishga tushirish" bo'limiga qarang).

Uchala test ham bitta suite'ni (`netlify/lib/test-suite.mjs`) ishlatadi va haqiqiy
`handleRequest` eksporti orqali oqimni yuritadi: auth → data (muhrlangan post + albom) →
qalqon (+30m / takror→409 / o'z posti→403) → like/comment/share → muhrlangan DM → muhrlangan
guruh xabari → admin dashboard → **media yuklash (bayt darajasida round-trip, 415/413/401 va
path traversal himoyasi) → media GC (faqat admin, orphan o'chadi, havolali fayl qoladi) →
`data:` URL migratsiyasi (URL faylga aylanadi, `data:` iz qolmaydi)** →
**rate-limit (brute force 11-urishda 429 + `Retry-After`, to'g'ri parol ham bloklanadi)** →
**parol tiklash (6 raqamli kod → eski parol 401 → yangi parol 200 → eski sessiya o'lgan)** →
**sessiya muddati (30 kun sliding TTL, o'tgani 401) + "hamma qurilmalardan chiqish"** →
**ovozli xabar (audio media 201/415/413, xabarda `audio` + `audioDuration`, DM va guruh tarixi)**
**bildirishnoma (xabar/qo'ng'iroq generatsiyasi, faqat qabul qiluvchida, cursor `since`, mark-read, `hangup`/`decline` da qo'ng'iroq bildirishnomasi yopiladi)** →
**Web Push obunasi (`/api/push/key`, subscribe idempotent, noto'g'ri endpoint → 400, auth → 401, obuna bilan xabar yuborish buzilmaydi, unsubscribe)** →
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
  components/   PostCard, OrbitView, MsgBubble, StoriesRow, CreatePost, LiveClock,
               VoiceRecorder, VoicePlayer, NotificationBell...
  data/         store, interactions, mock (tiplar), auth, notifications
  i18n/         69 til, `translate()` bilan fallback (missing kalit → base)
  styles/       components, layout, orbit
netlify/        functions/api.mjs, lib/api-core.mjs (business logika), lib/blobs-store.mjs,
                lib/postgres-store.mjs, lib/test-suite.mjs + uchta *.test.mjs,
                lib/live-voice-notif.smoke.mjs (haqiqiy server smoke)
server/         index.js, schema.sql (doppi_doc, doppi_media, notifications,
                push_subscriptions, app_settings, ...)
public/         favicon.svg, icons.svg, sw.js (Web Push + app shell cache)
deploy/         nginx.conf.example (nginx → app:4000, TLS 1.2+, HSTS, limit_req)
Dockerfile      3 bosqich: frontend build → runtime paketlar → non-root runtime
docker-compose.yml  nginx (80/443) + app (4000, ichki) + postgres (internal) + certbot
.dockerignore   build kontekstidan `.env`, `node_modules`, `certbot/` ni chiqaradi
purge-legacy-password.mjs  git tarixidan sizib chiqqan parolni tozalash
                            (parol faylda emas — `LEGACY_ADMIN_PASSWORD` orqali)
```
