<script setup lang="ts">
import { ref, watch } from 'vue'
import { useIdle } from '@vueuse/core'
import { useRouter } from 'vue-router'

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'

const props = withDefaults(defineProps<{
  /** Idle time in ms before showing the warning dialog (default: 15 min) */
  timeoutMs?: number
  /** Countdown seconds before auto-logout (default: 60) */
  countdownSec?: number
}>(), {
  timeoutMs:    15 * 60 * 1000,
  countdownSec: 60,
})

const { t } = useI18n()

// --- State ---
const { idle, reset } = useIdle(props.timeoutMs)

const showWarning = ref(false)
const countdown   = ref(props.countdownSec)
let timerInterval: any = null

const router = useRouter()
const authStore = useAuthStore()

// --- Logic ---

const doLogout = () => {
  clearInterval(timerInterval)
  showWarning.value = false
  authStore.handleLogout(false)
  router.push('/login')
}

const startCountdown = () => {
  countdown.value = props.countdownSec
  showWarning.value = true
  
  timerInterval = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      doLogout()
    }
  }, 1000)
}

// ฟังก์ชันเมื่อผู้ใช้กด "อยู่ในระบบต่อ"
const stayLoggedIn = () => {
  showWarning.value = false
  clearInterval(timerInterval)
  reset() // Reset เวลาของ useIdle กลับไปเริ่มต้นใหม่
}

watch(idle, (isIdle) => {
  if (isIdle) startCountdown()
})
</script>

<template>
  <AlertDialog :open="showWarning">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle class="flex items-center gap-2 text-destructive">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {{ t('auto_logout_title') }}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {{ t('auto_logout_desc_pre') }}
          <span class="text-red-600 font-bold text-lg"> {{ countdown }} </span>
          {{ t('auto_logout_desc_suf') }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogAction @click="stayLoggedIn" class="w-full sm:w-auto">
          {{ t('auto_logout_stay') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>