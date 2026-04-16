import { defineStore } from 'pinia'

export interface EmployeeProfile {
  empno:     number | null
  empname_t: string | null
  prename_t: string | null
  emppos:    string | null
  dpt_code:  string | null
  userId?:   string | null
}

export const useAuthStore = defineStore('auth', () => {
  const auth          = ref<any>({ is_authen: false })
  const vendorAuth    = ref<any>({ is_authen: false })
  const appinfo       = ref<any>({})
  const userRight     = ref<any[]>([])
  const projectRight  = ref<any[]>([])
  const config        = ref<any[]>([])
  const decimal       = ref(2)
  const langList      = ref<any[]>([])
  const uiLang        = ref<any>({})
  const profile       = ref<EmployeeProfile>({ empno: null, empname_t: null, prename_t: null, emppos: null, dpt_code: null })

  const controlMenu   = ref<any>(null)
  const otherMenu     = ref<any>(null)
  const menuSelector  = ref<any>(null)
  const indexRight    = ref<any>(null)
  const reportRight   = ref<any>(null)

  const { $xt, $i18n } = useNuxtApp()

  const showSpinner = ref(false)

  // ── Session cache (ลด API call ซ้ำเมื่อ navigate ภายใน tab) ──────────────────
  const SESSION_KEY = 'mango_auth_session'

  function restoreFromSession(): boolean {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY)
      if (!raw) return false
      const cached = JSON.parse(raw)
      if (!cached?.auth?.is_authen) return false
      auth.value         = cached.auth
      appinfo.value      = cached.appinfo       || {}
      userRight.value    = cached.userRight      || []
      projectRight.value = cached.projectRight   || []
      controlMenu.value  = cached.controlMenu    ?? null
      otherMenu.value    = cached.otherMenu      ?? null
      indexRight.value   = cached.indexRight     ?? null
      reportRight.value  = cached.reportRight    ?? null
      config.value       = cached.config         || []
      decimal.value      = cached.decimal        ?? 2
      return true
    } catch {
      return false
    }
  }

  function saveToSession() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        auth: auth.value, appinfo: appinfo.value,
        userRight: userRight.value, projectRight: projectRight.value,
        controlMenu: controlMenu.value, otherMenu: otherMenu.value,
        indexRight: indexRight.value, reportRight: reportRight.value,
        config: config.value, decimal: decimal.value,
      }))
    } catch { /* sessionStorage full */ }
  }

  // ── fetchUserAuth ─────────────────────────────────────────────────────────────
  const fetchUserAuth = async (menuName: string, menuId: string, moduleName?: string) => {
    const langKey = $i18n.locale.value || $i18n.locale

    // ตรวจ bi_session ยังใช้ได้ไหม + ดึง profile fields
    try {
      const me = await $fetch<any>('/api/auth/me')
      profile.value = {
        empno:     me?.empno     ?? null,
        empname_t: me?.empname_t ?? null,
        prename_t: me?.prename_t ?? null,
        emppos:    me?.emppos    ?? null,
        dpt_code:  me?.dpt_code  ?? null,
        userId:    me?.userId    ?? null,
      }
    } catch {
      auth.value = { is_authen: false }
      sessionStorage.removeItem(SESSION_KEY)
      return false
    }

    // session เก่าไม่มี empname_t → ดึงจาก MangoBI/Me โดยตรง (reactive update)
    if (!profile.value.empname_t) {
      $xt.getServer('MangoBI/Me').then((res: any) => {
        const data = res?.data ?? res
        if (data?.empname_t) {
          profile.value = {
            ...profile.value,
            empno:     data.empno     ?? profile.value.empno,
            empname_t: data.empname_t,
            prename_t: data.prename_t ?? null,
            emppos:    data.emppos    ?? null,
            dpt_code:  data.dpt_code  ?? null,
          }
        }
      }).catch(() => { /* profile optional */ })
    }

    // store ยังมี auth อยู่ (same-session navigation)
    if (auth.value?.is_authen) return true

    // refresh → ลอง restore จาก sessionStorage ก่อน
    if (restoreFromSession()) return true

    try {
      // ทุก call ผ่าน /api/proxy/main → server inject X-Mango-Auth จาก bi_session
      const respInit: any = await $xt.getServer(
        `api/public/ViewInitData2?menu_name=${encodeURIComponent(menuName)}&lang_code=&menu_id=${encodeURIComponent(menuId)}`
      )

      if (!respInit?.data?.auth) throw new Error('Missing Auth Data')

      const data     = respInit.data
      auth.value     = data.auth
      appinfo.value  = data.appinfo       || {}
      userRight.value    = data.menu_right    || []
      projectRight.value = data.project_right || []

      if (auth.value.is_authen) {
        const promises: Promise<void>[] = []

        promises.push((async () => {
          const res: any = await $xt.getServer(`anywhere/api/LayoutModuleConfig`)
          controlMenu.value = res.json
          otherMenu.value   = res.other
          indexRight.value  = res.layout_right
          reportRight.value = res.report_right
        })())

        if (moduleName) {
          promises.push((async () => {
            const res = await $xt.getServer(`Anywhere/Center/MenuSelector?module_=${moduleName}&lang_code=${langKey}`)
            menuSelector.value = res
          })())
        }

        // PPN Config — background, ไม่ block
        ;(async () => {
          const res: any = await $xt.getServer(`Planning/Plan/ppn_config`)
          config.value   = res?.config || []
          const decObj   = config.value.find((x: any) => x.code === 'PPN_DECIMAL' && x.active === 'Y')
          decimal.value  = decObj ? parseInt(decObj.value_data) : 2
        })()

        await Promise.all(promises)
      }

      saveToSession()

      if (import.meta.client) {
        window.auth         = data.auth
        window.userRight    = data.menu_right
        window.projectRight = data.project_right
        window.decimals     = data.appinfo.decimals || 2
        window.controlMenu  = controlMenu.value
        window.menu         = menuSelector.value
      }

      return true
    } catch (e) {
      console.error('Auth Fetch Error:', e)
      auth.value = { is_authen: false }
      return false
    }
  }

  // ── fetchVendorAuth ───────────────────────────────────────────────────────────
  const fetchVendorAuth = async () => {
    try {
      const rsp: any = await $xt.getServer(`Anywhere/VendorAuth/GetInitCustomerData`)
      if (!rsp?.data?.vendorAuth?.is_authen) throw new Error('Vendor Auth Failed')
      vendorAuth.value = rsp.data.vendorAuth
      if (import.meta.client) window.vendorAuth = rsp.data.vendorAuth
      return true
    } catch {
      vendorAuth.value = { is_authen: false }
      return false
    }
  }

  // ── handleLogout ──────────────────────────────────────────────────────────────
  const handleLogout = async (isAllDevices: boolean) => {
    showSpinner.value = true

    const raw       = config.value.find((x: any) => x.code === 'PPN_LOGIN')?.value_data ?? ''
    const logoutUrl = raw.startsWith('/') || raw.startsWith('http') ? raw : '/login'

    // ล้าง client state ทันที
    auth.value = { is_authen: false }
    sessionStorage.removeItem(SESSION_KEY)

    try {
      // server logout: เรียก Anywhere logout + ลบ bi_session cookie
      await $fetch('/api/auth/logout', {
        method: 'POST',
        body:   { allDevices: isAllDevices },
      })
    } catch (ex) {
      console.error('Logout Error:', ex)
    } finally {
      showSpinner.value = false
      window.location.href = logoutUrl
    }
  }

  return {
    auth, appinfo, userRight, projectRight, config, decimal, uiLang,
    controlMenu, otherMenu, menuSelector, indexRight, reportRight,
    profile,
    fetchUserAuth, fetchVendorAuth, vendorAuth, handleLogout, showSpinner,
  }
})
