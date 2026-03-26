<script setup lang="ts">
// 1. ดึง Store และ i18n มาใช้งาน
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()
const { locale } = useI18n()
const { start: startSessionGuard } = useSessionGuard()
const { initFontSize } = useAppFontSize()
const { start: startLoading, finish: finishLoading } = useLoadingIndicator()

// Trigger loading bar on every client-side navigation
router.beforeEach(() => { startLoading() })
router.afterEach(() => { finishLoading() })

// สถานะการโหลดแอป
const isReady = ref(false)

// 2. เริ่มต้นโหลดข้อมูล (Lifecycle ของ Nuxt 4)
onBeforeMount(async () => {
  if (import.meta.client) {
    initFontSize()
    // --- จุดที่แก้ไข: ข้ามการโหลดข้อมูลถ้าอยู่หน้า Login หรือหน้าที่ไม่ต้องใช้ Auth ---
    if (route.path.includes('/login')) {
      isReady.value = true
      return
    }

    try {
      // ดึงค่าจาก Meta ของ Route ปัจจุบัน (ถ้ามี)
      const mangoMenu = route.meta.mangoMenu as any
      const menuName = mangoMenu?.menu_name || 'PLANWEB'
      const menuId = mangoMenu?.menu_id || ''
      const moduleName = (route.meta.module as string) || ''

      // เรียกใช้ fetchUserAuth ตัวใหม่ที่คุณอัปเดตใน Store
      const success = await authStore.fetchUserAuth(menuName, menuId, moduleName)

      if (!success && route.meta.auth) {
        // ถ้าโหลดข้อมูลไม่สำเร็จและหน้านี้ต้องใช้ Auth ให้ดีดไป Login
        await navigateTo('/login')
      } else if (success) {
        // เริ่ม background session guard เมื่อ login สำเร็จ
        startSessionGuard()
      }
    } catch (error) {
      console.error("App Initialization Failed:", error)
      // ในกรณีเกิด Error รุนแรง ให้พยายามกลับไปตั้งหลักที่หน้า Login
      if (route.path !== '/login') {
        await navigateTo('/login')
      }
    } finally {
      // ไม่ว่าจะสำเร็จหรือไม่ ต้องเปิดสถานะ Ready เพื่อให้ NuxtPage ทำงานต่อ
      isReady.value = true
    }
  }
})
</script>

<template>
  <NuxtLoadingIndicator color="#f97316" :height="3" />

  <div v-if="!isReady" class="flex h-screen w-screen flex-col items-center justify-center bg-background">
    <div class="flex flex-col items-center gap-4">
      <div class="h-12 w-12 animate-spin rounded-full border-4 border-orange-500 border-t-transparent"></div>
      <div class="flex flex-col items-center gap-1">
        <p class="text-sm font-semibold text-foreground">
          Initializing PPN Planning System
        </p>
        <p class="text-xs text-muted-foreground animate-pulse">
          Please wait while we prepare your session...
        </p>
      </div>
    </div>
  </div>

  <div v-else :key="locale" class="min-h-screen">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>

<style>
/* นำเข้า Tailwind Reference (V4) */
@reference "~/assets/css/tailwind.css";

/* ตั้งค่า Font และพื้นฐาน Global */
body {
  @apply bg-background text-foreground antialiased;
  /* รองรับ Inter (Eng) และ Kanit (Thai) */
  font-family: 'Inter', 'Kanit', sans-serif;
}

/* ปรับปรุง Smooth Transition ระหว่างเปลี่ยนหน้า */
.page-enter-active,
.page-leave-active {
  transition: opacity 0.2s ease;
}
.page-enter-from,
.page-leave-to {
  opacity: 0;
}
</style>