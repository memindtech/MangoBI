<script setup lang="ts">
import { markRaw } from 'vue'
import { VueFlow, useVueFlow, type Node, type Edge, type Connection } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls }   from '@vue-flow/controls'
import '@vue-flow/controls/dist/style.css'
import {
  Database, Download, Loader2, AlertCircle,
  GitMerge, ArrowLeft, Trash2, Link2, X, Table2, Search, ArrowRight,
} from 'lucide-vue-next'
import ModelTableNode from '~/components/datamodel/ModelTableNode.vue'
import { MOCK_DATA, DATASET_META, type DatasetKey } from '~/stores/canvas'
import { AgGridVue } from 'ag-grid-vue3'
import { ClientSideRowModelModule, CommunityFeaturesModule, ModuleRegistry } from 'ag-grid-community'
import type { ColDef } from 'ag-grid-community'
import { parseColumnMapping } from '~/utils/columnMapping'

ModuleRegistry.registerModules([ClientSideRowModelModule, CommunityFeaturesModule])

// ─── Page meta ────────────────────────────────────────────────────────────────
definePageMeta({ layout: false, auth: true })

// ─── Stores / Router ──────────────────────────────────────────────────────────
const dmStore     = useDataModelStore()
const reportStore = useReportStore()
const router      = useRouter()
const { $xt } = useNuxtApp() as any

// ─── Vue Flow ─────────────────────────────────────────────────────────────────
const {
  addEdges, removeEdges,
  onConnect, onNodeClick, onEdgeClick, onPaneClick,
  onNodesChange, onEdgesChange,
  screenToFlowCoordinate,
} = useVueFlow({ id: 'data-model' })

const nodeTypes = { modelTable: markRaw(ModelTableNode) }

const nodes = ref<Node[]>([])
const edges = ref<Edge[]>([])

// ─── Selected relationship ────────────────────────────────────────────────────
const selectedEdgeId = ref<string | null>(null)
const selectedEdge   = computed(() => selectedEdgeId.value ? dmStore.relations[selectedEdgeId.value] : null)

// ─── Selected node (data preview) ─────────────────────────────────────────────
const selectedNodeId   = ref<string | null>(null)
const selectedNodeData = computed(() => selectedNodeId.value ? dmStore.getTable(selectedNodeId.value) : null)
const nodePreviewCols  = computed(() => selectedNodeId.value ? dmStore.columnsOf(selectedNodeId.value) : [])
const nodeSearchQuery  = ref('')

const colorMode = useColorMode()
const isDark     = computed(() => colorMode.value === 'dark')
const themeClass = computed(() => isDark.value ? 'ag-theme-quartz-dark' : 'ag-theme-quartz')

const nodePreviewColDefs = computed<ColDef[]>(() =>
  nodePreviewCols.value.map(col => ({
    field: col.name,
    headerName: col.label,
    sortable: true,
    resizable: true,
    filter: false,
    minWidth: 72,
    flex: 1,
    cellStyle: col.type === 'number' ? { textAlign: 'right', fontFamily: 'monospace' } : {},
    valueFormatter: (p: any) =>
      p.value === null || p.value === undefined ? '—' : String(p.value),
  }))
)

const nodePreviewRowData = computed(() => selectedNodeData.value?.rows ?? [])

const sampleJoinColDefs = computed<ColDef[]>(() =>
  (sampleJoin.value?.headers ?? []).map(h => ({
    field: h,
    headerName: h,
    sortable: false,
    resizable: true,
    filter: false,
    minWidth: 52,
    flex: 1,
    cellStyle: { fontSize: '9px', fontFamily: 'monospace' },
    valueFormatter: (p: any) =>
      p.value === null || p.value === undefined ? '—' : String(p.value),
  }))
)

// Column options for each side of selected edge
const fromCols = computed(() => selectedEdge.value ? dmStore.columnsOf(selectedEdge.value.fromTable) : [])
const toCols   = computed(() => selectedEdge.value ? dmStore.columnsOf(selectedEdge.value.toTable)   : [])

// Searchable column picker state
const fromColSearch = ref('')
const toColSearch   = ref('')
const fromColOpen   = ref(false)
const toColOpen     = ref(false)

const filteredFromCols = computed(() => {
  const q = fromColSearch.value.toLowerCase()
  return q
    ? fromCols.value.filter(c => c.name.toLowerCase().includes(q) || c.label.toLowerCase().includes(q))
    : fromCols.value
})
const filteredToCols = computed(() => {
  const q = toColSearch.value.toLowerCase()
  return q
    ? toCols.value.filter(c => c.name.toLowerCase().includes(q) || c.label.toLowerCase().includes(q))
    : toCols.value
})

// helper: แปลง column name → label สำหรับแสดงผล
function colLabel(tableId: string, colName: string): string {
  return dmStore.columnsOf(tableId).find(c => c.name === colName)?.label ?? colName
}

function selectFromCol(name: string) {
  updateRelation('fromColumn', name)
  fromColSearch.value = ''
  fromColOpen.value   = false
}
function selectToCol(name: string) {
  updateRelation('toColumn', name)
  toColSearch.value = ''
  toColOpen.value   = false
}

watch(selectedEdgeId, () => {
  fromColSearch.value = ''; toColSearch.value = ''
  fromColOpen.value   = false; toColOpen.value = false
})

// ─── Add Table panel ─────────────────────────────────────────────────────────
const showAddPanel  = ref(false)
const addMode       = ref<'mock' | 'sql'>('mock')
const customName    = ref('')
const selectedKey   = ref<DatasetKey>('sales_monthly')
const loading       = ref(false)
const errorMsg      = ref('')

const datasetOptions = Object.entries(DATASET_META).map(([key, m]) => ({
  key: key as DatasetKey, label: m.label,
}))

// SQL Template mode
const sqlPasscode        = ref('')
const sqlTemplates       = ref<{ template_id: number; template_name: string }[]>([])
const selectedTemplateId = ref<number | null>(null)
const sqlTemplatesLoaded = ref(false)
const sqlLoading         = ref(false)

async function fetchSqlTemplates() {
  if (!sqlPasscode.value.trim()) return
  sqlTemplatesLoaded.value = false
  sqlTemplates.value       = []
  selectedTemplateId.value = null
  sqlLoading.value         = true
  try {
    const res: any = await $xt.getServer(
      `Planning/Master/GetSqlFlowTemplate?passcode=${encodeURIComponent(sqlPasscode.value.trim())}`,
    )
    sqlTemplates.value = Array.isArray(res?.data) ? res.data : []
    if (sqlTemplates.value.length) selectedTemplateId.value = sqlTemplates.value[0].template_id
  } catch {
    sqlTemplates.value = []
  } finally {
    sqlLoading.value         = false
    sqlTemplatesLoaded.value = true
  }
}

watch(addMode, (m) => { if (m === 'sql') { sqlTemplatesLoaded.value = false; sqlTemplates.value = [] } })

// ─── Helpers ─────────────────────────────────────────────────────────────────
function extractSqlPayload(res: any): { rows: any[]; column_mapping_json?: any } | null {
  if (!res) return null
  const inner = res?.data ?? res
  const rows = Array.isArray(inner?.data)   ? inner.data
             : Array.isArray(inner?.rows)   ? inner.rows
             : Array.isArray(inner?.result) ? inner.result
             : Array.isArray(inner?.list)   ? inner.list
             : Array.isArray(inner?.items)  ? inner.items
             : Array.isArray(inner)         ? inner
             : null
  if (!rows) return null
  return { rows, column_mapping_json: inner?.column_mapping_json }
}

let _xOffset = 0
function placeTableNode(id: string, name: string, rows: any[], columnLabels?: ReturnType<typeof parseColumnMapping>) {
  dmStore.addTable({ id, name, rows, columnLabels })
  const pos = screenToFlowCoordinate({
    x: window.innerWidth  / 2 - 90 + _xOffset,
    y: window.innerHeight / 2 - 60,
  })
  _xOffset = (_xOffset + 240) % 720
  nodes.value.push({ id, type: 'modelTable', position: pos, data: {} })
}

// ─── Add from Mock ────────────────────────────────────────────────────────────
function addMockTable() {
  const name = customName.value.trim() || DATASET_META[selectedKey.value].label
  placeTableNode(`${selectedKey.value}_${Date.now()}`, name, MOCK_DATA[selectedKey.value])
  showAddPanel.value = false
  customName.value   = ''
}

// ─── Add from SQL Template ────────────────────────────────────────────────────
async function addSQLTable() {
  if (!selectedTemplateId.value) { errorMsg.value = 'กรุณาเลือก Template'; return }
  loading.value  = true
  errorMsg.value = ''
  try {
    const res: any = await $xt.getServer(
      `Planning/Master/ExecuteSqlFlowTemplate?template_id=${selectedTemplateId.value}&passcode=${encodeURIComponent(sqlPasscode.value.trim())}`,
    )
    if (res?.error) throw new Error(res.error)
    const payload = extractSqlPayload(res)
    if (!payload?.rows) throw new Error('ไม่พบข้อมูล')
    const tmpl    = sqlTemplates.value.find(t => t.template_id === selectedTemplateId.value)
    const name    = customName.value.trim() || tmpl?.template_name || `Template ${selectedTemplateId.value}`
    placeTableNode(`sql_${Date.now()}`, name, payload.rows, parseColumnMapping(payload.column_mapping_json))
    showAddPanel.value = false
    customName.value   = ''
  } catch (e: any) {
    errorMsg.value = e?.message ?? 'เกิดข้อผิดพลาด'
  } finally {
    loading.value = false
  }
}

// ─── Connection ───────────────────────────────────────────────────────────────
onConnect((conn: Connection) => {
  const edgeId = `rel_${conn.source}__${conn.target}_${Date.now()}`

  // Default: use first column of each table
  const fromCols = dmStore.columnsOf(conn.source)
  const toCols   = dmStore.columnsOf(conn.target)
  const fromCol  = fromCols[0]?.name ?? ''
  const toCol    = toCols[0]?.name   ?? ''

  addEdges([{
    id:           edgeId,
    source:       conn.source,
    target:       conn.target,
    type:         'smoothstep',
    animated:     true,
    label:        '1:*',
    style:        { stroke: '#6366f1', strokeWidth: 2 },
    labelStyle:   { fill: '#6366f1', fontWeight: 700, fontSize: 11 },
    labelBgStyle: { fill: 'white', fillOpacity: 0.9 },
    labelBgPadding: [4, 2] as [number, number],
  }])

  dmStore.setRelation(edgeId, {
    fromTable:   conn.source,
    fromColumn:  fromCol,
    toTable:     conn.target,
    toColumn:    toCol,
    joinType:    'inner',
    cardinality: '1:*',
  })

  // Auto-open relationship editor
  selectedEdgeId.value = edgeId
})

// ─── Click handlers ───────────────────────────────────────────────────────────
onEdgeClick(({ edge })  => { selectedEdgeId.value = edge.id;   selectedNodeId.value = null })
onNodeClick(({ node }) => { selectedNodeId.value  = node.id;  selectedEdgeId.value = null; nodeSearchQuery.value = '' })
onPaneClick(()          => { selectedEdgeId.value = null;     selectedNodeId.value = null })

// ─── Sync deletions → store (listen to specific remove events only) ───────────
onNodesChange((changes) => {
  for (const c of changes) {
    if (c.type === 'remove') dmStore.removeTable(c.id)
  }
})

onEdgesChange((changes) => {
  for (const c of changes) {
    if (c.type === 'remove') {
      dmStore.removeRelation(c.id)
      if (selectedEdgeId.value === c.id) selectedEdgeId.value = null
    }
  }
})

// ─── Relation editor ──────────────────────────────────────────────────────────
function updateRelation(field: string, value: string) {
  if (!selectedEdgeId.value || !selectedEdge.value) return
  dmStore.setRelation(selectedEdgeId.value, { ...selectedEdge.value, [field]: value } as any)
  // sync cardinality label on edge
  if (field === 'cardinality') {
    const idx = edges.value.findIndex(e => e.id === selectedEdgeId.value)
    if (idx !== -1) edges.value[idx] = { ...edges.value[idx], label: value }
  }
}

function deleteSelectedRelation() {
  if (!selectedEdgeId.value) return
  removeEdges([selectedEdgeId.value])
  dmStore.removeRelation(selectedEdgeId.value)
  selectedEdgeId.value = null
}

// ─── Stats ────────────────────────────────────────────────────────────────────
const tableCount    = computed(() => dmStore.tables.length)
const relationCount = computed(() => Object.keys(dmStore.relations).length)

// ─── Export readiness ─────────────────────────────────────────────────────────
const exportStatus = computed(() => {
  if (!dmStore.tables.length)
    return { ready: false, reason: 'ยังไม่มีตาราง' }
  const rels = Object.values(dmStore.relations)
  const incomplete = rels.filter(r => !r.fromColumn || !r.toColumn)
  if (incomplete.length)
    return { ready: false, reason: `Relation ยังเลือก Column ไม่ครบ ${incomplete.length} รายการ` }
  return { ready: true, reason: '' }
})

// ─── Build joined datasets from all tables + relations ────────────────────────
// Hard cap per joined dataset to avoid browser OOM
const MAX_JOIN_ROWS   = 50_000
// Cap source table rows fed into a join step (prevents n×m explosion)
const MAX_SOURCE_ROWS = 10_000

const exportWarning = ref('')

function joinStep(
  rows: any[], rel: ReturnType<typeof dmStore.getTable> extends undefined ? never : any,
  toRows: any[], cap: number,
): { result: any[]; truncated: boolean } {
  const existingKeys = rows.length   ? Object.keys(rows[0])   : []
  const toKeys       = toRows.length ? Object.keys(toRows[0]) : []

  const keyMap: Record<string, string> = {}
  for (const k of toKeys) keyMap[k] = existingKeys.includes(k) ? `${rel.toTable}_${k}` : k

  const result: any[] = []
  let truncated = false

  if (rel.joinType === 'right') {
    const fromIndex = new Map<string, any[]>()
    for (const row of rows) {
      const key = String(row[rel.fromColumn] ?? '')
      if (!fromIndex.has(key)) fromIndex.set(key, [])
      fromIndex.get(key)!.push(row)
    }
    outer: for (const toRow of toRows) {
      for (const fromRow of (fromIndex.get(String(toRow[rel.toColumn] ?? '')) ?? [null])) {
        if (result.length >= cap) { truncated = true; break outer }
        const merged: any = {}
        for (const k of existingKeys) merged[k] = fromRow ? fromRow[k] : null
        for (const [k, mk] of Object.entries(keyMap)) merged[mk] = toRow[k]
        result.push(merged)
      }
    }
  } else {
    const toIndex = new Map<string, any[]>()
    for (const row of toRows) {
      const key = String(row[rel.toColumn] ?? '')
      if (!toIndex.has(key)) toIndex.set(key, [])
      toIndex.get(key)!.push(row)
    }
    outer: for (const fromRow of rows) {
      const matches = toIndex.get(String(fromRow[rel.fromColumn] ?? ''))
      if (matches?.length) {
        for (const toRow of matches) {
          if (result.length >= cap) { truncated = true; break outer }
          const merged: any = { ...fromRow }
          for (const [k, mk] of Object.entries(keyMap)) merged[mk] = toRow[k]
          result.push(merged)
        }
      } else if (rel.joinType === 'left') {
        if (result.length >= cap) { truncated = true; break outer }
        const merged: any = { ...fromRow }
        for (const mk of Object.values(keyMap)) merged[mk] = null
        result.push(merged)
      }
    }
  }

  return { result, truncated }
}

function buildJoinedDatasets(): { id: string; name: string; rows: any[] }[] {
  const tables = dmStore.tables
  if (!tables.length) return []

  const rels = Object.values(dmStore.relations)

  // No relations → each table becomes its own dataset (share reference, no copy)
  if (!rels.length) {
    return tables.map(t => ({ id: `dm_${t.id}_${Date.now()}`, name: t.name, rows: t.rows, columnLabels: t.columnLabels }))
  }

  // Build undirected adjacency for connected-component detection
  const adj = new Map<string, Set<string>>()
  for (const t of tables) adj.set(t.id, new Set())
  for (const r of rels) {
    adj.get(r.fromTable)?.add(r.toTable)
    adj.get(r.toTable)?.add(r.fromTable)
  }

  // BFS connected components
  const visited = new Set<string>()
  const components: string[][] = []
  for (const t of tables) {
    if (visited.has(t.id)) continue
    const comp: string[] = []
    const q = [t.id]
    while (q.length) {
      const id = q.shift()!
      if (visited.has(id)) continue
      visited.add(id); comp.push(id)
      for (const nb of adj.get(id) ?? []) if (!visited.has(nb)) q.push(nb)
    }
    components.push(comp)
  }

  const datasets: { id: string; name: string; rows: any[]; columnLabels?: ReturnType<typeof parseColumnMapping> }[] = []
  let anyTruncated = false

  for (const comp of components) {
    const compRels = rels.filter(r => comp.includes(r.fromTable) && comp.includes(r.toTable))

    // รวม columnLabels จากทุกตารางใน component
    const mergedLabels: ReturnType<typeof parseColumnMapping> = {}
    for (const tableId of comp) {
      const t = dmStore.getTable(tableId)
      if (t?.columnLabels) Object.assign(mergedLabels, t.columnLabels)
    }
    const columnLabels = Object.keys(mergedLabels).length ? mergedLabels : undefined

    if (!compRels.length) {
      const t = dmStore.getTable(comp[0])!
      datasets.push({ id: `dm_${t.id}_${Date.now()}`, name: t.name, rows: t.rows, columnLabels })
      continue
    }

    // Slice source table to MAX_SOURCE_ROWS before first join step
    let rows: any[] = (dmStore.getTable(compRels[0].fromTable)?.rows ?? []).slice(0, MAX_SOURCE_ROWS)
    const joined = new Set([compRels[0].fromTable])

    for (const rel of compRels) {
      if (joined.has(rel.toTable)) continue
      joined.add(rel.toTable)

      const toRows = (dmStore.getTable(rel.toTable)?.rows ?? []).slice(0, MAX_SOURCE_ROWS)
      const { result, truncated } = joinStep(rows, rel, toRows, MAX_JOIN_ROWS)
      if (truncated) anyTruncated = true
      rows = result
    }

    const name = comp.map(id => dmStore.getTable(id)?.name ?? id).join(' + ')
    datasets.push({ id: `dm_joined_${Date.now()}_${Math.random().toString(36).slice(2)}`, name, rows, columnLabels })
  }

  exportWarning.value = anyTruncated
    ? `ข้อมูลถูกตัดให้เหลือสูงสุด ${MAX_JOIN_ROWS.toLocaleString()} แถวต่อ dataset เพื่อป้องกัน memory เกิน`
    : ''

  return datasets
}

function exportToReport() {
  exportWarning.value = ''
  const datasets = buildJoinedDatasets()
  reportStore.resetAll()
  for (const ds of datasets) reportStore.addDataset(ds)
  router.push('/report')
}

// ─── Join preview ─────────────────────────────────────────────────────────────
const SAMPLE_LIMIT = 10

type JoinRow = Record<string, any>

function buildIndex(rows: JoinRow[], col: string): Map<string, JoinRow[]> {
  const idx = new Map<string, JoinRow[]>()
  for (const row of rows) {
    const key = String(row[col] ?? '')
    if (!idx.has(key)) idx.set(key, [])
    idx.get(key)!.push(row)
  }
  return idx
}

function mergeRow(fromRow: JoinRow | null, toRow: JoinRow, fromCols: string[], toColsRaw: string[], toColNames: string[]): JoinRow {
  const r: JoinRow = {}
  for (const c of fromCols) r[c] = fromRow ? fromRow[c] : null
  toColsRaw.forEach((c, i) => { r[toColNames[i]] = toRow[c] })
  return r
}

function rightJoin(fromRows: JoinRow[], toRows: JoinRow[], fromCol: string, toCol: string, p: JoinParams): JoinRow[] {
  const fromIndex = buildIndex(fromRows, fromCol)
  const joined: JoinRow[] = []
  for (const toRow of toRows) {
    if (joined.length >= SAMPLE_LIMIT) break
    for (const fromRow of (fromIndex.get(String(toRow[toCol] ?? '')) ?? [null])) {
      if (joined.length >= SAMPLE_LIMIT) break
      joined.push(mergeRow(fromRow, toRow, p.fromCols, p.toColsRaw, p.toColNames))
    }
  }
  return joined
}

function nullFillRow(fromRow: JoinRow, fromCols: string[], toColNames: string[]): JoinRow {
  const r: JoinRow = {}
  for (const c of fromCols) r[c] = fromRow[c]
  for (const c of toColNames) r[c] = null
  return r
}

interface JoinParams { fromCols: string[]; toColsRaw: string[]; toColNames: string[] }

function innerLeftJoin(fromRows: JoinRow[], toRows: JoinRow[], fromCol: string, toCol: string, isLeft: boolean, p: JoinParams): JoinRow[] {
  const toIndex = buildIndex(toRows, toCol)
  const joined: JoinRow[] = []
  for (const fromRow of fromRows) {
    if (joined.length >= SAMPLE_LIMIT) break
    const matches = toIndex.get(String(fromRow[fromCol] ?? ''))
    if (matches?.length) {
      for (const toRow of matches) {
        if (joined.length >= SAMPLE_LIMIT) break
        joined.push(mergeRow(fromRow, toRow, p.fromCols, p.toColsRaw, p.toColNames))
      }
    } else if (isLeft) {
      joined.push(nullFillRow(fromRow, p.fromCols, p.toColNames))
    }
  }
  return joined
}

const sampleJoin = computed(() => {
  const rel = selectedEdge.value
  if (!rel) return null

  const fromRows = (dmStore.getTable(rel.fromTable)?.rows ?? []).slice(0, 500)
  const toRows   = (dmStore.getTable(rel.toTable)?.rows   ?? []).slice(0, 500)
  if (!fromRows.length || !toRows.length) return null

  const fromCols  = Object.keys(fromRows[0])
  const toColsRaw = Object.keys(toRows[0])
  const toColNames = toColsRaw.map(c => fromCols.includes(c) ? `${c}_2` : c)
  const headers    = [...fromCols, ...toColNames]
  const p: JoinParams = { fromCols, toColsRaw, toColNames }

  const rows = rel.joinType === 'right'
    ? rightJoin(fromRows, toRows, rel.fromColumn, rel.toColumn, p)
    : innerLeftJoin(fromRows, toRows, rel.fromColumn, rel.toColumn, rel.joinType === 'left', p)

  return { headers, rows }
})
</script>

<template>
  <div class="fixed inset-0 flex flex-col bg-background">

    <!-- ── Header ─────────────────────────────────────────────────────────── -->
    <header class="flex items-center gap-3 px-4 h-12 border-b shrink-0 bg-background z-20">
      <button
        @click="router.back()"
        class="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft class="size-4" />
        Back
      </button>
      <div class="h-4 w-px bg-border" />
      <GitMerge class="size-4 text-indigo-500" />
      <span class="font-semibold text-sm">Data Model</span>

      <div class="ml-auto flex items-center gap-3">
        <span class="text-xs text-muted-foreground">
          {{ tableCount }} ตาราง · {{ relationCount }} ความสัมพันธ์
        </span>
        <button
          @click="showAddPanel = !showAddPanel"
          class="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600
                 text-white rounded-lg font-medium transition-colors"
        >
          <Database class="size-3.5" />
          + เพิ่มตาราง
        </button>

        <!-- Export to Report -->
        <div class="flex items-center gap-2 border-l pl-3">
          <span
            v-if="!exportStatus.ready"
            class="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 max-w-[160px]"
            :title="exportStatus.reason"
          >
            <AlertCircle class="size-3 shrink-0" />
            <span class="truncate">{{ exportStatus.reason }}</span>
          </span>
          <button
            @click="exportToReport"
            :disabled="!exportStatus.ready"
            :title="exportStatus.ready ? 'ส่งข้อมูลไปใช้งานใน Report Builder' : exportStatus.reason"
            class="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors
                   bg-emerald-500 hover:bg-emerald-600 text-white
                   disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowRight class="size-3.5" />
            ใช้งานใน Report
          </button>
        </div>
      </div>
    </header>

    <!-- ── Truncation warning ─────────────────────────────────────────────── -->
    <Transition name="fade">
      <div
        v-if="exportWarning"
        class="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/30
               border-b border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 shrink-0 z-10"
      >
        <AlertCircle class="size-3.5 shrink-0" />
        <span class="text-[11px] flex-1">{{ exportWarning }}</span>
        <button @click="exportWarning = ''" class="text-amber-500 hover:text-amber-700">
          <X class="size-3.5" />
        </button>
      </div>
    </Transition>

    <!-- ── Body ───────────────────────────────────────────────────────────── -->
    <div class="flex overflow-hidden" style="height: calc(100vh - 3rem)">

      <!-- Add Table Panel -->
      <Transition name="slide-left">
        <aside
          v-if="showAddPanel"
          aria-label="เพิ่มตาราง"
          class="w-64 border-r bg-background z-10 flex flex-col overflow-y-auto shrink-0 shadow-lg"
        >
          <div class="p-3 border-b flex items-center justify-between shrink-0">
            <span class="text-xs font-semibold">เพิ่มตาราง</span>
            <button @click="showAddPanel = false" class="text-muted-foreground hover:text-foreground">
              <X class="size-4" />
            </button>
          </div>

          <!-- Mode tabs -->
          <div class="flex border-b text-[10px] shrink-0">
            <button
              v-for="[m, label] in ([['mock','📦 Demo'],['sql','🗄️ SQL']] as const)"
              :key="m"
              @click="addMode = m; errorMsg = ''"
              :class="[
                'flex-1 py-1.5 font-semibold transition-colors',
                addMode === m ? 'bg-indigo-500 text-white' : 'text-muted-foreground hover:bg-accent',
              ]"
            >{{ label }}</button>
          </div>

          <div class="p-3 flex flex-col gap-3">
            <!-- Custom name -->
            <div>
              <p class="text-[10px] font-semibold text-muted-foreground mb-1">ชื่อตาราง (ไม่บังคับ)</p>
              <input
                v-model="customName"
                placeholder="ชื่อที่แสดง..."
                class="w-full text-xs border rounded-lg px-2 py-1.5 bg-background
                       focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>

            <!-- Mock mode -->
            <template v-if="addMode === 'mock'">
              <div>
                <p class="text-[10px] font-semibold text-muted-foreground mb-1">ชุดข้อมูล</p>
                <select
                  v-model="selectedKey"
                  class="w-full text-xs border rounded-lg px-2 py-1.5 bg-background
                         focus:outline-none focus:ring-1 focus:ring-indigo-400"
                >
                  <option v-for="ds in datasetOptions" :key="ds.key" :value="ds.key">
                    {{ ds.label }}
                  </option>
                </select>
              </div>
              <button
                @click="addMockTable"
                class="w-full text-xs py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium transition-colors"
              >
                + เพิ่มตาราง
              </button>
            </template>

            <!-- SQL Template mode -->
            <template v-else>
              <!-- Passcode -->
              <div>
                <p class="text-[10px] font-semibold text-muted-foreground mb-1">Passcode</p>
                <div class="flex gap-1.5">
                  <input
                    v-model="sqlPasscode"
                    type="text"
                    placeholder="กรอก passcode..."
                    class="flex-1 text-xs border rounded-lg px-2 py-1.5 bg-background
                           focus:outline-none focus:ring-1 focus:ring-indigo-400 min-w-0
                           font-mono tracking-wider"
                    @keydown.enter.stop="fetchSqlTemplates"
                  />
                  <button
                    @click="fetchSqlTemplates"
                    :disabled="sqlLoading"
                    class="px-2.5 text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-900/40
                           text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700
                           rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-800/50 transition-colors
                           disabled:opacity-60 shrink-0"
                  >
                    <Loader2 v-if="sqlLoading" class="size-3 animate-spin" />
                    <span v-else>ค้นหา</span>
                  </button>
                </div>
              </div>

              <!-- Template list -->
              <template v-if="sqlTemplatesLoaded">
                <div v-if="sqlTemplates.length" class="space-y-1.5">
                  <div class="flex items-center justify-between">
                    <p class="text-[10px] font-semibold text-muted-foreground">Template</p>
                    <span class="text-[10px] text-indigo-500">{{ sqlTemplates.length }} รายการ</span>
                  </div>
                  <select
                    v-model="selectedTemplateId"
                    class="w-full text-xs border rounded-lg px-2 py-1.5 bg-background
                           focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  >
                    <option v-for="t in sqlTemplates" :key="t.template_id" :value="t.template_id">
                      {{ t.template_name }}
                    </option>
                  </select>
                </div>
                <div
                  v-else
                  class="flex items-center justify-center gap-1.5 py-2 text-[10px] text-muted-foreground border border-dashed rounded-lg"
                >
                  ไม่พบ Template สำหรับ passcode นี้
                </div>
              </template>

              <div
                v-if="errorMsg"
                class="flex items-start gap-1.5 text-[10px] text-destructive bg-destructive/10 rounded-lg px-2 py-1.5"
              >
                <AlertCircle class="size-3 shrink-0 mt-0.5" />
                <span class="break-all">{{ errorMsg }}</span>
              </div>

              <button
                v-if="sqlTemplatesLoaded && sqlTemplates.length"
                @click="addSQLTable"
                :disabled="loading || !selectedTemplateId"
                class="w-full flex items-center justify-center gap-1.5 text-xs py-2
                       bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium
                       transition-colors disabled:opacity-60"
              >
                <Loader2 v-if="loading" class="size-3 animate-spin" />
                <Download v-else class="size-3" />
                {{ loading ? 'กำลังโหลด...' : '+ เพิ่มตาราง' }}
              </button>
            </template>
          </div>
        </aside>
      </Transition>

      <!-- ── Canvas ──────────────────────────────────────────────────────── -->
      <div class="flex-1 relative overflow-hidden">
        <VueFlow
          v-model:nodes="nodes"
          v-model:edges="edges"
          :node-types="nodeTypes"
          fit-view-on-init
          class="w-full h-full"
        >
          <Background />
          <Controls />
        </VueFlow>

        <!-- Empty state -->
        <div
          v-if="!nodes.length"
          class="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none"
        >
          <GitMerge class="size-14 text-muted-foreground/15" />
          <p class="text-sm font-medium text-muted-foreground">คลิก "+ เพิ่มตาราง" เพื่อเริ่มสร้าง Data Model</p>
          <p class="text-xs text-muted-foreground/60">ลาก Handle (จุดสีม่วง) ระหว่างตารางเพื่อสร้าง Relationship</p>
        </div>
      </div>

      <!-- ── Node Data Preview (right panel) ───────────────────────────── -->
      <Transition name="slide-right">
        <aside
          v-if="selectedNodeData && !selectedEdge"
          aria-label="ข้อมูลตาราง"
          class="w-72 border-l bg-background z-10 flex flex-col shrink-0 shadow-lg"
        >
          <div class="p-3 border-b flex items-center justify-between shrink-0">
            <div class="flex items-center gap-1.5">
              <Table2 class="size-3.5 text-indigo-500" />
              <span class="text-xs font-semibold truncate max-w-[160px]" :title="selectedNodeData.name">
                {{ selectedNodeData.name }}
              </span>
            </div>
            <button @click="selectedNodeId = null" class="text-muted-foreground hover:text-foreground">
              <X class="size-3.5" />
            </button>
          </div>

          <!-- Stats row -->
          <div class="px-3 py-2 border-b flex gap-3 text-[10px] text-muted-foreground shrink-0">
            <span><span class="font-semibold text-foreground">{{ selectedNodeData.rows.length.toLocaleString() }}</span> แถว</span>
            <span><span class="font-semibold text-foreground">{{ nodePreviewCols.length }}</span> คอลัมน์</span>
          </div>

          <!-- Search -->
          <div class="px-3 py-2 border-b shrink-0">
            <div class="flex items-center gap-1.5 border rounded-lg px-2 py-1.5 bg-muted/20 focus-within:ring-1 focus-within:ring-indigo-400">
              <Search class="size-3 text-muted-foreground shrink-0" />
              <input
                v-model="nodeSearchQuery"
                placeholder="ค้นหาข้อมูล..."
                class="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground/60"
              />
            </div>
          </div>

          <!-- AG Grid -->
          <AgGridVue
            :class="[themeClass, 'ag-dm-preview flex-1 min-h-0 w-full']"
            :rowData="nodePreviewRowData"
            :columnDefs="nodePreviewColDefs"
            :quickFilterText="nodeSearchQuery"
            :rowHeight="26"
            :headerHeight="30"
            :suppressMovableColumns="true"
            :suppressCellFocus="true"
            :enableCellTextSelection="true"
          />
        </aside>
      </Transition>

      <!-- ── Relationship Editor (right panel) ──────────────────────────── -->
      <Transition name="slide-right">
        <aside
          v-if="selectedEdge"
          aria-label="แก้ไข Relationship"
          class="w-60 border-l bg-background z-10 flex flex-col shrink-0 shadow-lg"
        >
          <div class="p-3 border-b flex items-center justify-between shrink-0">
            <div class="flex items-center gap-1.5">
              <Link2 class="size-3.5 text-indigo-500" />
              <span class="text-xs font-semibold">Relationship</span>
            </div>
            <button
              @click="deleteSelectedRelation"
              class="text-muted-foreground hover:text-destructive transition-colors"
              title="ลบความสัมพันธ์นี้"
            >
              <Trash2 class="size-3.5" />
            </button>
          </div>

          <div class="p-3 flex flex-col gap-4 overflow-y-auto">

            <!-- From table + column -->
            <div class="space-y-1.5">
              <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">จากตาราง</p>
              <div class="rounded-lg border bg-muted/20 px-2.5 py-2 space-y-1.5">
                <p class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 truncate">
                  {{ dmStore.getTable(selectedEdge.fromTable)?.name ?? selectedEdge.fromTable }}
                </p>
                <!-- Searchable column picker (from) -->
                <div class="relative">
                  <div
                    class="flex items-center gap-1 border rounded-lg px-2 py-1.5 bg-background cursor-pointer
                           focus-within:ring-1 focus-within:ring-indigo-400"
                    @click="fromColOpen = !fromColOpen"
                  >
                    <span class="flex-1 text-xs truncate">
                      {{ selectedEdge.fromColumn ? colLabel(selectedEdge.fromTable, selectedEdge.fromColumn) : '—' }}
                    </span>
                    <svg class="size-3 text-muted-foreground shrink-0 transition-transform" :class="fromColOpen ? 'rotate-180' : ''" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"/></svg>
                  </div>
                  <div v-if="fromColOpen" class="absolute z-50 w-full mt-1 border rounded-lg bg-background shadow-lg overflow-hidden">
                    <div class="p-1.5 border-b">
                      <input
                        v-model="fromColSearch"
                        placeholder="ค้นหาคอลัมน์..."
                        autofocus
                        class="w-full text-xs px-2 py-1 bg-muted/30 rounded focus:outline-none"
                        @click.stop
                      />
                    </div>
                    <div class="max-h-40 overflow-y-auto">
                      <button
                        v-for="col in filteredFromCols"
                        :key="col.name"
                        @mousedown.prevent="selectFromCol(col.name)"
                        class="w-full text-left px-2 py-1.5 text-xs hover:bg-accent transition-colors"
                        :class="selectedEdge.fromColumn === col.name ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400' : ''"
                      >
                        <span class="block truncate">{{ col.label }}</span>
                        <span v-if="col.label !== col.name" class="block text-[10px] text-muted-foreground/60 font-mono truncate">{{ col.name }}</span>
                      </button>
                      <div v-if="!filteredFromCols.length" class="px-2 py-2 text-[10px] text-muted-foreground text-center">ไม่พบ</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- To table + column -->
            <div class="space-y-1.5">
              <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">ถึงตาราง</p>
              <div class="rounded-lg border bg-muted/20 px-2.5 py-2 space-y-1.5">
                <p class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 truncate">
                  {{ dmStore.getTable(selectedEdge.toTable)?.name ?? selectedEdge.toTable }}
                </p>
                <!-- Searchable column picker (to) -->
                <div class="relative">
                  <div
                    class="flex items-center gap-1 border rounded-lg px-2 py-1.5 bg-background cursor-pointer
                           focus-within:ring-1 focus-within:ring-indigo-400"
                    @click="toColOpen = !toColOpen"
                  >
                    <span class="flex-1 text-xs truncate">
                      {{ selectedEdge.toColumn ? colLabel(selectedEdge.toTable, selectedEdge.toColumn) : '—' }}
                    </span>
                    <svg class="size-3 text-muted-foreground shrink-0 transition-transform" :class="toColOpen ? 'rotate-180' : ''" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"/></svg>
                  </div>
                  <div v-if="toColOpen" class="absolute z-50 w-full mt-1 border rounded-lg bg-background shadow-lg overflow-hidden">
                    <div class="p-1.5 border-b">
                      <input
                        v-model="toColSearch"
                        placeholder="ค้นหาคอลัมน์..."
                        autofocus
                        class="w-full text-xs px-2 py-1 bg-muted/30 rounded focus:outline-none"
                        @click.stop
                      />
                    </div>
                    <div class="max-h-40 overflow-y-auto">
                      <button
                        v-for="col in filteredToCols"
                        :key="col.name"
                        @mousedown.prevent="selectToCol(col.name)"
                        class="w-full text-left px-2 py-1.5 text-xs hover:bg-accent transition-colors"
                        :class="selectedEdge.toColumn === col.name ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400' : ''"
                      >
                        <span class="block truncate">{{ col.label }}</span>
                        <span v-if="col.label !== col.name" class="block text-[10px] text-muted-foreground/60 font-mono truncate">{{ col.name }}</span>
                      </button>
                      <div v-if="!filteredToCols.length" class="px-2 py-2 text-[10px] text-muted-foreground text-center">ไม่พบ</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Cardinality -->
            <div class="space-y-1.5">
              <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Cardinality</p>
              <div class="grid grid-cols-2 gap-1.5">
                <button
                  v-for="c in (['1:1','1:*','*:1','*:*'] as const)"
                  :key="c"
                  @click="updateRelation('cardinality', c)"
                  :class="[
                    'py-2 rounded-lg border text-[11px] font-mono font-bold transition-colors',
                    selectedEdge.cardinality === c
                      ? 'bg-indigo-500 text-white border-indigo-500'
                      : 'text-muted-foreground hover:border-indigo-300 hover:text-indigo-600',
                  ]"
                >{{ c }}</button>
              </div>
            </div>

            <!-- Join Type -->
            <div class="space-y-1.5">
              <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Join Type</p>
              <select
                :value="selectedEdge.joinType"
                @change="updateRelation('joinType', ($event.target as HTMLSelectElement).value)"
                class="w-full text-xs border rounded-lg px-2 py-1.5 bg-background
                       focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="inner">Inner Join</option>
                <option value="left">Left Join</option>
                <option value="right">Right Join</option>
              </select>
            </div>

            <!-- Summary chip -->
            <div class="rounded-lg bg-indigo-50 dark:bg-indigo-950/30 px-3 py-2">
              <p class="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono text-center leading-relaxed">
                {{ dmStore.getTable(selectedEdge.fromTable)?.name }}.{{ colLabel(selectedEdge.fromTable, selectedEdge.fromColumn) }}<br/>
                <span class="font-bold">{{ selectedEdge.cardinality }}</span> ({{ selectedEdge.joinType }})<br/>
                {{ dmStore.getTable(selectedEdge.toTable)?.name }}.{{ colLabel(selectedEdge.toTable, selectedEdge.toColumn) }}
              </p>
            </div>

            <!-- Data Preview -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">ตัวอย่างข้อมูล</p>
                <span class="text-[10px] text-indigo-500">
                  {{ sampleJoin ? `${sampleJoin.rows.length} แถว` : '—' }}
                </span>
              </div>

              <div v-if="sampleJoin && sampleJoin.rows.length" class="border rounded-lg overflow-hidden" style="height: 200px;">
                <AgGridVue
                  :class="[themeClass, 'ag-dm-join w-full h-full']"
                  :rowData="sampleJoin.rows"
                  :columnDefs="sampleJoinColDefs"
                  :rowHeight="24"
                  :headerHeight="28"
                  :suppressMovableColumns="true"
                  :suppressCellFocus="true"
                  :enableCellTextSelection="true"
                />
              </div>

              <div
                v-else
                class="text-[10px] text-muted-foreground text-center py-3 border border-dashed rounded-lg"
              >
                {{ sampleJoin ? 'ไม่พบแถวที่ match กัน' : 'เพิ่มข้อมูลในตารางก่อน' }}
              </div>
            </div>

          </div>
        </aside>
      </Transition>

    </div>
  </div>
</template>

<style>
/* Vue Flow core styles — required for handles, edges, and zoom */
@import '@vue-flow/core/dist/style.css';

/* Handle */
.vue-flow__handle {
  width:  12px !important;
  height: 12px !important;
  border-radius: 50% !important;
  border: 2px solid white !important;
  background: #6366f1 !important;
  transition: transform 0.15s ease;
}
.vue-flow__handle:hover {
  transform: scale(1.4) !important;
}

/* Edge */
.vue-flow__edge-path {
  stroke: #6366f1 !important;
  stroke-width: 2 !important;
}
.vue-flow__edge.animated .vue-flow__edge-path {
  stroke: #6366f1 !important;
}

/* Controls */
.vue-flow__controls {
  box-shadow: 0 1px 4px rgba(0,0,0,.15) !important;
  border-radius: 8px !important;
}
.vue-flow__controls-button {
  border-radius: 6px !important;
}
</style>

<style scoped>
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.2s ease;
}
.slide-left-enter-from,
.slide-left-leave-to  { transform: translateX(-100%); opacity: 0; }
.slide-right-enter-from,
.slide-right-leave-to { transform: translateX(100%);  opacity: 0; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to       { opacity: 0; }

/* AG Grid overrides */
.ag-dm-preview .ag-root-wrapper,
.ag-dm-preview .ag-root,
.ag-dm-preview .ag-body-viewport,
.ag-dm-join .ag-root-wrapper,
.ag-dm-join .ag-root,
.ag-dm-join .ag-body-viewport {
  background: transparent !important;
}
.ag-dm-preview .ag-root-wrapper,
.ag-dm-join .ag-root-wrapper {
  border: none !important;
}
.ag-dm-preview .ag-header-cell-text,
.ag-dm-join .ag-header-cell-text {
  font-size: 10px;
  font-weight: 600;
}
.ag-dm-preview .ag-cell { font-size: 10px; }
.ag-dm-join .ag-cell    { font-size: 9px; }
</style>
