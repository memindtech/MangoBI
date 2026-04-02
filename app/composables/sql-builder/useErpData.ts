/**
 * SQL Builder — ERP Data Loading
 * Loads modules, objects, and table schemas from ADDSPEC APIs
 * Based on ChartDB: useChartDBData.js
 */
import type { ColumnInfo, ErpObject } from '~/types/sql-builder'
import { useSqlBuilderStore } from '~/stores/sql-builder'

export function useErpData() {
  const { $xt } = useNuxtApp() as any
  const store = useSqlBuilderStore()

  // ── Load module list then immediately load all objects ───────────────
  async function loadModules() {
    store.loadingMods = true
    try {
      const res: any = await $xt.getServer('AnywhereAPI/Master/Addspec_Module_ReadList')
      const seen = new Set<string>()
      store.modules = (res?.data ?? [])
        .map((m: any) => m.module)
        .filter((m: string) => {
          if (seen.has(m)) return false
          seen.add(m)
          return true
        })
    } catch {
      store.modules = []
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
        const res: any = await $xt.getServer(
          `AnywhereAPI/Master/Addspec_Object_ReadList?module=${mod}&text=`
        )
        store.objects = { ...store.objects, [mod]: res?.data ?? [] }
      } catch {
        store.objects = { ...store.objects, [mod]: [] }
      }
      store.loadingObjs = { ...store.loadingObjs, [mod]: false }
    }
  }

  // ── Load table columns (schema) ───────────────────────────────────────
  async function loadTableColumns(tableName: string): Promise<ColumnInfo[]> {
    const cached = store.getCachedColumns(tableName)
    if (cached) return cached

    try {
      const res: any = await $xt.getServer(
        `AnywhereAPI/Master/Addspec_Table_Read?table_name=${tableName}`
      )
      const detail = res?.data?.detail ?? res?.detail ?? []
      const cols: ColumnInfo[] = detail.map((d: any) => ({
        column_name: d.COLUMN_NAME ?? d.column_name ?? '',
        column_type: d.DATA_TYPE ?? d.column_type ?? d.data_type ?? '',
        data_type:   d.data_type ?? d.DATA_TYPE ?? '',
        data_pk:     d.COLUMN_KEY === 'PRI' || d.data_pk === 'Y' ? 'Y' : 'N',
        remark:      d.COLUMN_COMMENT ?? d.remark ?? '',
      })).sort((a: ColumnInfo, b: ColumnInfo) =>
        a.data_pk === b.data_pk ? 0 : a.data_pk === 'Y' ? -1 : 1
      )
      store.cacheColumns(tableName, cols)
      return cols
    } catch {
      return []
    }
  }

  // ── Load ADDSPEC column metadata (step 2 of onRead) ──────────────────
  async function loadObjectTableDetail(tableName: string): Promise<ColumnInfo[]> {
    try {
      const res: any = await $xt.getServer(
        `AnywhereAPI/Master/Addspec_Object_table_detail_Read?table_name=${tableName}`
      )
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
  async function loadTableColumnsEnriched(tableName: string): Promise<ColumnInfo[]> {
    const [dbCols, addspecCols] = await Promise.all([
      loadTableColumns(tableName),
      loadObjectTableDetail(tableName),
    ])
    if (!addspecCols.length) return dbCols
    // DB is authoritative for type + pk; ADDSPEC fills in remark when DB has none
    return dbCols.map(dbCol => {
      const ac = addspecCols.find(a => a.column_name === dbCol.column_name)
      return { ...dbCol, remark: dbCol.remark || ac?.remark || '' }
    })
  }

  // ── Load object header + related tables ───────────────────────────────
  async function loadObjectDetail(objectName: string, module = 'Master') {
    try {
      const res: any = await $xt.getServer(
        `AnywhereAPI/Master/Addspec_Object_Read?module=${encodeURIComponent(module)}&object_name=${encodeURIComponent(objectName)}`
      )
      // Support both { data: { header, object_table } } and { header, object_table } directly
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
          const res: any = await $xt.getServer(
            `AnywhereAPI/Master/Addspec_Object_ReadList?module=${mod}&text=`
          )
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

  // ── Match helper (searches object_name + remark/display name) ─────────
  function matchesQuery(o: any, q: string): boolean {
    if (!q) return true
    const name     = (o.object_name ?? '').toLowerCase()
    const remark   = (o.remark ?? '').toLowerCase()
    const ttype    = (o.t_object_name ?? '').toLowerCase()
    const menuId   = String(o.menu_id ?? '').toLowerCase()
    const menuName = (o.menu_name ?? '').toLowerCase()
    return name.includes(q) || remark.includes(q) || ttype.includes(q)
      || menuId.includes(q) || menuName.includes(q)
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

  function objectTypeColor(type: string): string {
    return ({
      T:  'bg-blue-500/20 text-blue-600',
      V:  'bg-purple-500/20 text-purple-600',
      FN: 'bg-teal-500/20 text-teal-600',
      R:  'bg-orange-500/20 text-orange-600',
      SP: 'bg-rose-500/20 text-rose-600',
    } as Record<string, string>)[type] ?? 'bg-muted text-muted-foreground'
  }

  return {
    loadModules, toggleModule, loadAllObjects,
    loadTableColumns, loadTableColumnsEnriched, loadObjectDetail,
    filteredModules, filteredObjects, objDisplayName, objectTypeColor,
  }
}
