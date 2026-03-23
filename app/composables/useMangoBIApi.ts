/**
 * Composable for MangoBI save / load / delete via Planning backend.
 * Routes: Planning/MangoBI/<action>
 */

const BASE = 'Planning/MangoBI'

export interface BIListItem {
  id:        string
  name:      string
  createdBy: string
  createdAt: string
  updatedAt: string | null
}

export function useMangoBIApi() {
  const { $xt } = useNuxtApp() as any

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

  return {
    listReports, loadReport, saveReport, deleteReport,
    listDataModels, loadDataModel, saveDataModel, deleteDataModel,
  }
}
