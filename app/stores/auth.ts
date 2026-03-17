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
  const fetchUserAuth = async (menuName: string, menuId: string, moduleName?: string) => {
    const headers = useRequestHeaders(['cookie']) as HeadersInit
    
    const langKey = $i18n.locale.value || $i18n.locale;

    const token = localStorage.getItem('mango_auth')
    if (!token) {
      auth.value = { is_authen: false }
      return false
    }

    try {
      // 1. เรียก API ViewUserAuthentication ตาม Logic ใหม่
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
        
        // C. โหลด PPN Config (คงเดิมจากเวอร์ชันก่อนหน้า)
        promises.push((async () => {
          const res: any = await $xt.getServer(`Planning/Plan/ppn_config`)
          config.value = res?.config || []
          const decObj = config.value.find(x => x.code === "PPN_DECIMAL" && x.active === "Y")
          decimal.value = decObj ? parseInt(decObj.value_data) : 2
        })())
      }

      await Promise.all(promises)

      // 4. บันทึก Log การเข้าใช้งาน (UserInsertLogs)
      // if (moduleName && menuId) {
      //   $xt.postServerJson('API/Public/UserInsertLogs', {
      //     module: moduleName || 'MG',
      //     menu_name: menuName,
      //     menu_id: menuId
      //   }).catch(() => {}) // บันทึก Log ล้มเหลวไม่ต้องดีดออก
      // }

      // 5. Mapping ข้อมูลลง Window (Legacy Support สำหรับไฟล์เก่า)
      if (import.meta.client) {
        window.ui = uiLang.value
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
    try {
      const url = `api/public/logout?all=${isAllDevices}&is_api=N`
      const rs: any = await $xt.getServer(url)

      if (rs.success) {
        localStorage.removeItem('mango_auth')
        localStorage.removeItem('auth_token')
        auth.value = { is_authen: false }
        
        // Redirect ไปหน้า Login
        const logoutUrl = config.value.find(x => x.code === "PPN_LOGIN")?.value_data || '/login'
        window.location.href = logoutUrl
      }
    } catch (ex) {
      console.error("Logout Error:", ex)
    } finally {
      showSpinner.value = false
    }
  }

  return { 
    auth, appinfo, userRight, projectRight, config, decimal, uiLang,
    controlMenu, otherMenu, menuSelector, indexRight, reportRight,
    fetchUserAuth, fetchVendorAuth, vendorAuth, handleLogout, showSpinner 
  }
})