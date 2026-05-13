<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import 'vue-sonner/style.css'

const route = useRoute()
const authStore = useAuthStore()

// แสดง Sidebar เฉพาะหน้าที่ผ่านการ auth แล้ว
const showSidebar = computed(() => {
  return !route.path.includes('/login') && authStore.auth?.is_authen
})
</script>

<template>
  <Toaster richColors />

  <!-- Layout ที่มี Sidebar (หลัง login) -->
  <SidebarProvider v-if="showSidebar">
    <AppSidebar />
    <SidebarInset>
      <header class="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger class="-ml-1" />
        <div class="ml-auto">
          <AppDisplayControls />
        </div>
      </header>
      <div class="flex flex-1 flex-col gap-4 p-4">
        <slot />
      </div>
    </SidebarInset>
  </SidebarProvider>

  <!-- Layout แบบ full-screen (หน้า login หรือยังไม่ authen) -->
  <div v-else class="min-h-screen">
    <slot />
  </div>
</template>
