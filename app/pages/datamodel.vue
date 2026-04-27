<script setup lang="ts">
import { markRaw, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { VueFlow, useVueFlow, type Node, type Edge, type Connection } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls }   from '@vue-flow/controls'
import '@vue-flow/controls/dist/style.css'
import {
  Database, Download, Loader2, AlertCircle, Bug,
  GitMerge, Home, Trash2, Link2, X, Table2, ArrowRight,
  Shuffle, Plus, ChevronDown, ChevronRight, Layers, RotateCcw, Globe, Lock,
  Calculator, BookMarked, RefreshCw, Sparkles,
} from 'lucide-vue-next'
import { useAiContext } from '~/composables/datamodel/useAiContext'
import { useAiChatStore } from '~/stores/ai-chat'
import { useAiFeature } from '~/composables/useAiFeature'
import {
  applyTransform, componentKey,
  accumulateRow, materializeAccumulators, matchFilters, normDateStr,
  type TransformConfig, type TransformFilter, type AggFn,
  AGG_OPTIONS, OP_OPTIONS,
  DATE_TOKEN_TODAY, DATE_TOKEN_YESTERDAY, DATE_TOKEN_LABELS,
} from '~/utils/transformData'
import {
  applyComputedColumns, defToFormula, previewColDef, newComputedColDef,
  COL_TYPE_OPTIONS, ARITH_OP_OPTIONS, CMP_OP_OPTIONS, FUNCTION_DEFS, FN_CATEGORY_LABELS,
  type ComputedColDef,
} from '~/utils/computedColumn'
import ModelTableNode from '~/components/datamodel/ModelTableNode.vue'
import { MOCK_DATA, DATASET_META, type DatasetKey } from '~/stores/canvas'
import { AgGridVue } from 'ag-grid-vue3'
import { ClientSideRowModelModule, CommunityFeaturesModule, ModuleRegistry } from 'ag-grid-community'
import type { ColDef } from 'ag-grid-community'
import { parseColumnMapping, isDateMeta } from '~/utils/columnMapping'
import { formatDateValue, formatNumericValue, DATE_PATTERNS } from '~/utils/formatValue'

ModuleRegistry.registerModules([ClientSideRowModelModule, CommunityFeaturesModule])

// ─── Page meta ────────────────────────────────────────────────────────────────
definePageMeta({ layout: false, auth: true })

// ─── i18n ─────────────────────────────────────────────────────────────────────
const { t } = useI18n()
useHead({ title: computed(() => `${t('page_title_datamodel')} | MangoBI`) })

// ─── Stores / Router ──────────────────────────────────────────────────────────
const dmStore     = useDataModelStore()
const reportStore = useReportStore()
const authStore   = useAuthStore()
const router      = useRouter()
const { $xt } = useNuxtApp() as any

// ─── Vue Flow ─────────────────────────────────────────────────────────────────
const {
  addEdges, removeEdges,
  onConnect, onNodeClick, onNodeDoubleClick, onEdgeClick, onPaneClick,
  onNodesChange, onEdgesChange,
  screenToFlowCoordinate,
  fitView,
} = useVueFlow({ id: 'data-model' })

// Cast as any: Vue Flow's NodeTypesObject expects NodeProps generics our SFCs don't expose
const nodeTypes = { modelTable: markRaw(ModelTableNode) } as any

const nodes = ref<Node[]>([])
const edges = ref<Edge[]>([])

// ─── Restore canvas from store on mount (back-navigation support) ─────────────
onMounted(() => {
  if (dmStore.canvasNodes.length) {
    nodes.value = dmStore.canvasNodes.map(n => ({
      id: n.id, type: 'modelTable', position: n.position, data: {},
    }))
    edges.value = dmStore.canvasEdges.map(e => ({ ...e }))
    if (dmStore.canvasSavedId)  dmSavedId.value  = dmStore.canvasSavedId
    if (dmStore.canvasSaveName) dmSaveName.value = dmStore.canvasSaveName
    nextTick(() => fitView())
  }
})

onBeforeUnmount(() => {
  dmStore.saveCanvas(
    nodes.value.map(n => ({ id: n.id, position: n.position })),
    edges.value.map(e => ({ ...e })),
    dmSavedId.value,
    dmSaveName.value,
  )
})

// ─── Selected relationship ────────────────────────────────────────────────────
const selectedEdgeId = ref<string | null>(null)
const selectedEdge   = computed(() => selectedEdgeId.value ? dmStore.relations[selectedEdgeId.value] : null)

// ─── Selected node (data preview) ─────────────────────────────────────────────
const selectedNodeId   = ref<string | null>(null)
const selectedNodeData = computed(() => selectedNodeId.value ? dmStore.getTable(selectedNodeId.value) : null)
const nodePreviewCols  = computed(() => selectedNodeId.value ? dmStore.columnsOf(selectedNodeId.value) : [])

// ─── Node pre-filters (applied before join) ───────────────────────────────────
const nodePreFilters = computed({
  get: () => selectedNodeId.value ? dmStore.getNodeFilters(selectedNodeId.value) : [],
  set: (v: TransformFilter[]) => {
    if (selectedNodeId.value) dmStore.setNodeFilters(selectedNodeId.value, v)
  },
})
function nodeAddPreFilter() {
  if (!selectedNodeId.value) return
  const current = [...dmStore.getNodeFilters(selectedNodeId.value)]
  current.push({ field: nodePreviewCols.value[0]?.name ?? '', op: '=', value: '' })
  dmStore.setNodeFilters(selectedNodeId.value, current)
}
function nodeRemovePreFilter(i: number) {
  if (!selectedNodeId.value) return
  const current = [...dmStore.getNodeFilters(selectedNodeId.value)]
  current.splice(i, 1)
  dmStore.setNodeFilters(selectedNodeId.value, current)
}
function nodeUpdatePreFilter(i: number, patch: Partial<TransformFilter>) {
  if (!selectedNodeId.value) return
  const current = dmStore.getNodeFilters(selectedNodeId.value).map((f, idx) =>
    idx === i ? { ...f, ...patch } : f,
  )
  dmStore.setNodeFilters(selectedNodeId.value, current)
}
const nodeHasPreFilters = computed(() => nodePreFilters.value.length > 0)

function isNodeDateField(col: string): boolean {
  if (!selectedNodeId.value) return false
  const t = dmStore.getTable(selectedNodeId.value)
  if (isDateMeta(t?.columnLabels?.[col], undefined)) return true
  const sample = t?.rows[0]?.[col]
  return typeof sample === 'string' && /^\d{4}-\d{2}-\d{2}/.test(sample)
}

// ─── Transform modal ──────────────────────────────────────────────────────────
const showTxModal  = ref(false)
const txModalTab   = ref<'before' | 'after'>('before')

// ─── Transform ────────────────────────────────────────────────────────────────
// Component key for the selected table (BFS over current relations)
const selectedCompKey = computed(() => {
  if (!selectedNodeId.value) return null
  return componentKey(
    selectedNodeId.value,
    dmStore.tables.map(t => t.id),
    Object.values(dmStore.relations),
  )
})

// All columns available in the component (union of all tables in component)
// Build the actual joined rows for the selected component so Transform preview
// matches what buildJoinedDatasets will produce (single-table = just that table).
const txJoinedRows = computed(() => {
  const key = selectedCompKey.value
  if (!key) return selectedNodeData.value?.rows ?? []
  const compIds = key.split('+')
  if (compIds.length === 1) return selectedNodeData.value?.rows ?? []
  const rels = Object.values(dmStore.relations)
  const compRels = rels.filter(r => compIds.includes(r.fromTable) && compIds.includes(r.toTable))
  if (!compRels.length) return selectedNodeData.value?.rows ?? []
  // Use the same caps as buildJoinedDatasets so the preview matches the export exactly
  const _fromFilters0 = dmStore.getNodeFilters(compRels[0]!.fromTable)
  let rows: any[] = (dmStore.getTable(compRels[0]!.fromTable)?.rows ?? [])
    .filter(r => matchFilters(r, _fromFilters0))
    .slice(0, MAX_SOURCE_ROWS)
  const joined = new Set([compRels[0]!.fromTable])
  for (const rel of compRels) {
    if (joined.has(rel.toTable)) continue
    joined.add(rel.toTable)
    const _toFilters = dmStore.getNodeFilters(rel.toTable)
    const toRows = (dmStore.getTable(rel.toTable)?.rows ?? [])
      .filter(r => matchFilters(r, _toFilters))
      .slice(0, MAX_SOURCE_ROWS)
    const { result } = joinStep(rows, rel, toRows, MAX_JOIN_ROWS)
    rows = result
  }
  return rows
})

// Column source map for the joined result (mirrors buildJoinedDatasets tracking)
const txColumnSources = computed<Record<string, string>>(() => {
  const key = selectedCompKey.value
  if (!key) return {}
  const compIds = key.split('+')
  const rels = Object.values(dmStore.relations)
  const compRels = rels.filter(r => compIds.includes(r.fromTable) && compIds.includes(r.toTable))
  const sources: Record<string, string> = {}
  if (!compRels.length) {
    const t = dmStore.getTable(compIds[0]!)
    for (const col of Object.keys(t?.rows[0] ?? {})) sources[col] = t?.name ?? compIds[0]!
    return sources
  }
  const firstTableId = compRels[0]!.fromTable
  const firstTable   = dmStore.getTable(firstTableId)
  let currentKeys    = Object.keys(firstTable?.rows[0] ?? {})
  for (const col of currentKeys) sources[col] = firstTable?.name ?? firstTableId
  const joined = new Set([firstTableId])
  for (const rel of compRels) {
    if (joined.has(rel.toTable)) continue
    joined.add(rel.toTable)
    const toTable = dmStore.getTable(rel.toTable)
    const toKeys  = Object.keys(toTable?.rows[0] ?? {})
    const newKeys: string[] = []
    for (const k of toKeys) {
      const finalKey = currentKeys.includes(k) ? `${rel.toTable}_${k}` : k
      sources[finalKey] = toTable?.name ?? rel.toTable
      newKeys.push(finalKey)
    }
    currentKeys = [...currentKeys, ...newKeys]
  }
  return sources
})

// Actual joined column names (matches what buildJoinedDatasets produces)
const txColumns = computed(() =>
  txJoinedRows.value.length ? Object.keys(txJoinedRows.value[0]) : [],
)

// Format config for the current component (numeric + date)
const txNumericFormat = computed(() =>
  selectedCompKey.value ? dmStore.getNumericFormat(selectedCompKey.value) : {},
)

function setTxNumericFormat(patch: import('~/utils/formatValue').NumericFormat) {
  if (!selectedCompKey.value) return
  dmStore.setNumericFormat(selectedCompKey.value, patch)
}

function toggleTxExcludeDecimalCol(col: string) {
  const excluded = txNumericFormat.value.excludeDecimalCols ?? []
  const next = excluded.includes(col)
    ? excluded.filter(c => c !== col)
    : [...excluded, col]
  setTxNumericFormat({ excludeDecimalCols: next })
}

// Numeric columns in the current joined result
const txNumericColumns = computed(() =>
  txColumns.value.filter(col => typeof txJoinedRows.value[0]?.[col] === 'number'),
)

const txExcludeSearch = ref('')
const txFilteredNumericColumns = computed(() => {
  const q = txExcludeSearch.value.trim().toLowerCase()
  if (!q) return txNumericColumns.value
  return txNumericColumns.value.filter(col => txColLabel(col).toLowerCase().includes(q))
})

// Aggregation column search
const txAggSearch = ref('')
const txFilteredAggGroups = computed(() => {
  const q = txAggSearch.value.trim().toLowerCase()
  if (!q) return txColGroups.value
  return txColGroups.value.map(g => ({
    ...g,
    cols: g.cols.filter(c => c !== txGroupBy.value && txColLabel(c).toLowerCase().includes(q)),
  })).filter(g => g.cols.length)
})

const txFilters       = ref<TransformFilter[]>([])
const txGroupBy       = ref('')
const txAggregations  = ref<Record<string, AggFn>>({})
const txComputedCols  = ref<ComputedColDef[]>([])

// Load config when component selection changes
watch(selectedCompKey, (key) => {
  const cfg = key ? dmStore.getTransform(key) : null
  txFilters.value      = cfg ? [...cfg.filters]      : []
  txGroupBy.value      = cfg?.groupByField            ?? ''
  txAggregations.value = cfg ? { ...cfg.aggregations } : {}
  txComputedCols.value = cfg?.computedColumns ? cfg.computedColumns.map(c => ({ ...c })) : []
}, { immediate: true })

// Auto-init aggregations when columns change (use joined row sample for correct type detection)
watch(txColumns, (cols) => {
  for (const col of cols) {
    if (!(col in txAggregations.value)) {
      const sample = txJoinedRows.value[0]?.[col]
      txAggregations.value[col] = typeof sample === 'number' ? 'sum' : 'first'
    }
  }
})

// Save config whenever it changes
watch([txFilters, txGroupBy, txAggregations, txComputedCols], () => {
  if (!selectedCompKey.value) return
  dmStore.setTransform(selectedCompKey.value, {
    filters:         txFilters.value,
    groupByField:    txGroupBy.value,
    aggregations:    txAggregations.value,
    computedColumns: txComputedCols.value.filter(c => c.name.trim()),
  })
}, { deep: true })

const txHasConfig = computed(() =>
  txFilters.value.length > 0 ||
  txGroupBy.value !== '' ||
  txComputedCols.value.some(c => c.name.trim()),
)

// Resolve display label — search all tables in the component
function txColLabel(col: string): string {
  for (const id of (selectedCompKey.value ?? '').split('+')) {
    const lbl = dmStore.getTable(id)?.columnLabels?.[col]?.label
    if (lbl) return lbl
  }
  return col
}

// Columns grouped by source table using the accurate join-aware source map
const txColGroups = computed(() => {
  const groups = new Map<string, string[]>()
  for (const col of txColumns.value) {
    const source = txColumnSources.value[col] ?? '—'
    if (!groups.has(source)) groups.set(source, [])
    groups.get(source)!.push(col)
  }
  return [...groups.entries()].map(([sourceName, cols]) => ({ sourceName, cols }))
})

// Returns true if the column (from the joined input) is a date type
function isDateField(col: string): boolean {
  for (const id of (selectedCompKey.value ?? '').split('+')) {
    const t = dmStore.getTable(id)
    if (isDateMeta(t?.columnLabels?.[col], undefined)) return true
  }
  const sample = txJoinedRows.value[0]?.[col]
  return typeof sample === 'string' && /^\d{4}-\d{2}-\d{2}/.test(sample)
}

// Same but for the join transform modal
function isJoinDateField(col: string): boolean {
  for (const id of joinTxCompKey.value.split('+')) {
    const t = dmStore.getTable(id)
    if (isDateMeta(t?.columnLabels?.[col], undefined)) return true
  }
  const sample = joinTxRows.value[0]?.[col]
  return typeof sample === 'string' && /^\d{4}-\d{2}-\d{2}/.test(sample)
}

function txAddFilter() {
  txFilters.value.push({ field: txColumns.value[0] ?? '', op: '=', value: '' })
}
function txRemoveFilter(i: number) { txFilters.value.splice(i, 1) }

// Input sample = the actual joined rows the transform will be applied to
const txInputSample = computed(() => txJoinedRows.value.slice(0, 200))

// Shared valueFormatter for TX grids — handles numeric and date columns
function makeTxFmt(col: string) {
  const fmt  = txNumericFormat.value
  const isNum  = typeof txJoinedRows.value[0]?.[col] === 'number'
  const isDate = isDateField(col)
  if (isDate && fmt.datePattern) {
    const pattern = fmt.datePattern
    const era     = fmt.dateEra ?? 'CE'
    return (p: any) => formatDateValue(p.value, pattern, era)
  }
  const isExcluded = fmt.excludeDecimalCols?.includes(col) ?? false
  if (isNum && !isExcluded && (fmt.comma || fmt.decimals !== undefined)) {
    return (p: any) => {
      if (p.value === null || p.value === undefined) return ''
      return formatNumericValue(p.value, fmt)
    }
  }
  return undefined
}

// AG Grid col defs for modal — based on joined rows
const txInputColDefs = computed<ColDef[]>(() =>
  txColumns.value.map(col => {
    const isNum = typeof txJoinedRows.value[0]?.[col] === 'number'
    return {
      field: col, headerName: txColLabel(col),
      sortable: true, resizable: true, filter: true, minWidth: 60,
      cellStyle: (isNum ? { textAlign: 'right', fontFamily: 'monospace' } : {}) as Record<string, string>,
      valueFormatter: makeTxFmt(col),
    }
  })
)

// Output sample as computed — auto-tracks all reactive dependencies (filters, groupBy, aggs, rows)
const txOutputSample = computed<any[]>(() => {
  if (!txHasConfig.value || !txJoinedRows.value.length) return []
  // Deep-track every field in computedCols (Vue only tracks .name via filter() otherwise)
  void JSON.stringify(txComputedCols.value)
  return applyTransform(
    txJoinedRows.value,
    {
      filters:         txFilters.value,
      groupByField:    txGroupBy.value,
      aggregations:    { ...txAggregations.value },
      computedColumns: txComputedCols.value.filter(c => c.name.trim()),
    },
  ).slice(0, 200)
})

// Key that changes whenever the set of output columns changes → forces AG Grid to rebuild column defs
const txOutputColsKey = computed(() => Object.keys(txOutputSample.value[0] ?? {}).join(','))

// Per-def preview value for the UI (sample row result)
const txComputedColPreviews = computed(() => {
  void JSON.stringify(txComputedCols.value)   // deep-track nested fields
  return txComputedCols.value.map(cc => {
    const sample = txJoinedRows.value[0] ?? {}
    return cc.name.trim() ? previewColDef(cc, sample) : '—'
  })
})

const txComputedColFormulas = computed(() => {
  void JSON.stringify(txComputedCols.value)
  return txComputedCols.value.map(cc => cc.name.trim() ? defToFormula(cc) : '')
})

const txOutputColDefs = computed<ColDef[]>(() => {
  if (!txOutputSample.value.length) return []
  return Object.keys(txOutputSample.value[0]).map(col => {
    const isNum = typeof txOutputSample.value[0]?.[col] === 'number'
    return {
      field: col, headerName: txColLabel(col),
      sortable: true, resizable: true, filter: true, minWidth: 60,
      cellStyle: (isNum ? { textAlign: 'right', fontFamily: 'monospace' } : {}) as Record<string, string>,
      valueFormatter: makeTxFmt(col),
    }
  })
})

// Lazy-mount flag: output grid mounts only when user first visits the results tab
// — ensures AG Grid initialises with a visible (non-zero-size) container
const txAfterMounted = ref(false)
watch(() => txModalTab.value, (tab) => {
  if (tab === 'after') txAfterMounted.value = true
})

const colorMode = useColorMode()
const isDark     = computed(() => colorMode.value === 'dark')
const themeClass = computed(() => isDark.value ? 'ag-theme-quartz-dark' : 'ag-theme-quartz')

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

// helper: resolve column name → display label
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
const showAddPanel    = ref(false)
const showLayersPanel = ref(false)
const addMode       = ref<'saved' | 'passcode' | 'rawsql'>('saved')
const customName    = ref('')
const selectedKey   = ref<DatasetKey>('sales_monthly')
const loading       = ref(false)
const errorMsg      = ref('')

const datasetOptions = Object.entries(DATASET_META).map(([key, m]) => ({
  key: key as DatasetKey, label: m.label,
}))

// ─── DM Templates (Append) ───────────────────────────────────────────────────
const tplOpen        = ref(true)
const tplMyList      = ref<import('~/composables/useMangoBIApi').BIListItem[]>([])
const tplPublicList  = ref<import('~/composables/useMangoBIApi').BIListItem[]>([])
const tplLoading     = ref(false)
const tplAppending   = ref<string | null>(null)

// ─── My SQL Builder (saved) ───────────────────────────────────────────────────
const savedSqlItems   = ref<import('~/composables/useMangoBIApi').BIListItem[]>([])
const publicSqlItems  = ref<import('~/composables/useMangoBIApi').BIListItem[]>([])
const savedSqlLoading = ref(false)
const savedSqlAdding  = ref<string | null>(null)

async function loadSavedSqlList() {
  savedSqlLoading.value = true
  try {
    const [mine, pub] = await Promise.all([
      biApi.listSQLBuilders(),
      biApi.listPublicSQLBuilders(),
    ])
    savedSqlItems.value  = mine
    const myIds          = new Set(mine.map(i => i.id))
    publicSqlItems.value = pub.filter(i => !myIds.has(i.id))
  } catch {
    savedSqlItems.value = []; publicSqlItems.value = []
  } finally {
    savedSqlLoading.value = false
  }
}

async function addSavedSqlTable(item: import('~/composables/useMangoBIApi').BIListItem) {
  savedSqlAdding.value = item.id
  errorMsg.value = ''
  try {
    const full = await biApi.loadSQLBuilder(item.id)
    if (!full?.sqlText) throw new Error('ไม่พบ SQL ของชุดนี้')

    const res: any = await $xt.postServerJson('MangoBI/ExecuteCustomSql', {
      sql:  full.sqlText,
      name: customName.value.trim() || item.name,
    })
    if (res?.error) throw new Error(res.error)
    const payload = extractSqlPayload(res)
    if (!payload?.rows?.length) throw new Error(t('bi_no_data_found'))

    // Apply columnMapping to rename columns
    let rows: any[] = payload.rows
    if (full.columnMapping) {
      const mapping: import('~/composables/useMangoBIApi').ColumnMapEntry[] = JSON.parse(full.columnMapping)
      const renamed = mapping.filter(m => m.newColumnName && m.newColumnName !== m.columnName)
      if (renamed.length) {
        rows = rows.map(row => {
          const out: Record<string, any> = {}
          for (const [k, v] of Object.entries(row as Record<string, any>)) {
            const m = renamed.find(r => r.columnName === k)
            out[m ? m.newColumnName : k] = v
          }
          return out
        })
      }
    }

    const name = customName.value.trim() || item.name
    placeTableNode(`saved_${Date.now()}`, name, rows)
    showAddPanel.value = false
    customName.value   = ''
  } catch (e: any) {
    errorMsg.value = e?.message ?? t('bi_error')
  } finally {
    savedSqlAdding.value = null
  }
}

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
    if (sqlTemplates.value.length) selectedTemplateId.value = sqlTemplates.value[0]!.template_id
  } catch {
    sqlTemplates.value = []
  } finally {
    sqlLoading.value         = false
    sqlTemplatesLoaded.value = true
  }
}

watch(addMode, (m) => {
  if (m === 'saved')    loadSavedSqlList()
  if (m === 'passcode') { sqlTemplatesLoaded.value = false; sqlTemplates.value = [] }
  rawSqlErrors.value = []
})

watch(showAddPanel, (v) => {
  if (v && addMode.value === 'saved') loadSavedSqlList()
  if (v && !tplMyList.value.length && !tplLoading.value) loadDmTemplates()
})

// ─── Raw SQL mode ─────────────────────────────────────────────────────────────
const rawSqlText   = ref('')
const rawSqlErrors = ref<string[]>([])
const rawSqlLoading = ref(false)

const BLOCKED_SQL_KEYWORDS = [
  'DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE', 'TRUNCATE',
  'EXEC', 'EXECUTE', 'SP_', 'XP_', 'GRANT', 'REVOKE', 'MERGE',
  'BULK', 'OPENROWSET', 'OPENDATASOURCE',
]

function validateRawSql(sql: string): string[] {
  const errors: string[] = []
  const trimmed = sql.trim()

  if (!trimmed) { errors.push('กรุณาใส่ SQL'); return errors }
  if (!/^(SELECT|WITH)\b/i.test(trimmed))
    errors.push('SQL ต้องเริ่มต้นด้วย SELECT หรือ WITH (CTE) เท่านั้น')
  if (trimmed.includes(';'))
    errors.push('ไม่อนุญาตให้ใช้ semicolon (;) เพื่อป้องกันการ inject หลาย statement')

  const upper = trimmed.toUpperCase()
  for (const kw of BLOCKED_SQL_KEYWORDS) {
    const pattern = new RegExp(`\\b${kw}\\b`)
    if (pattern.test(upper))
      errors.push(`พบคำสั่งที่ไม่อนุญาต: ${kw}`)
  }
  return errors
}

async function addRawSqlTable() {
  rawSqlErrors.value = validateRawSql(rawSqlText.value)
  if (rawSqlErrors.value.length) return

  rawSqlLoading.value = true
  errorMsg.value = ''
  try {
    const res: any = await $xt.postServerJson('MangoBI/ExecuteCustomSql', {
      sql:  rawSqlText.value.trim(),
      name: customName.value.trim() || 'Custom SQL',
    })
    if (res?.error) throw new Error(res.error)
    const payload = extractSqlPayload(res)
    if (!payload?.rows?.length) throw new Error(t('bi_no_data_found'))
    const name = customName.value.trim() || 'Custom SQL'
    placeTableNode(`rawsql_${Date.now()}`, name, payload.rows, parseColumnMapping(payload.column_mapping_json))
    showAddPanel.value = false
    customName.value   = ''
    rawSqlText.value   = ''
  } catch (e: any) {
    errorMsg.value = e?.message ?? t('bi_error')
  } finally {
    rawSqlLoading.value = false
  }
}

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
  if (!selectedTemplateId.value) { errorMsg.value = t('bi_please_select_template'); return }
  loading.value  = true
  errorMsg.value = ''
  try {
    const res: any = await $xt.getServer(
      `Planning/Master/ExecuteSqlFlowTemplate?template_id=${selectedTemplateId.value}&passcode=${encodeURIComponent(sqlPasscode.value.trim())}`,
    )
    if (res?.error) throw new Error(res.error)
    const payload = extractSqlPayload(res)
    if (!payload?.rows) throw new Error(t('bi_no_data_found'))
    const tmpl    = sqlTemplates.value.find(t => t.template_id === selectedTemplateId.value)
    const name    = customName.value.trim() || tmpl?.template_name || `Template ${selectedTemplateId.value}`
    placeTableNode(`sql_${Date.now()}`, name, payload.rows, parseColumnMapping(payload.column_mapping_json))
    showAddPanel.value = false
    customName.value   = ''
  } catch (e: any) {
    errorMsg.value = e?.message ?? t('bi_error')
  } finally {
    loading.value = false
  }
}

async function debugDownloadSQL() {
  if (!selectedTemplateId.value) { errorMsg.value = t('bi_please_select_template'); return }
  loading.value  = true
  errorMsg.value = ''
  try {
    const res: any = await $xt.getServer(
      `Planning/Master/ExecuteSqlFlowTemplate?template_id=${selectedTemplateId.value}&passcode=${encodeURIComponent(sqlPasscode.value.trim())}`,
    )
    const tmpl = sqlTemplates.value.find(t => t.template_id === selectedTemplateId.value)
    const filename = `debug_${tmpl?.template_name ?? selectedTemplateId.value}_${Date.now()}.json`
    const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  } catch (e: any) {
    errorMsg.value = e?.message ?? t('bi_error')
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
onNodeClick(({ node }) => { selectedNodeId.value  = node.id;  selectedEdgeId.value = null })
onPaneClick((event)     => {
  // Skip deselect if the click originated inside the layers overlay
  // OR if the layers panel is currently open (pointer events may be tricky)
  const target = event.target as HTMLElement
  if (target.closest?.('.layers-panel-overlay')) return
  if (showLayersPanel.value) return
  selectedEdgeId.value = null
  selectedNodeId.value = null
})

// Double-click node → open Transform Modal directly
onNodeDoubleClick(({ node }) => {
  selectedNodeId.value = node.id
  selectedEdgeId.value = null
  const compKey = componentKey(
    node.id,
    dmStore.tables.map(t => t.id),
    Object.values(dmStore.relations),
  )
  if (compKey.split('+').length > 1) {
    openJoinTxModal(compKey)
  } else {
    showTxModal.value  = true
    txModalTab.value   = 'before'
  }
})

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
    if (idx !== -1) edges.value[idx] = { ...edges.value[idx]!, label: value }
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

// Per-node relation count for the layers panel
const nodeRelationCount = computed(() => {
  const counts: Record<string, number> = {}
  for (const rel of Object.values(dmStore.relations)) {
    counts[rel.fromTable] = (counts[rel.fromTable] ?? 0) + 1
    counts[rel.toTable]   = (counts[rel.toTable]   ?? 0) + 1
  }
  return counts
})

function focusNode(nodeId: string) {
  selectedNodeId.value   = nodeId
  selectedEdgeId.value   = null
  fitView({ nodes: [nodeId], duration: 400, padding: 0.4 })
}

// ─── Export readiness ─────────────────────────────────────────────────────────
const exportStatus = computed(() => {
  if (!dmStore.tables.length)
    return { ready: false, reason: t('bi_no_tables_yet') }
  const rels = Object.values(dmStore.relations)
  const incomplete = rels.filter(r => !r.fromColumn || !r.toColumn)
  if (incomplete.length)
    return { ready: false, reason: t('bi_relation_incomplete', { count: incomplete.length }) }
  return { ready: true, reason: '' }
})

// ─── Joined Components (BFS groups with 2+ tables) ───────────────────────────
const joinedComponents = computed(() => {
  const tables = dmStore.tables
  if (!tables.length) return []
  const rels = Object.values(dmStore.relations)
  if (!rels.length) return []

  const adj = new Map<string, Set<string>>()
  for (const t of tables) adj.set(t.id, new Set())
  for (const r of rels) {
    adj.get(r.fromTable)?.add(r.toTable)
    adj.get(r.toTable)?.add(r.fromTable)
  }

  const visited = new Set<string>()
  const comps: { key: string; tableIds: string[]; relCount: number }[] = []
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
    const compRels = rels.filter(r => comp.includes(r.fromTable) && comp.includes(r.toTable))
    if (comp.length >= 2) {
      comps.push({ key: [...comp].sort().join('+'), tableIds: comp, relCount: compRels.length })
    }
  }
  return comps
})

// ─── Join Component Transform Modal ──────────────────────────────────────────
const showJoinTxModal     = ref(false)
const joinTxCompKey       = ref('')
const joinTxTab           = ref<'before' | 'after'>('before')
const joinTxAfterMounted  = ref(false)
const joinTxFilters       = ref<TransformFilter[]>([])
const joinTxGroupBy       = ref('')
const joinTxAggregations  = ref<Record<string, AggFn>>({})
const joinTxComputedCols  = ref<ComputedColDef[]>([])

const joinTxCompName = computed(() =>
  joinTxCompKey.value.split('+')
    .map(id => dmStore.getTable(id)?.name ?? id)
    .join(' + '),
)

// Build joined rows for the active component without applying any transform
const joinTxRows = computed(() => {
  const key = joinTxCompKey.value
  if (!key) return []
  const compIds = key.split('+')
  const rels = Object.values(dmStore.relations)
  const compRels = rels.filter(r => compIds.includes(r.fromTable) && compIds.includes(r.toTable))
  if (!compRels.length) {
    const _f = dmStore.getNodeFilters(compIds[0]!)
    const _r = dmStore.getTable(compIds[0]!)?.rows ?? []
    return _f.length ? _r.filter(r => matchFilters(r, _f)) : _r
  }
  const _fromFilters1 = dmStore.getNodeFilters(compRels[0]!.fromTable)
  let rows: any[] = (dmStore.getTable(compRels[0]!.fromTable)?.rows ?? [])
    .filter(r => matchFilters(r, _fromFilters1))
    .slice(0, MAX_SOURCE_ROWS)
  const joined = new Set([compRels[0]!.fromTable])
  for (const rel of compRels) {
    if (joined.has(rel.toTable)) continue
    joined.add(rel.toTable)
    const _toFilters1 = dmStore.getNodeFilters(rel.toTable)
    const toRows = (dmStore.getTable(rel.toTable)?.rows ?? [])
      .filter(r => matchFilters(r, _toFilters1))
      .slice(0, MAX_SOURCE_ROWS)
    const { result } = joinStep(rows, rel, toRows, MAX_JOIN_ROWS)
    rows = result
  }
  return rows
})

const joinTxColumns = computed(() =>
  joinTxRows.value.length ? Object.keys(joinTxRows.value[0]) : [],
)

function joinTxColLabel(col: string): string {
  for (const id of joinTxCompKey.value.split('+')) {
    const lbl = dmStore.getTable(id)?.columnLabels?.[col]?.label
    if (lbl) return lbl
  }
  return col
}

// Track which source table each final joined column came from
const joinTxColumnSources = computed<Record<string, string>>(() => {
  const key = joinTxCompKey.value
  if (!key) return {}
  const compIds = key.split('+')
  const rels = Object.values(dmStore.relations)
  const compRels = rels.filter(r => compIds.includes(r.fromTable) && compIds.includes(r.toTable))
  const sources: Record<string, string> = {}
  if (!compRels.length) {
    const t = dmStore.getTable(compIds[0]!)
    for (const col of Object.keys(t?.rows[0] ?? {})) sources[col] = t?.name ?? compIds[0]!
    return sources
  }
  const firstTableId = compRels[0]!.fromTable
  const firstTable   = dmStore.getTable(firstTableId)
  let currentKeys: string[] = Object.keys(firstTable?.rows[0] ?? {})
  for (const col of currentKeys) sources[col] = firstTable?.name ?? firstTableId
  const joined = new Set([firstTableId])
  for (const rel of compRels) {
    if (joined.has(rel.toTable)) continue
    joined.add(rel.toTable)
    const toTable = dmStore.getTable(rel.toTable)
    const toKeys  = Object.keys(toTable?.rows[0] ?? {})
    const newKeys: string[] = []
    for (const k of toKeys) {
      const finalKey = currentKeys.includes(k) ? `${rel.toTable}_${k}` : k
      sources[finalKey] = toTable?.name ?? rel.toTable
      newKeys.push(finalKey)
    }
    currentKeys = [...currentKeys, ...newKeys]
  }
  return sources
})

// Columns grouped by source table for join transform dropdowns
const joinTxColGroups = computed(() => {
  const groups = new Map<string, string[]>()
  for (const col of joinTxColumns.value) {
    const source = joinTxColumnSources.value[col] ?? '—'
    if (!groups.has(source)) groups.set(source, [])
    groups.get(source)!.push(col)
  }
  return [...groups.entries()].map(([sourceName, cols]) => ({ sourceName, cols }))
})

const joinTxColDefs = computed<ColDef[]>(() =>
  joinTxColumns.value.map(col => ({
    field: col, headerName: joinTxColLabel(col),
    sortable: true, resizable: true, filter: true, minWidth: 60,
  })),
)

const joinTxHasConfig = computed(() =>
  joinTxFilters.value.length > 0 ||
  joinTxGroupBy.value !== '' ||
  joinTxComputedCols.value.some(c => c.name.trim()),
)

// Output sample as computed — auto-tracks all reactive dependencies
const joinTxOutputSample = computed<any[]>(() => {
  if (!joinTxHasConfig.value || !joinTxRows.value.length) return []
  // Deep-track every field in computedCols
  void JSON.stringify(joinTxComputedCols.value)
  return applyTransform(
    joinTxRows.value,
    {
      filters:         joinTxFilters.value,
      groupByField:    joinTxGroupBy.value,
      aggregations:    { ...joinTxAggregations.value },
      computedColumns: joinTxComputedCols.value.filter(c => c.name.trim()),
    },
  ).slice(0, 200)
})

const joinTxOutputColsKey = computed(() => Object.keys(joinTxOutputSample.value[0] ?? {}).join(','))

// Per-def preview value for join TX modal
const joinTxComputedColPreviews = computed(() => {
  void JSON.stringify(joinTxComputedCols.value)  // deep-track nested fields
  return joinTxComputedCols.value.map(cc => {
    const sample = joinTxRows.value[0] ?? {}
    return cc.name.trim() ? previewColDef(cc, sample) : '—'
  })
})

const joinTxComputedColFormulas = computed(() => {
  void JSON.stringify(joinTxComputedCols.value)
  return joinTxComputedCols.value.map(cc => cc.name.trim() ? defToFormula(cc) : '')
})

// Output column defs derived from actual output (respects 'none' aggregation exclusions)
const joinTxOutputColDefs = computed<ColDef[]>(() => {
  if (!joinTxOutputSample.value.length) return []
  return Object.keys(joinTxOutputSample.value[0]).map(col => ({
    field: col, headerName: joinTxColLabel(col),
    sortable: true, resizable: true, filter: true, minWidth: 60,
  }))
})

// Persist transform config whenever it changes
watch([joinTxFilters, joinTxGroupBy, joinTxAggregations, joinTxComputedCols], () => {
  if (!joinTxCompKey.value) return
  dmStore.setTransform(joinTxCompKey.value, {
    filters:         joinTxFilters.value,
    groupByField:    joinTxGroupBy.value,
    aggregations:    joinTxAggregations.value,
    computedColumns: joinTxComputedCols.value.filter(c => c.name.trim()),
  })
}, { deep: true })

watch(() => joinTxTab.value, tab => { if (tab === 'after') joinTxAfterMounted.value = true })

function openJoinTxModal(compKey: string) {
  joinTxCompKey.value      = compKey
  joinTxTab.value          = 'before'
  joinTxAfterMounted.value = false
  const cfg = dmStore.getTransform(compKey)
  joinTxFilters.value      = cfg ? [...cfg.filters]        : []
  joinTxGroupBy.value      = cfg?.groupByField              ?? ''
  joinTxAggregations.value = cfg ? { ...cfg.aggregations }  : {}
  joinTxComputedCols.value = cfg?.computedColumns ? cfg.computedColumns.map(c => ({ ...c })) : []
  for (const col of joinTxColumns.value) {
    if (!(col in joinTxAggregations.value)) {
      const sample = joinTxRows.value[0]?.[col]
      joinTxAggregations.value[col] = typeof sample === 'number' ? 'sum' : 'first'
    }
  }
  showJoinTxModal.value = true
}

// ─── Build joined datasets from all tables + relations ────────────────────────
// Hard cap per joined dataset to avoid browser OOM
const MAX_JOIN_ROWS   = 50_000
// Cap source table rows fed into a join step (prevents n×m explosion)
const MAX_SOURCE_ROWS = 10_000

const exportWarning = ref('')

// ── Streaming join + GROUP BY ─────────────────────────────────────────────────
// Joins all tables in a component row-by-row and feeds each joined row directly
// into a GROUP BY accumulator — never materialises the full join result, so there
// is no row-count cap and the result is always accurate regardless of join size.
function joinStreamGroupBy(
  firstTableId: string,
  orderedRels:  ReturnType<typeof dmStore.getTable> extends undefined ? never : any[],
  txCfg:        TransformConfig,
): any[] {
  const _preFirst = dmStore.getNodeFilters(firstTableId)
  const allFirstRows = dmStore.getTable(firstTableId)?.rows ?? []
  const firstRows = _preFirst.length ? allFirstRows.filter(r => matchFilters(r, _preFirst)) : allFirstRows
  if (!firstRows.length) return []

  // Pre-build hash indices + column key-maps for every "to" table
  type Idx = Map<string, any[]>
  const indices  = new Map<string, Idx>()
  const keyMaps  = new Map<string, Record<string, string>>()
  let currentKeys = Object.keys(firstRows[0] ?? {})

  for (const rel of orderedRels) {
    const _preTo = dmStore.getNodeFilters(rel.toTable)
    const allToRows = dmStore.getTable(rel.toTable)?.rows ?? []
    const toRows = _preTo.length ? allToRows.filter(r => matchFilters(r, _preTo)) : allToRows
    const toKeys = toRows.length ? Object.keys(toRows[0]!) : []
    const km: Record<string, string> = {}
    for (const k of toKeys) km[k] = currentKeys.includes(k) ? `${rel.toTable}_${k}` : k
    keyMaps.set(rel.toTable, km)
    currentKeys = [...currentKeys, ...Object.values(km)]

    // Right joins use the from-index; inner/left use the to-index
    if (rel.joinType === 'right') {
      // We'll build a from-index lazily during streaming — handled in streamJoin
    } else {
      const idx: Idx = new Map()
      for (const row of toRows) {
        const key = String(row[rel.toColumn] ?? '')
        if (!idx.has(key)) idx.set(key, [])
        idx.get(key)!.push(row)
      }
      indices.set(rel.toTable, idx)
    }
  }

  // Streaming accumulator (reuses exported helpers from transformData)
  const accs   = new Map<string, any>()
  const colsRef = { v: [] as string[] }

  // Recursive streaming probe — feeds completed joined rows into accumulator
  function streamJoin(partial: any, relIdx: number): void {
    if (relIdx >= orderedRels.length) {
      accumulateRow(partial, txCfg, accs, colsRef)
      return
    }
    const rel = orderedRels[relIdx]
    const km  = keyMaps.get(rel.toTable)!

    if (rel.joinType === 'right') {
      // Right join: probe toRows against fromColumn value in partial
      const toRows = dmStore.getTable(rel.toTable)?.rows ?? []
      for (const toRow of toRows) {
        if (String(partial[rel.fromColumn] ?? '') === String(toRow[rel.toColumn] ?? '')) {
          const merged: any = { ...partial }
          for (const [k, mk] of Object.entries(km)) merged[mk] = toRow[k]
          streamJoin(merged, relIdx + 1)
        }
      }
      return
    }

    const idx     = indices.get(rel.toTable)!
    const matches = idx?.get(String(partial[rel.fromColumn] ?? ''))
    if (matches?.length) {
      for (const toRow of matches) {
        const merged: any = { ...partial }
        for (const [k, mk] of Object.entries(km)) merged[mk] = toRow[k]
        streamJoin(merged, relIdx + 1)
      }
    } else if (rel.joinType === 'left') {
      const merged: any = { ...partial }
      for (const mk of Object.values(km)) merged[mk] = null
      streamJoin(merged, relIdx + 1)
    }
    // inner join with no match → row excluded
  }

  for (const fromRow of firstRows) streamJoin(fromRow, 0)

  if (!colsRef.v.length) return []
  return materializeAccumulators(accs, colsRef.v, txCfg)
}

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

function buildJoinedDatasets(): { id: string; name: string; rows: any[]; columnLabels?: ReturnType<typeof parseColumnMapping>; columnSources?: Record<string, string>; numericFormat?: import('~/utils/formatValue').NumericFormat }[] {
  const tables = dmStore.tables
  if (!tables.length) return []

  const rels = Object.values(dmStore.relations)

  // No relations → each table becomes its own dataset
  if (!rels.length) {
    return tables.map(t => {
      const cfg    = dmStore.getTransform(t.id)
      const preF   = dmStore.getNodeFilters(t.id)
      const base   = preF.length ? t.rows.filter(r => matchFilters(r, preF)) : t.rows
      const rows   = cfg && (cfg.filters.length || cfg.groupByField || cfg.computedColumns?.length) ? applyTransform(base, cfg) : base
      const rawFmt = dmStore.getNumericFormat(t.id)
      const fmt    = Object.keys(rawFmt).length ? rawFmt : undefined
      return { id: `dm_${t.id}_${Date.now()}`, name: t.name, rows, columnLabels: t.columnLabels, numericFormat: fmt }
    })
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

  const datasets: { id: string; name: string; rows: any[]; columnLabels?: ReturnType<typeof parseColumnMapping>; columnSources?: Record<string, string>; numericFormat?: import('~/utils/formatValue').NumericFormat }[] = []
  let anyTruncated = false

  for (const comp of components) {
    const compRels = rels.filter(r => comp.includes(r.fromTable) && comp.includes(r.toTable))

    // merge columnLabels from all tables + get numeric format for this component
    const mergedLabels: ReturnType<typeof parseColumnMapping> = {}
    for (const tableId of comp) {
      const t = dmStore.getTable(tableId)
      if (t?.columnLabels) Object.assign(mergedLabels, t.columnLabels)
    }
    const columnLabels = Object.keys(mergedLabels).length ? mergedLabels : undefined

    if (!compRels.length) {
      const t      = dmStore.getTable(comp[0]!)!
      const rawFmt = dmStore.getNumericFormat(t.id)
      const fmt    = Object.keys(rawFmt).length ? rawFmt : undefined
      const preF = dmStore.getNodeFilters(t.id)
      const baseRows = preF.length ? t.rows.filter(r => matchFilters(r, preF)) : t.rows
      const isoCfg = dmStore.getTransform(t.id)
      const isoRows = isoCfg && (isoCfg.filters.length || isoCfg.groupByField || isoCfg.computedColumns?.length)
        ? applyTransform(baseRows, isoCfg)
        : baseRows
      datasets.push({ id: `dm_${t.id}_${Date.now()}`, name: t.name, rows: isoRows, columnLabels, numericFormat: fmt })
      continue
    }

    const firstTableId = compRels[0]!.fromTable
    const firstTable   = dmStore.getTable(firstTableId)
    const name         = comp.map(id => dmStore.getTable(id)?.name ?? id).join(' + ')
    const compKey      = [...comp].sort().join('+')
    const txCfg        = dmStore.getTransform(compKey)

    // Build columnSources map (mirrors joinStep key renaming)
    const columnSources: Record<string, string> = {}
    let   _srcKeys = Object.keys(firstTable?.rows[0] ?? {})
    for (const col of _srcKeys) columnSources[col] = firstTable?.name ?? firstTableId
    const _joined = new Set([firstTableId])
    for (const rel of compRels) {
      if (_joined.has(rel.toTable)) continue
      _joined.add(rel.toTable)
      const toTable = dmStore.getTable(rel.toTable)
      for (const k of Object.keys(toTable?.rows[0] ?? {})) {
        const finalKey = _srcKeys.includes(k) ? `${rel.toTable}_${k}` : k
        columnSources[finalKey] = toTable?.name ?? rel.toTable
        _srcKeys = [..._srcKeys, finalKey]
      }
    }

    // Ordered relation list (deduplicated, same order as join steps)
    const orderedRels: typeof compRels = []
    const ordJoined = new Set([firstTableId])
    for (const rel of compRels) {
      if (ordJoined.has(rel.toTable)) continue
      ordJoined.add(rel.toTable)
      orderedRels.push(rel)
    }

    let rows: any[]

    if (txCfg?.groupByField) {
      // ── Streaming join + GROUP BY ──────────────────────────────────────────
      rows = joinStreamGroupBy(firstTableId, orderedRels, txCfg)
      // Apply computed columns after streaming GROUP BY (applyTransform not called here)
      if (txCfg?.computedColumns?.length) {
        rows = applyComputedColumns(rows, txCfg.computedColumns)
      }
    } else {
      // ── Regular join with cap + optional filter-only transform ─────────────
      const _preFrom = dmStore.getNodeFilters(firstTableId)
      rows = (firstTable?.rows ?? [])
        .filter(r => matchFilters(r, _preFrom))
        .slice(0, MAX_SOURCE_ROWS)
      for (const rel of orderedRels) {
        const _preTo = dmStore.getNodeFilters(rel.toTable)
        const toRows = (dmStore.getTable(rel.toTable)?.rows ?? [])
          .filter(r => matchFilters(r, _preTo))
          .slice(0, MAX_SOURCE_ROWS)
        const { result, truncated } = joinStep(rows, rel, toRows, MAX_JOIN_ROWS)
        if (truncated) anyTruncated = true
        rows = result
      }
      if (txCfg && (txCfg.filters.length || txCfg.computedColumns?.length)) rows = applyTransform(rows, txCfg)
    }

    const joinedRawFmt = dmStore.getNumericFormat(compKey)
    datasets.push({
      id: `dm_joined_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name, rows, columnLabels,
      numericFormat:  Object.keys(joinedRawFmt).length ? joinedRawFmt : undefined,
      columnSources:  Object.keys(columnSources).length > 0 ? columnSources : undefined,
    })
  }

  exportWarning.value = anyTruncated
    ? t('bi_data_truncated', { max: MAX_JOIN_ROWS.toLocaleString() })
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
  toColsRaw.forEach((c, i) => { r[toColNames[i]!] = toRow[c] })
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

  const fromCols  = Object.keys(fromRows[0]!)
  const toColsRaw = Object.keys(toRows[0]!)
  const toColNames = toColsRaw.map(c => fromCols.includes(c) ? `${c}_2` : c)
  const headers    = [...fromCols, ...toColNames]
  const p: JoinParams = { fromCols, toColsRaw, toColNames }

  // Preview always uses left join so we always see rows (nulls for unmatched right side)
  const rows = rel.joinType === 'right'
    ? rightJoin(fromRows, toRows, rel.fromColumn, rel.toColumn, p)
    : innerLeftJoin(fromRows, toRows, rel.fromColumn, rel.toColumn, true, p)

  return { headers, rows }
})

// ─── Save / Load / Delete ─────────────────────────────────────────────────────
const biApi = useMangoBIApi()

const dmSavedId    = ref<string | null>(null)   // current saved record id
const dmSaveName   = ref('')
const dmIsPublic   = ref(false)
const dmSaving     = ref(false)
const dmSaveMsg    = ref('')
const showDmSave   = ref(false)

const showDmLoad    = ref(false)
const dmLoadTab     = ref<'mine' | 'public'>('mine')
const dmLoadList    = ref<import('~/composables/useMangoBIApi').BIListItem[]>([])
const dmPublicList  = ref<import('~/composables/useMangoBIApi').BIListItem[]>([])
const dmLoadBusy    = ref(false)
const dmPublicBusy  = ref(false)
const dmDeleting    = ref<string | null>(null)

async function openDmSave() {
  dmSaveMsg.value  = ''
  showDmSave.value = true
}

async function doSaveDm() {
  if (!dmSaveName.value.trim()) { dmSaveMsg.value = t('bi_please_enter_name'); return }
  dmSaving.value = true
  dmSaveMsg.value = ''
  try {
    const nodesPayload = nodes.value.map(n => ({ id: n.id, position: n.position }))
    const edgesPayload = edges.value.map(e => ({
      id: e.id, source: e.source, target: e.target,
      type: e.type, animated: e.animated, label: e.label,
      style: e.style, labelStyle: e.labelStyle, labelBgStyle: e.labelBgStyle,
      labelBgPadding: e.labelBgPadding,
    }))
    const tablesPayload = dmStore.tables.map(t => ({
      id: t.id, name: t.name, rows: t.rows, columnLabels: t.columnLabels,
    }))
    const nodesJson = JSON.stringify({
      nodes:         nodesPayload,
      edges:         edgesPayload,
      tables:        tablesPayload,
      transforms:    dmStore.transforms,
      nodeFilters:   dmStore.nodeFilters,
      numericFormats: dmStore.numericFormats,
    })
    const relationsJson = JSON.stringify({ relations: dmStore.relations })

    const savedId = await biApi.saveDataModel({
      id:           dmSavedId.value ?? undefined,
      name:         dmSaveName.value.trim(),
      nodesJson,
      relationsJson,
      isPublic:     dmIsPublic.value,
    })
    if (savedId) {
      dmSavedId.value = savedId
      dmSaveMsg.value = t('bi_save_success')
      setTimeout(() => { dmSaveMsg.value = ''; showDmSave.value = false }, 1200)
    } else {
      dmSaveMsg.value = t('bi_error')
    }
  } catch { dmSaveMsg.value = t('bi_error') }
  finally { dmSaving.value = false }
}

async function openDmLoad() {
  showDmLoad.value  = true
  dmLoadTab.value   = 'mine'
  dmLoadBusy.value  = true
  dmLoadList.value  = []
  dmPublicList.value = []
  try { dmLoadList.value = await biApi.listDataModels() }
  catch { dmLoadList.value = [] }
  finally { dmLoadBusy.value = false }
}

async function loadDmPublicTab() {
  if (dmPublicList.value.length) return
  dmPublicBusy.value = true
  try { dmPublicList.value = await biApi.listPublicDataModels() }
  catch { dmPublicList.value = [] }
  finally { dmPublicBusy.value = false }
}

watch(dmLoadTab, (tab) => {
  if (tab === 'public') loadDmPublicTab()
})

async function doLoadDm(id: string) {
  dmLoadBusy.value = true
  try {
    const row = await biApi.loadDataModel(id)
    if (!row) return
    const payload  = JSON.parse(row.nodesJson  ?? '{}')
    const relPay   = JSON.parse(row.relationsJson ?? '{}')

    // restore store
    dmStore.tables.splice(0)
    for (const k of Object.keys(dmStore.relations))      delete dmStore.relations[k]
    for (const k of Object.keys(dmStore.transforms))     delete dmStore.transforms[k]
    for (const k of Object.keys(dmStore.nodeFilters))    delete dmStore.nodeFilters[k]
    for (const k of Object.keys(dmStore.numericFormats)) delete dmStore.numericFormats[k]

    for (const t of (payload.tables ?? [])) dmStore.addTable(t)
    for (const [k, v] of Object.entries(relPay.relations        ?? {})) dmStore.setRelation(k, v as any)
    for (const [k, v] of Object.entries(payload.transforms      ?? {})) dmStore.setTransform(k, v as any)
    for (const [k, v] of Object.entries(payload.nodeFilters     ?? {})) dmStore.setNodeFilters(k, v as any)
    for (const [k, v] of Object.entries(payload.numericFormats  ?? {})) dmStore.setNumericFormat(k, v as any)

    nodes.value = (payload.nodes ?? []).map((n: any) => ({
      id: n.id, type: 'modelTable', position: n.position, data: {},
    }))
    edges.value = (payload.edges ?? []).map((e: any) => ({ ...e }))

    // sync canvas store so back-navigation restores the loaded state
    dmStore.saveCanvas(
      nodes.value.map(n => ({ id: n.id, position: n.position })),
      edges.value.map(e => ({ ...e })),
      id, row.name ?? '',
    )

    dmSavedId.value  = id
    dmSaveName.value = row.name ?? ''
    dmIsPublic.value = row.isPublic ?? false
    showDmLoad.value = false
    selectedNodeId.value = null
    selectedEdgeId.value = null
  } catch (err) { console.error(err) }
  finally { dmLoadBusy.value = false }
}

async function doDeleteDm(id: string) {
  if (!confirm(t('bi_confirm_delete_dm'))) return
  dmDeleting.value = id
  try {
    await biApi.deleteDataModel(id)
    dmLoadList.value = dmLoadList.value.filter(r => r.id !== id)
    if (dmSavedId.value === id) dmSavedId.value = null
  } catch { }
  finally { dmDeleting.value = null }
}

function goHome() { router.push('/') }

function clearDatamodel() {
  if (!confirm('Clear all tables, relations and transforms?')) return
  dmStore.tables.length = 0
  for (const k of Object.keys(dmStore.relations))      delete dmStore.relations[k]
  for (const k of Object.keys(dmStore.transforms))     delete dmStore.transforms[k]
  for (const k of Object.keys(dmStore.nodeFilters))    delete dmStore.nodeFilters[k]
  for (const k of Object.keys(dmStore.numericFormats)) delete dmStore.numericFormats[k]
  dmStore.clearCanvas()
  nodes.value = []
  edges.value = []
  dmSavedId.value  = null
  dmSaveName.value = ''
  selectedNodeId.value = null
  selectedEdgeId.value = null
}

// ─── Append DM Templates ──────────────────────────────────────────────────────
async function loadDmTemplates() {
  tplLoading.value = true
  try {
    const [mine, pub] = await Promise.all([
      biApi.listDataModels(),
      biApi.listPublicDataModels(),
    ])
    tplMyList.value     = mine
    const myIds         = new Set(mine.map((i: any) => i.id))
    tplPublicList.value = pub.filter((i: any) => !myIds.has(i.id))
  } catch {
    tplMyList.value = []; tplPublicList.value = []
  } finally {
    tplLoading.value = false
  }
}

async function appendDmTemplate(id: string) {
  if (tplAppending.value) return
  tplAppending.value = id
  try {
    const row = await biApi.loadDataModel(id)
    if (!row) return
    const payload = JSON.parse(row.nodesJson    ?? '{}')
    const relPay  = JSON.parse(row.relationsJson ?? '{}')

    const suffix = `-${Date.now()}`
    // Offset Y so appended nodes appear below existing ones
    const dy = nodes.value.length
      ? Math.max(...nodes.value.map((n: any) => (n.position?.y ?? 0) + 200)) + 80
      : 0

    // Build ID remap: old tableId → new tableId
    const idMap = new Map<string, string>()
    for (const t of (payload.tables ?? [])) idMap.set(t.id, t.id + suffix)

    // Append tables with remapped IDs
    for (const t of (payload.tables ?? [])) {
      dmStore.addTable({ ...t, id: idMap.get(t.id) ?? t.id })
    }

    // Append relations with remapped keys + fromTable/toTable
    for (const [k, v] of Object.entries(relPay.relations ?? {})) {
      const rel = v as any
      const newKey = k + suffix
      dmStore.setRelation(newKey, {
        ...rel,
        fromTable: idMap.get(rel.fromTable) ?? (rel.fromTable + suffix),
        toTable:   idMap.get(rel.toTable)   ?? (rel.toTable   + suffix),
      })
    }

    // Append transforms / nodeFilters / numericFormats with remapped keys
    for (const [k, v] of Object.entries(payload.transforms ?? {}))
      dmStore.setTransform(k + suffix, v as any)
    for (const [k, v] of Object.entries(payload.nodeFilters ?? {}))
      dmStore.setNodeFilters(k + suffix, v as any)
    for (const [k, v] of Object.entries(payload.numericFormats ?? {}))
      dmStore.setNumericFormat(k + suffix, v as any)

    // Append VueFlow nodes
    const newNodes = (payload.nodes ?? []).map((n: any) => ({
      id: idMap.get(n.id) ?? (n.id + suffix),
      type: 'modelTable',
      position: { x: n.position?.x ?? 0, y: (n.position?.y ?? 0) + dy },
      data: {},
    }))

    // Append VueFlow edges
    const newEdges = (payload.edges ?? []).map((e: any) => ({
      ...e,
      id:     e.id + suffix,
      source: idMap.get(e.source) ?? (e.source + suffix),
      target: idMap.get(e.target) ?? (e.target + suffix),
    }))

    nodes.value = [...nodes.value, ...newNodes]
    edges.value = [...edges.value, ...newEdges]
  } catch (err) { console.error(err) }
  finally { tplAppending.value = null }
}

const { systemPrompt: aiSystemPrompt, contextLabel: aiContextLabel } = useAiContext()
const aiStore = useAiChatStore()
const { enabled: aiEnabled } = useAiFeature()
</script>

<template>
  <div class="fixed inset-0 flex flex-col bg-background">

    <!-- ── Header ─────────────────────────────────────────────────────────── -->
    <header class="flex items-center gap-3 px-4 h-12 border-b shrink-0 bg-background z-20">
      <button
        @click="goHome"
        class="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Home class="size-4" />
        Home
      </button>
      <div class="h-4 w-px bg-border" />
      <GitMerge class="size-4 text-indigo-500" />
      <span class="font-semibold text-sm">Data Model</span>
      <button
        @click="clearDatamodel"
        title="Clear all tables, relations and transforms"
        class="flex items-center gap-1 text-xs px-2 py-1 rounded-lg text-destructive hover:bg-destructive/10 transition-colors border border-destructive/30"
      >
        <RotateCcw class="size-3" />
        Clear
      </button>

      <div class="ml-auto flex items-center gap-3">
        <span class="text-xs text-muted-foreground">
          {{ t('bi_table_stat', { count: tableCount, rel: relationCount }) }}
        </span>
        <button
          @click="showAddPanel = !showAddPanel"
          class="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600
                 text-white rounded-lg font-medium transition-colors"
        >
          <Database class="size-3.5" />
          {{ t('bi_add_table') }}
        </button>

        <!-- Save / Load buttons -->
        <div class="flex items-center gap-1.5 border-l pl-3">
          <button
            @click="openDmSave"
            :disabled="!dmStore.tables.length"
            :title="t('bi_save_dm_title')"
            class="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors
                   bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600
                   disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download class="size-3.5" />
            {{ t('bi_save_dm_title') }}
          </button>
          <button
            @click="openDmLoad"
            :title="t('bi_load_dm_title')"
            class="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors
                   bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            <Loader2 class="size-3.5" />
            {{ t('bi_load_dm_title') }}
          </button>
        </div>

        <!-- AI Assistant (paying customers only) -->
        <button
          v-if="aiEnabled"
          @click="aiStore.togglePanel('datamodel')"
          :class="[
            'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all',
            aiStore.openPage === 'datamodel'
              ? 'bg-violet-500 text-white border-violet-500'
              : 'border-violet-300 text-violet-600 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-950/30',
          ]"
        >
          <Sparkles class="size-3.5" />
          AI
        </button>

        <!-- Export to Report -->
        <div class="flex items-center gap-2 border-l pl-3">
          <span
            v-if="!exportStatus.ready"
            class="flex items-center gap-1 text-[12px] text-amber-600 dark:text-amber-400 max-w-[160px]"
            :title="exportStatus.reason"
          >
            <AlertCircle class="size-3 shrink-0" />
            <span class="truncate">{{ exportStatus.reason }}</span>
          </span>
          <button
            @click="exportToReport"
            :disabled="!exportStatus.ready"
            :title="exportStatus.ready ? t('bi_export_to_report_tooltip') : exportStatus.reason"
            class="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors
                   bg-emerald-500 hover:bg-emerald-600 text-white
                   disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowRight class="size-3.5" />
            {{ t('bi_use_in_report') }}
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
        <span class="text-[13px] flex-1">{{ exportWarning }}</span>
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
          :aria-label="t('bi_add_table')"
          class="w-64 border-r bg-background z-10 flex flex-col overflow-y-auto shrink-0 shadow-lg"
        >
          <div class="p-3 border-b flex items-center justify-between shrink-0">
            <span class="text-xs font-semibold">{{ t('bi_add_table') }}</span>
            <button @click="showAddPanel = false" class="text-muted-foreground hover:text-foreground">
              <X class="size-4" />
            </button>
          </div>

          <!-- Mode tabs -->
          <div class="flex border-b text-[12px] shrink-0">
            <button
              v-for="[m, label] in ([['saved','🗄️ My SQL'],['passcode','🔑 Passcode'],['rawsql','✏️ SQL']] as const)"
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
              <p class="text-[12px] font-semibold text-muted-foreground mb-1">{{ t('bi_table_name_optional') }}</p>
              <input
                v-model="customName"
                :placeholder="t('bi_display_name_placeholder')"
                class="w-full text-xs border rounded-lg px-2 py-1.5 bg-background
                       focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>

            <!-- My SQL Builder (saved) -->
            <template v-if="addMode === 'saved'">
              <div class="flex items-center justify-between">
                <p class="text-[12px] font-semibold text-muted-foreground">SQL Builder ของฉัน</p>
                <button
                  @click="loadSavedSqlList"
                  :disabled="savedSqlLoading"
                  class="size-5 flex items-center justify-center rounded hover:bg-accent transition-colors text-muted-foreground disabled:opacity-50"
                  title="รีเฟรช"
                >
                  <RotateCcw v-if="!savedSqlLoading" class="size-3" />
                  <Loader2 v-else class="size-3 animate-spin" />
                </button>
              </div>

              <!-- Loading -->
              <div v-if="savedSqlLoading" class="flex justify-center py-5">
                <Loader2 class="size-4 animate-spin text-muted-foreground" />
              </div>

              <!-- Empty -->
              <div v-else-if="!savedSqlItems.length"
                class="flex flex-col items-center gap-1.5 py-5 text-[12px] text-muted-foreground/60 italic border border-dashed rounded-lg">
                <Database class="size-4" />
                ยังไม่มี SQL Builder ที่บันทึกไว้
              </div>

              <!-- List -->
              <div v-else class="flex flex-col gap-1 max-h-56 overflow-y-auto -mx-1 px-1">
                <div
                  v-for="item in savedSqlItems" :key="item.id"
                  class="flex items-center gap-2 px-2.5 py-2 rounded-xl border hover:bg-accent/50 transition-colors group"
                >
                  <div class="flex-1 min-w-0">
                    <p class="text-xs font-medium truncate">{{ item.name }}</p>
                    <p class="text-[13px] text-muted-foreground/60 font-mono">
                      {{ new Date(item.updatedAt ?? item.createdAt).toLocaleString('th-TH') }}
                    </p>
                  </div>
                  <button
                    @click="addSavedSqlTable(item)"
                    :disabled="!!savedSqlAdding"
                    class="flex items-center gap-1 text-[12px] px-2.5 py-1 bg-indigo-500 hover:bg-indigo-600
                           text-white rounded-lg font-semibold transition-colors disabled:opacity-50 shrink-0"
                  >
                    <Loader2 v-if="savedSqlAdding === item.id" class="size-3 animate-spin" />
                    <Plus v-else class="size-3" />
                    <span v-if="savedSqlAdding !== item.id">Add</span>
                  </button>
                </div>
              </div>

              <!-- Error -->
              <div v-if="errorMsg && addMode === 'saved'"
                class="flex items-start gap-1.5 text-[12px] text-destructive bg-destructive/10 rounded-lg px-2 py-1.5">
                <AlertCircle class="size-3 shrink-0 mt-0.5" />
                <span class="break-all">{{ errorMsg }}</span>
              </div>

              <!-- Public SQL Builder -->
              <div class="flex items-center gap-1.5 pt-1">
                <Globe class="size-3 text-sky-400 shrink-0" />
                <p class="text-[12px] font-semibold text-muted-foreground flex-1">SQL Builder สาธารณะ</p>
                <span class="text-[13px] text-muted-foreground/50 font-mono">({{ publicSqlItems.length }})</span>
              </div>

              <div v-if="savedSqlLoading" class="flex justify-center py-3">
                <Loader2 class="size-4 animate-spin text-muted-foreground" />
              </div>
              <div v-else-if="!publicSqlItems.length"
                class="flex flex-col items-center gap-1 py-3 text-[12px] text-muted-foreground/50 italic border border-dashed rounded-lg">
                <Globe class="size-3.5" />
                ยังไม่มี SQL Builder สาธารณะ
              </div>
              <div v-else class="flex flex-col gap-1 max-h-48 overflow-y-auto -mx-1 px-1">
                <div
                  v-for="item in publicSqlItems" :key="item.id"
                  class="flex items-center gap-2 px-2.5 py-2 rounded-xl border border-sky-500/20 hover:bg-sky-500/5 transition-colors group"
                >
                  <Globe class="size-3 text-sky-400 shrink-0" />
                  <div class="flex-1 min-w-0">
                    <p class="text-xs font-medium truncate">{{ item.name }}</p>
                    <p class="text-[13px] text-muted-foreground/60 font-mono truncate">
                      {{ item.createdBy }} · {{ new Date(item.updatedAt ?? item.createdAt).toLocaleString('th-TH') }}
                    </p>
                  </div>
                  <button
                    @click="addSavedSqlTable(item)"
                    :disabled="!!savedSqlAdding"
                    class="flex items-center gap-1 text-[12px] px-2.5 py-1 bg-sky-500 hover:bg-sky-600
                           text-white rounded-lg font-semibold transition-colors disabled:opacity-50 shrink-0"
                  >
                    <Loader2 v-if="savedSqlAdding === item.id" class="size-3 animate-spin" />
                    <Plus v-else class="size-3" />
                    <span v-if="savedSqlAdding !== item.id">Add</span>
                  </button>
                </div>
              </div>

            </template>

            <!-- Passcode / SQL Template mode -->
            <template v-else-if="addMode === 'passcode'">
              <!-- Passcode -->
              <div>
                <p class="text-[12px] font-semibold text-muted-foreground mb-1">Passcode</p>
                <div class="flex gap-1.5">
                  <input
                    v-model="sqlPasscode"
                    type="text"
                    :placeholder="t('bi_enter_passcode_placeholder')"
                    class="flex-1 text-xs border rounded-lg px-2 py-1.5 bg-background
                           focus:outline-none focus:ring-1 focus:ring-indigo-400 min-w-0
                           font-mono tracking-wider"
                    @keydown.enter.stop="fetchSqlTemplates"
                  />
                  <button
                    @click="fetchSqlTemplates"
                    :disabled="sqlLoading"
                    class="px-2.5 text-[12px] font-semibold bg-indigo-100 dark:bg-indigo-900/40
                           text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700
                           rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-800/50 transition-colors
                           disabled:opacity-60 shrink-0"
                  >
                    <Loader2 v-if="sqlLoading" class="size-3 animate-spin" />
                    <span v-else>{{ t('bi_search') }}</span>
                  </button>
                </div>
              </div>

              <!-- Template list -->
              <template v-if="sqlTemplatesLoaded">
                <div v-if="sqlTemplates.length" class="space-y-1.5">
                  <div class="flex items-center justify-between">
                    <p class="text-[12px] font-semibold text-muted-foreground">Template</p>
                    <span class="text-[12px] text-indigo-500">{{ sqlTemplates.length }} {{ t('bi_items') }}</span>
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
                  class="flex items-center justify-center gap-1.5 py-2 text-[12px] text-muted-foreground border border-dashed rounded-lg"
                >
                  {{ t('bi_template_not_found_passcode') }}
                </div>
              </template>

              <div
                v-if="errorMsg"
                class="flex items-start gap-1.5 text-[12px] text-destructive bg-destructive/10 rounded-lg px-2 py-1.5"
              >
                <AlertCircle class="size-3 shrink-0 mt-0.5" />
                <span class="break-all">{{ errorMsg }}</span>
              </div>

              <div v-if="sqlTemplatesLoaded && sqlTemplates.length" class="flex gap-1.5">
                <button
                  @click="addSQLTable"
                  :disabled="loading || !selectedTemplateId"
                  class="flex-1 flex items-center justify-center gap-1.5 text-xs py-2
                         bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium
                         transition-colors disabled:opacity-60"
                >
                  <Loader2 v-if="loading" class="size-3 animate-spin" />
                  <Download v-else class="size-3" />
                  {{ loading ? t('bi_loading') : t('bi_add_table') }}
                </button>
                <button
                  @click="debugDownloadSQL"
                  :disabled="loading || !selectedTemplateId"
                  title="Debug: download raw API response as JSON"
                  class="flex items-center justify-center gap-1 text-xs px-2 py-2
                         bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium
                         transition-colors disabled:opacity-60"
                >
                  <Loader2 v-if="loading" class="size-3 animate-spin" />
                  <Bug v-else class="size-3" />
                </button>
              </div>
            </template>

            <!-- Raw SQL mode -->
            <template v-else-if="addMode === 'rawsql'">
              <!-- Validation errors -->
              <div
                v-if="rawSqlErrors.length"
                class="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 space-y-0.5"
              >
                <p class="text-[12px] font-semibold text-destructive mb-1">SQL ไม่ผ่านการตรวจสอบ</p>
                <p v-for="err in rawSqlErrors" :key="err" class="text-[12px] text-destructive flex items-start gap-1">
                  <AlertCircle class="size-3 shrink-0 mt-0.5" />
                  {{ err }}
                </p>
              </div>

              <!-- SQL textarea -->
              <div>
                <div class="flex items-center justify-between mb-1">
                  <p class="text-[12px] font-semibold text-muted-foreground">SQL Statement</p>
                  <span class="text-[13px] text-muted-foreground/60">SELECT / WITH CTE</span>
                </div>
                <textarea
                  v-model="rawSqlText"
                  rows="10"
                  placeholder="SELECT col1, col2&#10;FROM table_name&#10;WHERE condition&#10;&#10;-- หรือ CTE:&#10;WITH cte AS (&#10;  SELECT ...&#10;)&#10;SELECT * FROM cte"
                  spellcheck="false"
                  class="w-full text-[12px] font-mono border rounded-lg px-2 py-1.5 bg-background
                         focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none leading-relaxed"
                  :class="rawSqlErrors.length ? 'border-destructive' : ''"
                  @input="rawSqlErrors = []"
                />
              </div>

              <!-- Security note -->
              <div class="flex items-start gap-1.5 text-[12px] text-muted-foreground bg-muted/40 rounded-lg px-2.5 py-2">
                <AlertCircle class="size-3 shrink-0 mt-0.5 text-amber-500" />
                <span>ระบบจะตรวจสอบ SQL ทั้ง client และ server — อนุญาตเฉพาะ SELECT และ WITH … AS (CTE) เท่านั้น</span>
              </div>

              <!-- Error -->
              <div
                v-if="errorMsg"
                class="flex items-start gap-1.5 text-[12px] text-destructive bg-destructive/10 rounded-lg px-2 py-1.5"
              >
                <AlertCircle class="size-3 shrink-0 mt-0.5" />
                <span class="break-all">{{ errorMsg }}</span>
              </div>

              <button
                @click="addRawSqlTable"
                :disabled="rawSqlLoading || !rawSqlText.trim()"
                class="w-full flex items-center justify-center gap-1.5 text-xs py-2
                       bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium
                       transition-colors disabled:opacity-60"
              >
                <Loader2 v-if="rawSqlLoading" class="size-3 animate-spin" />
                <Download v-else class="size-3" />
                {{ rawSqlLoading ? t('bi_loading') : t('bi_add_table') }}
              </button>
            </template>
          </div>

          <!-- ── DM Templates (Append) ──────────────────────────────────── -->
          <div class="border-t shrink-0">

            <!-- Section header -->
            <button
              class="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/60 transition-colors text-left"
              @click="tplOpen = !tplOpen; if (tplOpen && !tplMyList.length && !tplLoading) loadDmTemplates()"
            >
              <ChevronRight :class="['size-3.5 text-muted-foreground shrink-0 transition-transform duration-150', tplOpen ? 'rotate-90' : '']" />
              <BookMarked class="size-3.5 text-violet-400 shrink-0" />
              <span class="text-xs font-bold text-muted-foreground uppercase tracking-wide flex-1">Templates</span>
              <Loader2 v-if="tplLoading" class="size-3.5 animate-spin text-muted-foreground shrink-0" />
              <button
                v-else
                @click.stop="loadDmTemplates()"
                class="text-muted-foreground hover:text-foreground shrink-0"
                title="รีเฟรช"
              >
                <RefreshCw class="size-3.5" />
              </button>
            </button>

            <div v-if="tplOpen" class="max-h-64 overflow-y-auto">

              <!-- ของฉัน -->
              <div class="px-3 py-1 flex items-center gap-1.5 sticky top-0 bg-background/90 backdrop-blur-sm z-10">
                <Lock class="size-2.5 text-muted-foreground/60" />
                <span class="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wide">ของฉัน</span>
                <span class="text-[9px] text-muted-foreground/40 font-mono">({{ tplMyList.length }})</span>
              </div>
              <div v-if="!tplMyList.length && !tplLoading"
                class="px-4 pb-2 text-[10px] text-muted-foreground/50 italic">ยังไม่มี</div>
              <button
                v-for="t in tplMyList" :key="t.id"
                @click="appendDmTemplate(t.id)"
                :disabled="tplAppending === t.id"
                class="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent transition-colors text-left disabled:opacity-50 border-b border-border/10 last:border-0"
              >
                <Loader2 v-if="tplAppending === t.id" class="size-3 animate-spin text-violet-400 shrink-0" />
                <BookMarked v-else class="size-3 text-violet-400 shrink-0" />
                <div class="flex-1 min-w-0">
                  <p class="text-xs truncate">{{ t.name }}</p>
                  <p class="text-[9px] text-muted-foreground/50 truncate">
                    {{ new Date(t.updatedAt ?? t.createdAt).toLocaleDateString('th-TH') }}
                  </p>
                </div>
              </button>

              <!-- สาธารณะ -->
              <div class="px-3 py-1 flex items-center gap-1.5 sticky top-0 bg-background/90 backdrop-blur-sm z-10 mt-1">
                <Globe class="size-2.5 text-sky-400/80" />
                <span class="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wide">สาธารณะ</span>
                <span class="text-[9px] text-muted-foreground/40 font-mono">({{ tplPublicList.length }})</span>
              </div>
              <div v-if="!tplPublicList.length && !tplLoading"
                class="px-4 pb-2 text-[10px] text-muted-foreground/50 italic">ยังไม่มี</div>
              <button
                v-for="t in tplPublicList" :key="t.id"
                @click="appendDmTemplate(t.id)"
                :disabled="tplAppending === t.id"
                class="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent transition-colors text-left disabled:opacity-50 border-b border-border/10 last:border-0"
              >
                <Loader2 v-if="tplAppending === t.id" class="size-3 animate-spin text-sky-400 shrink-0" />
                <Globe v-else class="size-3 text-sky-400 shrink-0" />
                <div class="flex-1 min-w-0">
                  <p class="text-xs truncate">{{ t.name }}</p>
                  <p class="text-[9px] text-muted-foreground/50 truncate">
                    {{ t.createdBy }} · {{ new Date(t.updatedAt ?? t.createdAt).toLocaleDateString('th-TH') }}
                  </p>
                </div>
              </button>

            </div>
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
          <p class="text-sm font-medium text-muted-foreground">{{ t('bi_hint_click_add_table') }}</p>
          <p class="text-xs text-muted-foreground/60">{{ t('bi_hint_drag_handle') }}</p>
        </div>

        <!-- ── Layers toggle button (top-right of canvas) ──────────────── -->
        <button
          v-if="!showLayersPanel"
          @click.stop="showLayersPanel = true"
          @pointerdown.stop
          @mousedown.stop
          :class="[
            'layers-panel-overlay absolute top-3 right-3 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all shadow-sm',
            'bg-background text-muted-foreground border-border hover:border-indigo-400/50 hover:text-indigo-500',
          ]"
        >
          <Layers class="size-3.5" />
          Layers
        </button>

        <!-- ── Layers Panel ──────────────────────────────────────────────── -->
        <Transition name="slide-right">
          <div
            v-if="showLayersPanel && nodes.length"
            class="layers-panel-overlay absolute top-3 right-3 z-20 w-60 rounded-xl border bg-background shadow-2xl flex flex-col overflow-hidden"
            style="max-height: calc(100% - 24px)"
            @click.stop
            @pointerdown.stop
            @mousedown.stop
          >
            <div class="px-3 py-2.5 border-b flex items-center justify-between shrink-0 bg-muted/30">
              <div class="flex items-center gap-1.5">
                <Layers class="size-3.5 text-indigo-500" />
                <span class="text-xs font-semibold">Layers</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-[12px] text-muted-foreground">{{ tableCount }} {{ t('bi_tables') }}</span>
                <button @click="showLayersPanel = false" class="text-muted-foreground hover:text-foreground transition-colors">
                  <X class="size-3.5" />
                </button>
              </div>
            </div>
            <div class="flex-1 overflow-y-auto min-h-0">
              <!-- Tables list -->
              <button
                v-for="table in dmStore.tables"
                :key="table.id"
                @click="focusNode(table.id)"
                class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent transition-colors group"
                :class="selectedNodeId === table.id && !selectedEdge ? 'bg-indigo-50 dark:bg-indigo-950/40' : ''"
              >
                <Table2 class="size-3.5 shrink-0"
                  :class="selectedNodeId === table.id && !selectedEdge ? 'text-indigo-500' : 'text-muted-foreground'" />
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-medium truncate"
                    :class="selectedNodeId === table.id && !selectedEdge ? 'text-indigo-600 dark:text-indigo-400' : ''">
                    {{ table.name }}
                  </p>
                  <p class="text-[12px] text-muted-foreground">
                    {{ table.rows.length.toLocaleString() }} {{ t('bi_rows') }}
                    <template v-if="nodeRelationCount[table.id]">
                      · {{ nodeRelationCount[table.id] }} {{ t('bi_relations') }}
                    </template>
                  </p>
                </div>
                <span
                  v-if="nodeRelationCount[table.id]"
                  class="size-1.5 rounded-full bg-emerald-400 shrink-0"
                  :title="`${nodeRelationCount[table.id]} relation(s)`"
                />
              </button>

              <!-- Joined Components section -->
              <template v-if="joinedComponents.length">
                <div class="px-3 py-1.5 bg-muted/40 border-t flex items-center gap-1.5">
                  <GitMerge class="size-3 text-violet-500" />
                  <span class="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">
                    {{ t('bi_joined_components') }}
                  </span>
                </div>
                <div
                  v-for="comp in joinedComponents"
                  :key="comp.key"
                  class="px-3 py-2 border-t first:border-t-0 flex flex-col gap-1.5"
                >
                  <div class="flex items-start gap-1.5">
                    <GitMerge class="size-3.5 shrink-0 text-violet-400 mt-0.5" />
                    <div class="flex-1 min-w-0">
                      <p class="text-[13px] font-medium text-violet-700 dark:text-violet-300 leading-tight">
                        {{ comp.tableIds.map(id => dmStore.getTable(id)?.name ?? id).join(' + ') }}
                      </p>
                      <p class="text-[12px] text-muted-foreground">
                        {{ comp.tableIds.length }} {{ t('bi_tables') }} · {{ comp.relCount }} {{ t('bi_relations') }}
                        <span
                          v-if="dmStore.getTransform(comp.key)"
                          class="ml-1 text-violet-500 font-semibold"
                        >· Transform ✓</span>
                      </p>
                    </div>
                  </div>
                  <button
                    @click="openJoinTxModal(comp.key)"
                    class="w-full flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-semibold
                           rounded-lg border border-violet-300 dark:border-violet-700
                           text-violet-600 dark:text-violet-400
                           hover:bg-violet-50 dark:hover:bg-violet-950/40 transition-colors"
                  >
                    <Shuffle class="size-3" />
                    Transform & Export
                  </button>
                </div>
              </template>
            </div>
          </div>
        </Transition>
      </div>

      <!-- ── Node Data Preview (right panel) ───────────────────────────── -->
      <Transition name="slide-right">
        <aside
          v-if="selectedNodeData && !selectedEdge"
          :aria-label="t('bi_table_data_aria')"
          class="w-72 border-l bg-background z-10 flex flex-col shrink-0 shadow-lg"
        >
          <!-- Header -->
          <div class="px-3 py-2.5 border-b flex items-center justify-between shrink-0">
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

          <!-- Stats row + Transform button -->
          <div class="px-3 py-2 border-b flex items-center gap-3 text-[12px] text-muted-foreground shrink-0">
            <span><span class="font-semibold text-foreground">{{ selectedNodeData.rows.length.toLocaleString() }}</span> {{ t('bi_rows') }}</span>
            <span><span class="font-semibold text-foreground">{{ nodePreviewCols.length }}</span> {{ t('bi_columns_label') }}</span>
            <button
              @click="showTxModal = true; txModalTab = 'before'"
              class="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-md border text-[12px] font-semibold transition-colors"
              :class="txHasConfig
                ? 'border-violet-400 text-violet-600 bg-violet-50 dark:bg-violet-950/40'
                : 'border-border text-muted-foreground hover:bg-accent'"
            >
              <Shuffle class="size-3" />
              Transform
              <span v-if="txHasConfig" class="size-1.5 rounded-full bg-violet-500" />
            </button>
          </div>

          <!-- Pre-filter section -->
          <div class="px-3 py-2.5 flex flex-col gap-2 overflow-y-auto flex-1">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5">
                <p class="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Pre-filter</p>
                <span v-if="nodeHasPreFilters"
                  class="text-[13px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400">
                  {{ nodePreFilters.length }}
                </span>
              </div>
              <button
                @click="nodeAddPreFilter"
                class="flex items-center gap-1 text-[12px] px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 hover:bg-orange-200 transition-colors font-semibold"
              >
                <Plus class="size-3" /> {{ t('bi_add') }}
              </button>
            </div>

            <div v-if="!nodeHasPreFilters" class="text-[12px] text-muted-foreground text-center py-3 border border-dashed rounded-lg">
              {{ t('bi_no_filters') }}
            </div>

            <div v-for="(f, i) in nodePreFilters" :key="i" class="flex flex-col gap-1 p-2 rounded-lg bg-muted/30 border">
              <!-- Column picker -->
              <select
                :value="f.field"
                @change="nodeUpdatePreFilter(i, { field: ($event.target as HTMLSelectElement).value })"
                class="w-full text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-orange-400"
              >
                <option v-for="c in nodePreviewCols" :key="c.name" :value="c.name">{{ c.label }}</option>
              </select>
              <div class="flex items-center gap-1">
                <!-- Op -->
                <select
                  :value="f.op"
                  @change="nodeUpdatePreFilter(i, { op: ($event.target as HTMLSelectElement).value as any })"
                  class="w-16 shrink-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-orange-400"
                >
                  <option v-for="o in OP_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
                <!-- Value: date field -->
                <template v-if="isNodeDateField(f.field)">
                  <span
                    v-if="DATE_TOKEN_LABELS[f.value]"
                    class="flex items-center gap-1 text-[12px] font-semibold text-blue-600 dark:text-blue-400
                           bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-700
                           rounded px-2 py-1 shrink-0 cursor-pointer"
                    @click="nodeUpdatePreFilter(i, { value: '' })"
                    title="Click to clear"
                  >{{ DATE_TOKEN_LABELS[f.value] }} <X class="size-2.5" /></span>
                  <input v-else type="date" :value="f.value"
                    @change="nodeUpdatePreFilter(i, { value: ($event.target as HTMLInputElement).value })"
                    class="flex-1 min-w-0 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-orange-400" />
                  <button @click="nodeUpdatePreFilter(i, { value: DATE_TOKEN_TODAY })"
                    :class="['shrink-0 text-[13px] font-semibold px-1.5 py-1 rounded transition-colors border',
                      f.value === DATE_TOKEN_TODAY
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40']"
                    :title="t('bi_today')">T</button>
                </template>
                <!-- Value: regular -->
                <input v-else
                  :value="f.value"
                  @input="nodeUpdatePreFilter(i, { value: ($event.target as HTMLInputElement).value })"
                  :placeholder="t('bi_value')"
                  class="flex-1 min-w-0 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-orange-400"
                />
                <button @click="nodeRemovePreFilter(i)" class="shrink-0 text-muted-foreground hover:text-destructive transition-colors">
                  <X class="size-3.5" />
                </button>
              </div>
            </div>
          </div>

        </aside>
      </Transition>

      <!-- ── Relationship Editor (right panel) ──────────────────────────── -->
      <Transition name="slide-right">
        <aside
          v-if="selectedEdge"
          :aria-label="t('bi_edit_relationship')"
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
              :title="t('bi_delete_relation_title')"
            >
              <Trash2 class="size-3.5" />
            </button>
          </div>

          <div class="p-3 flex flex-col gap-4 overflow-y-auto">

            <!-- From table + column -->
            <div class="space-y-1.5">
              <p class="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">{{ t('bi_from_table') }}</p>
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
                        :placeholder="t('bi_search_column_placeholder')"
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
                        <span v-if="col.label !== col.name" class="block text-[12px] text-muted-foreground/60 font-mono truncate">{{ col.name }}</span>
                      </button>
                      <div v-if="!filteredFromCols.length" class="px-2 py-2 text-[12px] text-muted-foreground text-center">{{ t('bi_not_found') }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- To table + column -->
            <div class="space-y-1.5">
              <p class="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">{{ t('bi_to_table') }}</p>
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
                        :placeholder="t('bi_search_column_placeholder')"
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
                        <span v-if="col.label !== col.name" class="block text-[12px] text-muted-foreground/60 font-mono truncate">{{ col.name }}</span>
                      </button>
                      <div v-if="!filteredToCols.length" class="px-2 py-2 text-[12px] text-muted-foreground text-center">{{ t('bi_not_found') }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Cardinality -->
            <div class="space-y-1.5">
              <p class="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Cardinality</p>
              <div class="grid grid-cols-2 gap-1.5">
                <button
                  v-for="c in (['1:1','1:*','*:1','*:*'] as const)"
                  :key="c"
                  @click="updateRelation('cardinality', c)"
                  :class="[
                    'py-2 rounded-lg border text-[13px] font-mono font-bold transition-colors',
                    selectedEdge.cardinality === c
                      ? 'bg-indigo-500 text-white border-indigo-500'
                      : 'text-muted-foreground hover:border-indigo-300 hover:text-indigo-600',
                  ]"
                >{{ c }}</button>
              </div>
            </div>

            <!-- Join Type -->
            <div class="space-y-1.5">
              <p class="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Join Type</p>
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
              <p class="text-[12px] text-indigo-600 dark:text-indigo-400 font-mono text-center leading-relaxed">
                {{ dmStore.getTable(selectedEdge.fromTable)?.name }}.{{ colLabel(selectedEdge.fromTable, selectedEdge.fromColumn) }}<br/>
                <span class="font-bold">{{ selectedEdge.cardinality }}</span> ({{ selectedEdge.joinType }})<br/>
                {{ dmStore.getTable(selectedEdge.toTable)?.name }}.{{ colLabel(selectedEdge.toTable, selectedEdge.toColumn) }}
              </p>
            </div>

            <!-- Data Preview -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <p class="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">{{ t('bi_sample_data') }}</p>
                <span class="text-[12px] text-indigo-500">
                  {{ sampleJoin ? `${sampleJoin.rows.length} ${t('bi_rows')}` : '—' }}
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
                class="text-[12px] text-muted-foreground text-center py-3 border border-dashed rounded-lg"
              >
                {{ sampleJoin ? t('bi_no_matching_rows') : t('bi_add_data_to_tables_first') }}
              </div>
            </div>

          </div>
        </aside>
      </Transition>

    </div>

    <!-- ── Save DataModel Dialog ─────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showDmSave" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          @click.self="showDmSave = false">
          <div class="bg-background rounded-xl shadow-2xl w-80 p-5 flex flex-col gap-4">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-sm">{{ t('bi_save_dm_title') }}</span>
              <button @click="showDmSave = false" class="text-muted-foreground hover:text-foreground">
                <X class="size-4" />
              </button>
            </div>
            <div>
              <label class="text-[12px] font-semibold text-muted-foreground mb-1 block">{{ t('bi_name') }}</label>
              <input
                v-model="dmSaveName"
                :placeholder="t('bi_dm_name_placeholder')"
                class="w-full text-xs border rounded-lg px-3 py-2 bg-background
                       focus:outline-none focus:ring-2 focus:ring-indigo-500"
                @keydown.enter="doSaveDm"
              />
            </div>
            <!-- Public toggle -->
            <button
              type="button"
              @click="dmIsPublic = !dmIsPublic"
              :class="[
                'w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors',
                dmIsPublic
                  ? 'bg-sky-500/10 border-sky-500/40 text-sky-600'
                  : 'bg-muted/30 border-border text-muted-foreground hover:bg-accent'
              ]"
            >
              <Globe v-if="dmIsPublic" class="size-4 shrink-0" />
              <Lock v-else class="size-4 shrink-0" />
              <div class="flex-1 text-left">
                <p class="text-xs font-semibold">{{ dmIsPublic ? 'สาธารณะ' : 'ส่วนตัว' }}</p>
                <p class="text-[12px] opacity-70">{{ dmIsPublic ? 'ทุกคนในระบบเห็นและโหลดได้' : 'มองเห็นเฉพาะคุณ' }}</p>
              </div>
              <div :class="['relative w-9 h-5 rounded-full transition-colors shrink-0', dmIsPublic ? 'bg-sky-500' : 'bg-muted-foreground/30']">
                <div :class="['absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform', dmIsPublic ? 'translate-x-4' : 'translate-x-0.5']" />
              </div>
            </button>
            <p v-if="dmSaveMsg" class="text-xs text-center"
               :class="dmSaveMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-500'">
              {{ dmSaveMsg }}
            </p>
            <div class="flex gap-2">
              <button @click="showDmSave = false"
                class="flex-1 text-xs py-1.5 rounded-lg border hover:bg-accent transition-colors">
                {{ t('cancel') }}
              </button>
              <button @click="doSaveDm" :disabled="dmSaving"
                class="flex-1 text-xs py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600
                       text-white font-medium transition-colors disabled:opacity-50">
                {{ dmSaving ? t('bi_saving') : t('save') }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Load DataModel Dialog ──────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showDmLoad" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          @click.self="showDmLoad = false">
          <div class="bg-background rounded-xl shadow-2xl w-[460px] flex flex-col max-h-[80vh]">

            <!-- Header -->
            <div class="flex items-center justify-between px-5 py-4 border-b">
              <span class="font-semibold text-sm">{{ t('bi_load_dm_title') }}</span>
              <button @click="showDmLoad = false" class="text-muted-foreground hover:text-foreground">
                <X class="size-4" />
              </button>
            </div>

            <!-- Tabs -->
            <div class="flex gap-1 mx-4 mt-3 mb-1 p-1 bg-muted/50 rounded-lg shrink-0">
              <button
                @click="dmLoadTab = 'mine'"
                :class="['flex-1 text-xs py-1 rounded-md font-medium transition-colors',
                  dmLoadTab === 'mine' ? 'bg-background shadow text-sky-600' : 'text-muted-foreground hover:text-foreground']"
              >
                ของฉัน <span class="text-[12px] opacity-60">({{ dmLoadList.length }})</span>
              </button>
              <button
                @click="dmLoadTab = 'public'"
                :class="['flex-1 text-xs py-1 rounded-md font-medium transition-colors flex items-center justify-center gap-1',
                  dmLoadTab === 'public' ? 'bg-background shadow text-sky-600' : 'text-muted-foreground hover:text-foreground']"
              >
                <Globe class="size-3" />
                สาธารณะ
              </button>
            </div>

            <!-- List -->
            <div class="flex-1 overflow-y-auto p-3">

              <!-- ของฉัน -->
              <template v-if="dmLoadTab === 'mine'">
                <div v-if="dmLoadBusy" class="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                  <Loader2 class="size-4 animate-spin" />
                  <span class="text-xs">{{ t('bi_loading') }}</span>
                </div>
                <div v-else-if="!dmLoadList.length"
                  class="text-center py-10 text-xs text-muted-foreground">{{ t('bi_no_saved_dm') }}</div>
                <div v-else class="flex flex-col gap-1.5">
                  <div
                    v-for="item in dmLoadList" :key="item.id"
                    class="flex items-center gap-2 px-3 py-2.5 rounded-lg border hover:bg-accent cursor-pointer transition-colors"
                    @click="doLoadDm(item.id)"
                  >
                    <div class="flex-1 min-w-0">
                      <p class="text-xs font-semibold truncate">{{ item.name }}</p>
                      <p class="text-[12px] text-muted-foreground">
                        {{ item.createdBy }} ·
                        {{ new Date(item.updatedAt ?? item.createdAt).toLocaleDateString('th-TH') }}
                      </p>
                    </div>
                    <button
                      @click.stop="doDeleteDm(item.id)"
                      :disabled="dmDeleting === item.id"
                      class="shrink-0 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30
                             text-red-500 transition-colors disabled:opacity-50"
                      :title="t('delete')"
                    >
                      <Trash2 class="size-3.5" />
                    </button>
                  </div>
                </div>
              </template>

              <!-- สาธารณะ -->
              <template v-else>
                <div v-if="dmPublicBusy" class="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                  <Loader2 class="size-4 animate-spin" />
                  <span class="text-xs">{{ t('bi_loading') }}</span>
                </div>
                <div v-else-if="!dmPublicList.length"
                  class="text-center py-10 text-xs text-muted-foreground">ยังไม่มี Data Model สาธารณะ</div>
                <div v-else class="flex flex-col gap-1.5">
                  <div
                    v-for="item in dmPublicList" :key="item.id"
                    class="flex items-center gap-2 px-3 py-2.5 rounded-lg border hover:bg-accent cursor-pointer transition-colors"
                    @click="doLoadDm(item.id)"
                  >
                    <Globe class="size-3.5 text-sky-400 shrink-0" />
                    <div class="flex-1 min-w-0">
                      <p class="text-xs font-semibold truncate">{{ item.name }}</p>
                      <p class="text-[12px] text-muted-foreground">
                        {{ item.createdBy }} ·
                        {{ new Date(item.updatedAt ?? item.createdAt).toLocaleDateString('th-TH') }}
                      </p>
                    </div>
                  </div>
                </div>
              </template>

            </div>

            <div class="px-5 py-3 border-t flex justify-end">
              <button @click="showDmLoad = false"
                class="text-xs px-4 py-1.5 rounded-lg border hover:bg-accent transition-colors">
                {{ t('close') }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Transform Modal ────────────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showTxModal"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          @click.self="showTxModal = false"
        >
          <div class="bg-background flex flex-col overflow-hidden w-screen h-screen">

            <!-- Modal header -->
            <div class="flex items-center gap-2.5 px-5 py-3 border-b shrink-0">
              <Shuffle class="size-4 text-violet-500" />
              <span class="text-sm font-semibold">Transform</span>
              <span class="text-xs text-muted-foreground truncate max-w-[220px]">
                — {{ txJoinedRows.length > (selectedNodeData?.rows.length ?? 0)
                    ? `${selectedNodeData?.name ?? ''} (joined: ${txJoinedRows.length.toLocaleString()} rows)`
                    : (selectedNodeData?.name ?? '') }}
              </span>
              <div class="ml-auto flex items-center gap-2">
                <button
                  @click="txFilters = []; txGroupBy = ''; txAggregations = {}; txComputedCols = []"
                  class="text-xs px-2.5 py-1 rounded-lg border text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
                >
                  {{ t('bi_clear') }}
                </button>
                <button @click="showTxModal = false" class="text-muted-foreground hover:text-foreground transition-colors">
                  <X class="size-4" />
                </button>
              </div>
            </div>

            <!-- Modal body -->
            <div class="flex flex-1 min-h-0">

              <!-- Left: config panel -->
              <div class="w-80 shrink-0 border-r flex flex-col" style="min-height:0">
                <!-- scrollable config area -->
                <div class="flex-1 overflow-y-auto p-4" style="min-height:0">
                <div class="flex flex-col gap-5">

                <!-- Filter -->
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <p class="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Filter</p>
                    <button
                      @click="txAddFilter"
                      class="flex items-center gap-1 text-[12px] px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 hover:bg-violet-200 transition-colors font-semibold"
                    >
                      <Plus class="size-3" /> {{ t('bi_add') }}
                    </button>
                  </div>

                  <div v-if="!txFilters.length" class="text-[12px] text-muted-foreground text-center py-2 border border-dashed rounded-lg">
                    {{ t('bi_no_filters') }}
                  </div>

                  <div v-for="(f, i) in txFilters" :key="i" class="flex items-center gap-1.5">
                    <select
                      v-model="f.field"
                      class="flex-1 min-w-0 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400"
                    >
                      <template v-if="txColGroups.length > 1">
                        <optgroup v-for="g in txColGroups" :key="g.sourceName" :label="g.sourceName">
                          <option v-for="c in g.cols" :key="c" :value="c">{{ txColLabel(c) }}</option>
                        </optgroup>
                      </template>
                      <option v-else v-for="c in txColumns" :key="c" :value="c">{{ txColLabel(c) }}</option>
                    </select>
                    <select
                      v-model="f.op"
                      class="w-16 shrink-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400"
                    >
                      <option v-for="o in OP_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                    <!-- Date field: datepicker + dynamic tokens -->
                    <template v-if="isDateField(f.field)">
                      <span
                        v-if="DATE_TOKEN_LABELS[f.value]"
                        class="flex items-center gap-1 text-[12px] font-semibold text-blue-600 dark:text-blue-400
                               bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-700
                               rounded px-2 py-1 shrink-0 cursor-pointer"
                        @click="f.value = ''"
                        title="Click to clear"
                      >{{ DATE_TOKEN_LABELS[f.value] }} <X class="size-2.5" /></span>
                      <input v-else type="date" v-model="f.value"
                        class="w-28 shrink-0 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400" />
                      <button @click="f.value = DATE_TOKEN_TODAY"
                        :class="['shrink-0 text-[13px] font-semibold px-1.5 py-1 rounded transition-colors border',
                          f.value === DATE_TOKEN_TODAY
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40']"
                        :title="t('bi_today')">T</button>
                    </template>
                    <!-- Regular text field -->
                    <input v-else
                      v-model="f.value"
                      :placeholder="t('bi_value')"
                      class="w-20 shrink-0 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400"
                    />
                    <button @click="txRemoveFilter(i)" class="shrink-0 text-muted-foreground hover:text-destructive transition-colors">
                      <X class="size-3.5" />
                    </button>
                  </div>
                </div>

                <!-- Group By -->
                <div class="space-y-1.5">
                  <p class="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Group By</p>
                  <select
                    v-model="txGroupBy"
                    class="w-full text-xs border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400"
                  >
                    <option value="">{{ t('bi_no_group') }}</option>
                    <template v-if="txColGroups.length > 1">
                      <optgroup v-for="g in txColGroups" :key="g.sourceName" :label="g.sourceName">
                        <option v-for="c in g.cols" :key="c" :value="c">{{ txColLabel(c) }}</option>
                      </optgroup>
                    </template>
                    <option v-else v-for="c in txColumns" :key="c" :value="c">{{ txColLabel(c) }}</option>
                  </select>
                </div>

                <!-- Aggregations (shown only when group by is set) -->
                <div v-if="txGroupBy" class="space-y-1.5">
                  <p class="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Aggregation</p>
                  <!-- search -->
                  <div class="relative flex items-center">
                    <input
                      v-model="txAggSearch"
                      placeholder="Filter columns..."
                      class="w-full text-[12px] border rounded-md px-2 py-1 pr-6 bg-background
                             focus:outline-none focus:ring-1 focus:ring-violet-400 placeholder:text-muted-foreground/40"
                    />
                    <button v-if="txAggSearch" @click="txAggSearch = ''"
                      class="absolute right-1.5 text-muted-foreground hover:text-foreground">
                      <X class="size-3" />
                    </button>
                  </div>
                  <div class="space-y-1 max-h-52 overflow-y-auto pr-1">
                    <template v-for="g in txFilteredAggGroups" :key="g.sourceName">
                      <p v-if="txColGroups.length > 1 && g.cols.length"
                         class="text-[13px] font-semibold text-muted-foreground/50 uppercase tracking-wide pt-1 pb-0.5 pl-0.5">
                        {{ g.sourceName }}
                      </p>
                      <div v-for="col in g.cols" :key="col" class="flex items-center gap-2">
                        <span class="flex-1 min-w-0 text-[12px] text-muted-foreground truncate" :title="col">{{ txColLabel(col) }}</span>
                        <select
                          :value="txAggregations[col] ?? 'first'"
                          @change="txAggregations[col] = ($event.target as HTMLSelectElement).value as AggFn"
                          class="w-20 shrink-0 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400"
                        >
                          <option v-for="a in AGG_OPTIONS" :key="a.value" :value="a.value">{{ a.label }}</option>
                        </select>
                      </div>
                    </template>
                    <p v-if="!txFilteredAggGroups.length" class="text-[12px] text-muted-foreground/50 text-center py-2">No columns match</p>
                  </div>
                </div>

                <!-- Computed Columns -->
                <div class="rounded-xl border border-border overflow-hidden">
                  <div class="px-3 py-2 bg-muted/40 border-b border-border flex items-center justify-between">
                    <div class="flex items-center gap-1.5">
                      <Calculator class="size-3 text-violet-500" />
                      <p class="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Computed Columns</p>
                    </div>
                    <button
                      @click="txComputedCols.push(newComputedColDef())"
                      class="flex items-center gap-0.5 text-[13px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 hover:bg-violet-200 transition-colors font-semibold"
                    >
                      <Plus class="size-2.5" /> Add
                    </button>
                  </div>

                  <div class="divide-y divide-border/40">
                    <div v-if="!txComputedCols.length" class="px-3 py-3 text-[12px] text-muted-foreground text-center">
                      ยังไม่มี computed column
                    </div>

                    <div v-for="(cc, i) in txComputedCols" :key="i" class="px-3 py-2.5 flex flex-col gap-2">

                      <!-- Row 1: name + type + delete -->
                      <div class="flex items-center gap-1.5">
                        <input v-model="cc.name" placeholder="ชื่อ column"
                          class="flex-1 min-w-0 text-[12px] font-semibold border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400" />
                        <select v-model="cc.type"
                          class="w-28 shrink-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400">
                          <option v-for="t in COL_TYPE_OPTIONS" :key="t.value" :value="t.value">{{ t.label }}</option>
                        </select>
                        <button @click="txComputedCols.splice(i, 1)" class="shrink-0 text-muted-foreground hover:text-destructive transition-colors">
                          <X class="size-3.5" />
                        </button>
                      </div>

                      <!-- Arithmetic builder -->
                      <template v-if="cc.type === 'arithmetic'">
                        <div class="flex items-center gap-1">
                          <!-- Left operand -->
                          <div class="flex-1 min-w-0 flex items-center gap-1">
                            <button @click="cc.left!.kind = cc.left!.kind === 'col' ? 'const' : 'col'"
                              :class="['shrink-0 text-[12px] font-bold px-1 py-0.5 rounded border transition-colors',
                                cc.left!.kind === 'col' ? 'bg-violet-100 dark:bg-violet-950/40 text-violet-600 border-violet-300' : 'text-muted-foreground border-border']">
                              {{ cc.left!.kind === 'col' ? 'col' : 'val' }}</button>
                            <select v-if="cc.left!.kind === 'col'" v-model="cc.left!.col"
                              class="flex-1 min-w-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400 truncate">
                              <option value="">— เลือก —</option>
                              <option v-for="c in txColumns" :key="c" :value="c">{{ txColLabel(c) }}</option>
                            </select>
                            <input v-else v-model="cc.left!.val" placeholder="0"
                              class="flex-1 min-w-0 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400" />
                          </div>
                          <!-- Operator -->
                          <select v-model="cc.op"
                            class="w-16 shrink-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400">
                            <option v-for="o in ARITH_OP_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                          </select>
                          <!-- Right operand -->
                          <div class="flex-1 min-w-0 flex items-center gap-1">
                            <button @click="cc.right!.kind = cc.right!.kind === 'col' ? 'const' : 'col'"
                              :class="['shrink-0 text-[12px] font-bold px-1 py-0.5 rounded border transition-colors',
                                cc.right!.kind === 'col' ? 'bg-violet-100 dark:bg-violet-950/40 text-violet-600 border-violet-300' : 'text-muted-foreground border-border']">
                              {{ cc.right!.kind === 'col' ? 'col' : 'val' }}</button>
                            <select v-if="cc.right!.kind === 'col'" v-model="cc.right!.col"
                              class="flex-1 min-w-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400 truncate">
                              <option value="">— เลือก —</option>
                              <option v-for="c in txColumns" :key="c" :value="c">{{ txColLabel(c) }}</option>
                            </select>
                            <input v-else v-model="cc.right!.val" placeholder="0"
                              class="flex-1 min-w-0 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400" />
                          </div>
                        </div>
                      </template>

                      <!-- Function builder -->
                      <template v-else-if="cc.type === 'function'">
                        <select v-model="cc.fn"
                          class="w-full text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400">
                          <optgroup v-for="cat in ['math','text','date']" :key="cat" :label="FN_CATEGORY_LABELS[cat]">
                            <option v-for="f in FUNCTION_DEFS.filter(f => f.category === cat)" :key="f.value" :value="f.value">{{ f.label }}</option>
                          </optgroup>
                        </select>
                        <!-- arg1 (always column) -->
                        <div class="flex items-center gap-1">
                          <span class="text-[13px] text-muted-foreground shrink-0 w-8">arg 1</span>
                          <select v-model="cc.arg1!.col"
                            class="flex-1 min-w-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400 truncate">
                            <option value="">— เลือก column —</option>
                            <option v-for="c in txColumns" :key="c" :value="c">{{ txColLabel(c) }}</option>
                          </select>
                        </div>
                        <!-- CONCAT separator (optional) -->
                        <div v-if="cc.fn === 'CONCAT'" class="flex items-center gap-1">
                          <span class="text-[13px] text-muted-foreground shrink-0 w-8">sep</span>
                          <input v-model="cc.concatSep" placeholder="เว้นว่างถ้าไม่ต้องการ"
                            class="flex-1 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400" />
                        </div>
                        <!-- arg2: second col or n — only for fns that need it -->
                        <div v-if="FUNCTION_DEFS.find(f => f.value === cc.fn)?.args.length === 2" class="flex items-center gap-1">
                          <span class="text-[13px] text-muted-foreground shrink-0 w-8">arg 2</span>
                          <!-- col2: second column picker -->
                          <template v-if="FUNCTION_DEFS.find(f => f.value === cc.fn)?.args[1] === 'col2'">
                            <select v-model="cc.arg2!.col"
                              class="flex-1 min-w-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400 truncate">
                              <option value="">— เลือก column —</option>
                              <option v-for="c in txColumns" :key="c" :value="c">{{ txColLabel(c) }}</option>
                            </select>
                          </template>
                          <!-- n: number input -->
                          <template v-else>
                            <input v-model="cc.arg2!.val" type="number" placeholder="n"
                              class="flex-1 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400" />
                          </template>
                        </div>
                      </template>

                      <!-- IF builder -->
                      <template v-else-if="cc.type === 'if'">
                        <!-- Condition row -->
                        <div class="flex items-center gap-1">
                          <span class="text-[13px] font-bold text-violet-500 shrink-0">IF</span>
                          <select v-model="cc.ifCol"
                            class="flex-1 min-w-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400 truncate">
                            <option value="">— เลือก column —</option>
                            <option v-for="c in txColumns" :key="c" :value="c">{{ txColLabel(c) }}</option>
                          </select>
                          <select v-model="cc.ifOp"
                            class="w-10 shrink-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400">
                            <option v-for="o in CMP_OP_OPTIONS" :key="o.value" :value="o.value">{{ o.value }}</option>
                          </select>
                          <div class="flex-1 min-w-0 flex items-center gap-1">
                            <button @click="cc.ifVal!.kind = cc.ifVal!.kind === 'col' ? 'const' : 'col'"
                              :class="['shrink-0 text-[12px] font-bold px-1 py-0.5 rounded border transition-colors',
                                cc.ifVal!.kind === 'col' ? 'bg-violet-100 dark:bg-violet-950/40 text-violet-600 border-violet-300' : 'text-muted-foreground border-border']">
                              {{ cc.ifVal!.kind === 'col' ? 'col' : 'val' }}</button>
                            <select v-if="cc.ifVal!.kind === 'col'" v-model="cc.ifVal!.col"
                              class="flex-1 min-w-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400 truncate">
                              <option value="">— เลือก —</option>
                              <option v-for="c in txColumns" :key="c" :value="c">{{ txColLabel(c) }}</option>
                            </select>
                            <input v-else v-model="cc.ifVal!.val" placeholder="ค่า"
                              class="flex-1 min-w-0 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400" />
                          </div>
                        </div>
                        <!-- THEN row -->
                        <div class="flex items-center gap-1">
                          <span class="text-[13px] font-bold text-emerald-500 shrink-0 w-8">THEN</span>
                          <button @click="cc.thenVal!.kind = cc.thenVal!.kind === 'col' ? 'const' : 'col'"
                            :class="['shrink-0 text-[12px] font-bold px-1 py-0.5 rounded border transition-colors',
                              cc.thenVal!.kind === 'col' ? 'bg-violet-100 dark:bg-violet-950/40 text-violet-600 border-violet-300' : 'text-muted-foreground border-border']">
                            {{ cc.thenVal!.kind === 'col' ? 'col' : 'val' }}</button>
                          <select v-if="cc.thenVal!.kind === 'col'" v-model="cc.thenVal!.col"
                            class="flex-1 min-w-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400 truncate">
                            <option value="">— เลือก —</option>
                            <option v-for="c in txColumns" :key="c" :value="c">{{ txColLabel(c) }}</option>
                          </select>
                          <input v-else v-model="cc.thenVal!.val" placeholder="ค่า"
                            class="flex-1 min-w-0 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400" />
                        </div>
                        <!-- ELSE row -->
                        <div class="flex items-center gap-1">
                          <span class="text-[13px] font-bold text-orange-400 shrink-0 w-8">ELSE</span>
                          <button @click="cc.elseVal!.kind = cc.elseVal!.kind === 'col' ? 'const' : 'col'"
                            :class="['shrink-0 text-[12px] font-bold px-1 py-0.5 rounded border transition-colors',
                              cc.elseVal!.kind === 'col' ? 'bg-violet-100 dark:bg-violet-950/40 text-violet-600 border-violet-300' : 'text-muted-foreground border-border']">
                            {{ cc.elseVal!.kind === 'col' ? 'col' : 'val' }}</button>
                          <select v-if="cc.elseVal!.kind === 'col'" v-model="cc.elseVal!.col"
                            class="flex-1 min-w-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400 truncate">
                            <option value="">— เลือก —</option>
                            <option v-for="c in txColumns" :key="c" :value="c">{{ txColLabel(c) }}</option>
                          </select>
                          <input v-else v-model="cc.elseVal!.val" placeholder="ค่า"
                            class="flex-1 min-w-0 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400" />
                        </div>
                      </template>

                      <!-- Preview -->
                      <div v-if="cc.name.trim()" class="flex flex-col gap-0.5 text-[13px] text-muted-foreground">
                        <span class="font-mono bg-muted/50 rounded px-1.5 py-0.5 truncate max-w-full opacity-60">
                          {{ txComputedColFormulas[i] }}
                        </span>
                        <span class="font-mono bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 rounded px-1.5 py-0.5 truncate max-w-full">
                          {{ cc.name }} = {{ txComputedColPreviews[i] }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Number Format -->
                <div class="rounded-xl border border-border overflow-hidden">
                  <div class="px-3 py-2 bg-muted/40 border-b border-border">
                    <p class="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Number Format</p>
                  </div>
                  <div class="divide-y divide-border/60">
                    <!-- Comma toggle -->
                    <label class="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/30 cursor-pointer transition-colors">
                      <div class="flex flex-col gap-0.5">
                        <span class="text-[13px] font-medium">Thousands separator</span>
                        <span class="text-[12px] text-muted-foreground font-mono">
                          {{ txNumericFormat.comma ? '1,000,000' : '1000000' }}
                        </span>
                      </div>
                      <!-- switch -->
                      <div
                        class="relative w-8 h-4.5 rounded-full transition-colors shrink-0"
                        :class="txNumericFormat.comma ? 'bg-violet-500' : 'bg-muted-foreground/30'"
                      >
                        <input
                          type="checkbox"
                          :checked="txNumericFormat.comma === true"
                          @change="setTxNumericFormat({ ...txNumericFormat, comma: ($event.target as HTMLInputElement).checked })"
                          class="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                        />
                        <span
                          class="absolute top-0.5 left-0.5 size-3.5 rounded-full bg-white shadow transition-transform"
                          :class="txNumericFormat.comma ? 'translate-x-3.5' : 'translate-x-0'"
                        />
                      </div>
                    </label>
                    <!-- Decimal places -->
                    <div class="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div class="flex flex-col gap-0.5">
                        <span class="text-[13px] font-medium">Decimal places</span>
                        <span class="text-[12px] text-muted-foreground font-mono">
                          {{ txNumericFormat.decimals !== undefined ? (1234.5678).toFixed(txNumericFormat.decimals) : '—' }}
                        </span>
                      </div>
                      <div class="flex items-center gap-1 shrink-0">
                        <button
                          @click="setTxNumericFormat({ ...txNumericFormat, decimals: txNumericFormat.decimals !== undefined && txNumericFormat.decimals > 0 ? txNumericFormat.decimals - 1 : undefined })"
                          class="size-6 flex items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted/50 text-sm font-bold transition-colors"
                        >−</button>
                        <span class="w-7 text-center text-[13px] font-mono font-semibold">
                          {{ txNumericFormat.decimals ?? 'auto' }}
                        </span>
                        <button
                          @click="setTxNumericFormat({ ...txNumericFormat, decimals: txNumericFormat.decimals === undefined ? 0 : Math.min(10, txNumericFormat.decimals + 1) })"
                          class="size-6 flex items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted/50 text-sm font-bold transition-colors"
                        >+</button>
                      </div>
                    </div>

                    <!-- Per-column exclusion (shown when comma or decimals is active) -->
                    <div v-if="txNumericColumns.length && (txNumericFormat.comma || txNumericFormat.decimals !== undefined)"
                         class="px-3 py-2.5 flex flex-col gap-1.5">
                      <span class="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Exclude columns</span>
                      <div class="relative flex items-center">
                        <input
                          v-model="txExcludeSearch"
                          placeholder="Filter columns..."
                          class="w-full text-[12px] border rounded-md px-2 py-1 pr-6 bg-background
                                 focus:outline-none focus:ring-1 focus:ring-violet-400 placeholder:text-muted-foreground/40"
                        />
                        <button v-if="txExcludeSearch" @click="txExcludeSearch = ''"
                          class="absolute right-1.5 text-muted-foreground hover:text-foreground">
                          <X class="size-3" />
                        </button>
                      </div>
                      <div class="space-y-1 max-h-36 overflow-y-auto">
                        <label
                          v-for="col in txFilteredNumericColumns"
                          :key="col"
                          class="flex items-center gap-2 cursor-pointer hover:bg-muted/30 rounded px-1 py-0.5"
                        >
                          <input
                            type="checkbox"
                            :checked="txNumericFormat.excludeDecimalCols?.includes(col) ?? false"
                            @change="toggleTxExcludeDecimalCol(col)"
                            class="accent-violet-500 shrink-0"
                          />
                          <span class="text-[12px] truncate flex-1" :title="col">{{ txColLabel(col) }}</span>
                          <span v-if="txNumericFormat.excludeDecimalCols?.includes(col)"
                                class="text-[13px] text-muted-foreground/50 shrink-0">excluded</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Date Format -->
                <div class="rounded-xl border border-border overflow-hidden">
                  <div class="px-3 py-2 bg-muted/40 border-b border-border">
                    <p class="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Date Format</p>
                  </div>
                  <div class="divide-y divide-border/60">
                    <!-- Pattern -->
                    <div class="px-3 py-2.5 flex flex-col gap-1.5">
                      <span class="text-[13px] font-medium">Pattern</span>
                      <select
                        :value="txNumericFormat.datePattern ?? ''"
                        @change="setTxNumericFormat({ ...txNumericFormat, datePattern: ($event.target as HTMLSelectElement).value || undefined })"
                        class="w-full text-[13px] border rounded-lg px-2 py-1.5 bg-background
                               focus:outline-none focus:ring-1 focus:ring-violet-400"
                      >
                        <option value="">— original —</option>
                        <option v-for="p in DATE_PATTERNS" :key="p.value" :value="p.value">{{ p.label }}</option>
                      </select>
                    </div>
                    <!-- Era -->
                    <div class="px-3 py-2.5 flex flex-col gap-1.5">
                      <span class="text-[13px] font-medium">Year era</span>
                      <div class="flex gap-1.5">
                        <button
                          v-for="era in [{ v: 'CE', label: 'ค.ศ.' }, { v: 'BE', label: 'พ.ศ.' }]"
                          :key="era.v"
                          @click="setTxNumericFormat({ ...txNumericFormat, dateEra: era.v as 'CE' | 'BE' })"
                          :class="[
                            'flex-1 text-[13px] py-1.5 rounded-lg border transition-colors font-medium',
                            (txNumericFormat.dateEra ?? 'CE') === era.v
                              ? 'bg-violet-500 border-violet-500 text-white'
                              : 'border-border text-muted-foreground hover:bg-muted/50',
                          ]"
                        >{{ era.label }}</button>
                      </div>
                    </div>
                    <!-- Preview -->
                    <div v-if="txNumericFormat.datePattern" class="px-3 py-2 bg-muted/20">
                      <div class="flex items-center justify-between">
                        <span class="text-[12px] text-muted-foreground">Preview</span>
                        <span class="text-[13px] font-mono font-semibold text-violet-600 dark:text-violet-400">
                          {{ formatDateValue('2024-03-15', txNumericFormat.datePattern, txNumericFormat.dateEra ?? 'CE') }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                </div><!-- end inner flex col -->
                </div><!-- end scrollable config area -->

                <!-- Row count summary — fixed at bottom -->
                <div class="shrink-0 px-4 py-3 border-t bg-background">
                  <div class="flex items-center justify-between text-[12px]">
                    <span class="text-muted-foreground">{{ t('bi_original_data') }}</span>
                    <span class="font-semibold">{{ txJoinedRows.length.toLocaleString() }} {{ t('bi_rows') }}</span>
                  </div>
                  <div v-if="txHasConfig" class="flex items-center justify-between text-[12px] mt-1">
                    <span class="text-muted-foreground">{{ t('bi_after_transform') }}</span>
                    <span class="font-semibold text-violet-600 dark:text-violet-400">{{ txOutputSample.length.toLocaleString() }} {{ t('bi_rows') }}</span>
                  </div>
                </div>
              </div>

              <!-- Right: data sample -->
              <div class="flex-1 min-w-0 flex flex-col">

                <!-- Tabs -->
                <div class="flex border-b shrink-0 text-xs">
                  <button
                    @click="txModalTab = 'before'"
                    :class="[
                      'px-4 py-2.5 font-semibold transition-colors border-b-2 -mb-px',
                      txModalTab === 'before'
                        ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    ]"
                  >
                    {{ t('bi_original_data') }}
                    <span class="ml-1.5 text-[12px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                      {{ txInputSample.length.toLocaleString() }}
                    </span>
                  </button>
                  <button
                    @click="txModalTab = 'after'"
                    :class="[
                      'px-4 py-2.5 font-semibold transition-colors border-b-2 -mb-px',
                      txModalTab === 'after'
                        ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    ]"
                  >
                    {{ t('bi_results') }}
                    <span
                      class="ml-1.5 text-[12px] rounded px-1.5 py-0.5"
                      :class="txHasConfig
                        ? 'bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400'
                        : 'bg-muted text-muted-foreground'"
                    >
                      {{ txOutputSample.length.toLocaleString() }}
                    </span>
                  </button>
                </div>

                <!-- Grid -->
                <div class="flex-1 min-h-0 relative">
                  <!-- original data tab grid -->
                  <AgGridVue
                    v-if="txModalTab === 'before'"
                    :class="[themeClass, 'ag-tx-grid w-full h-full']"
                    :rowData="txInputSample"
                    :columnDefs="txInputColDefs"
                    :rowHeight="26"
                    :headerHeight="30"
                    :suppressMovableColumns="true"
                    :suppressCellFocus="true"
                    :enableCellTextSelection="true"
                    @first-data-rendered="(p: any) => p.api.autoSizeAllColumns()"
                  />
                  <!-- results tab — placeholder when no config -->
                  <div
                    v-else-if="!txHasConfig"
                    class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
                  >
                    {{ t('bi_configure_filter_hint') }}
                  </div>
                  <!-- results grid — lazy-mount (mounts only when user first visits this tab,
                       so AG Grid always initialises with a visible container) -->
                  <AgGridVue
                    v-else-if="txAfterMounted"
                    :key="txOutputColsKey"
                    :class="[themeClass, 'ag-tx-grid w-full h-full']"
                    :rowData="txOutputSample"
                    :columnDefs="txOutputColDefs"
                    :rowHeight="26"
                    :headerHeight="30"
                    :suppressMovableColumns="true"
                    :suppressCellFocus="true"
                    :enableCellTextSelection="true"
                    @first-data-rendered="(p: any) => p.api.autoSizeAllColumns()"
                  />
                </div>
              </div>

            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Join Component Transform Modal ────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showJoinTxModal"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          @click.self="showJoinTxModal = false"
        >
          <div class="bg-background flex flex-col overflow-hidden w-screen h-screen">

            <!-- Header -->
            <div class="flex items-center gap-2.5 px-5 py-3 border-b shrink-0 bg-violet-50 dark:bg-violet-950/20">
              <GitMerge class="size-4 text-violet-500" />
              <span class="text-sm font-semibold">{{ t('bi_join_transform_title') }}</span>
              <span class="text-xs text-muted-foreground truncate max-w-[300px]">— {{ joinTxCompName }}</span>
              <div class="ml-auto flex items-center gap-2">
                <button
                  @click="joinTxFilters = []; joinTxGroupBy = ''; joinTxAggregations = {}; joinTxComputedCols = []"
                  class="text-xs px-2.5 py-1 rounded-lg border text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
                >
                  {{ t('bi_clear') }}
                </button>
                <button
                  @click="exportToReport(); showJoinTxModal = false"
                  :disabled="!exportStatus.ready"
                  class="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors
                         bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-40"
                >
                  <ArrowRight class="size-3.5" />
                  {{ t('bi_use_in_report') }}
                </button>
                <button @click="showJoinTxModal = false" class="text-muted-foreground hover:text-foreground transition-colors">
                  <X class="size-4" />
                </button>
              </div>
            </div>

            <!-- Body -->
            <div class="flex flex-1 min-h-0">

              <!-- Left: config -->
              <div class="w-80 shrink-0 border-r flex flex-col overflow-y-auto p-4 gap-5">

                <!-- Filter -->
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <p class="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Filter</p>
                    <button
                      @click="joinTxFilters.push({ field: joinTxColumns[0] ?? '', op: '=', value: '' })"
                      class="flex items-center gap-1 text-[12px] px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 hover:bg-violet-200 transition-colors font-semibold"
                    >
                      <Plus class="size-3" /> {{ t('bi_add') }}
                    </button>
                  </div>
                  <div v-if="!joinTxFilters.length" class="text-[12px] text-muted-foreground text-center py-2 border border-dashed rounded-lg">
                    {{ t('bi_no_filters') }}
                  </div>
                  <div v-for="(f, i) in joinTxFilters" :key="i" class="flex items-center gap-1.5">
                    <select v-model="f.field"
                      class="flex-1 min-w-0 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400">
                      <optgroup v-for="g in joinTxColGroups" :key="g.sourceName" :label="g.sourceName">
                        <option v-for="c in g.cols" :key="c" :value="c">{{ joinTxColLabel(c) }}</option>
                      </optgroup>
                    </select>
                    <select v-model="f.op"
                      class="w-16 shrink-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400">
                      <option v-for="o in OP_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                    <!-- Date field: datepicker + dynamic tokens -->
                    <template v-if="isJoinDateField(f.field)">
                      <span
                        v-if="DATE_TOKEN_LABELS[f.value]"
                        class="flex items-center gap-1 text-[12px] font-semibold text-blue-600 dark:text-blue-400
                               bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-700
                               rounded px-2 py-1 shrink-0 cursor-pointer"
                        @click="f.value = ''"
                        title="Click to clear"
                      >{{ DATE_TOKEN_LABELS[f.value] }} <X class="size-2.5" /></span>
                      <input v-else type="date" v-model="f.value"
                        class="w-28 shrink-0 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400" />
                      <button @click="f.value = DATE_TOKEN_TODAY"
                        :class="['shrink-0 text-[13px] font-semibold px-1.5 py-1 rounded transition-colors border',
                          f.value === DATE_TOKEN_TODAY
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40']"
                        :title="t('bi_today')">T</button>
                    </template>
                    <input v-else v-model="f.value" :placeholder="t('bi_value')"
                      class="w-20 shrink-0 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400" />
                    <button @click="joinTxFilters.splice(i, 1)" class="shrink-0 text-muted-foreground hover:text-destructive transition-colors">
                      <X class="size-3.5" />
                    </button>
                  </div>
                </div>

                <!-- Group By -->
                <div class="space-y-1.5">
                  <p class="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Group By</p>
                  <select v-model="joinTxGroupBy"
                    class="w-full text-xs border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400">
                    <option value="">{{ t('bi_no_group') }}</option>
                    <optgroup v-for="g in joinTxColGroups" :key="g.sourceName" :label="g.sourceName">
                      <option v-for="c in g.cols" :key="c" :value="c">{{ joinTxColLabel(c) }}</option>
                    </optgroup>
                  </select>
                </div>

                <!-- Aggregations -->
                <div v-if="joinTxGroupBy" class="space-y-1.5">
                  <p class="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Aggregation</p>
                  <div class="space-y-1 max-h-64 overflow-y-auto pr-1">
                    <template v-for="g in joinTxColGroups" :key="g.sourceName">
                      <p v-if="g.cols.some(c => c !== joinTxGroupBy)"
                         class="text-[13px] font-semibold text-muted-foreground/50 uppercase tracking-wide pt-1 pb-0.5 pl-0.5">
                        {{ g.sourceName }}
                      </p>
                      <div v-for="col in g.cols.filter(c => c !== joinTxGroupBy)" :key="col" class="flex items-center gap-2">
                        <span class="flex-1 min-w-0 text-[12px] text-muted-foreground truncate" :title="col">{{ joinTxColLabel(col) }}</span>
                        <select
                          :value="joinTxAggregations[col] ?? 'first'"
                          @change="joinTxAggregations[col] = ($event.target as HTMLSelectElement).value as AggFn"
                          class="w-20 shrink-0 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400"
                        >
                          <option v-for="a in AGG_OPTIONS" :key="a.value" :value="a.value">{{ a.label }}</option>
                        </select>
                      </div>
                    </template>
                  </div>
                </div>

                <!-- Computed Columns -->
                <div class="rounded-xl border border-border overflow-hidden shrink-0">
                  <div class="px-3 py-2 bg-muted/40 border-b border-border flex items-center justify-between">
                    <div class="flex items-center gap-1.5">
                      <Calculator class="size-3 text-violet-500" />
                      <p class="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Computed Columns</p>
                    </div>
                    <button
                      @click="joinTxComputedCols.push(newComputedColDef())"
                      class="flex items-center gap-0.5 text-[13px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 hover:bg-violet-200 transition-colors font-semibold"
                    >
                      <Plus class="size-2.5" /> Add
                    </button>
                  </div>

                  <div class="divide-y divide-border/40">
                    <div v-if="!joinTxComputedCols.length" class="px-3 py-3 text-[12px] text-muted-foreground text-center">
                      ยังไม่มี computed column
                    </div>

                    <div v-for="(cc, i) in joinTxComputedCols" :key="i" class="px-3 py-2.5 flex flex-col gap-2">

                      <!-- Row 1: name + type + delete -->
                      <div class="flex items-center gap-1.5">
                        <input v-model="cc.name" placeholder="ชื่อ column"
                          class="flex-1 min-w-0 text-[12px] font-semibold border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400" />
                        <select v-model="cc.type"
                          class="w-28 shrink-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400">
                          <option v-for="t in COL_TYPE_OPTIONS" :key="t.value" :value="t.value">{{ t.label }}</option>
                        </select>
                        <button @click="joinTxComputedCols.splice(i, 1)" class="shrink-0 text-muted-foreground hover:text-destructive transition-colors">
                          <X class="size-3.5" />
                        </button>
                      </div>

                      <!-- Arithmetic builder -->
                      <template v-if="cc.type === 'arithmetic'">
                        <div class="flex items-center gap-1">
                          <div class="flex-1 min-w-0 flex items-center gap-1">
                            <button @click="cc.left!.kind = cc.left!.kind === 'col' ? 'const' : 'col'"
                              :class="['shrink-0 text-[12px] font-bold px-1 py-0.5 rounded border transition-colors',
                                cc.left!.kind === 'col' ? 'bg-violet-100 dark:bg-violet-950/40 text-violet-600 border-violet-300' : 'text-muted-foreground border-border']">
                              {{ cc.left!.kind === 'col' ? 'col' : 'val' }}</button>
                            <select v-if="cc.left!.kind === 'col'" v-model="cc.left!.col"
                              class="flex-1 min-w-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400 truncate">
                              <option value="">— เลือก —</option>
                              <option v-for="c in joinTxColumns" :key="c" :value="c">{{ joinTxColLabel(c) }}</option>
                            </select>
                            <input v-else v-model="cc.left!.val" placeholder="0"
                              class="flex-1 min-w-0 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400" />
                          </div>
                          <select v-model="cc.op"
                            class="w-16 shrink-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400">
                            <option v-for="o in ARITH_OP_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                          </select>
                          <div class="flex-1 min-w-0 flex items-center gap-1">
                            <button @click="cc.right!.kind = cc.right!.kind === 'col' ? 'const' : 'col'"
                              :class="['shrink-0 text-[12px] font-bold px-1 py-0.5 rounded border transition-colors',
                                cc.right!.kind === 'col' ? 'bg-violet-100 dark:bg-violet-950/40 text-violet-600 border-violet-300' : 'text-muted-foreground border-border']">
                              {{ cc.right!.kind === 'col' ? 'col' : 'val' }}</button>
                            <select v-if="cc.right!.kind === 'col'" v-model="cc.right!.col"
                              class="flex-1 min-w-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400 truncate">
                              <option value="">— เลือก —</option>
                              <option v-for="c in joinTxColumns" :key="c" :value="c">{{ joinTxColLabel(c) }}</option>
                            </select>
                            <input v-else v-model="cc.right!.val" placeholder="0"
                              class="flex-1 min-w-0 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400" />
                          </div>
                        </div>
                      </template>

                      <!-- Function builder -->
                      <template v-else-if="cc.type === 'function'">
                        <select v-model="cc.fn"
                          class="w-full text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400">
                          <optgroup v-for="cat in ['math','text','date']" :key="cat" :label="FN_CATEGORY_LABELS[cat]">
                            <option v-for="f in FUNCTION_DEFS.filter(f => f.category === cat)" :key="f.value" :value="f.value">{{ f.label }}</option>
                          </optgroup>
                        </select>
                        <div class="flex items-center gap-1">
                          <span class="text-[13px] text-muted-foreground shrink-0 w-8">arg 1</span>
                          <select v-model="cc.arg1!.col"
                            class="flex-1 min-w-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400 truncate">
                            <option value="">— เลือก column —</option>
                            <option v-for="c in joinTxColumns" :key="c" :value="c">{{ joinTxColLabel(c) }}</option>
                          </select>
                        </div>
                        <!-- CONCAT separator (optional) -->
                        <div v-if="cc.fn === 'CONCAT'" class="flex items-center gap-1">
                          <span class="text-[13px] text-muted-foreground shrink-0 w-8">sep</span>
                          <input v-model="cc.concatSep" placeholder="เว้นว่างถ้าไม่ต้องการ"
                            class="flex-1 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400" />
                        </div>
                        <div v-if="FUNCTION_DEFS.find(f => f.value === cc.fn)?.args.length === 2" class="flex items-center gap-1">
                          <span class="text-[13px] text-muted-foreground shrink-0 w-8">arg 2</span>
                          <template v-if="FUNCTION_DEFS.find(f => f.value === cc.fn)?.args[1] === 'col2'">
                            <select v-model="cc.arg2!.col"
                              class="flex-1 min-w-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400 truncate">
                              <option value="">— เลือก column —</option>
                              <option v-for="c in joinTxColumns" :key="c" :value="c">{{ joinTxColLabel(c) }}</option>
                            </select>
                          </template>
                          <template v-else>
                            <input v-model="cc.arg2!.val" type="number" placeholder="n"
                              class="flex-1 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400" />
                          </template>
                        </div>
                      </template>

                      <!-- IF builder -->
                      <template v-else-if="cc.type === 'if'">
                        <div class="flex items-center gap-1">
                          <span class="text-[13px] font-bold text-violet-500 shrink-0">IF</span>
                          <select v-model="cc.ifCol"
                            class="flex-1 min-w-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400 truncate">
                            <option value="">— เลือก column —</option>
                            <option v-for="c in joinTxColumns" :key="c" :value="c">{{ joinTxColLabel(c) }}</option>
                          </select>
                          <select v-model="cc.ifOp"
                            class="w-10 shrink-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400">
                            <option v-for="o in CMP_OP_OPTIONS" :key="o.value" :value="o.value">{{ o.value }}</option>
                          </select>
                          <div class="flex-1 min-w-0 flex items-center gap-1">
                            <button @click="cc.ifVal!.kind = cc.ifVal!.kind === 'col' ? 'const' : 'col'"
                              :class="['shrink-0 text-[12px] font-bold px-1 py-0.5 rounded border transition-colors',
                                cc.ifVal!.kind === 'col' ? 'bg-violet-100 dark:bg-violet-950/40 text-violet-600 border-violet-300' : 'text-muted-foreground border-border']">
                              {{ cc.ifVal!.kind === 'col' ? 'col' : 'val' }}</button>
                            <select v-if="cc.ifVal!.kind === 'col'" v-model="cc.ifVal!.col"
                              class="flex-1 min-w-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400 truncate">
                              <option value="">— เลือก —</option>
                              <option v-for="c in joinTxColumns" :key="c" :value="c">{{ joinTxColLabel(c) }}</option>
                            </select>
                            <input v-else v-model="cc.ifVal!.val" placeholder="ค่า"
                              class="flex-1 min-w-0 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400" />
                          </div>
                        </div>
                        <div class="flex items-center gap-1">
                          <span class="text-[13px] font-bold text-emerald-500 shrink-0 w-8">THEN</span>
                          <button @click="cc.thenVal!.kind = cc.thenVal!.kind === 'col' ? 'const' : 'col'"
                            :class="['shrink-0 text-[12px] font-bold px-1 py-0.5 rounded border transition-colors',
                              cc.thenVal!.kind === 'col' ? 'bg-violet-100 dark:bg-violet-950/40 text-violet-600 border-violet-300' : 'text-muted-foreground border-border']">
                            {{ cc.thenVal!.kind === 'col' ? 'col' : 'val' }}</button>
                          <select v-if="cc.thenVal!.kind === 'col'" v-model="cc.thenVal!.col"
                            class="flex-1 min-w-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400 truncate">
                            <option value="">— เลือก —</option>
                            <option v-for="c in joinTxColumns" :key="c" :value="c">{{ joinTxColLabel(c) }}</option>
                          </select>
                          <input v-else v-model="cc.thenVal!.val" placeholder="ค่า"
                            class="flex-1 min-w-0 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400" />
                        </div>
                        <div class="flex items-center gap-1">
                          <span class="text-[13px] font-bold text-orange-400 shrink-0 w-8">ELSE</span>
                          <button @click="cc.elseVal!.kind = cc.elseVal!.kind === 'col' ? 'const' : 'col'"
                            :class="['shrink-0 text-[12px] font-bold px-1 py-0.5 rounded border transition-colors',
                              cc.elseVal!.kind === 'col' ? 'bg-violet-100 dark:bg-violet-950/40 text-violet-600 border-violet-300' : 'text-muted-foreground border-border']">
                            {{ cc.elseVal!.kind === 'col' ? 'col' : 'val' }}</button>
                          <select v-if="cc.elseVal!.kind === 'col'" v-model="cc.elseVal!.col"
                            class="flex-1 min-w-0 text-[12px] border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400 truncate">
                            <option value="">— เลือก —</option>
                            <option v-for="c in joinTxColumns" :key="c" :value="c">{{ joinTxColLabel(c) }}</option>
                          </select>
                          <input v-else v-model="cc.elseVal!.val" placeholder="ค่า"
                            class="flex-1 min-w-0 text-[12px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400" />
                        </div>
                      </template>

                      <!-- Preview -->
                      <div v-if="cc.name.trim()" class="flex flex-col gap-0.5 text-[13px] text-muted-foreground">
                        <span class="font-mono bg-muted/50 rounded px-1.5 py-0.5 truncate max-w-full opacity-60">
                          {{ joinTxComputedColFormulas[i] }}
                        </span>
                        <span class="font-mono bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 rounded px-1.5 py-0.5 truncate max-w-full">
                          {{ cc.name }} = {{ joinTxComputedColPreviews[i] }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Row count summary -->
                <div class="mt-auto pt-3 border-t space-y-1">
                  <div class="flex items-center justify-between text-[12px]">
                    <span class="text-muted-foreground">{{ t('bi_original_data') }}</span>
                    <span class="font-semibold">{{ joinTxRows.length.toLocaleString() }} {{ t('bi_rows') }}</span>
                  </div>
                  <div v-if="joinTxHasConfig" class="flex items-center justify-between text-[12px]">
                    <span class="text-muted-foreground">{{ t('bi_after_transform') }}</span>
                    <span class="font-semibold text-violet-600 dark:text-violet-400">
                      {{ joinTxOutputSample.length.toLocaleString() }} {{ t('bi_rows') }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Right: data grid -->
              <div class="flex-1 min-w-0 flex flex-col">
                <!-- Tabs -->
                <div class="flex border-b shrink-0 text-xs">
                  <button
                    @click="joinTxTab = 'before'"
                    :class="['px-4 py-2.5 font-semibold transition-colors border-b-2 -mb-px',
                      joinTxTab === 'before'
                        ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                        : 'border-transparent text-muted-foreground hover:text-foreground']"
                  >
                    {{ t('bi_original_data') }}
                    <span class="ml-1.5 text-[12px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                      {{ joinTxRows.length.toLocaleString() }}
                    </span>
                  </button>
                  <button
                    @click="joinTxTab = 'after'"
                    :class="['px-4 py-2.5 font-semibold transition-colors border-b-2 -mb-px',
                      joinTxTab === 'after'
                        ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                        : 'border-transparent text-muted-foreground hover:text-foreground']"
                  >
                    {{ t('bi_results') }}
                    <span class="ml-1.5 text-[12px] rounded px-1.5 py-0.5"
                      :class="joinTxHasConfig ? 'bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400' : 'bg-muted text-muted-foreground'">
                      {{ joinTxOutputSample.length.toLocaleString() }}
                    </span>
                  </button>
                </div>

                <!-- Grid -->
                <div class="flex-1 min-h-0 relative">
                  <AgGridVue
                    v-if="joinTxTab === 'before'"
                    :class="[themeClass, 'ag-tx-grid w-full h-full']"
                    :rowData="joinTxRows.slice(0, 500)"
                    :columnDefs="joinTxColDefs"
                    :rowHeight="26" :headerHeight="30"
                    :suppressMovableColumns="true" :suppressCellFocus="true" :enableCellTextSelection="true"
                    @first-data-rendered="(p: any) => p.api.autoSizeAllColumns()"
                  />
                  <div v-else-if="!joinTxHasConfig"
                    class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                    {{ t('bi_configure_filter_hint') }}
                  </div>
                  <AgGridVue
                    v-else-if="joinTxAfterMounted"
                    :key="joinTxOutputColsKey"
                    :class="[themeClass, 'ag-tx-grid w-full h-full']"
                    :rowData="joinTxOutputSample"
                    :columnDefs="joinTxOutputColDefs"
                    :rowHeight="26" :headerHeight="30"
                    :suppressMovableColumns="true" :suppressCellFocus="true" :enableCellTextSelection="true"
                    @first-data-rendered="(p: any) => p.api.autoSizeAllColumns()"
                  />
                </div>
              </div>

            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- AI Panel -->
    <AiPanel
      v-if="aiEnabled && aiStore.openPage === 'datamodel'"
      page="datamodel"
      :system-prompt="aiSystemPrompt"
      :context-label="aiContextLabel"
    />

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
.ag-dm-join .ag-root-wrapper,
.ag-dm-join .ag-root,
.ag-dm-join .ag-body-viewport { background: transparent !important; }
.ag-dm-join .ag-root-wrapper  { border: none !important; }
.ag-dm-join .ag-header-cell-text { font-size: 10px; font-weight: 600; }
.ag-dm-join .ag-cell { font-size: 9px; }

/* Transform modal grid */
.ag-tx-grid .ag-root-wrapper,
.ag-tx-grid .ag-root,
.ag-tx-grid .ag-body-viewport { background: transparent !important; }
.ag-tx-grid .ag-root-wrapper  { border: none !important; }
.ag-tx-grid .ag-header-cell-text { font-size: 11px; font-weight: 600; }
.ag-tx-grid .ag-cell { font-size: 11px; }
</style>
