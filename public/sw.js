/* Do'ppi service worker — Web Push yetkazib berish.
   Vazifa: sahifa yopiq yoki fon rejimida bo'lganda ham bildirishnomani
   ko'rsatish va "qo'ng'iroqqa qo'shilish" tugmasini ishlash. */

const CACHE = 'doppi-shell-v1'
const SHELL = ['/', '/index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

/* Sahifa navigatsiyasida network-first: yangi versiyani olish, muvaffaqiyatsiz
   bo'lsa eski shell'dan qaytarish (oflayn ko'rinish). */
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/index.html').then((r) => r || Response.error())))
  }
})

function targetUrl(data) {
  if (data.threadId) return `/messenger?thread=${encodeURIComponent(data.threadId)}`
  if (data.groupId) return `/groups?group=${encodeURIComponent(data.groupId)}`
  return '/'
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Yangi xabar', body: event.data ? event.data.text() : '' }
  }

  const options = {
    body: data.body || '',
    icon: '/icons.svg',
    badge: '/favicon.svg',
    tag: data.tag || 'doppi-notif',
    renotify: true,
    vibrate: data.kind === 'call' ? [80, 60, 80, 60, 80] : [60, 40, 60],
    data: { ...data, url: targetUrl(data) },
    requireInteraction: data.kind === 'call',
  }
  if (Array.isArray(data.actions) && data.actions.length) options.actions = data.actions

  event.waitUntil(self.registration.showNotification(data.title || 'Do‘ppi', options))
})

/* Bildirishnoma bosilganda: sahifani ochamiz va xabar haqidagi ma'lumotni
   mijozgа yuboramiz. "O'qilgan" belgisini o'zi qo'yadi — bu app cookie emas,
   Authorization: Bearer ishlatadi, service worker esa token saqlamaydi.
   "Qo'ng'iroqqa qo'shilish" tanlansa, ochiq bo'lgach responder rejimi
   ishga tushadi. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const action = event.action
  const url = data.url || targetUrl(data)

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clientList) {
        if (client.url.includes('/login') || client.url.includes('/register')) continue
        if ('focus' in client) {
          await client.focus()
          client.postMessage({ type: 'doppi:push-click', action, data })
          return
        }
      }
      // ochiq oyna yo'q — yangi oyna ochamiz, join haqidagi ma'lumot
      // URL orqali (thread/group) saqlanadi
      await self.clients.openWindow(url)
    })(),
  )
})
