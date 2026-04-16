import moment from 'moment'
import Decimal from 'decimal.js'

/**
 * mango-bridge — BFF edition
 *
 * ทุก API call ผ่าน Nuxt proxy routes (/api/proxy/planning/* และ /api/proxy/main/*)
 * Server ฝั่ง Nitro inject X-Mango-Auth จาก bi_session cookie โดยอัตโนมัติ
 * Browser ไม่เห็น mango_auth token และไม่เห็น URL ของ Planning/Main backend
 *
 * Planning prefix  → /api/proxy/planning/{path}
 * ที่เหลือทั้งหมด → /api/proxy/main/{path}
 */

const PLANNING_PREFIXES = ['Planning/', 'planning/']

function makeProxyFetcher(prefix: string, onUnauthorized?: () => void) {
  return $fetch.create({
    baseURL: prefix,
    credentials: 'include', // ส่ง bi_session cookie ไปกับทุก request
    async onResponseError({ response }) {
      if ((response.status === 401 || response.status === 403) && onUnauthorized) {
        onUnauthorized()
      }
      throw response._data
    },
  })
}

export default defineNuxtPlugin((_nuxtApp) => {
  // ป้องกัน redirect ซ้ำเมื่อหลาย request ล้มพร้อมกัน
  let _loggingOut = false

  async function handleUnauthorized() {
    if (!import.meta.client || _loggingOut) return
    if (window.location.pathname.includes('/login')) return
    _loggingOut = true
    // ล้าง server session + cookie ผ่าน logout endpoint
    try { await $fetch('/api/auth/logout', { method: 'POST' }) } catch {}
    window.location.href = '/login'
  }

  const planningProxy = makeProxyFetcher('/api/proxy/planning/', handleUnauthorized)
  const mainProxy     = makeProxyFetcher('/api/proxy/main/',     handleUnauthorized)

  function getFetcher(url: string) {
    return PLANNING_PREFIXES.some(p => url.startsWith(p)) ? planningProxy : mainProxy
  }

  const config = useRuntimeConfig()

  const xtools = {
    async getServer(url: string, opts?: any) {
      try {
        return await getFetcher(url)(url, { method: 'GET', ...opts })
      } catch (error: any) {
        console.error(`xt.getServer Error [${url}]:`, error)
        return { error: error?.message || error }
      }
    },

    async postServerJson(url: string, data: any, opts?: any) {
      try {
        return await getFetcher(url)(url, { method: 'POST', body: data, ...opts })
      } catch (error: any) {
        console.error(`xt.postServerJson Error [${url}]:`, error)
        return { error: error?.message || error }
      }
    },

    async capture_log_planning(
      task: string, pre_event: string, plan_code: string,
      taskid      = '',
      log_status  = '',
      to_target   = '',
      alertcode   = '',
    ) {
      return await this.postServerJson('Planning/Planning/Planning_Log', {
        task, pre_event, plan_code,
        taskid, log_status, to_target, alertcode,
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
        const globalDecimal: number = import.meta.client ? ((globalThis as any).decimals ?? 2) : 2
        const precision = n === 0 ? 0 : (n !== undefined ? globalDecimal : 2)
        const dValue = new Decimal(x)
        if (dValue.isNaN()) return ''
        const sp = dValue.toFixed(precision).split('.')
        let fm = Number.parseInt(sp[0] ?? '0').toLocaleString('en-US')
        if (sp.length > 1) fm = fm + '.' + sp[1]
        return fm
      } catch {
        return ''
      }
    },

    checkUserRight(id: number, moduleName = 'PN') {
      const authStore  = useAuthStore()
      const userRights = authStore?.userRight ?? []
      const status     = userRights.find((x: any) => x.menu_id == id && x.module == moduleName) || null
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
      return val === null || val === undefined || val === ''
        || (Array.isArray(val) && val.length === 0)
    },

    int(val: any) {
      return Number.parseInt(val) || 0
    },
  }

  return { provide: { xt: xtools } }
})
