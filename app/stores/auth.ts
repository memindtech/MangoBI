import { defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', () => {
  // --- State สำหรับเก็บข้อมูล ---
  const auth = ref<any>({ is_authen: false })
  const vendorAuth = ref<any>({ is_authen: false })
  const appinfo = ref<any>({})
  const userRight = ref<any[]>([])
  const projectRight = ref<any[]>([])
  const config = ref<any[]>([])
  const decimal = ref(2)
  const langList = ref<any[]>([])
  const uiLang = ref<any>({})
  
  // State สำหรับ Layout และ Menu Selector
  const controlMenu = ref<any>(null)
  const otherMenu = ref<any>(null)
  const menuSelector = ref<any>(null)
  const indexRight = ref<any>(null)
  const reportRight = ref<any>(null)

  const { $xt, $i18n } = useNuxtApp()
  
  const showSpinner = ref(false)

  /**
   * ฟังก์ชันหลักสำหรับดึงข้อมูลการเข้าถึงและสิทธิ์
   */
  const SESSION_KEY = 'mango_auth_session'

  // โหลด auth state จาก sessionStorage (ใช้ตอน refresh ให้ไม่ต้อง hit API ซ้ำ)
  function restoreFromSession(): boolean {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY)
      if (!raw) return false
      const cached = JSON.parse(raw)
      if (!cached?.auth?.is_authen) return false
      auth.value       = cached.auth
      appinfo.value    = cached.appinfo    || {}
      userRight.value  = cached.userRight  || []
      projectRight.value = cached.projectRight || []
      controlMenu.value  = cached.controlMenu  ?? null
      otherMenu.value    = cached.otherMenu    ?? null
      indexRight.value   = cached.indexRight   ?? null
      reportRight.value  = cached.reportRight  ?? null
      config.value       = cached.config       || []
      decimal.value      = cached.decimal      ?? 2
      return true
    } catch {
      return false
    }
  }

  function saveToSession() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        auth: auth.value,
        appinfo: appinfo.value,
        userRight: userRight.value,
        projectRight: projectRight.value,
        controlMenu: controlMenu.value,
        otherMenu: otherMenu.value,
        indexRight: indexRight.value,
        reportRight: reportRight.value,
        config: config.value,
        decimal: decimal.value,
      }))
    } catch { /* sessionStorage full — ไม่ critical */ }
  }

  const fetchUserAuth = async (menuName: string, menuId: string, moduleName?: string) => {
    const langKey = $i18n.locale.value || $i18n.locale;

    const token = localStorage.getItem('mango_auth')
    if (!token) {
      auth.value = { is_authen: false }
      sessionStorage.removeItem(SESSION_KEY)
      return false
    }

    // ถ้า store ยังมี auth อยู่ (same-session navigation) ไม่ต้อง hit API ซ้ำ
    if (auth.value?.is_authen) return true

    // refresh → ลอง restore จาก sessionStorage ก่อน
    if (restoreFromSession()) return true

    try {
      // 1. เรียก API ViewInitData2
      const respInit: any = await $xt.getServer(
        `api/public/ViewInitData2?menu_name=${encodeURIComponent(menuName)}&lang_code=&menu_id=${encodeURIComponent(menuId)}`
      )

      if (!respInit?.data?.auth) throw new Error('Missing Auth Data')

      const data = respInit.data
      auth.value = data.auth
      appinfo.value = data.appinfo || {}
      userRight.value = data.menu_right || []
      projectRight.value = data.project_right || []

      // 3. เรียกข้อมูลเพิ่มเติมแบบขนาน (Parallel Promises)
      const promises: Promise<void>[] = []

      if (auth.value.is_authen) {
        // A. โหลด Layout Module Config
        promises.push((async () => {
          const res: any = await $xt.getServer(`anywhere/api/LayoutModuleConfig`)
          controlMenu.value = res.json
          otherMenu.value = res.other
          indexRight.value = res.layout_right
          reportRight.value = res.report_right
        })())

        // B. โหลด Menu Selector
        if (moduleName) {
          promises.push((async () => {
            const res = await $xt.getServer(`Anywhere/Center/MenuSelector?module_=${moduleName}&lang_code=${langKey}`)
            menuSelector.value = res
          })())
        }
        
        // C. โหลด PPN Config แบบ background (ไม่ block การเข้าระบบ)
        ;(async () => {
          const res: any = await $xt.getServer(`Planning/Plan/ppn_config`)
          config.value = res?.config || []
          const decObj = config.value.find((x: any) => x.code === "PPN_DECIMAL" && x.active === "Y")
          decimal.value = decObj ? parseInt(decObj.value_data) : 2
        })()
      }

      await Promise.all(promises)

      // บันทึก session cache ไว้ใช้ตอน refresh
      saveToSession()

      // Mapping ข้อมูลลง Window (Legacy Support)
      if (import.meta.client) {
        window.auth = data.auth
        window.userRight = data.menu_right
        window.projectRight = data.project_right
        window.decimals = data.appinfo.decimals || 2
        window.controlMenu = controlMenu.value
        window.menu = menuSelector.value
      }

      return true
    } catch (e) {
      console.error("Auth Fetch Error:", e)
      auth.value = { is_authen: false }
      return false
    }
  }

  const fetchVendorAuth = async () => {
    try {
      const rsp: any = await $xt.getServer(`Anywhere/VendorAuth/GetInitCustomerData`)
      if (!rsp?.data?.vendorAuth?.is_authen) throw new Error('Vendor Auth Failed')
      
      vendorAuth.value = rsp.data.vendorAuth
      if (import.meta.client) window.vendorAuth = rsp.data.vendorAuth // Legacy Support
      return true
    } catch (e) {
      vendorAuth.value = { is_authen: false }
      return false
    }
  }

  const handleLogout = async (isAllDevices: boolean) => {
    showSpinner.value = true

    // ล้าง state ทันทีเสมอ ไม่รอผล API (ป้องกัน 2-click login หลัง logout)
    const raw = config.value.find((x: any) => x.code === "PPN_LOGIN")?.value_data ?? ''
    const logoutUrl = raw.startsWith('/') || raw.startsWith('http') ? raw : '/login'

    localStorage.removeItem('mango_auth')
    localStorage.removeItem('auth_token')
    sessionStorage.removeItem(SESSION_KEY)
    auth.value = { is_authen: false }

    // ล้าง cookie ด้วย (ป้องกัน token เก่าค้างอยู่)
    const authCookie = useCookie('mango_auth')
    authCookie.value = null

    try {
      await $xt.getServer(`api/public/logout?all=${isAllDevices}&is_api=N`)
    } catch (ex) {
      console.error("Logout Error:", ex)
    } finally {
      showSpinner.value = false
      window.location.href = logoutUrl
    }
  }

  return { 
    auth, appinfo, userRight, projectRight, config, decimal, uiLang,
    controlMenu, otherMenu, menuSelector, indexRight, reportRight,
    fetchUserAuth, fetchVendorAuth, vendorAuth, handleLogout, showSpinner 
  }
})