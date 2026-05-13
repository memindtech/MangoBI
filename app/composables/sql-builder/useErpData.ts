/**
 * SQL Builder — ERP Data Loading
 *
 * เปลี่ยนจากเรียก Mango API โดยตรงจาก browser
 * → เรียกผ่าน Nuxt server proxy /api/mango-schema/*
 *
 * ข้อดี:
 *   - Browser คุยกับ MangoBI เท่านั้น (same-origin)
 *   - Firewall config ที่ server level เท่านั้น
 *   - Cache fallback ถ้า Mango ไม่ตอบ
 */
import type { ColumnInfo } from '~/types/sql-builder'
import { useSqlBuilderStore } from '~/stores/sql-builder'

// ── Standalone pure helper (safe to import without calling useErpData) ────────
export function objectTypeColor(type: string): string {
  return ({
    T:  'bg-blue-500/20 text-blue-600',
    V:  'bg-purple-500/20 text-purple-600',
    FN: 'bg-teal-500/20 text-teal-600',
    R:  'bg-orange-500/20 text-orange-600',
    SP: 'bg-rose-500/20 text-rose-600',
  } as Record<string, string>)[type] ?? 'bg-muted text-muted-foreground'
}

export function useErpData() {
  const store = useSqlBuilderStore()

  // ── Load module list then immediately load all objects ───────────────
  // B4: validates response shape so a malformed 200 (e.g. misconfigured
  //     backend returning HTML) doesn't silently result in an empty
  //     modules list with no warning.
  async function loadModules() {
    store.loadingMods  = true
    store.syncStatus   = 'syncing'
    try {
      const res: any = await $fetch('/api/mango-schema/modules')
      const raw = res?.data
      if (!Array.isArray(raw)) {
        console.error('[loadModules] unexpected response shape', res)
        throw new Error('invalid_shape')
      }
      const seen = new Set<string>()
      store.modules = raw
        .map((m: any) => m?.module)
        .filter((m: any): m is string => typeof m === 'string' && m.length > 0)
        .filter((m: string) => {
          if (seen.has(m)) return false
          seen.add(m)
          return true
        })
      store.syncStatus  = 'ok'
      store.syncLastAt  = new Date()
    } catch (err) {
      console.error('[loadModules] failed', err)
      store.modules    = []
      store.syncStatus = 'error'
    } finally {
      store.loadingMods = false
    }
    // Auto-load all objects after modules are ready
    loadAllObjects()
  }

  // ── Toggle module expansion & lazy-load objects ───────────────────────
  async function toggleModule(mod: string) {
    if (store.expandedMods.has(mod)) {
      store.expandedMods.delete(mod)
      store.expandedMods = new Set(store.expandedMods)
      return
    }
    store.expandedMods.add(mod)
    store.expandedMods = new Set(store.expandedMods)

    if (!store.objects[mod] && !store.loadingObjs[mod]) {
      store.loadingObjs = { ...store.loadingObjs, [mod]: true }
      try {
        const res: any = await $fetch(`/api/mango-schema/objects?module=${encodeURIComponent(mod)}`)
        store.objects = { ...store.objects, [mod]: res?.data ?? [] }
      } catch {
        store.objects = { ...store.objects, [mod]: [] }
      }
      store.loadingObjs = { ...store.loadingObjs, [mod]: false }
    }
  }

  // ── Load table columns (schema) ───────────────────────────────────────
  // B2+B4: propagates errors (server now throws 502) so the caller can
  // distinguish "table really has no columns" from "failed to reach Mango".
  // Validates response shape: the detail array must exist on the response.
  async function loadTableColumns(tableName: string): Promise<ColumnInfo[]> {
    const cached = store.getCachedColumns(tableName)
    if (cached) return cached

    const res: any = await $fetch(`/api/mango-schema/table-columns?table=${encodeURIComponent(tableName)}`)
    const detail = res?.data?.detail ?? res?.detail
    if (!Array.isArray(detail)) {
      console.error('[loadTableColumns] unexpected response shape', tableName, res)
      throw new Error('invalid_shape')
    }
    const cols: ColumnInfo[] = detail.map((d: any) => ({
      column_name: d.COLUMN_NAME ?? d.column_name ?? '',
      column_type: d.DATA_TYPE ?? d.column_type ?? d.data_type ?? '',
      data_type:   d.data_type ?? d.DATA_TYPE ?? '',
      data_pk:     (d.COLUMN_KEY === 'PRI' || d.data_pk === 'Y' ? 'Y' : 'N') as 'Y' | 'N',
      remark:      d.COLUMN_COMMENT ?? d.remark ?? '',
    })).sort((a: ColumnInfo, b: ColumnInfo) =>
      a.data_pk === b.data_pk ? 0 : a.data_pk === 'Y' ? -1 : 1
    )
    store.cacheColumns(tableName, cols)
    return cols
  }

  // ── Load ADDSPEC column metadata (step 2 of onRead) ──────────────────
  async function loadObjectTableDetail(tableName: string): Promise<ColumnInfo[]> {
    try {
      const res: any = await $fetch(`/api/mango-schema/object-table-detail?table=${encodeURIComponent(tableName)}`)
      const rows = res?.data ?? res ?? []
      if (!Array.isArray(rows)) return []
      return rows.map((d: any) => ({
        column_name: d.column_name ?? d.COLUMN_NAME ?? '',
        column_type: d.column_type ?? d.DATA_TYPE ?? '',
        data_type:   d.data_type ?? d.column_type ?? '',
        data_pk:     d.data_pk === 'Y' || d.COLUMN_KEY === 'PRI' ? 'Y' : 'N',
        remark:      d.remark ?? d.COLUMN_COMMENT ?? '',
      }))
    } catch {
      return []
    }
  }

  // ── Load DB schema + merge ADDSPEC remarks ─────────────────────────────
  // loadTableColumns now throws on error (B2+B4), so Promise.all would reject
  // the whole enrichment. loadObjectTableDetail is enrichment-only and
  // stays best-effort — caller still gets columns if ADDSPEC is unreachable.
  async function loadTableColumnsEnriched(tableName: string): Promise<ColumnInfo[]> {
    const [dbCols, addspecCols] = await Promise.all([
      loadTableColumns(tableName),
      loadObjectTableDetail(tableName),  // already swallows errors → []
    ])
    if (!addspecCols.length) return dbCols
    return dbCols.map(dbCol => {
      const ac = addspecCols.find(a => a.column_name === dbCol.column_name)
      return { ...dbCol, remark: dbCol.remark || ac?.remark || '' }
    })
  }

  // ── Load object header + related tables ───────────────────────────────
  async function loadObjectDetail(objectName: string, module = 'Master') {
    try {
      const res: any = await $fetch(
        `/api/mango-schema/object-detail?module=${encodeURIComponent(module)}&object_name=${encodeURIComponent(objectName)}`
      )
      const body = (res?.data && !Array.isArray(res.data) && typeof res.data === 'object')
        ? res.data
        : (res && !Array.isArray(res) && typeof res === 'object' ? res : {})

      const header      = body?.header ?? {}
      const objectTable = Array.isArray(body?.object_table) ? body.object_table : []

      if (import.meta.dev) {
        console.log('[loadObjectDetail]', objectName, '→', objectTable.length, 'tables:', objectTable.map((t: any) => t.table_name))
      }

      return { header, objectTable }
    } catch (e) {
      console.error('[loadObjectDetail] failed for', objectName, e)
      return { header: {}, objectTable: [] }
    }
  }

  // ── Load ALL modules objects (for search) ────────────────────────────
  async function loadAllObjects() {
    const unloaded = store.modules.filter((m: string) => !store.objects[m] && !store.loadingObjs[m])
    if (!unloaded.length) return

    store.searchLoading = true
    try {
      await Promise.all(unloaded.map(async (mod: string) => {
        store.loadingObjs = { ...store.loadingObjs, [mod]: true }
        try {
          const res: any = await $fetch(`/api/mango-schema/objects?module=${encodeURIComponent(mod)}`)
          store.objects = { ...store.objects, [mod]: res?.data ?? [] }
        } catch {
          store.objects = { ...store.objects, [mod]: [] }
        }
        store.loadingObjs = { ...store.loadingObjs, [mod]: false }
      }))
    } finally {
      store.searchLoading = false
    }
  }

  // ── Manual sync (cache bust + re-fetch) ──────────────────────────────
  async function syncNow() {
    store.syncStatus = 'syncing'
    try {
      const res: any = await $fetch('/api/mango-schema/sync', { method: 'POST' })
      // รีเซ็ต objects cache ใน store เพื่อ force re-load จาก server
      store.objects   = {}
      store.modules   = []
      store.columnCache = {}
      store.syncLastAt = new Date(res.syncedAt)
      await loadModules()
      store.syncStatus = res.mangoReachable ? 'ok' : 'stale'
    } catch {
      store.syncStatus = 'error'
    }
  }

  // ── Match helper (searches object_name + remark/display name) ─────────
  function matchesQuery(o: any, q: string): boolean {
    if (!q) return true
    const name     = (o.object_name ?? '').toLowerCase()
    const remark   = (o.remark ?? '').toLowerCase()
    const menuId   = String(o.menu_id ?? '').toLowerCase()
    const menuName = (o.menu_name ?? '').toLowerCase()
    return name.includes(q) || remark.includes(q) || menuId.includes(q) || menuName.includes(q)
  }

  // ── Filtered modules (search-aware) ───────────────────────────────────
  const filteredModules = computed(() => {
    const q = store.search.toLowerCase().trim()
    if (!q) return store.modules
    return store.modules.filter((m: string) => {
      if (m.toLowerCase().includes(q)) return true
      return (store.objects[m] ?? []).some((o: any) => matchesQuery(o, q))
    })
  })

  function filteredObjects(mod: string) {
    const q = store.search.toLowerCase().trim()
    const objs = (store.objects[mod] ?? []).filter((o: any) => o.object_type === 'T')
    return q ? objs.filter((o: any) => matchesQuery(o, q)) : objs
  }

  // ── Display name helper ───────────────────────────────────────────────
  function objDisplayName(obj: any): string {
    const remark = obj?.remark?.trim()
    if (!remark) return obj?.object_name ?? ''
    return remark.split('\n')[0].replace(/^[-–•]\s*/, '').trim() || obj.object_name
  }

  return {
    loadModules, toggleModule, loadAllObjects, syncNow,
    loadTableColumns, loadTableColumnsEnriched, loadObjectDetail,
    filteredModules, filteredObjects, objDisplayName, objectTypeColor,
  }
}
