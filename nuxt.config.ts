import tailwindcss from '@tailwindcss/vite'
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'
import { resolve } from 'node:path'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  // เปิดใช้งานโครงสร้าง Nuxt 4
  future: {
    compatibilityVersion: 4,
  },

  build: {
    transpile: ['vuetify'],
  },

  runtimeConfig: {
    public: {
      apiBase:      'http://localhost/service/',        // Main service (auth, public)
      planningBase: 'http://localhost:8310/api/v1/',   // Planning Service (dev)
    }
  },

  devtools: { enabled: true },
  css: [
    '~/assets/css/tailwind.css',
    'ag-grid-community/styles/ag-grid.css',
    'ag-grid-community/styles/ag-theme-quartz.css',
  ],

  fontFamily: "THSarabunNew, sans-serif",

  vite: {
    vue: {
      template: {
        transformAssetUrls,
      },
    },
    plugins: [
      tailwindcss(),
      vuetify({ autoImport: true }),
    ],
  },

  // ลงทะเบียนโมดูลทั้งหมดที่ต้องใช้
  modules: [
    'shadcn-nuxt',
    '@nuxtjs/i18n',
    '@nuxtjs/color-mode',
    '@pinia/nuxt'
  ],

  // --- ตั้งค่า i18n ---
  i18n: {
    locales: [
      { code: 'th', file: 'th.json' },
      { code: 'en', file: 'en.json' },
      { code: 'cn', file: 'cn.json' }
    ],
    lazy: true,
    // ใช้ resolve เพื่อดึงพาธจาก app/locales ตรงๆ ป้องกัน i18n v10 เติมพาธซ้อน
    langDir: resolve(__dirname, 'app/locales'),
    defaultLocale: 'th',
    strategy: 'no_prefix'
  },

  // --- ตั้งค่า Color Mode (สำหรับสลับ Dark/Light) ---
  colorMode: {
    classSuffix: '', // สำคัญมากสำหรับ Tailwind v4 และ shadcn
    preference: 'system',
    fallback: 'light'
  },

  shadcn: {
    prefix: '',
    componentDir: './app/components/ui'
  }
})