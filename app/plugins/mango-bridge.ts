import moment from 'moment'
import Decimal from 'decimal.js'

// Paths ที่ขึ้นต้นด้วย prefix เหล่านี้ → ส่งไปยัง Planning backend (localhost:8310)
// ที่เหลือ (api/public/..., etc.) → ส่งไปยัง main service (localhost/service/)
const PLANNING_PREFIXES = ['Planning/', 'planning/']

function makeFetcher(baseURL: string, getToken: () => string, onUnauthorized?: () => void) {
  return $fetch.create({
    baseURL,
    async onRequest({ options }) {
      const extra: Record<string, string> = {}
      const token = getToken()
      if (token) extra['X-Mango-Auth'] = token
      if (import.meta.server) {
        const reqHeaders = useRequestHeaders(['cookie'])
        if (reqHeaders.cookie) extra['cookie'] = reqHeaders.cookie
      }
      options.headers = { ...(options.headers as Record<string, string>), ...extra }
    },
    async onResponseError({ response }) {
      if (response.status === 401 && onUnauthorized) {
        onUnauthorized()
      }
      throw response._data
    }
  })
}

export default defineNuxtPlugin((_nuxtApp) => {
  const config      = useRuntimeConfig()
  const authCookie  = useCookie('mango_auth')
  const getToken    = () => authCookie.value || (import.meta.client ? localStorage.getItem('mango_auth') ?? '' : '')

  // ป้องกัน redirect ซ้ำเมื่อหลาย request ล้มพร้อมกัน
  let _loggingOut = false
  function handleUnauthorized() {
    if (!import.meta.client || _loggingOut) return
    // หยุด request อื่นทันที ก่อน redirect
    if (window.location.pathname.includes('/login')) return
    _loggingOut = true
    localStorage.removeItem('mango_auth')
    sessionStorage.removeItem('mango_auth_session')
    authCookie.value = null
    // hard redirect เหมือน handleLogout — ให้ plugin re-init ใหม่ ไม่ค้าง state เดิม
    window.location.href = '/login'
  }

  const mainFetcher     = makeFetcher(config.public.apiBase,      getToken, handleUnauthorized)
  const planningFetcher = makeFetcher(config.public.planningBase, getToken, handleUnauthorized)

  function getFetcher(url: string) {
    return PLANNING_PREFIXES.some(p => url.startsWith(p)) ? planningFetcher : mainFetcher
  }

  const xtools = {
    async getServer(url: string, opts?: any) {
      try {
        return await getFetcher(url)(url, { method: 'GET', ...opts })
      } catch (error: any) {
        console.error(`xt.getServer Error [${url}]:`, error)
        return { error: error.message || error }
      }
    },

    async postServerJson(url: string, data: any, opts?: any) {
      try {
        return await getFetcher(url)(url, { method: 'POST', body: data, ...opts })
      } catch (error: any) {
        console.error(`xt.postServerJson Error [${url}]:`, error)
        return { error: error.message || error }
      }
    },

    async capture_log_planning(task: string, pre_event: string, plan_code: string,
      taskid: string = '',
      log_status: string = '',
      to_target: string = '',
      alertcode: string = ''
    ) {
      return await this.postServerJson('Planning/Planning/Planning_Log', {
        task, pre_event, plan_code,
        taskid: taskid || '',
        log_status: log_status || '',
        to_target: to_target || '',
        alertcode: alertcode || ''
      })
    },

    formatDate(d: any, f?: string) {
      const m = moment(d)
      if (this.isEmpty(d) || !m.isValid()) return ''
      return m.format(this.isEmpty(f) ? 'DD/MM/YYYY' : f)
    },

    getPic(download: boolean, file: string) {
      if (file) return `${config.public.apiBase}api/file/download/?id=${file}&download=${download}`
      return `/Content/Image/user-2.svg`
    },

    formatNumber(x: any, n?: number) {
      try {
        if (this.isEmpty(x) || Number.isNaN(Number.parseFloat(x))) return ''
        // n=0 → 0 ทศนิยม | n ระบุ → ใช้ global decimal | ไม่ระบุ → 2
        const globalDecimal: number = import.meta.client ? ((globalThis as any).decimals ?? 2) : 2
        const precision = n === 0 ? 0 : (n !== undefined ? globalDecimal : 2)
        const dValue = new Decimal(x)
        if (dValue.isNaN()) return ''
        const sp = dValue.toFixed(precision).split('.')
        let fm = Number.parseInt(sp[0]).toLocaleString('en-US')
        if (sp.length > 1) fm = fm + '.' + sp[1]
        return fm
      } catch {
        return ''
      }
    },

    checkUserRight(id: number, moduleName = 'PN') {
      const authStore = useAuthStore()
      const userRights = authStore?.userRight ?? []
      const status = userRights.find((x: any) => x.menu_id == id && x.module == moduleName) || null
      if (status) {
        const classes: string[] = []
        if (status.isall == 1)      classes.push('rights-is-all')
        if (status.isdelete == 1)   classes.push('rights-is-delete')
        if (status.isenabled == 1)  classes.push('rights-is-enabled')
        if (status.isprint == 1)    classes.push('rights-is-print')
        if (status.isreadonly == 1) classes.push('rights-is-read-only')
        if (status.issaveas == 1)   classes.push('rights-is-save')
        return { data: { ...status }, class: classes.join(' ') }
      }
      return { data: { isenabled: 0 }, class: 'hide-button' }
    },

    isEmpty(val: any) {
      return val === null || val === undefined || val === '' || (Array.isArray(val) && val.length === 0)
    },

    int(val: any) {
      return Number.parseInt(val) || 0
    },
  }

  return { provide: { xt: xtools } }
})
