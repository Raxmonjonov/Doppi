# Do'ppi — ishlab chiqarish imaji (multi-stage).
#
# OLD: bitta bosqich, `COPY dist/ ./dist/`. Bu ikkita jiddiy xatoni
#      keltiradi: (1) `dist/` .gitignore'da — yangi klonimizdan
#      `docker build` butunlay ishlamaydi; (2) `npm ci` faqat ildiz
#      paketlarini o'rnatadi, `server/package.json` (express, pg)
#      alohida o'rnatiladi — server `module not found` bilan o'lardi.
#      Bundan tashqari `.dockerignore` yo'q edi: `.env` (maxfiy
#      kalitlar) va lokal `node_modules` image ichiga ko'chirilardi.
#
# Endi uch bosqich: build (frontend), deps (runtime paketlari), runtime.

# ---------- 1) Frontend build ----------
# `npm run build` = `tsc -b && vite build` — ikkalasi ham devDependency,
# shuning uchun bu bosqichda `--omit=dev` ISHLAMAYDI.
FROM node:24-alpine AS build

WORKDIR /app

# Faqat manifest — manba kodi kiritilgandan keyin `npm ci` qayta ishga
# tushmasligi uchun qatlamlarni keshlaymiz.
#
# `||` bilan qayta urinish: `npm ci` vaqti vaqtincha platforma-specific
# optional dependency'ni tushirib qoldirishi mumkin (npm/cli#4828).
# Bu aynan Vite 8 -> rolldown -> `@rolldown/binding-linux-x64-musl` ga
# tegiladi va keyin `npm run build` "Cannot find native binding" bilan
# yiqiladi. `npm ci` o'zida `node_modules` ni o'chiradi, shuning uchun
# oddiy qayta chaqirish yetarli. Haqiqiy xatolar (lockfile mos kelmasligi)
# ikkinchi urishda ham yiqiladi — ya'ni xato yashirilmaydi.
COPY package*.json ./
RUN npm ci || (echo "npm/cli#4828: native binding qayta o'rnatilmoqda" && npm ci)

COPY index.html vite.config.ts tsconfig*.json ./
COPY src/ ./src/
COPY public/ ./public/

RUN npm run build

# ---------- 2) Runtime paketlari ----------
# Ikkala xil paket kerak:
#   /app/node_modules       — ildiz (web-push, server/index.js uni import qiladi)
#   /app/server/node_modules — express, pg (server/package.json)
FROM node:24-alpine AS deps

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev

# ---------- 3) Runtime ----------
FROM node:24-alpine AS runtime

# Non-root foydalanuvchi. Alpine'da `addgroup -g`/`adduser -u` ikkalasi
# ham berilishi kerak (GID va UID mos kelishi uchun).
RUN addgroup -S -g 1001 appgroup && adduser -S -u 1001 -G appgroup appuser

WORKDIR /app

COPY --from=deps --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=deps --chown=appuser:appgroup /app/server/node_modules ./server/node_modules
COPY --chown=appuser:appgroup package*.json ./
COPY --chown=appuser:appgroup server/ ./server/
# server/index.js `../netlify/lib/delivery.mjs` va `security.mjs` ni
# import qiladi — bu papka shu sabab majburiy.
COPY --chown=appuser:appgroup netlify/lib/ ./netlify/lib/
COPY --from=build --chown=appuser:appgroup /app/dist ./dist

USER appuser

# HOST=0.0.0.0: nginx boshqa konteynerda, shuning uchun loopback
# binding server'ni nginx'dan ajratib qo'yadi.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000

EXPOSE 4000

# `/api/health` — auth'siz va 308'siz (server/index.js da shu shaklda
# yozilgan). `/api/ping` ishlatib bo'lmaydi: u POST + auth talab qiladi,
# shuning uchun healthcheck doim `unhealthy` bo'lib qolardi.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1

CMD ["node", "server/index.js"]
