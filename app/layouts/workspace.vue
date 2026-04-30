<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import 'vue-sonner/style.css'

const route = useRoute()
const authStore = useAuthStore()

const showSidebar = computed(() =>
  !route.path.includes('/login') && authStore.auth?.is_authen
)
</script>

<template>
  <Toaster richColors />

  <SidebarProvider v-if="showSidebar" style="height:100vh;overflow:hidden">
    <AppSidebar />
    <SidebarInset style="overflow:hidden;display:flex;flex-direction:column;min-height:0;flex:1">
      <!-- No padding — full workspace for the page -->
      <div style="flex:1;overflow:hidden;min-height:0;display:flex;flex-direction:column">
        <slot />
      </div>
    </SidebarInset>
  </SidebarProvider>

  <div v-else class="min-h-screen">
    <slot />
  </div>
</template>
