<script setup lang="ts">
import { ref, watch } from 'vue'
import { useIdle } from '@vueuse/core'
import { useRouter } from 'vue-router'
// Import Store ของคุณ (ปรับ path ให้ตรง)
// import { useAuthStore } from '@/stores/auth' 

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'

// --- Config ---
const TIMEOUT_DURATION = 15 * 60 * 1000 // 15 นาที (เวลาที่จะเริ่มนับว่า Idle)
const COUNTDOWN_DURATION = 60 // 60 วินาที (เวลาถอยหลังก่อนดีดออกจริง)

// --- State ---
// useIdle จะ return value เป็น true ถ้าไม่มี user activity ตามเวลาที่กำหนด
const { idle, reset } = useIdle(TIMEOUT_DURATION) 

const showWarning = ref(false)
const countdown = ref(COUNTDOWN_DURATION)
let timerInterval: any = null

const router = useRouter()
const authStore = useAuthStore()

// --- Logic ---

// ฟังก์ชัน Logout
const doLogout = () => {
  console.log('User inactive - Logging out...')
  
  // 1. เคลียร์ Interval
  clearInterval(timerInterval)
  showWarning.value = false
  
  // 2. เรียก Store Logout (ปรับให้ตรงกับ Auth Store ของคุณ)
  authStore.handleLogout(false)
  
  // 3. บังคับ Redirect ไปหน้า Login
  // window.location.href = '/login' // ใช้แบบนี้ชัวร์สุดเพื่อเคลียร์ state ทุกอย่าง
  // หรือใช้ router
  router.push('/login')
}

// ฟังก์ชันเริ่มนับถอยหลัง 60 วินาที
const startCountdown = () => {
  countdown.value = COUNTDOWN_DURATION
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

// จับตาดูค่า idle
watch(idle, (isIdle) => {
  if (isIdle) {
    // ถ้า Idle ครบ 15 นาที -> เปิด Modal นับถอยหลัง
    startCountdown()
  } else {
    // ถ้า user ขยับเมาส์ระหว่างที่ Modal ขึ้น (optional: จะให้ปิดเองเลยก็ได้)
    // แต่ปกติเรามักจะบังคับให้กดปุ่ม "อยู่ต่อ" เพื่อความชัวร์
    // ในที่นี้ถ้า idle เป็น false แปลว่ามีการขยับเมาส์ 'ก่อน' จะครบ 15 นาที 
    // ตัว useIdle มันจัดการ reset ให้เองอยู่แล้ว
  }
})
</script>

<template>
  <AlertDialog :open="showWarning">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle class="flex items-center gap-2 text-destructive">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            หมดเวลาการเชื่อมต่อ
        </AlertDialogTitle>
        <AlertDialogDescription>
            คุณไม่ได้ทำรายการใดๆ เป็นเวลานาน ระบบจะออกจากระบบอัตโนมัติในอีก 
            <span class="text-red-600 font-bold text-lg"> {{ countdown }} </span> วินาที
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogAction @click="stayLoggedIn" class="w-full sm:w-auto">
          อยู่ในระบบต่อ
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>