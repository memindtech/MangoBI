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
    // Server-only — ไม่ expose ไป browser
    // ค่าจริงอยู่ใน .env → NUXT_MANGO_BASE / NUXT_MANGO_SCHEMA_PASSCODE
    mangoBase: '',
    mangoSchemaPasscode: '',
    // ── AI Assistant (server-only — keys ไม่เปิดเผย browser) ──────────────────
    aiEnabled:    false,              // NUXT_AI_ENABLED=true  ← เปิดสำหรับลูกค้าที่จ่าย
    aiProvider:   'claude',           // NUXT_AI_PROVIDER: 'claude' | 'gemini' | 'backend'
    claudeApiKey: '',                 // NUXT_CLAUDE_API_KEY
    geminiApiKey: '',                 // NUXT_GEMINI_API_KEY
    geminiModel:  'gemini-2.0-flash', // NUXT_GEMINI_MODEL
    aiBackendUrl:   'https://backend-ai.mangoanywhere.com/api/chat', // NUXT_AI_BACKEND_URL
    aiBackendModel: '',  // NUXT_AI_BACKEND_MODEL e.g. 'qwen3.5:9b'
    public: {
      // ค่าจริงอยู่ใน .env → NUXT_PUBLIC_API_BASE / NUXT_PUBLIC_PLANNING_BASE / NUXT_PUBLIC_BI_BASE
      apiBase:      '',
      planningBase: '',
      biBase:       '',   // MangoBI backend (MicroBackend)
    }
  },

  nitro: {
    storage: {
      'mango-schema':  { driver: 'memory' },
      // server-side session store — swap driver เป็น redis ใน production
      // NUXT_NITRO_STORAGE_BI_SESSIONS_DRIVER=redis
      // NUXT_NITRO_STORAGE_BI_SESSIONS_URL=redis://...
      'bi-sessions':   { driver: 'memory' },
    },
  },

  devtools: { enabled: true },
  css: [
    '~/assets/css/tailwind.css',
    '~/assets/css/main.css',
    'ag-grid-community/styles/ag-grid.css',
    'ag-grid-community/styles/ag-theme-quartz.css',
  ],

  // fontFamily ตั้งค่าใน app/assets/css/tailwind.css (--font-sans) ไม่ใช่ nuxt.config

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