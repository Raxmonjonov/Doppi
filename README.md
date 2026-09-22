# Do'ppi

*(avvalgi nomlari: FaceNet, undan ham oldin — Groot)*

O'zbek foydalanuvchilari uchun mo'ljallangan ijtimoiy-media platforma interfeysi (frontend demo). Odamlar rasm va video joylaydi, do'stlashadi, guruh/sahifa ochadi, chatlashadi, reels ko'radi va o'zi ham yaratadi. Interfeys tuzilishi jihatidan Facebook'ga o'xshaydi (yuqorida navbar, chapda sidebar, o'rtada feed, pastda mobil bottom-nav), lekin ranglar sxemasi va umumiy "his" alohida.

## Hozirgi holat

Loyiha hozircha **faqat frontend demo** bosqichida. Backend yo'q — barcha ma'lumotlar `src/data/mock.ts` ichidagi mock ma'lumotlar va brauzer `localStorage`'ida saqlanadi. Foydalanuvchi yaratgan post/story/reels/albom sahifa yangilansa ham saqlanib qoladi.

## Texnologik stack

| Qism | Texnologiya |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite 8 |
| Routing | react-router-dom (SPA) |
| Ikonlar | lucide-react |
| Doimiy saqlash | localStorage |
| Lint | oxlint |

## Asosiy funksiyalar

**Uy sahifasi**
- Post yaratish (matn, rasm/video — fayl to'g'ridan-to'g'ri base64 qilib yuklanadi)
- 24 soatlik Stories lentasi
- Post kartalari: like, izoh, ulashish, jonli (live) ko'rsatkichi
- Ko'p rasmlar uchun grid ko'rinishi va lightbox

**Reels**
- Vertikal, to'liq ekranli, avtoplay qisqa video lenta
- Like, izoh, ulashish (tanlab yuborish), ovoz rejimi (audio/disco)

**Fotoalbomlar**
- Albomlar galereyasi, rasmlarni belgilash (tagging), lightbox

**Profil**
- Cover, avatar, do'stlar stack'i

**Guruhlar va sahifalar**
- Guruh/sahifa kartalari, a'zo bo'lish/obuna tugmalari

**Messenger**
- Suhbatlar ro'yxati + chat paneli (backend ulangan emas, xabarlar local)

**Sozlamalar**
- Tungi rejim (light/dark, sistema sozlamasini avtomatik aniqlaydi)
- Til tanlash (keng ro'yxat, hozircha faqat interfeys ko'rsatadi)

## Responsivlik

- Desktop: navbar + sidebar + feed
- Mobil: bottom-nav, sidebar yashirinadi, search yashirinadi

## Ishga tushirish

```bash
npm install
npm run dev      # development server
npm run build    # production build
npm run lint     # oxlint tekshiruvi
npm run preview  # build natijasini ko'rish
```

## Papka tuzilishi

```
src/
├── components/   # Navbar, Sidebar, BottomNav, PostCard, StoriesRow, ...
├── pages/        # Home, Reels, Photos, Profile, Groups, Pages, Messenger, Settings
├── data/         # mock ma'lumotlar, store (useSyncExternalStore + localStorage)
├── lib/          # format, upload (fayl -> base64)
├── styles/       # tokens, global, layout, components
└── theme/        # light/dark tema konteksti
```

## Rejalar

- Backend (Django REST Framework) va real baza (PostgreSQL)
-Media uchun S3/CDN va avtomatik encoding
- Real-time chat (Django Channels)
- AI assistent va Telegram support bot
- Flutter mobil ilova