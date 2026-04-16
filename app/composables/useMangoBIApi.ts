/**
 * Composable for MangoBI save / load / delete via main backend.
 * Routes: MangoBI/<action>
 */

const BASE        = 'Planning/MangoBI'
const BASE_PUBLIC = 'Planning/Public'

// Module-level cache — shared across all composable instances within the same session.
// Stores fetched report/datamodel/sqlbuilder data keyed by id.
// In-flight map deduplicates concurrent requests for the same id.
const _reportCache   = new Map<string, any>()
const _reportFlight  = new Map<string, Promise<any>>()

function invalidateReport(id: string): void {
  _reportCache.delete(id)
  _reportFlight.delete(id)
}

export interface BIListItem {
  id:            string
  name:          string
  createdBy:     string
  createdAt:     string
  updatedAt:     string | null
  columnMapping?: string   // JSON: ColumnMapEntry[]
  isPublic?:     boolean
}

export interface ColumnMapEntry {
  columnName:    string
  dataType:      string
  newColumnName: string
}

export function useMangoBIApi() {
  const { $xt } = useNuxtApp() as any
  const config  = useRuntimeConfig()

  // ── Public (no-auth, no-redirect) ─────────────────────────────────────────

  /** Load a report via the public endpoint — no login required, no 401 redirect. */
  async function loadPublicReport(id: string): Promise<any> {
    try {
      const res: any = await $fetch(
        `${config.public.planningBase}${BASE_PUBLIC}/GetPublicReport?id=${id}`,
        { method: 'GET' },
      )
      return res?.data ?? null
    } catch {
      return null
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────

  async function listReports(): Promise<BIListItem[]> {
    const res: any = await $xt.getServer(`${BASE}/GetReports`)
    return res?.data ?? []
  }

  async function loadReport(id: string, bustCache = false): Promise<any> {
    if (!bustCache && _reportCache.has(id)) return _reportCache.get(id)
    // Deduplicate concurrent fetches for the same id
    if (!bustCache && _reportFlight.has(id)) return _reportFlight.get(id)
    const promise = $xt.getServer(`${BASE}/GetReport?id=${id}`)
      .then((res: any) => {
        const data = res?.data ?? null
        if (data) _reportCache.set(id, data)
        _reportFlight.delete(id)
        return data
      })
      .catch((err: any) => { _reportFlight.delete(id); throw err })
    _reportFlight.set(id, promise)
    return promise
  }

  /** Call on hover to warm the cache before the user clicks. */
  function prefetchReport(id: string): void {
    if (_reportCache.has(id) || _reportFlight.has(id)) return
    loadReport(id).catch(() => {})
  }

  async function saveReport(payload: {
    id?:         string
    name:        string
    widgetsJson: string
  }): Promise<string | null> {
    const res: any = await $xt.postServerJson(`${BASE}/SaveReport`, payload)
    const savedId  = res?.data?.id ?? res?.id ?? null
    if (savedId) invalidateReport(savedId)
    return savedId
  }

  async function deleteReport(id: string): Promise<boolean> {
    const res: any = await $xt.postServerJson(`${BASE}/DeleteReport?id=${id}`, {})
    if (res?.data?.deleted === true) invalidateReport(id)
    return res?.data?.deleted === true
  }

  // ── DataModel ─────────────────────────────────────────────────────────────

  async function listDataModels(): Promise<BIListItem[]> {
    const res: any = await $xt.getServer(`${BASE}/GetDataModels`)
    return res?.data ?? []
  }

  async function loadDataModel(id: string): Promise<any> {
    const res: any = await $xt.getServer(`${BASE}/GetDataModel?id=${id}`)
    return res?.data ?? null
  }

  async function saveDataModel(payload: {
    id?:           string
    name:          string
    nodesJson:     string
    relationsJson: string
  }): Promise<string | null> {
    const res: any = await $xt.postServerJson(`${BASE}/SaveDataModel`, payload)
    return res?.data?.id ?? res?.id ?? null
  }

  async function deleteDataModel(id: string): Promise<boolean> {
    const res: any = await $xt.postServerJson(`${BASE}/DeleteDataModel?id=${id}`, {})
    return res?.data?.deleted === true
  }

  // ── SQL Builder ───────────────────────────────────────────────────────────

  async function listSQLBuilders(): Promise<BIListItem[]> {
    const res: any = await $xt.getServer(`${BASE}/GetSQLBuilders`)
    return res?.data ?? []
  }

  async function loadSQLBuilder(id: string): Promise<any> {
    const res: any = await $xt.getServer(`${BASE}/GetSQLBuilder?id=${id}`)
    return res?.data ?? null
  }

  async function saveSQLBuilder(payload: {
    id?:           string
    name:          string
    nodesJson:     string
    edgesJson:     string
    sqlText:       string
    columnMapping?: string   // JSON: ColumnMapEntry[]
  }): Promise<string | null> {
    const res: any = await $xt.postServerJson(`${BASE}/SaveSQLBuilder`, payload)
    return res?.data?.id ?? res?.id ?? null
  }

  async function deleteSQLBuilder(id: string): Promise<boolean> {
    const res: any = await $xt.postServerJson(`${BASE}/DeleteSQLBuilder?id=${id}`, {})
    return res?.data?.deleted === true
  }

  // ── System ────────────────────────────────────────────────────────────────

  async function updateStructure(
    columnMappings?: ColumnMapEntry[],
  ): Promise<{ messages: string[] } | null> {
    const body = columnMappings?.length ? { columnMappings } : {}
    const res: any = await $xt.postServerJson(`${BASE}/UpdateStructure`, body)
    return res?.data ?? null
  }

  return {
    loadPublicReport,
    listReports, loadReport, saveReport, deleteReport,
    prefetchReport, invalidateReport,
    listDataModels, loadDataModel, saveDataModel, deleteDataModel,
    listSQLBuilders, loadSQLBuilder, saveSQLBuilder, deleteSQLBuilder,
    updateStructure,
  }
}
