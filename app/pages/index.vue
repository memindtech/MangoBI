<script setup lang="ts">
import { Share2, LayoutDashboard, Send, Code2, ArrowRight } from 'lucide-vue-next'

const router = useRouter()

definePageMeta({
  auth: true,
  mangoMenu: { checkUserRight: false, menu_name: 'PLANWEB', menu_id: '' }
})
useHead({ title: 'MangoBI — Home' })

const features = [
  {
    icon: Code2,
    color: 'text-sky-500',
    bg:    'bg-sky-500/10',
    border:'border-sky-500/20',
    title: 'SQL Builder',
    desc:  'สร้าง SQL Query จาก Structure ของระบบ ERP แบบ Visual',
    path:  '/sql-builder',
  },
  {
    icon: Share2,
    color: 'text-violet-500',
    bg:    'bg-violet-500/10',
    border:'border-violet-500/20',
    title: 'Data Model',
    desc:  'นำเข้าข้อมูล กำหนด Relation และจัดการ Dataset สำหรับ Report',
    path:  '/datamodel',
  },
  {
    icon: LayoutDashboard,
    color: 'text-orange-500',
    bg:    'bg-orange-500/10',
    border:'border-orange-500/20',
    title: 'Report Builder',
    desc:  'สร้าง Dashboard ด้วย Chart, Table, KPI แบบ Drag & Drop',
    path:  '/report',
  },
  {
    icon: Send,
    color: 'text-emerald-500',
    bg:    'bg-emerald-500/10',
    border:'border-emerald-500/20',
    title: 'Send Report',
    desc:  'ตั้งเวลาและส่ง Report ให้ผู้รับผ่าน LINE หรือ Email',
    path:  '/send-report',
  },
]
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-[70vh] gap-8 px-4">
    <!-- Logo / Title -->
    <div class="text-center">
      <div class="flex items-center justify-center gap-3 mb-3">
        <div class="flex size-12 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg">
          <LayoutDashboard class="size-6" />
        </div>
        <h1 class="text-3xl font-bold tracking-tight">MangoBI</h1>
      </div>
      <p class="text-muted-foreground text-sm">Business Intelligence Platform</p>
    </div>

    <!-- Feature Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-4xl">
      <button
        v-for="f in features"
        :key="f.path"
        @click="router.push(f.path)"
        :class="['group flex flex-col gap-3 p-5 rounded-2xl border text-left transition-all hover:shadow-md hover:-translate-y-0.5', f.border, f.bg]"
      >
        <div :class="['flex size-10 items-center justify-center rounded-xl', f.bg, 'border', f.border]">
          <component :is="f.icon" :class="['size-5', f.color]" />
        </div>
        <div class="flex-1">
          <p class="font-semibold text-sm mb-1">{{ f.title }}</p>
          <p class="text-xs text-muted-foreground leading-relaxed">{{ f.desc }}</p>
        </div>
        <div :class="['flex items-center gap-1 text-xs font-medium transition-colors', f.color]">
          เปิดใช้งาน
          <ArrowRight class="size-3 transition-transform group-hover:translate-x-1" />
        </div>
      </button>
    </div>

  </div>
</template>
