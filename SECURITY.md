# SECURITY — portlar, tarmoq qoidalari va shifrlash

Bu hujjat loyihaning **xavfsizlik holatini** tasvirlaydi: ochiq/yopiq portlar,
firewall qoidalari, transport shifrlash, maxfiy ma'lumotlar boshqaruvi va
**hal qilinmagan (ochiq qolgan) xavflar**.

> Izoh: holatni o'zgartirganda bu hujjatni ham yangilang — bu fayl
> operatsion qoida, rejalashtirish emas.

---

## 0. Stek haqida aniqlik

Ushbu xavfsizlik ro'yxati Django REST Framework + Celery/Redis + Django Channels
+ AWS S3 + Docker/Nginx degan taxmin bilan tuzilgan edi. Haqiqiy stek:

| Taxmin qilingan | Loyihada bor | Izoh |
|---|---|---|
| Django / DRF / `settings.py` | **Yo'q** → `server/index.js` (Express) | Mos ekvivalentlar quyida (§4, §5) |
| Celery / Redis | **Yo'q** | Chegiruvchi (rate limit) jarayon xotirasida |
| Django Channels (WebSocket) | **Yo'q** | WebSocket/realtime kanal yo'q; Web Push (VAPID) bor |
| AWS S3 | **Yo'q** | Fayllar Postgres `bytea` yoki Netlify Blobs'da |
| Docker / nginx konfigi | **Bor** (`Dockerfile`, `docker-compose.yml`, `deploy/nginx.conf.example`) | §4.0; tashqaridan faqat 80/443, PostgreSQL `internal` tarmoqda |
| JWT (access/refresh) | **Yo'q** | Oddiy sessiya tokeni + HMAC imzosi (§5) |
| Google OAuth callback | **Yo'q** | `index.html` da gsi skripti yuklanadi, ishlatilmaydi |

Shu sababli ro'yxatdagi **mos keladigan** bandlar alohida bajarildi (§8 jadval).

---

## 1. Portlar holati (ochiq / yopiq)

### Nima xavfsiz (qoidalarga mos)

| Port | Holat | Qanday ta'minlangan |
|---|---|---|
| **443** (HTTPS) | Ochiq — yagona kirish nuqtasi | Netlify yoki nginx/Let's Encrypt |
| **80** (HTTP) | Faqat 443'ga redirect | `netlify.toml` HSTS; `FORCE_HTTPS=1` (§4) |
| **API (4000)** | **Yopiq** — faqat `127.0.0.1` | `HOST` sukut bo'yicha `127.0.0.1` |
| **PostgreSQL (5432)** | Ichki — localhost yoki ichki tarmoq | URL/`PGHOST` bilan, tashqi ruxsat yo'q |
| **Redis (6379)** | **Umuman yo'q** | Loyihada Redis ishlatilmaydi |

App **butunlay `127.0.0.1:4000` da turadi** — ya'ni tashqi tarmoqdan port ochiq
turmadi. Ishlab chiqarishda `0.0.0.0` berilsa (proxy ortida/ichki tarmoqda
kerak bo'lsa) server boshida ogohlantirish yozadi:

```
[xavfsizlik] Server barcha interfeyslarga ulanmoqda (HOST=0.0.0.0). ...
```

Buni tekshirish:

```bash
# nimani kim eshitmoqda
ss -tulpn          # Linux
netstat -an        # Windows
# app porti tashqaridan ochiqmi?
curl -m 3 http://SERVER_IP:4000/api/health   # ECONNREFUSED bo'lishi kerak
```

### To'liq port auditi (bu ish stansiya)

`netstat -ano` bo'yicha **barcha** LISTENING portlar, tashqi tegishliligi
(`0.0.0.0` / `[::]` = hamma interfeys) va qilingan harakat:

| Port | Jarayon | Tegishlilik | Holat / harakat |
|---|---|---|---|
| **4000** | Do'ppi API (`server/index.js`) | `127.0.0.1` | **Yopiq** — default-deny bind |
| **5432** | PostgreSQL 18 | `0.0.0.0` → `127.0.0.1` | **Yopildi** (§1 lockdown: konfig + restart + firewall) |
| 6379 | — | — | Redis umuman yo'q |
| **3000** | boshqa loyiha (`Desktop\Hibon\server\server.js`) | `0.0.0.0` | **Yopildi** — inbound **Block** qoidasi (lokal ishlashda davom etadi) |
| 445 / 139 | Windows SMB | `0.0.0.0` | Ochiq qoldirildi (foydalanuvchi qarori). Tashqi tarmoq serverida: `ufw deny 445/tcp` |
| 135 + 49664-49669 | Windows RPC/DCOM | `0.0.0.0` | Ochiq qoldirildi (Windows standarti) |
| 5040 | svchost (Local Session Manager) | `0.0.0.0` | Windows standarti |
| 22 (SSH) | — | tinglamaydi | OpenSSH server o'rnatilmagan → SSH bandi tegishli emas |
| 3389 (RDP) | — | tinglamaydi | Yopiq |

**Tekshirish cheklovi (muhim):** bu mashinadan o'zining LAN IP'siga ulanish
firewall qoidalaridan **o'tmaydi** (host→self), shuning uchun audit paytida
`3000 -> OPEN` ko'rinishi haqiqiy masofaviy test **emas**. Muhim qismi
listener bind'i: 4000/5432 loopback'ga cheklangani uchun ular tashqaridan
`ECONNREFUSED` bo'ladi. Qoida konfiguratsiyasi esa alohida tekshirildi —
3000 bo'yicha yagona inbound qoida: **Inbound + Block + TCP 3000 + Profile
Any**, ya'ni boshqa hech qanday Allow uni qayta ochmaydi.

Aniq tasdiq **boshqa qurilmadan** (telefon/Wi-Fi):

```bash
nc -vz 10.141.158.103 3000    # refused bo'lishi kerak
nc -vz 10.141.158.103 4000    # refused bo'lishi kerak
nc -vz 10.141.158.103 5432    # refused bo'lishi kerak
```

### Mahalliy audit xulosasi (eski holat) — TOPILDI VA TUZATILDI

Auditda ikkala himoya ham yo'q edi:

```
TOPILDI (eski):                              TUZATILGAN (hozir):
TCP  0.0.0.0:5432  LISTENING                 TCP  127.0.0.1:5432  LISTENING
                                             TCP  [::1]:5432       LISTENING
Windows Firewall: 4 ta "PostgreSQL Server"
Allow (inbound) — YOQILGAN                   0 ta qoldi (hammasi o'chirildi)
```

Qilingan ishlar:

1. `postgresql.conf` → `listen_addresses = '*'` o'rniga `'localhost'`
   (zaxira: `postgresql.conf.bak-security`).
2. `postgresql-x64-18` xizmati qayta ishga tushirildi
   (`listen_addresses` faqat restartda qabul qilinadi — reload yetmaydi).
3. Windows Firewall'ning 4 ta inbound **Allow** qoidasi o'chirildi.

Tekshiruv natijasi:

```text
LAN 10.141.158.103:5432  -> ECONNREFUSED   (tashqi kirish yopiq)
127.0.0.1:5432           -> OK             (app ulanishida ishlaydi)
npm run test:all         -> 429 passed, 0 failed
```

**Xuddi shu tuzatish real serverda (Linux):**

```bash
# 1) faqat loopback'ga cheklash
sudo editor /etc/postgresql/16/main/postgresql.conf
listen_addresses = 'localhost'
sudo systemctl restart postgresql        # reload EMAS — restart shart

# 2) firewall bilan baravar himoya (ikkala qatlam)
sudo ufw deny 5432/tcp

# 3) tasdiqlash: tashqaridan rad etilishi kerak
ss -tlnp | grep 5432                     # 127.0.0.1:5432 ko'rinadi
nc -vz SERVER_IP 5432                    # "refused" bo'lishi kerak
```

> Postgres tashqi tarmoqda e'lon qilingan bo'lsa (Neon, RDS, Managed),
> ularning o'zi TLS majburiy qiladi; `DATABASE_CA` bilan sertifikatni
> tekshiring (§4).

---

## 2. Nima ochiq bo'lishi KERAK (faqat shular)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing

sudo ufw allow 443/tcp          # HTTPS
sudo ufw allow 80/tcp           # faqat 443'ga redirect
sudo ufw allow 2222/tcp         # SSH — standart bo'lmagan port
sudo ufw enable
```

Qolgan **hamma port yopiq**. Parol bilan SSH kirishini o'chiring:

```bash
# /etc/ssh/sshd_config
PasswordAuthentication no
PermitRootLogin prohibit-password
# port 2222 ga ko'chirilgan bo'lsa
Port 2222
sudo systemctl restart sshd
```

Bir martalik qoidalarni tahrirlash:

```bash
sudo ufw status numbered
```

---

## 3. Firewall qoidalari — nima ochiq, nima yopiq

| Proto/port | Kirish | Kim uchun | Inbound |
|---|---|---|---|
| tcp/443 | Ochiq | Hamma | `ufw allow 443/tcp` |
| tcp/80 | Ochiq | Hamma | `ufw allow 80/tcp` |
| tcp/2222 | Ochiq (port tanlangan) | SSH kaliti bilan | `ufw allow 2222/tcp` |
| tcp/4000 | **Yopiq** | Faqat 127.0.0.1 (nginx) | `HOST=127.0.0.1` |
| tcp/5432 | **Yopiq** | Faqat lokal/baza hosti | `ufw deny 5432/tcp` |
| tcp/6379 | **Yopiq** | — | loyihamizda ishlatilmaydi |

Hujum yuzasi sifatida 5432 ochiq qolsa: ma'lumotlar bazasi to'g'ridan-to'g'ri
portfolyo tarmoqqa chiqadi (parol soni kuzatuvchi hujum). `ufw deny` +
`listen_addresses='localhost'` **ikki tomonlama** himoya — bitta xato
ya'ni tashqi kirish.

---

## 4. Transport shifrlash (transit)

### 4.0 Nginx + Let's Encrypt (o'z hostingizda)

Tayyor, qattiq sozlangan konfiguratsiya: **`deploy/nginx.conf.example`**.
U quyidagilarni o'z ichiga oladi (checklist item 2):

- **HTTP → HTTPS majburiy redirect** (`return 308 https://$canonical_host$request_uri`)
  — `$host` emas, `map $host $canonical_host`: aks holda `Host: evil.com`
  yuborgan so'rov `https://evil.com/...` ga ketardi (ilovaning
  `ALLOWED_HOSTS` tekshiruvi redirect nginx'da bo'lgani uchun ishlamaydi).
  Noma'lum Host asosiy domenga tushadi.
- **Faqat TLS 1.2/1.3** (`ssl_protocols TLSv1.2 TLSv1.3`), eskirgan TLSv1.0/1.1
  va zaif shifrlar ro'yxati bilan (`ssl_ciphers`), stapling + session tickets off.
  **Runtime'da tekshirilgan** (Node `tls` moduli, faqat bitta versiyani
  taklif qilib): TLSv1 va TLSv1.1 → `ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION`
  (server faol rad etadi), TLSv1.2 → `ECDHE-RSA-AES256-GCM-SHA384`,
  TLSv1.3 → `TLS_AES_256_GCM_SHA384`.

  > Windows'dagi `curl.exe` **Schannel** bilan qurilgan va `--tlsv1.0`
  > kabi bayroqlarni *majburlamaydi* (faqat minimal versiyani belgilaydi) —
  > shuning uchun u har doim `200` qaytaradi va **dalil emas**. `--tls-max`
  > esa umuman qo'llab-quvvatlanmaydi. Shu sababdan skript ishlatildi.
- **HSTS** `max-age=63072000; includeSubDomains; preload`
- **`X-Forwarded-Proto`** — ilova (`FORCE_HTTPS`, `req.secure`) shu headerga
  bog'liq; buni uzatmasangiz HTTPS redirect sikli yoki HSTS yuborilmaydi.
  `TRUST_PROXY` ham shu yerda: nginx boshqa konteynerda bo'lsa `loopback`
  EMAS (`1` yoki subnet) — aks holda header e'tiborsiz qoladi
- **`limit_req`** — login/register/forgot/reset va media uchun alohida zonalar
  (item 5: ko'p instanceda ham ishlaydigan rate limit qatlami)
- **`proxy_hide_header`** — ilova ham xavfsizlik sarlavhalarini o'zi
  yuboradi (`security.mjs` + HSTS). Ikkala manba birga yuborilsa, mijoz
  qaysi qatorni qo'llashini tushunmaydi; yagona manba nginx qoldiriladi.
  `Content-Security-Policy` va `Cross-Origin-Resource-Policy` yashirilmaydi
  (ular faqat bitta manbada bor)
- `client_max_body_size 45m` (media: rasm 8MB, video 40MB)

Sertifikat o'rnatish (certbot):

```bash
# nginx o'rnatilgandan keyin, DNS'ga A yozuvini qo'yib
sudo certbot certonly --webroot -w /var/www/certbot -d example.uz -d www.example.uz

# yoki nginx plugin bilan (80-port ochiq bo'lishi kerak)
sudo certbot --nginx -d example.uz -d www.example.uz

# avtomatik yangilash
sudo systemctl status certbot.timer

# tekshirish
sudo nginx -t && sudo systemctl reload nginx
curl -I https://example.uz/        # HSTS borligini tekshiring
curl -I http://example.uz/         # 308 kutiladi
```

> Netlify'da bu kerak emas: TLS, redirect va HSTS platforma tomonidan
> boshqariladi (`netlify.toml` dagi sarlavhalar bilan birgalikda).

### 4.1 Brauzer → server (HTTPS + HSTS)

`netlify.toml` (`[[headers]]`) barcha statik fayl va API uchun:

- `Strict-Transport-Security = max-age=31536000; includeSubDomains`
- CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  COOP/CORP, `Referrer-Policy`

Netlify'da **Force HTTPS** dashboard sozlamasi yoqilgan bo'lishi kerak
(bu faylda emas — Netlify tomonida tasdiqlang).

### 4.2 Express server (`server/index.js`)

| Sozlama | Standart | Maqsad |
|---|---|---|
| `FORCE_HTTPS` | `1` (production'da) | HTTP so'rovni **308** bilan HTTPS'ga yo'naltiradi (`SECURE_SSL_REDIRECT` ekvivalenti) |
| `TRUST_PROXY` | `loopback` | Faqat loopback'dan kelgan `X-Forwarded-Proto`'ga ishonish — soxta header bilan `req.secure` qilish mumkin emas |
| `ALLOWED_HOSTS` | sozlanmagan | Host sarlavhasi chegarasi (Django `ALLOWED_HOSTS` ekvivalenti) — noto'g'ri Host **400** oladi |
| HSTS | production + `req.secure` | `max-age=31536000; includeSubDomains` |

#### HTML hujjatga CSP qo'shilishi (2026-09)

Avval `security.mjs` dagi qattiq CSP (`script-src 'self'`) **amalda
qo'llanmasdi**: `express.static` `dist/index.html` ni o'ziga ham beradi,
shuning uchun `res.sendFile` middleware'i umuman ishga tushmasdi va `/`
`isStatic` deb o'tib, CSP siz qolardi. Endi `server/index.js` qaror
`req.path` bo'yicha qabul qiladi (HTML hujjat / statik aktiv / API).

Bu o'zgarishning **bilinadigan oqibati**: `media-src` da `https:` yo'q,
shuning uchun uchinchi tomon `https://` manbadagi audio/video **yuklanmaydi**.
Buni sezilarli qilib qoldirmaslik uchun:

- Ilovaning o'z yuklash yo'li `/api/media` (server saqlaydi, imzo bilan
  beradi) — `media-src 'self' data: blob:` uni qamrab oladi.
- Lekin server `message.audio` maydonida **URL formatini tekshirmaydi**
  (`server/index.js`, `const audio = ... ? req.body.audio : ''`), ya'ni
  mijoz `https://` manba yozsa saqlanadi va `<audio src>` ga to'g'ridan
  to'g'ri qo'yiladi (`src/lib/media.ts`, `isDirectUrl`). Bunday audio
  foydalanuvchi IP'sini uchinchi tomonga oshkor qiladi — ya'ni tracking
  vektor. Qattiq CSP shuni bloklab, bu teshikni yopadi, va endi **server
  tomoni ham rad etadi** (§2.1).

### 2.1 Media manba validatsiyasi (server tomoni)

CSP — bu **defenziv qatlam**: eski yozilgan xabarlar, boshqa mijozlar yoki
CSP'siz kirishda `https://` manba hali ham `<audio>` ga tushishi mumkin.
Shuning uchun `security.mjs` ga `mediaRefProblem()` qo'shildi va u
**yozish** yo'llarida `400` qaytaradi:

- `POST /api/threads/:id/messages` (DM) — `image` va `audio`
- `POST /api/groups/:id/messages` — `image` va `audio`

Netlify (`api-core.mjs`) va Express (`server/index.js`) — **ikkalasi ham**.

Qabul qilinadigan yagona shakl: `/api/media/<id>` yoki imzo bilan
`/api/media/<id>?s=<hex>`. Rad etiladi: `https://`, `//host` (protocol-relative),
`data:`, `/etc/passwd`, `/api/media/../../...` va ortiqcha "kirvona" qism
(masalan `/api/media/<id>@boshqa.host/x` — `mediaPathOf` prefiksni olib
to'xtar edi, endi to'liq shakl tekshiriladi). 600 belgidan uzun qiymat
ham rad etiladi. Bo'sh qiymatga ruxsat beriladi (oddiy matnli xabar).

**`avatar` bundan TEJILGAN**: `sanitizeAvatar()` tashqi `https://` avatar'ni
ataylab ruxsat beradi — bu boshqa yo'l va boshqa qaror.

Sinovlar: `test-suite.mjs` da 16 ta (har biri uch backend'da takrorlanadi:
fayl, blobs, postgres) + `live-voice-notif.smoke.mjs` da 4 ta (haqiqiy
Express server'ga qarshi), jumladan **o'z serverimizdagi imzoli media
qabul qilinishi** tekshiriladi — ya'ni qoida legitim trafikni tegmaydi.

### 2.2 Qaysi maydonlar qamrab olinadi — qaror chizig'i

Qoida **maydon nomiga emas, CHIZISH KONTEKSTIGA** bog'liq. Bu muhim,
chunki CSP ikki xil kontekstni boshqacha qayta qaraydi:

| Maydon | Chizilishi | CSP | Qaror |
| --- | --- | --- | --- |
| `message.audio` | `<audio src>` | `media-src 'self' data: blob:` | **Rad etiladi** (400) |
| `message.image` | `<img src>` | `img-src ... https:` | **Rad etiladi** (400) — chat tori, qattiqroq |
| `post.video` | `<video src>` (`MediaGrid.tsx`) | `media-src` | **Kesiladi** (`''`) |
| `reel.image` | `<video src>` (`Reels.tsx:118`, `Home.tsx:241`) | `media-src` | **Kesiladi** (`''`) |
| `avatar` | `<img src>` | `img-src ... https:` | Ochiq (`sanitizeAvatar`) |
| `post.images` | `<img src>` | `img-src ... https:` | Ochiq — ataylab |
| `story.image` | `<img src>` (`StoriesRow.tsx:71`) | `img-src ... https:` | Ochiq — ataylab |
| `group.cover` | `<img src>` (`Groups.tsx:156`) | `img-src ... https:` | Ochiq — ataylab |

Diqqat: **`reel.image` nomi `image` bo'lsa ham, `<video>` da chiziladi** —
ya'ni `media-src` konteksti. Shu sababli u `post.images` dan boshqacha
qaror oladi.

### 2.3 Nega `post.video`/`reel.image` uchun 400 emas, KESISH

Ular `PUT /api/data` orqali yoziladi — bu endpoint **butun hujjatni**
(postlar, reels, guruhlar, hammasi) bitta kelishuvda saqlaydi. Unda
birorta maydonga `400` qaytarish **foydalanuvchining butun sinxini
buzardi**: bitta noto'g'ri maydon bo'ldimi, barcha ma'lumot yo'qolmadi.
Yana bu tuzatishdan **OLDIN** yozilgan eski ma'lumotda ham tashqi URL
bo'lishi mumkin, va u 400 bilan qaytib kelardi.

Shuning uchun `safeMediaRef()` qiymatni **kesadi** (`''` ga), endpoint esa
**200** qaytaradi. Sinovlar aynan shuni tekshiradi:
`PUT /api/data accepts doc with external video (sync not bricked)`.

Xabar endpointlari (`POST /api/threads/:id/messages`,
`POST /api/groups/:id/messages`) boshqa holat: ular **tor**, bitta
maqsadli, `image`/`audio` maydoni boshqa hech narsaga xizmat qilmaydi —
u yerda `400` to'g'ri javob.

**O'qish yo'llari (`GET /api/data`) tegilmadi**: u yerda tozalash
ko'ruvchiga ko'rsatiladigan narsani yashirib, muammoni niqop qilardi.

Rasm uchun `img-src ... https:` ochiq qoldirilgan (avatars va `mock.ts`
dagi `picsum.photos` shunga bog'liq).

Hujumchi to'g'ridan-to'g'ri portga `X-Forwarded-Proto: https` bermoqchi bo'lsa,
u manba loopback emasligi uchun ishonilmaydi → soxta HTTPS talab qilinmaydi.

**Host sarlavhasi:** redirect manzili `req.get('host')` dan tuziladi, ya'ni
`Host: evil.com` yuborib ilovani `https://evil.com/...` ga yo'naltirish (open
redirect) mumkin edi. `ALLOWED_HOSTS` belgilansa noto'g'ri Host **400**
oladi; belgilanmagan bo'lsa production'da ogohlantirish chiqadi.

```bash
# TLS yo'q, lekin server HTTP'da turgan bo'lsa kirish to'xtaydi:
FORCE_HTTPS=0     # faqat shunday zaruratda

# Host chegarasi (production uchun tavsiya):
ALLOWED_HOSTS=example.uz,www.example.uz
```

### 2.4 Media IDOR: begona faylni o'z xabariga tortish (topilgan, yopilgan)

Shakl tekshiruvi (`mediaRefProblem`, 2.1) `/api/media/<id>` shaklidagi
qiymatlarni o'tkazadi — bu **ataylab** shunday, chunki ilova har doim
avval `/api/media` ga yuklaydi. Lekin shakl to'g'ri bo'lgani bilan
**egalik** tekshirilmas edi.

`scopePrivateMedia` xabardagi havolani `ownerId = yuboruvchi` bilan QAYTA
scopelaydi. `setMediaMeta` esa `scope`/`refId`/`ownerId` ni shartsiz
qayta yozadi. Natijada boshqa foydalanuvchi `/api/media/<begona-id>` ni
o'z xabariga yozib:

- fayl `public` dan `dm`/`group` ga tushib, yuboruvchining suhbatiga
  bog'lanardi (u endi faylni ko'ra boshlardi);
- asl egasi esa uni **yo'qotardi** — `401`, chunki u yangi scope'ning
  a'zosi emas.

Tuzatish:

- **Netlify** — avval `store.getMedia()` bilan `ownerId` tekshiriladi.
  Media yo'q yoki `ownerId` begona bo'lsa, sessiya jimgina **tashlab
  ketiladi** (metadata yozilmaydi). `POST /api/media` yuklashda
  `ownerId` ni `me.id` ga qo'yadi, shuning uchun legitim oqim o'tadi.
- **Express** — shart SQL'ning **o'ziga** qo'yildi, JS oraliqsiz:
  `WHERE id = $4 AND (owner_id IS NULL OR owner_id = '' OR owner_id = $3)`.
  Aks holda JS da tekshirib, keyin yozish orasida poyga (TOCTOU)
  oyna qolardi.

Regressiya testlari: `test-suite.mjs` 5b-bis (3 ta) va
`live-voice-notif.smoke.mjs` 4b (3 ta). Guruh ataylab ishlatilgan, DM
emas: DM'da jabarda ham a'zo bo'lgani uchun scope o'zgarganini access
orqali aniqlab bo'lmas edi.

Tuzatish VAQTINCHA olib tashlab tekshirilgan: Netlify va Express
ikkalasida ham test `401` bilan yiqiladi (jabar o'z fayliga
kirmaydi) — demak test yuzaki emas, zaiflikni haqiqatan ushlaydi.

### 2.5 Blobs store: media privacy butunlay ishlamagan (topilgan, yopilgan)

Yuqoridagi tuzatishni yozararken aniqlangan **ikkinchi**, undan ham
jiddiy muammo: `blobs-store.mjs` `blob.setMetadata(...)` deb chaqirardi.
**@netlify/blobs v11 da bunday metodi YO'Q** — mavjud API lar: `set`,
`setJSON`, `get`, `getWithMetadata`, `getMetadata`, `list`, `delete`.

Natija production'da `TypeError` -> `try/catch` uni yutadi ->
`setMediaMeta` `false` qaytaradi -> **scope hech qachon yozilmaydi**.
Ya'ni Netlify Blobs deployment'ida DM/guruh media `public` da qolardi va
**har qanday autentifikatsiyalangan foydalanuvchi** uni o'qiy olar edi.
Xabar yuborishdagi privacy umuman ishlamagan.

Nima uchun hech kim sezmagan:

1. `try/catch` xatoni yutadi (test `false` ko'rmaydi, faqat "muvaffaqiyatli"
   deb hisoblanadi);
2. testdagi **fake** store ham `setMetadata` siz edi, ya'ni xuddi shu
   xil xato qilardi — testlar bir-birini "tasdiqladi", lekin hech qanday
   tekshiruv privacy yo'lini **haqiqatan** urmaydi.

Tuzatish: ko'rinish chegarasi (`scope`/`refId`/`ownerId`) endi alohida
kichik blob'da (`media-meta/<id>`) saqlanadi — `setJSON` bilan yoziladi.
Sabab: v11 da metadata'ni yangilash yo'li yo'q, faqat `set` bor va u butun
tanani qayta yozadi, ya'ni scope o'zgarishi 8 MB rasm/13 MB ovozni har bir
xabar yuborilganda qayta yuklashni talab qilardi. Chegara o'zgaruvchan va
mayda o'lchamli ma'lumot, shuning uchun u tanasiz yerga ajratildi.

- `getMediaMeta()` — faqat kichik blob (tana **yuklanmaydi**). Bu egalik
  tekshiruvini ham arzonlashtiradi: avval `getMedia` 8 MB gacha faylni
  xotiraga tortardi.
- **Legacy:** `media-meta/` joriy bo'lishidan oldin yuklangan fayllarda
  chegara tananing metadata'sida turadi — `getMediaMeta` uni ham o'qiydi,
  aks holda eski fayl "egasi yo'q" deb hisoblanib begona tomonidan tortib
  olinishi mumkin edi. `blobs-store.test.mjs` da 5 ta legacy test.
- `listMedia()` `media-meta/` ni qaytarmaydi (`media-` bilan boshlanadi),
  `deleteMedia()` esa ikkalasini ham tozalaydi.

Fake store ham tuzatildi: u endi `getMetadata` ni beradi va `setMetadata`
ga **ataylab xato` bilan** javob beradi — ya'ni kelgusi da mavjud bo'lmagan
API chaqirilsa, test jimgina "o'tib" keta olmaydi.

Yangi regressiya: `own media becomes private after DM (public -> dm
re-bound)` — bu test aynan shu yo'li tekshiradi va u **blobs store'da
dastlab `200` bilan yiqilgan** edi (ya'ni privacy buzilgan holat).

### 2.6 "Jimgina muvaffaqiyat" — xavfsizlik chegarasida fail-open

Yuqoridagi tuzatishdan keyin xuddi shu sinf boshqa joylarda ham bormi
degan savolga `catch { return false }` naqshi bo'yicha audit qilindi.
Ikkita muammo topildi va ikkalasi ham tuzatildi:

1. **`setMediaMeta` yozish xatosini yutardi.** `catch { return false }`
   -> media `public` da qolardi, `scopePrivateMedia` esa qaytarilgan
   qiymatni umuman tekshirmardi, log ham yo'q edi. Ya'ni yozish muvaffaqiyatsiz
   bo'lsa, xabar "shaxsiy" deb ko'rinib turib **ochiq** qolardi.
   Endi blobs store xatoni yuqoriga ko'taradi, `api-core` esa aniq
   `false` qaytishni ham ochiq log qiladi (file store `undefined`
   qaytaradi — bu "yo'q" degani, xato emas, shuning uchun farqlanadi).

2. **`getMedia` chegara o'qib bo'lmasa `public` deb taxmin qilardi.**
   `?? normMeta(res.metadata)` — vaqtincha xato bo'lganda yoki metadata
   bo'lmaganda shaxsiy DM rasm **har qanday autentifikatsiyalangan**
   foydalanuvchiga ochiq bo'lib ketardi. Bu **fail-OPEN** xavfsizlik
   chegarasi edi. `readScope` allaqachon legacy fayllarni ham qamrab
   olgani uchun bu fallback keraksiz ham, xavfli ham edi — olib
   tashlandi. Endi chegara aniqlanmasa media **fail-closed**: rad etiladi
   va log yoziladi.

   4 ta test (chegara o'qib bo'lmaganda rad etish, `public` deb taxmin
   qilinmasligi, tiklashdan keyin o'qilishi).

Bu ikki kalit qoida kelgusi uchun `SECURITY.md` ga: **xavfsizlik
tekshiruvida `catch` xatoni yutmasin** — yoki aniq rad etsin, yoki
butun yo'lni to'xtatsin, lekin "muvaffaqiyat" qaytarmasin.

### 4.3 PostgreSQL (sslmode=require)

`resolveDatabaseSsl()`:

- production'da **TLS majburiy** (default `sslmode=require`);
- `rejectUnauthorized: true` — **sertifikat tekshiriladi**;
- `DATABASE_CA` — o'z CA sertifikati (base64 yoki fayl);
- `DATABASE_URL` ichidagi `sslmode=disable` **olib tashlanadi**;
- `DATABASE_SSL_NO_VERIFY=1` — ataylab zaiflashtirish, MITM ogohlantirishi
  bilan; `DATABASE_SSL=0` production'da ogohlantirish chiqaradi.

`netlify/lib/postgres-store.mjs` (Neon) — `neon()` HTTP endpoint **https**
orqali ishlaydi, shifrlash implicit.

### 4.4 Parol tiklash kodi va tashqi webhook

`netlify/lib/delivery.mjs` — kod va `Authorization: Bearer` token shu kanalda
ketadi, shuning uchun **faqat shifrlangan kanal**:

- `DELIVERY_WEBHOOK_URL` faqat `https://` (loopback `http://` mahalliy test
  uchun ruxsat) — aks holda `sendMail` rad etadi va tarmoqqa chiqmaydi;
- `APP_URL`/`PUBLIC_URL` faqat `https://` — `http://` bo'lsa tiklash
  **havolasi umuman tashlab qolinadi** (matndagi kod baribir qoladi).

### 4.5 WebSocket / S3 / Redis

- **WebSocket (Channels) yo'q** — realtime kanal mavjud emas.
- **AWS S3 yo'q** — SSE-S3/SSE-KMS bandi tegishli emas. Media Postgres
  `bytea`/Netlify Blobs'da: tranzitda HTTPS, diskda blobsdagi himoya.
- **Redis yo'q** — parol/TLS bandi tegishli emas.

---

## 5. Autentifikatsiya, sessiya, parollar

| Himoya | Qanday ishlaydi |
|---|---|
| Parol saqlash | `scrypt` (N=16384, r=8, p=1, keylen=64) + 16 bayt **tasodifiy salt**, `timingSafeEqual` bilan solishtirish |
| Sessiya tokeni | `randomBytes(32)` — bazaga **HMAC-SHA256 (`SESSION_SECRET`) imzosi** bilan yoziladi; bazada xom token yo'q |
| Sessiya muddati | 30 kun **sliding TTL**; parol o'zgarsa / `logout-all` → hammasi bekor |
| Admin paroli | Majburiy, kamida 12 belgi; default parol yo'q (`Admin.Do'ppi...` olib tashlangan) |
| Xom tokenlar | Rad etiladi (`ALLOW_LEGACY_SESSIONS=1` faqat lokal migratsiya) |
| Ochiq ma'lumot | `email` boshqa foydalanuvchilarga hech qachon ko'rsatilmaydi; API loyihasi `password*` maydonlarni tashlamaydi |

### Rate limiting (chegiruvchi)

`netlify/lib/security.mjs` → `RATE_LIMITS` (core va server bir xil qoida):

| Endpoint | Chegara |
|---|---|
| login | 10 / 15 min (IP + login) |
| admin-login | 10 / 15 min (IP), 5 / 15 min (hisob) |
| register | 10 / soat |
| forgot (kod) | 5 / 15 min (IP), 3 / soat (hisob) |
| reset (kodni tekshirish) | 10 / 15 min |
| media upload | 120 / soat |
| kontent amallari + xabar (`write`) | 600 / soat, **sessiya bo'yicha** (like/comment/share/shield/follow, thread/guruh yaratish, xabar yuborish) |
| `PUT /api/data` (`sync`) | 600 / soat, **sessiya bo'yicha** (butun holat blobi, 2MB gacha — eng qimmat yozish) |
| **ataylab chegaralanmaydiganlar** | `stories/view` (5 soniyada bir avtomatik o'tish), `notifications/read`, `ping`, `logout`, `push` — ularni bloklash foydalanuvchini qulflab qo'yardi |

429 + `Retry-After` qaytariladi.

**Muhim cheklov:** chegaralar **jarayon xotirasida** (`Map`) saqlanadi. Bitta
instanceda to'liq ishlaydi; **ko'p instanceli/serverless** muhitda har bir
instance alohida hisoblaydi → himoya kamayadi. To'liq yechim uchun
umumiy storage (Redis) yoki **nginx `limit_req`** darajasida qoplash kerak
(misol `netlify.toml`/server host konfigida).

```nginx
# nginx tomonida qoplash — repo'da `deploy/nginx.conf.example` da bajarilgan
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/m;
location /api/auth/ { limit_req zone=api burst=5 nodelay; ... }
```

Docker Compose'da bu qatlam **yoqiq**: nginx `app` oldida turadi, shuning
uchun chegaralar ilova o'zgarishidan qat'i narsa (va `depends_on:
service_healthy` orqali ilova tayyor bo'lgandan keyin ochiladi). Netlify
serverless'da esa `limit_req` yo'q — chunka cheklov §9.1 da hali ochiq.

---

## 6. Maxfiy ma'lumotlar

- **`.env` repo'ga kirmaydi**: `.gitignore` da `.env`, `.env.*`, `*.env`
  (istisno: `!.env.example`).
- **`git ls-files` da `.env` yo'q** — haqiqiy kalitlar commit qilinmagan.
- **Maxfiy qiymatlar BIR TIRNOQ (`'`) bilan yozilishi shart.**
  Bu `docker-compose.yml` dagi `${ADMIN_PASSWORD}` kabi interpolatsiya
  tufayli muhim: Docker Compose `.env` ni o'zgaruvchi interpolatsiyasi
  uchun o'qiydi va rasmiy hujjatga ko'ra interpolatsiya **kitalsiz va
  qo'sh tirnoqli** qiymatlarga qo'llaniladi, **bitta tirnoqli qiymatlar
  esa butunlay (literal) olinadi**:

  | `.env` yozuvi | Compose natijasi |
  | --- | --- |
  | `VAR='$OTHER'` | `$OTHER` — to'g'ri |
  | `VAR="$OTHER"` | interpolatsiya qilinadi — **buziladi** |

  Ya'ni `ADMIN_PASSWORD="...$..."` da `$...` kalit deb o'qilib ketadi va
  parol production'da **jimgina buziladi** — xato xabarsiz (admin panel
  oddiyda "parol xato" deydi, sababni ko'rsatmaydi). `SESSION_SECRET`
  uchun ham xuddi shu.

  `.env.example` ilgari **noto'g'ri** ravishda qo'sh tirnoqni tavsiya qilgan
  edi; endi u bir tirnoqni tushuntiradi va farqni sabab bilan ko'rsatadi.
  Node `--env-file` ham bitta tirnoqni to'g'ri talqin qiladi va
  interpolatsiya qilmaydi — ya'ni bir tirnoq **ikkala** foydalanuvchi
  (Node va Compose) uchun ham to'g'ri.

  Tekshirish (qiymat chiqmaydi):
  ```bash
  node --env-file=.env -e "console.log(process.env.ADMIN_PASSWORD.length)"
  docker compose config | grep -A1 ADMIN_PASSWORD   # interpolatsiyadan keyingi qiymat
  ```
- **Skaner natijasi** (tracked fayllar + git tarixi): xususiy kalit
  (`-----BEGIN ... PRIVATE KEY`), AWS/GitHub/Slack kalitlari, haqiqiy
  `postgres://user:pass@` URI **topilmadi**; tarixdagi fayl nomlari orasida
  `.env`/`.pem`/`.key` **yo'q**. "password" bo'yicha to'qnashuvlar — faqat
  test fixture'lari (`Testpass1!`, `wrong-pass`) va `test-env.mjs` dagi
  eski (koddan olingan) admin paroli — u faqat "rad etilishi" testida
  ishlatiladi (tarixdagi holati §9.6).
- **Loglar** (`api.log`, `api.err.log`, `vite.log`) tracked emas va
  `password|Bearer |api_key|secret` bo'yicha toza tekshirilgan.
- **Production'da majburiy:**
  - `SESSION_SECRET` — kamida **16 belgi**, aks holda `serverSecret()` xato
    tashlaydi. **MUHIM:** "xato tashlaydi" qismi serverless'da
    `NODE_ENV` tekshiruviga tayanmasligi kerak edi — Netlify funksiyalari
    `NODE_ENV` ni `production` qilib **qo'ymaydi**, shuning uchun kod jimgina
    vaqtinchalik kalit yaratib, saytni "ishlayotgan" holatda saqlab qolgan
    edi. Natijada login `200` berib, keyingi har bir so'rovda `401` qaytardi
    (sessiya imzosi boshqa nolda hisoblanadi) — foydalanuvchi esa har safar
    "chiqib ketyapti" deb o'ylardi. Endi `NETLIFY` /
    `AWS_LAMBDA_FUNCTION_NAME` / `VERCEL` / `NETLIFY_LOCAL` ham aniqlanadi
    (batafsil: README, "majburiy muhit o'zgaruvchilari" bo'limi);
  - `ADMIN_USERNAME` + `ADMIN_PASSWORD` — kamida **12 belgi**, aks holda admin kirishi o'chgan holda qoladi (server ishlayveradi).
- **Xavfli rejimlar production'da o'chiq:** `RESET_CODE_ECHO` (production'da
  o'chiq), `ALLOW_LEGACY_SESSIONS`, `ALLOW_SEED`.
- **Docker:** repoda `Dockerfile`/`docker-compose.yml` **yo'q**, shuning uchun
  "root bo'lmagan foydalanuvchi" bandi hozircha tegishli emas. Konteyner
  qo'shilsa: `USER` direktivi, va `expose` (sukut) / faqat gateway'ga `ports`.
  Postgres/Redis ichki tarmoqda (`networks: internal`) qolsin.

---

## 7. Kiruvchi / tashqi integratsiyalar

| Savol | Javob |
|---|---|
| Kiruvchi webhook bormi? | **Yo'q** — repoda inbound webhook endpointi yo'q (`delivery.mjs` faqat **chiqish** webhook) |
| Xaritori webhookning imzosi tekshiriladimi? | Tashqi qabul qiluvchi bo'lgani uchun **bu tomonda tekshiruv yo'q**. Chiqish tomonida himoya = HTTPS majburiy + Bearer token |
| OAuth callback? | Google OAuth **ishlatilmaydi**; `APP_URL` faqat HTTPS (§4.4) |
| JWT access/refresh? | JWT yo'q → sessiya tokeni (§5) |
| S3 event? | S3 yo'q |

Agar kiruvchi webhook keyin qo'shilsa: **imzo majburiy** — HMAC-SHA256
`rawBody + SECRET`, `timingSafeEqual` bilan tekshirish, imzosiz `401`.

---

## 8. Ro'yxat bo'yicha holat

| # | Band | Holat |
|---|---|---|
| 1 | Portlarni yopish | Bajarildi: `HOST=127.0.0.1` default + `0.0.0.0` ogohlantirish; UFW qoidalari §2-3; lokal Postgres 5432 **yopildi** (§1) |
| 2 | Nginx/TLS | Bajarildi: HSTS/CSP/redirect `netlify.toml` + `FORCE_HTTPS`; `deploy/nginx.conf.example` (TLS 1.2+, HSTS, 308 redirect, `limit_req`) + certbot yo'riqnomasi §4.0 |
| 3 | Django `settings.py` | Bajarildi: `DEBUG=False` → `NODE_ENV=production` (RESET_CODE_ECHO o'chiq); `ALLOWED_HOSTS` → `ALLOWED_HOSTS`; `SECURE_SSL_REDIRECT` → `FORCE_HTTPS` (308); `SECURE_HSTS_*` → HSTS sarlavhasi; `TRUST_PROXY`. Cookie `*_SECURE` — tegishli emas: cookie ishlatilmaydi (Bearer token) |
| 4 | Shifrlash transit/at-rest | Bajarildi: TLS DB (verify), reset-code HTTPS, media `?s=` imzo, scrypt. Cheklov: Redis/S3/Channels **yo'q** |
| 5 | Tashqi provayderlar | Bajarildi: webhook HTTPS majburiy; kiruvchi webhook **yo'q**; rate limit §5 — kirishlar **va yozishlar** (`write`/`sync`, sessiya bo'yicha 600/soat), lekin jarayon xotirasida. Cheklov: JWT/OAuth yo'q |
| 6 | Maxfiylar + Docker | Bajarildi: `.env` yopiq, `.env.example`, majburiy kalitlar, loglar toza. Cheklov: Docker fayllar yo'q |
| 7 | README + SECURITY | Bajarildi: README §"Xavfsizlik" + shu hujjat |
| 8 | Kod darajasidagi audit (SQLi/travers/IDOR/XSS) | Bajarildi: SQL injection **yo'q** (hamma so'rovlar parametrli), path traversal **yo'q** (`isSafeMediaId` + imzo + `timingSafeEqual`), XSS **yo'q** (`dangerouslySetInnerHTML`/`innerHTML` ishlatilmaydi). Topilgan IDOR/mass-assignment teshiklari yopildi: `PUT /api/data` endi faqat egasini yangilaydi va yangi yozuvni sessiya egasi nomidan yaratadi (posts/stories/reels), guruhni faqat yaratuvchisi o'zgartiradi + `MAX_GROUPS` sync'da ham; push obunasi o'chirish sessiyaga bog'landi (Netlify); `GET /api/data` guruhlarda `memberIds`/`createdBy` yashirildi; noma'lum media scope fail-closed; **boshqa foydalanuvchining media'sini o'z xabariga havola qilish (media IDOR) — `scopePrivateMedia` endi `ownerId` ni tekshiradi**; Express admin `gc`/`migrate` `tokenRef`+TTL bilan tuzatildi (avval doim 403 edi); blobs `putMedia` id tekshiruvi; `ALLOW_LEGACY_SESSIONS` production'da o'chiq. Tekshiruv: `test:all` 564 + jonli Express probe 79/79 |

---

## 9. Ochiq qolgan xavflar (hal qilinmagan)

1. **Rate limit in-memory** — ko'p instanceda zaif; nginx `limit_req` bilan
   qoplash kerak.
2. **Nginx/Docker hali deploy qilinmagan** — `deploy/nginx.conf.example`,
   `Dockerfile` va `docker-compose.yml` repo'da tayyor, lekin real serverga
   o'rnatilmagan. `docker compose up` dan keyin quyidagilarni qo'lda
   tekshirish kerak: `docker compose ps` da `app` va `nginx` `healthy`,
   `curl -I https://domen.uz` da HSTS sarlavhasi, `GET /api/health` da
   `{"ok":true}`, va PostgreSQL porti tashqaridan yopiq (`docker compose
   exec postgres pg_isready` — tashqaridan esa ulanish yo'q).
3. **Netlify Force HTTPS** — dashboardda tasdiqlash kerak.
4. **Media ochiq URL'lari** (`?s=` imzo bilan) — imzo `SESSION_SECRET`ga
   bog'liq; kalit o'zgarsa eski havolalar bekor bo'ladi (xohlanmagan).
5. **2FA / qurilma tanib olish yo'q**, webhook uchun imzo mexanizmi hozircha
   kerak emas (serverda inbound webhook yo'q).
6. **Git tarixidagi eski admin paroli** — ✅ **lokal tarix tozalandi**
   (2026-09-27, `git filter-repo`). Parol koddan ham, tarixdan ham olib
   tashlandi va `git fsck` hamda obyekt skaneri bilan tekshirildi (0 qoldiq).
   ⚠️ **Bajarilishi kerak bo'lgan qolgan ishlar:**
   - `git push --force --all && git push --force --tags` — remote'da
     eski tarix hozir ham turibdi, u o'zi kuchli nolga ega emas.
   - **Parolni ALMASHTIRISH shart.** U ochiq repoda ko'rinib turgan;
     tarixni tozalash parol allaqachon oshkor bo'lganini o'zgartirmaydi.
   - Eski klonlarni o'chirib, yangidan `clone` qilish (github.com/.../Doppi
     forklari ham).
   - Qayta ishlatish uchun: `purge-legacy-password.mjs` (repo ildizida).
     Parol skriptga yozilMAYDI (aks holda skriptni commit qilish uni yana
     tarixga kiritardi) — muhit o'zgaruvchisi orqali beriladi:
     `pip install git-filter-repo`, keyin
     `LEGACY_ADMIN_PASSWORD='...' node purge-legacy-password.mjs`.
     (PowerShell: `$env:LEGACY_ADMIN_PASSWORD='...'; node purge-legacy-password.mjs`).
     Skript xom, qochirilgan (`\'`) va URL-kodlangan (`%27`) shakllarni
     ham almashtiradi, `refs/*` ning barchasini qayta yozadi va har bir
     shaklni alohida tekshiradi.
   - **Qarshilik (2026-09-28):** `c5fbdb0` commit **xabarida** eski
     parolning sha256 fragmenti (`33ddfc5f1414b1c5`, 64-bit) qolgan —
     `git filter-repo` faqat blob'larni (source/docs) almashtirgan, commit
     xabarlarini emas. Amaliy risk minimal: (1) parolning to'liq shakli
     allaqachon eski tarixda ochiq, (2) fragment mos keladigan parol barcha
     jonli tizimlardan almashtirilgan (Netlify env + lokal `.env`; sha256
     mosligi haqiqiy qiymatlar bilan tekshirilgan), (3) 64-bit truncation
     preimage tiklash uchun yetarli emas. Shu sababli qo'shimcha tarix
     rewriti amalga oshirilmadi.
7. **Xavfsizlik testlari** — `npm run test:all` (delivery 42 tekshiruv,
   api-core 174, blobs 174, pg-store 174, delivery 42 = **564**) vositasi sifatida
   ishlaydi; bind/HSTS/redirect, yozish limiti va IDOR probe'lari qo'lda
   (jonli Express serverga qarshi) amalga oshirildi (natija §1, §8).
8. **Albomlar — umumiy pool (qabul qilingan dizayn)** — `albums` jadvalida
   **egalik ustuni yo'q** va `GET /api/data` barcha albomlarni hammaga
   ko'rsatadi: har qanday autentifikatsiyalangan foydalanuvchi albomga
   rasm qo'shadi/o'zgartiradi (limitlar ham global: 10 albom / 30 rasm).
   Bu prototipdagi "hamma uchun ochiq album" g'oyasiga mos, shuning uchun
   IDOR hisoblanmaydi — lekin bir foydalanuvchi umumiy pulni to'ldirib
   qo'yishi/bo'shatishi mumkin (barqarorlik emas, huquq emas).
   Individual egalik kerak bo'lsa: `owner_id` ustuni + migratsiya + UI'da
   "mening albomlarim" filtri qo'shish kerak.
9. **Sessiya TTL siljigan (sliding) + RESET_CODE_ECHO `NODE_ENV`ga bog'liq**
   — sessiyalar har so'rovda yangilanadi (faol sessiya yakunlanmaydi);
   parol tiklash kodi esa `NODE_ENV=production` bo'lmagan serverda javobga
   qaytariladi (`.env.example` da `NODE_ENV=production` belgilangan,
   rate limit ham bor). Ikkalasi ham ataylab qoldirilgan: birinchisi
   "eslab qolish" qulayligi, ikkinchisi lokal ishlab chiqish uchun.
   Zichlashtirish xohlasa: mutlaq sessiya muddati (`created_at + N kun`)
   va echo uchun alohida `RESET_CODE_ECHO=1` talab qilinadi.

---

## 10. Tekshirish buyruqlari

```bash
npm run test:all          # o'zgarmalarni tekshirish
npm run lint

# portlar
ss -tulpn                 # Linux
netstat -an               # Windows

# HTTP→HTTPS va HSTS
curl -I http://HOST/api/health | grep -i location
curl -I https://HOST/api/health | grep -i strict-transport

# app tashqaridan ochiqmi? (ECONNREFUSED kutiladi)
curl -m 3 http://SERVER_IP:4000/api/health
```

---

## 11. Ishlab chiqarish bazasi: media audit (faqat o'qish)

Server tomonidagi tekshiruv (f44fe7a, 09b4be8) faqat **yangi yozishlarga**
taalluqli. Baza ichidagi eski qatorlar o'zgarishmaydi. Mahalliy
`Do'ppi` da tekshirilgan natija: `https://` tashqi manba **yo'q**, faqat
bitta `data:` URL (uzilib qolgan, qo'lda sinov qoldig'i) — u uchinchi
tomonga so'rov yubormaydi.

Production bazasi remote bo'lgani uchun uni **joyida** shu tarzda
tekshirish kerak. Quyidagi so'rovlar FAQAT O'QISHI bilan
(`count`, `information_schema`) — hech narsani o'zgartirmaydi:

```sql
-- 1) Avval jadvallar borligini ko'ring
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public' ORDER BY table_name;

-- 2) Media maydonlarida tashqi manba bormi?
--    (<jadval> va <ustun> ni 2-bosqichdagi ro'yxatdan oling)
SELECT count(*) FROM group_messages
 WHERE COALESCE(image,'') <> ''
   AND (image LIKE 'https://%' OR image LIKE 'http://%'
        OR image LIKE '//%' OR image LIKE 'data:%');
```

> **Natija > 0 bo'lsa darhol tozalama.** Yuqoridagi so'rov `data:` ni ham
> hisobga oladi, lekin `data:` URL uchinchi tomonga **so'rov yubormaydi** —
> u ko'ruvchining IP'sini oshkor qilmaydi. Faqat `https://`, `http://`
> va `//` (protocol-relative) qatorlari haqiqiy kuzatish muammosi.
> Avval ularni ajrating:
> ```sql
> SELECT count(*) FILTER (WHERE image LIKE 'data:%')      AS xavfsiz_data_url,
>        count(*) FILTER (WHERE image LIKE 'https://%'
>                           OR image LIKE '//%')            AS HAQIQIY_MUAMMO
>   FROM group_messages WHERE COALESCE(image,'') <> '';
> ```

Tekshirilishi lozim bo'lgan ustunlar (chizish konteksti bo'yicha):

| Jadval | Ustun | Kontekst | Zarar |
| --- | --- | --- | --- |
| `messages` | `image` | `<img>` | ko'ruvchi IP oshkor (CSP `img-src https:` ochiq) |
| `messages` | `audio` | `<audio>` | CSP `media-src` bloklaydi — xavfsiz |
| `group_messages` | `image` | `<img>` | ko'ruvchi IP oshkor |
| `group_messages` | `audio` | `<audio>` | CSP bloklaydi |
| `posts` | `video` | `<video>` | CSP bloklaydi |
| `reels` | `image` | `<video>` | CSP bloklaydi |
| `stories`, `groups` | `image`, `cover` | `<img>` | ataylab ochiq (`img-src https:`) |

**Natija nol bo'lsa, hech narsa qilish shart emas.** Natija nolga teng
bo'lmasa ham, `audio`/`video`/`reel.image` uchun hech narsa qilish
shart emas — ularni CSP allaqachon bloklaydi. Faqat `messages.image` va
`group_messages.image` haqida qaror qabul qish kerak: ular `<img>`
kontekstida, ya'ni `img-src ... https:` ular uchun ataylab ochiq.
Tozalash (`UPDATE ... SET image=''`) foydalanuvchi ma'lumotini
BUZADI, shuning uchun u avval **backup** olinib, keyin va faqat
aniq ruxsat bilan bajariladi.
