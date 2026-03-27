/**
 * Composable for MangoBI save / load / delete via Planning backend.
 * Routes: Planning/MangoBI/<action>
 */

const BASE        = 'Planning/MangoBI'
const BASE_PUBLIC = 'Planning/Public'

export interface BIListItem {
  id:        string
  name:      string
  createdBy: string
  createdAt: string
  updatedAt: string | null
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

  async function loadReport(id: string): Promise<any> {
    const res: any = await $xt.getServer(`${BASE}/GetReport?id=${id}`)
    return res?.data ?? null
  }

  async function saveReport(payload: {
    id?:         string
    name:        string
    widgetsJson: string
  }): Promise<string | null> {
    const res: any = await $xt.postServerJson(`${BASE}/SaveReport`, payload)
    return res?.data?.id ?? res?.id ?? null
  }

  async function deleteReport(id: string): Promise<boolean> {
    const res: any = await $xt.postServerJson(`${BASE}/DeleteReport?id=${id}`, {})
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
    id?:       string
    name:      string
    nodesJson: string
    edgesJson: string
    sqlText:   string
  }): Promise<string | null> {
    const res: any = await $xt.postServerJson(`${BASE}/SaveSQLBuilder`, payload)
    return res?.data?.id ?? res?.id ?? null
  }

  async function deleteSQLBuilder(id: string): Promise<boolean> {
    const res: any = await $xt.postServerJson(`${BASE}/DeleteSQLBuilder?id=${id}`, {})
    return res?.data?.deleted === true
  }

  return {
    loadPublicReport,
    listReports, loadReport, saveReport, deleteReport,
    listDataModels, loadDataModel, saveDataModel, deleteDataModel,
    listSQLBuilders, loadSQLBuilder, saveSQLBuilder, deleteSQLBuilder,
  }
}
