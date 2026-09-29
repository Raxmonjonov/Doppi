import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  // Prod'da /api/data birinchi yuklanishi MB'larcha (sekin tarmoqda 15-30s),
  // Netlify funksiyalari vaqti-vaqti bilan sekinlashadi — test xulq emas,
  // INFRATUZILMA tezligini kutadi. Chegara faqat haqiqiy qotib qolish uchun.
  timeout: 180_000,
  // Prod (netlify) tomonda Blobs/functions vaqti-vaqti bilan interval 5xx beradi;
  // ular infratuzilma urinishlari — test o'z-o'zidan ikki marta qayta urinadi.
  retries: 2,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE ?? 'http://127.0.0.1:5173',
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
})