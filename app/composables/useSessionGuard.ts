/**
 * useSessionGuard
 *
 * Ping a lightweight auth endpoint periodically and on tab-focus.
 * If the server returns 401, the existing handleUnauthorized() in mango-bridge.ts
 * will clear tokens and redirect to /login automatically.
 */
export function useSessionGuard(intervalMs = 5 * 60 * 1000) {
  const authStore  = useAuthStore()
  const { $xt }    = useNuxtApp() as any
  const route      = useRoute()

  let _timer: ReturnType<typeof setInterval> | null = null
  let _lastCheck   = Date.now()

  async function check() {
    // ไม่ทำงานถ้า: ไม่ใช่ client, อยู่หน้า login, หรือยังไม่ได้ login
    if (!import.meta.client)          return
    if (route.path.includes('/login')) return
    if (!authStore.auth?.is_authen)   return

    _lastCheck = Date.now()

    // เรียก endpoint เบาๆ — ถ้า 401 → handleUnauthorized ใน plugin จะ redirect เอง
    await $xt.getServer('api/public/ViewInitData2?menu_name=&lang_code=&menu_id=0')
  }

  function onVisibilityChange() {
    if (document.visibilityState !== 'visible') return
    // ตรวจทันทีถ้าหนีจาก tab ไปนานกว่า interval
    if (Date.now() - _lastCheck >= intervalMs) check()
  }

  function start() {
    if (!import.meta.client) return
    stop() // clear ก่อนเสมอป้องกัน double-register

    _timer = setInterval(check, intervalMs)
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  function stop() {
    if (_timer) { clearInterval(_timer); _timer = null }
    if (import.meta.client) document.removeEventListener('visibilitychange', onVisibilityChange)
  }

  onUnmounted(stop)

  return { start, stop }
}
