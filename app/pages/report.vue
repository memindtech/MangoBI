<script setup lang="ts">
import {
  BarChart2, TrendingUp, PieChart, Table2, Hash,
  Database, Download, Loader2, AlertCircle,
  LayoutDashboard, Home, Plus, X, Trash2,
  ChevronDown, ChevronLeft, Hash as HashIcon, Type as TypeIcon, Filter,
  Layers, Activity, Network, Code2, MousePointer2, Link2, Check, RotateCcw,
} from 'lucide-vue-next'
import ReportWidget from '~/components/report/ReportWidget.vue'
import { MOCK_DATA, DATASET_META, type DatasetKey } from '~/stores/canvas'
import type { WidgetType, WidgetFields, FilterCondition, FilterOperator, ReportWidget as RWidget, AggregationType } from '~/stores/report'
import type { DataRow } from '~/stores/canvas'
import { parseColumnMapping } from '~/utils/columnMapping'
import { resolveDynamicValue, DATE_TOKEN_TODAY, DATE_TOKEN_YESTERDAY, DATE_TOKEN_LABELS } from '~/utils/transformData'
import { formatDateValue, formatNumericValue } from '~/utils/formatValue'
import { AgGridVue } from 'ag-grid-vue3'
import { ClientSideRowModelModule, CommunityFeaturesModule, ModuleRegistry } from 'ag-grid-community'
import type { ColDef } from 'ag-grid-community'

ModuleRegistry.registerModules([ClientSideRowModelModule, CommunityFeaturesModule])

// ─── Page meta ────────────────────────────────────────────────────────────────
definePageMeta({ layout: false, auth: true })

// ─── i18n ─────────────────────────────────────────────────────────────────────
const { t } = useI18n()
useHead({ title: computed(() => `${t('page_title_report')} | MangoBI`) })

// ─── Store / Router ───────────────────────────────────────────────────────────
const store  = useReportStore()
const router = useRouter()
const { $xt } = useNuxtApp() as any

// ─── Selection ────────────────────────────────────────────────────────────────
const selectedWidgetId = ref<string | null>(null)
const selectedWidget   = computed(() => store.widgets.find(w => w.id === selectedWidgetId.value) ?? null)

// Active field well: when user clicks a field well, the next column click assigns to it
const activeField = ref<keyof WidgetFields | null>(null)

function setActiveField(f: keyof WidgetFields) {
  activeField.value = activeField.value === f ? null : f
}

// ─── Resolve which field to assign when no field well is active ───────────────
function resolveField(type: WidgetType, colType: 'number' | 'string' | 'date'): keyof WidgetFields {
  if (type === 'table') return 'columns'
  if (type === 'kpi')   return 'yField'
  if (stackedWidgetTypes.includes(type)) return colType === 'number' ? 'yFields' : 'xField'
  return colType === 'number' ? 'yField' : 'xField'
}

// ─── Column click → assign to active field (or auto-assign if none active) ───
function onColumnClick(datasetId: string, colName: string) {
  if (!selectedWidgetId.value) return

  const widget = selectedWidget.value!
  if (widget.datasetId !== datasetId) return

  // Determine target field: use active well, or fall back to smart auto-assign
  const cols  = store.columnsOf(datasetId)
  const col   = cols.find(c => c.name === colName)
  const field = activeField.value ?? resolveField(widget.type, col?.type ?? 'string')

  if (field === 'columns' || field === 'yFields') {
    const cur: string[] = [...((widget.fields as any)[field] ?? [])]
    const idx = cur.indexOf(colName)
    store.updateFields(widget.id, { [field]: idx === -1 ? [...cur, colName] : cur.filter(c => c !== colName) })
  } else {
    store.updateFields(widget.id, { [field]: colName })
    if (activeField.value) activeField.value = null  // advance only when field well was explicitly active
  }
}

// ─── Add Visual ───────────────────────────────────────────────────────────────
const showVisualMenu = ref(false)
const WIDGET_TYPES: { type: WidgetType; label: string; icon: any; color: string }[] = [
  { type: 'bar',          label: 'Bar Chart',     icon: BarChart2,  color: 'text-blue-500'   },
  { type: 'line',         label: 'Line Chart',    icon: TrendingUp, color: 'text-teal-500'   },
  { type: 'pie',          label: 'Pie Chart',     icon: PieChart,   color: 'text-violet-500' },
  { type: 'stackedBar',   label: 'Stacked 100%',  icon: Layers,     color: 'text-blue-500'   },
  { type: 'stackedHBar',  label: 'H-Stack Bar',   icon: Layers,     color: 'text-blue-400'   },
  { type: 'stackedLine',  label: 'Stacked Line',  icon: Layers,     color: 'text-teal-500'   },
  { type: 'halfDoughnut', label: 'Half Donut',    icon: PieChart,   color: 'text-violet-400' },
  { type: 'scatter',      label: 'Scatter',       icon: Activity,   color: 'text-orange-500' },
  { type: 'tree',         label: 'Tree',          icon: Network,    color: 'text-green-500'  },
  { type: 'ecOption',     label: 'ECharts JSON',  icon: Code2,      color: 'text-slate-500'  },
  { type: 'table',        label: 'Table',         icon: Table2,     color: 'text-indigo-500' },
  { type: 'kpi',          label: 'KPI Card',      icon: Hash,       color: 'text-amber-500'  },
]

const stackedWidgetTypes: WidgetType[] = ['stackedBar', 'stackedHBar', 'stackedLine']
const isStackedWidget = computed(() =>
  stackedWidgetTypes.includes(selectedWidget.value?.type ?? 'bar' as WidgetType),
)

let _placeCursor = 40
function addWidget(type: WidgetType) {
  if (!store.datasets.length) return
  const id = `widget_${Date.now()}`
  const ds = store.datasets[0]!
  store.addWidget({
    id, type, datasetId: ds.id,
    title: `${WIDGET_TYPES.find(t => t.type === type)?.label} ${store.widgets.length + 1}`,
    fields: { xField: '', yField: '', columns: [] },
    x: _placeCursor, y: _placeCursor,
    w: type === 'kpi' ? 200 : type === 'table' ? 460 : 340,
    h: type === 'kpi' ? 140 : 260,
  })
  _placeCursor = (_placeCursor + 24) % 200
  selectedWidgetId.value = id
  activeField.value = null
  showVisualMenu.value = false
}

// ─── Add Data panel ───────────────────────────────────────────────────────────
const showAddPanel  = ref(false)
const addMode       = ref<'mock' | 'sql'>('mock')
const customName    = ref('')
const selectedKey   = ref<DatasetKey>('sales_monthly')
const loading       = ref(false)
const errorMsg      = ref('')

const datasetOptions = Object.entries(DATASET_META).map(([key, m]) => ({
  key: key as DatasetKey, label: m.label,
}))

// SQL Template
const sqlPasscode        = ref('')
const sqlTemplates       = ref<{ template_id: number; template_name: string }[]>([])
const selectedTemplateId = ref<number | null>(null)
const sqlTemplatesLoaded = ref(false)
const sqlLoading         = ref(false)

async function fetchSqlTemplates() {
  if (!sqlPasscode.value.trim()) return
  sqlTemplatesLoaded.value = false; sqlTemplates.value = []; selectedTemplateId.value = null
  sqlLoading.value = true
  try {
    const res: any = await $xt.getServer(
      `Planning/Master/GetSqlFlowTemplate?passcode=${encodeURIComponent(sqlPasscode.value.trim())}`,
    )
    sqlTemplates.value = Array.isArray(res?.data) ? res.data : []
    if (sqlTemplates.value.length) selectedTemplateId.value = sqlTemplates.value[0]?.template_id ?? null
  } catch { sqlTemplates.value = [] }
  finally { sqlLoading.value = false; sqlTemplatesLoaded.value = true }
}

watch(addMode, (m) => { if (m === 'sql') { sqlTemplatesLoaded.value = false; sqlTemplates.value = [] } })

// unwrap response from JsonContentResult({ data, column_mapping_json })
// Structure: { success, error, data: { data: [...rows], column_mapping_json: "..." } }
function extractSqlPayload(res: any): { rows: any[]; column_mapping_json?: any } | null {
  if (!res) return null
  // unwrap JsonContentResult wrapper → inner = { data: [...], column_mapping_json: "..." }
  const inner = res?.data ?? res
  // inner.data = actual rows array
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


function addMockDataset() {
  const name = customName.value.trim() || DATASET_META[selectedKey.value].label
  store.addDataset({ id: `${selectedKey.value}_${Date.now()}`, name, rows: MOCK_DATA[selectedKey.value] })
  showAddPanel.value = false; customName.value = ''
}

async function addSQLDataset() {
  if (!selectedTemplateId.value) { errorMsg.value = t('bi_please_select_template'); return }
  loading.value = true; errorMsg.value = ''
  try {
    const res: any = await $xt.getServer(
      `Planning/Master/ExecuteSqlFlowTemplate?template_id=${selectedTemplateId.value}&passcode=${encodeURIComponent(sqlPasscode.value.trim())}`,
    )
    if (res?.error) throw new Error(res.error)
    const payload = extractSqlPayload(res)
    if (!payload?.rows) throw new Error(t('bi_no_data_found'))
    const tmpl    = sqlTemplates.value.find(t => t.template_id === selectedTemplateId.value)
    const name    = customName.value.trim() || tmpl?.template_name || `Template ${selectedTemplateId.value}`
    store.addDataset({
      id:           `sql_${Date.now()}`,
      name,
      rows:         payload.rows,
      columnLabels: parseColumnMapping(payload.column_mapping_json),
    })
    showAddPanel.value = false; customName.value = ''
  } catch (e: any) { errorMsg.value = e?.message ?? t('bi_error') }
  finally { loading.value = false }
}

// ─── Field wells config per type ─────────────────────────────────────────────
interface FieldWell { key: keyof WidgetFields; label: string; multi?: boolean }
const fieldWells = computed<Record<WidgetType, FieldWell[]>>(() => ({
  bar:          [{ key: 'xField', label: 'X-Axis (Category)' }, { key: 'yField',  label: 'Y-Axis (Value)'   }],
  line:         [{ key: 'xField', label: 'X-Axis (Category)' }, { key: 'yField',  label: 'Y-Axis (Value)'   }],
  pie:          [{ key: 'xField', label: 'Label'             }, { key: 'yField',  label: 'Value'            }],
  halfDoughnut: [{ key: 'xField', label: 'Label'             }, { key: 'yField',  label: 'Value'            }],
  scatter:      [{ key: 'xField', label: 'X (Numeric)'       }, { key: 'yField',  label: 'Y (Numeric)'      }],
  tree:         [{ key: 'xField', label: 'Parent Group'      }, { key: 'yField',  label: 'Child Node'       }],
  stackedBar:   [{ key: 'xField', label: 'X-Axis (Category)' }, { key: 'yFields', label: t('bi_y_series_multi'), multi: true }],
  stackedHBar:  [{ key: 'xField', label: 'Y-Axis (Category)' }, { key: 'yFields', label: t('bi_x_series_multi'), multi: true }],
  stackedLine:  [{ key: 'xField', label: 'X-Axis (Category)' }, { key: 'yFields', label: t('bi_y_series_multi'), multi: true }],
  ecOption:     [],
  table:        [{ key: 'columns',  label: 'Columns', multi: true }],
  kpi:          [{ key: 'yField',   label: 'Value (Sum)'     }],
}))

function getFieldValue(well: FieldWell): string {
  if (!selectedWidget.value) return ''
  if (well.multi) {
    const vals: string[] = (selectedWidget.value.fields as any)[well.key] ?? []
    return vals.length ? `${vals.length} fields` : ''
  }
  const colName = (selectedWidget.value.fields as any)[well.key] ?? ''
  return colName ? store.labelOf(selectedWidget.value.datasetId, colName) : ''
}

function clearField(well: FieldWell) {
  if (!selectedWidget.value) return
  if (well.multi) store.updateFields(selectedWidget.value.id, { [well.key]: [] })
  else store.updateFields(selectedWidget.value.id, { [well.key]: '' })
}

function isColumnActive(datasetId: string, colName: string): boolean {
  if (!selectedWidget.value || selectedWidget.value.datasetId !== datasetId) return false
  const f = selectedWidget.value.fields
  if (activeField.value === 'columns') return f.columns?.includes(colName) ?? false
  if (activeField.value === 'yFields') return f.yFields?.includes(colName) ?? false
  if (activeField.value) return (f as any)[activeField.value] === colName
  return Object.values(f).flat().includes(colName)
}

// ─── Filter logic ─────────────────────────────────────────────────────────────
function normDate(val: unknown): string | null {
  const m = String(val ?? '').match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1]! : null
}

function matchCondition(row: DataRow, c: FilterCondition): boolean {
  const v        = row[c.column]
  const resolved = resolveDynamicValue(c.value)

  // Date-aware: if both sides look like dates, compare as YYYY-MM-DD strings
  const cellDate   = normDate(v)
  const filterDate = normDate(resolved)
  const isDateCmp  = cellDate !== null && filterDate !== null

  switch (c.operator) {
    case 'eq':         return isDateCmp ? cellDate === filterDate : String(v ?? '') === resolved
    case 'neq':        return isDateCmp ? cellDate !== filterDate : String(v ?? '') !== resolved
    case 'gt':         return isDateCmp ? cellDate > filterDate   : Number(v) >  Number(resolved)
    case 'gte':        return isDateCmp ? cellDate >= filterDate  : Number(v) >= Number(resolved)
    case 'lt':         return isDateCmp ? cellDate < filterDate   : Number(v) <  Number(resolved)
    case 'lte':        return isDateCmp ? cellDate <= filterDate  : Number(v) <= Number(resolved)
    case 'contains':   return String(v ?? '').toLowerCase().includes(resolved.toLowerCase())
    case 'notContains':return !String(v ?? '').toLowerCase().includes(resolved.toLowerCase())
    case 'blank':      return v === null || v === undefined || v === ''
    case 'notBlank':   return v !== null && v !== undefined && v !== ''
    case 'in':         return (c.values ?? []).includes(String(v ?? ''))
    case 'notIn':      return !(c.values ?? []).includes(String(v ?? ''))
  }
}

function filteredRowsOf(widget: RWidget): DataRow[] {
  const rows = store.rowsOf(widget.datasetId)
  const filters = widget.filters
  let result = rows
  if (filters?.conditions.length) {
    const valid = filters.conditions.filter(c => {
      if (!c.column) return false
      if (c.operator === 'blank' || c.operator === 'notBlank') return true
      if (c.operator === 'in' || c.operator === 'notIn') return (c.values?.length ?? 0) > 0
      return c.value !== ''
    })
    if (valid.length) {
      result = rows.filter(row =>
        filters.logic === 'and'
          ? valid.every(c => matchCondition(row, c))
          : valid.some(c => matchCondition(row, c)),
      )
    }
  }
  return applyGroupBy(result, widget)
}

function applyGroupBy(rows: DataRow[], widget: RWidget): DataRow[] {
  const { groupByField, aggregation = 'sum' } = widget.fields
  if (!groupByField) return rows

  const cols       = store.columnsOf(widget.datasetId)
  const numCols    = cols.filter(c => c.type === 'number').map(c => c.name)
  const nonNumCols = cols.filter(c => c.type !== 'number').map(c => c.name)

  const groups = new Map<string, DataRow[]>()
  for (const row of rows) {
    const key = String(row[groupByField] ?? '').trim().replace(/\s+/g, ' ')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }

  return [...groups.entries()].map(([key, groupRows]) => {
    const result: DataRow = { [groupByField]: key }

    // non-numeric: carry first row's values
    for (const col of nonNumCols) {
      if (col !== groupByField) result[col] = groupRows[0]?.[col] ?? ''
    }

    // numeric: aggregate
    for (const col of numCols) {
      const vals = groupRows.map(r => Number(r[col] ?? 0)).filter(v => !isNaN(v))
      switch (aggregation) {
        case 'sum':   result[col] = vals.reduce((a, b) => a + b, 0); break
        case 'avg':   result[col] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; break
        case 'count': result[col] = groupRows.length; break
        case 'min':   result[col] = vals.length ? Math.min(...vals) : 0; break
        case 'max':   result[col] = vals.length ? Math.max(...vals) : 0; break
      }
    }
    return result
  })
}

// ─── Filter panel helpers ─────────────────────────────────────────────────────
const NUMBER_OPS = computed<{ value: FilterOperator; label: string }[]>(() => [
  { value: 'eq',      label: '=' },      { value: 'neq',    label: '≠' },
  { value: 'gt',      label: '>' },      { value: 'gte',    label: '≥' },
  { value: 'lt',      label: '<' },      { value: 'lte',    label: '≤' },
  { value: 'in',      label: t('bi_filter_in_list') },
  { value: 'notIn',   label: t('bi_filter_not_in_list') },
  { value: 'blank',   label: t('bi_filter_blank') },   { value: 'notBlank', label: t('bi_filter_not_blank') },
])
const STRING_OPS = computed<{ value: FilterOperator; label: string }[]>(() => [
  { value: 'eq',         label: t('bi_filter_equals') },
  { value: 'neq',        label: t('bi_filter_not_equals') },
  { value: 'contains',   label: t('bi_filter_contains') },
  { value: 'notContains',label: t('bi_filter_not_contains') },
  { value: 'in',         label: t('bi_filter_in_list') },
  { value: 'notIn',      label: t('bi_filter_not_in_list') },
  { value: 'blank',      label: t('bi_filter_blank_full') },
  { value: 'notBlank',   label: t('bi_filter_not_blank_full') },
])

// ─── Left sidebar search ───────────────────────────────────────────────────────
const sidebarSearch = ref('')

function filteredColumnsOf(dsId: string) {
  const q = sidebarSearch.value.trim().toLowerCase()
  const cols = store.columnsOf(dsId)
  if (!q) return cols
  return cols.filter(c => c.label.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
}

// Group columns by source table (used when dataset has columnSources)
function columnGroups(dsId: string): { sourceName: string; columns: ReturnType<typeof store.columnsOf> }[] {
  const ds = store.datasets.find(d => d.id === dsId)
  if (!ds?.columnSources) return []
  const cols = filteredColumnsOf(dsId)
  const groups = new Map<string, typeof cols>()
  for (const col of cols) {
    const source = ds.columnSources[col.name] ?? '—'
    if (!groups.has(source)) groups.set(source, [])
    groups.get(source)!.push(col)
  }
  return [...groups.entries()].map(([sourceName, columns]) => ({ sourceName, columns }))
}

// ─── in/notIn value picker ─────────────────────────────────────────────────────
const valuePickerSearch = reactive<Record<string, string>>({})

function uniqueValuesFor(colName: string): string[] {
  if (!selectedWidget.value) return []
  const rows = store.rowsOf(selectedWidget.value.datasetId)
  const seen = new Set<string>()
  for (const row of rows) {
    const v = String(row[colName] ?? '')
    if (v !== '') seen.add(v)
  }
  return [...seen].sort((a, b) => a.localeCompare(b, 'th'))
}

function filteredPickerValues(condId: string, colName: string): string[] {
  const q = (valuePickerSearch[condId] ?? '').trim().toLowerCase()
  const vals = uniqueValuesFor(colName)
  return q ? vals.filter(v => v.toLowerCase().includes(q)) : vals
}

function togglePickerValue(condId: string, val: string, current: string[]) {
  updateFilterCondition(condId, {
    values: current.includes(val) ? current.filter(v => v !== val) : [...current, val],
  })
}

const filterCols = computed(() =>
  selectedWidget.value ? store.columnsOf(selectedWidget.value.datasetId) : [],
)

const filterColSearch = ref('')
const filteredFilterCols = computed(() => {
  const q = filterColSearch.value.trim().toLowerCase()
  if (!q) return filterCols.value
  return filterCols.value.filter(c =>
    c.label.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
  )
})

const filterConditions = computed(() =>
  selectedWidget.value?.filters?.conditions ?? [],
)

const filterLogic = computed(() =>
  selectedWidget.value?.filters?.logic ?? 'and',
)

const activeFilterCount = computed(() => {
  const conds = selectedWidget.value?.filters?.conditions ?? []
  return conds.filter(c =>
    c.column && (c.operator === 'blank' || c.operator === 'notBlank' || c.value !== ''),
  ).length
})

const DATE_OPS = computed<{ value: FilterOperator; label: string }[]>(() => [
  { value: 'eq',      label: '=' },      { value: 'neq',    label: '≠' },
  { value: 'gt',      label: '>' },      { value: 'gte',    label: '≥' },
  { value: 'lt',      label: '<' },      { value: 'lte',    label: '≤' },
  { value: 'blank',   label: t('bi_filter_blank') },   { value: 'notBlank', label: t('bi_filter_not_blank') },
])

function getColType(colName: string): 'number' | 'string' | 'date' {
  return filterCols.value.find(c => c.name === colName)?.type ?? 'string'
}

function opsForCol(colName: string) {
  const t2 = getColType(colName)
  if (t2 === 'number') return NUMBER_OPS.value
  if (t2 === 'date')   return DATE_OPS.value
  return STRING_OPS.value
}

function setFilterLogic(logic: 'and' | 'or') {
  if (!selectedWidget.value) return
  const filters = selectedWidget.value.filters ?? { logic: 'and', conditions: [] }
  store.updateFilters(selectedWidget.value.id, { ...filters, logic })
}

function addFilterCondition() {
  if (!selectedWidget.value) return
  const first = filterCols.value[0]?.name ?? ''
  const filters = selectedWidget.value.filters ?? { logic: 'and', conditions: [] }
  store.updateFilters(selectedWidget.value.id, {
    ...filters,
    conditions: [
      ...filters.conditions,
      { id: `f_${Date.now()}_${Math.random().toString(36).slice(2)}`, column: first, operator: 'eq', value: '' },
    ],
  })
}

function removeFilterCondition(id: string) {
  if (!selectedWidget.value) return
  const filters = selectedWidget.value.filters!
  store.updateFilters(selectedWidget.value.id, {
    ...filters,
    conditions: filters.conditions.filter(c => c.id !== id),
  })
}

function updateFilterCondition(id: string, patch: Partial<FilterCondition>) {
  if (!selectedWidget.value) return
  const filters = selectedWidget.value.filters!
  store.updateFilters(selectedWidget.value.id, {
    ...filters,
    conditions: filters.conditions.map(c => c.id === id ? { ...c, ...patch } : c),
  })
}

// ─── Cell Click Modal ─────────────────────────────────────────────────────────
interface CellClickContext {
  widgetTitle: string
  datasetId:   string
  rowData:     Record<string, any>
  colField:    string
  cellValue:   any
  fontSize?:   number
}

const cellClickCtx  = ref<CellClickContext | null>(null)
const cellClickTab  = ref<'detail' | 'related'>('detail')
const cellModalAfterMounted = ref(false)
const cellRelatedSearch = ref('')

// ── Modal resize / move ───────────────────────────────────────────────────────
const modalW = ref(860)
const modalH = ref(640)
const modalX = ref<number | null>(null)   // null = centered
const modalY = ref<number | null>(null)

function clampModal(w: number, h: number, x: number | null, y: number | null) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const nw = Math.max(380, Math.min(w, vw - 32))
  const nh = Math.max(280, Math.min(h, vh - 32))
  const nx = x === null ? null : Math.max(0, Math.min(x, vw - nw))
  const ny = y === null ? null : Math.max(0, Math.min(y, vh - nh))
  return { nw, nh, nx, ny }
}

function absorbNextClick() {
  const handler = (e: Event) => { e.stopPropagation(); document.removeEventListener('click', handler, true) }
  document.addEventListener('click', handler, true)
}

function startModalResize(e: MouseEvent, dir: 'r' | 'b' | 'br') {
  e.preventDefault()
  const startX = e.clientX
  const startY = e.clientY
  const startW = modalW.value
  const startH = modalH.value
  const onMove = (me: MouseEvent) => {
    const dx = me.clientX - startX
    const dy = me.clientY - startY
    const { nw, nh } = clampModal(
      dir !== 'b' ? startW + dx : startW,
      dir !== 'r' ? startH + dy : startH,
      modalX.value, modalY.value,
    )
    if (dir !== 'b') modalW.value = nw
    if (dir !== 'r') modalH.value = nh
  }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    absorbNextClick()
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function startModalMove(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('button')) return
  e.preventDefault()
  const el = (e.currentTarget as HTMLElement).closest<HTMLElement>('.modal-box')
  if (!el) return
  const rect = el.getBoundingClientRect()
  if (modalX.value === null) modalX.value = rect.left
  if (modalY.value === null) modalY.value = rect.top
  const startX = e.clientX - modalX.value
  const startY = e.clientY - modalY.value
  const onMove = (me: MouseEvent) => {
    const { nx, ny } = clampModal(modalW.value, modalH.value, me.clientX - startX, me.clientY - startY)
    modalX.value = nx
    modalY.value = ny
  }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    absorbNextClick()
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

watch(cellClickTab, (tab) => { if (tab === 'related') cellModalAfterMounted.value = true })
watch(cellClickCtx, (v) => {
  if (v) {
    cellModalAfterMounted.value = false
    cellRelatedSearch.value = ''
    modalX.value = null
    modalY.value = null
  }
})

function onCellClick(
  widget: RWidget,
  payload: { rowData: Record<string, any>; colField: string; cellValue: any },
) {
  cellClickCtx.value = {
    widgetTitle: widget.title || widget.type,
    datasetId:   widget.datasetId,
    rowData:     payload.rowData,
    colField:    payload.colField,
    cellValue:   payload.cellValue,
    fontSize:    widget.fontSize,
  }
  cellClickTab.value = 'detail'
}

function closeCellModal() { cellClickCtx.value = null }

const modalFontSize = computed(() => cellClickCtx.value?.fontSize ?? 11)

const cellDetailEntries = computed(() => {
  if (!cellClickCtx.value) return []
  const { datasetId } = cellClickCtx.value
  const fmt  = store.numericFormatOf(datasetId)
  const cols = store.columnsOf(datasetId)
  return Object.entries(cellClickCtx.value.rowData).map(([key, raw]) => {
    const colMeta = cols.find(c => c.name === key)
    const isDate  = colMeta?.type === 'date' || (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw))
    const isNum   = colMeta?.type === 'number' || (typeof raw === 'number')
    const isExcluded = fmt.excludeDecimalCols?.includes(key) ?? false
    let display: string
    if (raw === null || raw === undefined) {
      display = '—'
    } else if (isDate && fmt.datePattern) {
      display = formatDateValue(raw, fmt.datePattern, fmt.dateEra ?? 'CE')
    } else if (isNum && !isExcluded && (fmt.comma || fmt.decimals !== undefined)) {
      display = formatNumericValue(raw, fmt)
    } else {
      display = String(raw)
    }
    return {
      key,
      label:     store.labelOf(datasetId, key),
      value:     display,
      rawValue:  raw,
      isClicked: key === cellClickCtx.value!.colField,
    }
  })
})

const cellRelatedRows = computed(() => {
  if (!cellClickCtx.value) return []
  const { datasetId, colField, cellValue } = cellClickCtx.value
  const norm = (v: unknown) => String(v ?? '').trim().replaceAll(/\s+/g, ' ')
  const strVal = norm(cellValue)
  return store.rowsOf(datasetId).filter(r => norm(r[colField]) === strVal)
})

const filteredCellRelatedRows = computed(() => {
  const q = cellRelatedSearch.value.trim().toLowerCase()
  if (!q) return cellRelatedRows.value
  return cellRelatedRows.value.filter(r =>
    Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q)),
  )
})

const cellRelatedColDefs = computed<ColDef[]>(() => {
  if (!cellClickCtx.value || !cellRelatedRows.value.length) return []
  const { datasetId, rowData } = cellClickCtx.value
  const fmt  = store.numericFormatOf(datasetId)
  const cols = store.columnsOf(datasetId)
  return Object.keys(rowData).map(col => {
    const colMeta    = cols.find(c => c.name === col)
    const isDate     = colMeta?.type === 'date'
    const isNum      = colMeta?.type === 'number'
    const isExcluded = fmt.excludeDecimalCols?.includes(col) ?? false
    return {
      field:      col,
      headerName: store.labelOf(datasetId, col),
      sortable: true, resizable: true, filter: false, minWidth: 60,
      valueFormatter: (p: any) => {
        if (p.value === null || p.value === undefined) return '—'
        const raw = p.value
        const looksDate = isDate || (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw))
        const looksNum  = isNum  || typeof raw === 'number'
        if (looksDate && fmt.datePattern) return formatDateValue(raw, fmt.datePattern, fmt.dateEra ?? 'CE')
        if (looksNum && !isExcluded && (fmt.comma || fmt.decimals !== undefined)) return formatNumericValue(raw, fmt)
        return String(raw)
      },
    }
  })
})

function onCellModalFirstData(event: any) {
  event.api.autoSizeAllColumns()
}

const colorModeCellModal = useColorMode()
const cellModalTheme = computed(() =>
  colorModeCellModal.value === 'dark' ? 'ag-theme-quartz-dark' : 'ag-theme-quartz',
)

// ─── Canvas click ─────────────────────────────────────────────────────────────
function onCanvasClick() {
  selectedWidgetId.value = null
  activeField.value = null
  showVisualMenu.value = false
}

// ─── Title editing ────────────────────────────────────────────────────────────
function onTitleInput(e: Event) {
  if (!selectedWidgetId.value) return
  store.updateWidget(selectedWidgetId.value, { title: (e.target as HTMLInputElement).value })
}

// ─── Dataset change for widget ────────────────────────────────────────────────
function onDatasetChange(e: Event) {
  if (!selectedWidgetId.value) return
  const dsId = (e.target as HTMLSelectElement).value
  store.updateWidget(selectedWidgetId.value, {
    datasetId: dsId,
    fields: { xField: '', yField: '', columns: [] },
  })
}

// ─── Widget type change ───────────────────────────────────────────────────────
function changeWidgetType(type: WidgetType) {
  if (!selectedWidgetId.value) return
  store.updateWidget(selectedWidgetId.value, { type })
}

// ─── Save / Load / Delete ─────────────────────────────────────────────────────
const biApi = useMangoBIApi()

const rpSavedId   = ref<string | null>(null)
const rpSaveName  = ref('')
const rpSaving    = ref(false)
const rpSaveMsg   = ref('')
const showRpSave  = ref(false)

const showRpLoad  = ref(false)
const rpLoadList  = ref<import('~/composables/useMangoBIApi').BIListItem[]>([])
const rpLoadBusy  = ref(false)
const rpDeleting  = ref<string | null>(null)

async function openRpSave() {
  if (!rpSaveName.value) rpSaveName.value = ''
  rpSaveMsg.value  = ''
  showRpSave.value = true
}

function goHome() { router.push('/') }

function clearReport() {
  if (!confirm('Clear all widgets and datasets?')) return
  store.resetAll()
  rpSavedId.value  = null
  rpSaveName.value = ''
  selectedWidgetId.value = null
}

const shareCopied = ref(false)
function copyShareUrl() {
  if (!rpSavedId.value) return
  const url = `${globalThis.location.origin}/view/${rpSavedId.value}`
  navigator.clipboard.writeText(url).then(() => {
    shareCopied.value = true
    setTimeout(() => { shareCopied.value = false }, 2000)
  })
}

async function doSaveRp() {
  if (!rpSaveName.value.trim()) { rpSaveMsg.value = t('bi_please_enter_name'); return }
  rpSaving.value  = true
  rpSaveMsg.value = ''
  try {
    const datasetsPayload = store.datasets.map(d => ({
      id: d.id, name: d.name, rows: d.rows,
      columnLabels: d.columnLabels,
      columnSources: d.columnSources,
      numericFormat: d.numericFormat,
    }))
    const widgetsJson = JSON.stringify({ widgets: store.widgets, datasets: datasetsPayload })
    const savedId = await biApi.saveReport({
      id:   rpSavedId.value ?? undefined,
      name: rpSaveName.value.trim(),
      widgetsJson,
    })
    if (savedId) {
      rpSavedId.value = savedId
      rpSaveMsg.value = t('bi_save_success')
      setTimeout(() => { rpSaveMsg.value = ''; showRpSave.value = false }, 1200)
    } else {
      rpSaveMsg.value = t('bi_error')
    }
  } catch { rpSaveMsg.value = t('bi_error') }
  finally  { rpSaving.value = false }
}

async function openRpLoad() {
  showRpLoad.value = true
  rpLoadBusy.value = true
  rpLoadList.value = []
  try { rpLoadList.value = await biApi.listReports() }
  catch { rpLoadList.value = [] }
  finally { rpLoadBusy.value = false }
}

async function doLoadRp(id: string) {
  rpLoadBusy.value = true
  try {
    const row = await biApi.loadReport(id)
    if (!row) return
    const payload = JSON.parse(row.widgetsJson ?? '{}')
    store.resetAll()
    for (const ds of (payload.datasets ?? [])) store.addDataset(ds)
    for (const w  of (payload.widgets  ?? [])) store.addWidget(w)
    rpSavedId.value  = id
    rpSaveName.value = row.name ?? ''
    selectedWidgetId.value = null
    showRpLoad.value = false
  } catch (err) { console.error(err) }
  finally { rpLoadBusy.value = false }
}

async function doDeleteRp(id: string) {
  if (!confirm(t('bi_confirm_delete_report'))) return
  rpDeleting.value = id
  try {
    await biApi.deleteReport(id)
    rpLoadList.value = rpLoadList.value.filter(r => r.id !== id)
    if (rpSavedId.value === id) rpSavedId.value = null
  } catch { }
  finally { rpDeleting.value = null }
}
</script>

<template>
  <div class="fixed inset-0 flex flex-col bg-background" @click="onCanvasClick">

    <!-- ── Header ─────────────────────────────────────────────────────────── -->
    <header
      class="flex items-center gap-3 px-4 h-12 border-b shrink-0 bg-background z-30"
      @click.stop
    >
      <button
        @click="goHome"
        class="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Home class="size-4" />
        Home
      </button>
      <div class="h-4 w-px bg-border" />
      <button
        @click="router.push('/datamodel')"
        class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft class="size-4" />
        Data Model
      </button>
      <div class="h-4 w-px bg-border" />
      <LayoutDashboard class="size-4 text-orange-500" />
      <span class="font-semibold text-sm">Report Builder</span>
      <button
        @click.stop="clearReport"
        title="Clear all widgets and datasets"
        class="flex items-center gap-1 text-xs px-2 py-1 rounded-lg text-destructive hover:bg-destructive/10 transition-colors border border-destructive/30"
      >
        <RotateCcw class="size-3" />
        Clear
      </button>

      <div class="ml-auto flex items-center gap-2">
        <span class="text-xs text-muted-foreground">
          {{ store.datasets.length }} dataset · {{ store.widgets.length }} visual
        </span>

        <!-- Save / Load -->
        <button
          @click.stop="openRpSave"
          :disabled="!store.widgets.length"
          :title="t('bi_save_report_title')"
          class="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors
                 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600
                 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download class="size-3.5" />
          {{ t('bi_save_report_title') }}
        </button>
        <button
          @click.stop="openRpLoad"
          :title="t('bi_load_report_title')"
          class="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors
                 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600"
        >
          <Loader2 class="size-3.5" />
          {{ t('bi_load_report_title') }}
        </button>
        <button
          v-if="rpSavedId"
          @click.stop="copyShareUrl"
          title="Copy share URL"
          class="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors
                 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:hover:bg-emerald-800/50
                 text-emerald-700 dark:text-emerald-300"
        >
          <Check v-if="shareCopied" class="size-3.5" />
          <Link2 v-else class="size-3.5" />
          {{ shareCopied ? 'Copied!' : 'Share' }}
        </button>

        <!-- Add Data -->
        <button
          @click.stop="showAddPanel = !showAddPanel; showVisualMenu = false"
          class="flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-lg
                 hover:bg-accent transition-colors font-medium"
        >
          <Database class="size-3.5" />
          + Data
        </button>

        <!-- Add Visual dropdown -->
        <div class="relative">
          <button
            @click.stop="showVisualMenu = !showVisualMenu; showAddPanel = false"
            :disabled="!store.datasets.length"
            class="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-orange-500 hover:bg-orange-600
                   text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            <Plus class="size-3.5" />
            + Visual
            <ChevronDown class="size-3 ml-0.5" />
          </button>
          <div
            v-if="showVisualMenu"
            class="absolute right-0 top-full mt-1 bg-background border rounded-xl shadow-xl z-50 py-1 min-w-[160px]"
          >
            <button
              v-for="vt in WIDGET_TYPES" :key="vt.type"
              @click.stop="addWidget(vt.type)"
              class="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
            >
              <component :is="vt.icon" class="size-4 shrink-0" :class="vt.color" />
              {{ vt.label }}
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- ── Body ───────────────────────────────────────────────────────────── -->
    <div class="relative flex flex-1 overflow-hidden" @click.stop>

      <!-- ── Left: Fields panel ─────────────────────────────────────────── -->
      <aside class="w-52 border-r bg-background flex flex-col overflow-hidden shrink-0">
        <div class="px-3 py-2 border-b shrink-0">
          <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Fields</p>
        </div>

        <!-- Column search -->
        <div class="px-2 py-1.5 border-b shrink-0">
          <div class="relative flex items-center">
            <input
              v-model="sidebarSearch"
              :placeholder="t('bi_search_column_report')"
              class="w-full text-[11px] border rounded-md px-2 py-1 pr-6 bg-background
                     focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-muted-foreground/40"
            />
            <button
              v-if="sidebarSearch"
              @click.stop="sidebarSearch = ''"
              class="absolute right-1.5 text-muted-foreground hover:text-foreground"
            >
              <X class="size-3" />
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto">
          <!-- No dataset -->
          <div
            v-if="!store.datasets.length"
            class="flex flex-col items-center justify-center gap-2 h-32 text-center px-4"
          >
            <Database class="size-6 text-muted-foreground/30" />
            <p class="text-[11px] text-muted-foreground">{{ t('bi_hint_add_data') }}</p>
          </div>

          <!-- Dataset sections -->
          <div v-for="ds in store.datasets" :key="ds.id" class="border-b last:border-0">
            <!-- Dataset header -->
            <div class="flex items-center gap-1.5 px-3 py-2 bg-muted/30 sticky top-0 z-10">
              <Database class="size-3 text-orange-400 shrink-0" />
              <span class="text-[11px] font-semibold truncate flex-1" :title="ds.name">{{ ds.name }}</span>
              <span class="text-[10px] text-muted-foreground font-mono shrink-0">{{ ds.rows.length }}r</span>
              <button
                @click.stop="store.removeDataset(ds.id)"
                class="text-muted-foreground hover:text-destructive transition-colors ml-1"
              >
                <X class="size-3" />
              </button>
            </div>

            <!-- Columns — grouped by source table if columnSources is available -->
            <div v-if="ds.columnSources">
              <template v-for="group in columnGroups(ds.id)" :key="group.sourceName">
                <!-- Source table sub-header -->
                <div class="flex items-center gap-1.5 px-3 py-1 bg-muted/20 sticky top-[32px] z-[5]">
                  <Table2 class="size-2.5 text-indigo-400 shrink-0" />
                  <span class="text-[9px] font-semibold text-indigo-500 dark:text-indigo-400 truncate uppercase tracking-wide">
                    {{ group.sourceName }}
                  </span>
                  <span class="ml-auto text-[9px] text-muted-foreground/60">{{ group.columns.length }}</span>
                </div>
                <button
                  v-for="col in group.columns"
                  :key="col.name"
                  class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/40 transition-colors"
                  :class="[
                    isColumnActive(ds.id, col.name)
                      ? 'bg-orange-50 dark:bg-orange-950/30'
                      : '',
                    selectedWidget && selectedWidget.datasetId !== ds.id
                      ? 'opacity-40 cursor-not-allowed'
                      : 'cursor-pointer',
                  ]"
                  @click.stop="onColumnClick(ds.id, col.name)"
                >
                  <HashIcon v-if="col.type === 'number'" class="size-3 shrink-0 text-blue-400" />
                  <TypeIcon v-else class="size-3 shrink-0 text-emerald-400" />
                  <div class="min-w-0 flex-1">
                    <span class="text-[11px] block truncate" :title="col.name">{{ col.label }}</span>
                    <span v-if="col.label !== col.name" class="text-[9px] block truncate text-muted-foreground/50 font-mono leading-tight">{{ col.name }}</span>
                  </div>
                </button>
              </template>
            </div>

            <!-- Flat list (no source info — single-table datasets) -->
            <div v-else>
              <button
                v-for="col in filteredColumnsOf(ds.id)"
                :key="col.name"
                class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/40 transition-colors"
                :class="[
                  isColumnActive(ds.id, col.name)
                    ? 'bg-orange-50 dark:bg-orange-950/30'
                    : '',
                  selectedWidget && selectedWidget.datasetId !== ds.id
                    ? 'opacity-40 cursor-not-allowed'
                    : 'cursor-pointer',
                ]"
                @click.stop="onColumnClick(ds.id, col.name)"
              >
                <HashIcon v-if="col.type === 'number'" class="size-3 shrink-0 text-blue-400" />
                <TypeIcon v-else class="size-3 shrink-0 text-emerald-400" />
                <div class="min-w-0 flex-1">
                  <span class="text-[11px] block truncate" :title="col.name">{{ col.label }}</span>
                  <span v-if="col.label !== col.name" class="text-[9px] block truncate text-muted-foreground/50 font-mono leading-tight">{{ col.name }}</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <!-- ── Add Data Slide Panel ────────────────────────────────────────── -->
      <Transition name="slide-panel">
        <div
          v-if="showAddPanel"
          class="w-64 border-r bg-background z-20 flex flex-col shadow-lg absolute left-52 top-0 bottom-0"
          @click.stop
        >
          <!-- Tabs + Close -->
          <div class="flex border-b text-[10px] shrink-0">
            <button
              v-for="[m, label] in ([['mock','📦 Demo'],['sql','🗄️ SQL']] as const)"
              :key="m"
              @click="addMode = m; errorMsg = ''"
              :class="['flex-1 py-2 font-semibold transition-colors', addMode === m ? 'bg-orange-500 text-white' : 'text-muted-foreground hover:bg-accent']"
            >{{ label }}</button>
            <button
              @click="showAddPanel = false"
              class="px-3 flex items-center justify-center border-l text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              :title="t('close')"
            >
              <X class="size-3.5" />
            </button>
          </div>

          <!-- Scrollable content -->
          <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
            <div>
              <p class="text-[10px] font-semibold text-muted-foreground mb-1">{{ t('bi_dataset_name_optional') }}</p>
              <input v-model="customName" :placeholder="t('bi_display_name_placeholder')"
                class="w-full text-xs border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-orange-400" />
            </div>

            <!-- Mock -->
            <template v-if="addMode === 'mock'">
              <select v-model="selectedKey"
                class="w-full text-xs border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-orange-400">
                <option v-for="ds in datasetOptions" :key="ds.key" :value="ds.key">{{ ds.label }}</option>
              </select>
              <button @click="addMockDataset"
                class="w-full text-xs py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors">
                {{ t('bi_add_dataset') }}
              </button>
            </template>

            <!-- SQL -->
            <template v-else>
              <div>
                <p class="text-[10px] font-semibold text-muted-foreground mb-1">Passcode</p>
                <div class="flex gap-1.5">
                  <input v-model="sqlPasscode" type="text" :placeholder="t('bi_enter_passcode_placeholder')"
                    class="flex-1 text-xs border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-orange-400 font-mono min-w-0"
                    @keydown.enter.stop="fetchSqlTemplates" />
                  <button @click="fetchSqlTemplates" :disabled="sqlLoading"
                    class="px-2.5 text-[10px] font-semibold bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300
                           border border-orange-200 rounded-lg hover:bg-orange-200 transition-colors disabled:opacity-60 shrink-0">
                    <Loader2 v-if="sqlLoading" class="size-3 animate-spin" />
                    <span v-else>{{ t('bi_search') }}</span>
                  </button>
                </div>
              </div>

              <template v-if="sqlTemplatesLoaded">
                <div v-if="sqlTemplates.length" class="space-y-1.5">
                  <div class="flex items-center justify-between">
                    <p class="text-[10px] font-semibold text-muted-foreground">Template</p>
                    <span class="text-[10px] text-orange-500">{{ sqlTemplates.length }} {{ t('bi_items') }}</span>
                  </div>
                  <select v-model="selectedTemplateId"
                    class="w-full text-xs border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-orange-400">
                    <option v-for="t in sqlTemplates" :key="t.template_id" :value="t.template_id">
                      {{ t.template_name }}
                    </option>
                  </select>
                </div>
                <div v-else class="text-[10px] text-center text-muted-foreground py-2 border border-dashed rounded-lg">
                  {{ t('bi_template_not_found') }}
                </div>
              </template>

              <div v-if="errorMsg" class="flex items-start gap-1.5 text-[10px] text-destructive bg-destructive/10 rounded-lg px-2 py-1.5">
                <AlertCircle class="size-3 shrink-0 mt-0.5" />
                <span class="break-all">{{ errorMsg }}</span>
              </div>

              <button v-if="sqlTemplatesLoaded && sqlTemplates.length"
                @click="addSQLDataset" :disabled="loading || !selectedTemplateId"
                class="w-full flex items-center justify-center gap-1.5 text-xs py-2 bg-orange-500 hover:bg-orange-600
                       text-white rounded-lg font-medium transition-colors disabled:opacity-60">
                <Loader2 v-if="loading" class="size-3 animate-spin" />
                <Download v-else class="size-3" />
                {{ loading ? t('bi_loading') : t('bi_add_dataset') }}
              </button>
            </template>
          </div>
        </div>
      </Transition>

      <!-- ── Canvas ──────────────────────────────────────────────────────── -->
      <div
        class="flex-1 relative overflow-auto pr-3 bg-background bg-[radial-gradient(circle,_hsl(var(--border))_1px,_transparent_1px)] bg-[size:24px_24px]"
        @click="onCanvasClick"
      >
        <!-- Empty state -->
        <div
          v-if="!store.widgets.length"
          class="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none"
        >
          <LayoutDashboard class="size-14 text-muted-foreground/15" />
          <p class="text-sm font-medium text-muted-foreground">
            {{ store.datasets.length ? t('bi_hint_add_visual') : t('bi_hint_start_data') }}
          </p>
          <p v-if="store.datasets.length" class="text-xs text-muted-foreground/60">
            {{ t('bi_hint_assign_field') }}
          </p>
        </div>

        <!-- Canvas size extender -->
        <div style="min-width: 1400px; min-height: 900px; position: relative; padding: 12px;">
          <ReportWidget
            v-for="widget in store.widgets"
            :key="widget.id"
            :widget="widget"
            :rows="filteredRowsOf(widget)"
            :selected="selectedWidgetId === widget.id"
            @select="selectedWidgetId = widget.id; activeField = null"
            @delete="store.removeWidget(widget.id); if (selectedWidgetId === widget.id) selectedWidgetId = null"
            @move="(x, y) => store.updateWidget(widget.id, { x, y })"
            @resize="(w, h) => store.updateWidget(widget.id, { w, h })"
            @cell-click="(p) => onCellClick(widget, p)"
          />
        </div>
      </div>

      <!-- ── Right: Visualization config ────────────────────────────────── -->
      <Transition name="slide-right">
        <aside
          v-if="selectedWidget"
          class="w-56 border-l bg-background flex flex-col overflow-hidden shrink-0"
          @click.stop
        >
          <!-- Panel header -->
          <div class="px-3 py-2 border-b shrink-0 flex items-center justify-between">
            <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Visualizations</p>
            <button @click="store.removeWidget(selectedWidget.id); selectedWidgetId = null"
              class="text-muted-foreground hover:text-destructive transition-colors" :title="t('bi_delete_visual')">
              <Trash2 class="size-3.5" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-4">

            <!-- Visual type picker -->
            <div>
              <p class="text-[10px] font-semibold text-muted-foreground mb-2">{{ t('bi_visual_type') }}</p>
              <div class="grid grid-cols-2 gap-1">
                <button
                  v-for="vt in WIDGET_TYPES" :key="vt.type"
                  @click="changeWidgetType(vt.type)"
                  :class="[
                    'flex items-center gap-1.5 px-2 py-1.5 text-[10px] rounded-lg border transition-colors',
                    selectedWidget.type === vt.type
                      ? 'border-primary bg-primary/5 font-semibold'
                      : 'border-transparent hover:border-border hover:bg-muted/40',
                  ]"
                  :title="vt.label"
                >
                  <component :is="vt.icon" class="size-3 shrink-0" :class="vt.color" />
                  {{ vt.label }}
                </button>
              </div>
            </div>

            <!-- Title -->
            <div>
              <p class="text-[10px] font-semibold text-muted-foreground mb-1">{{ t('bi_name') }}</p>
              <input
                :value="selectedWidget.title"
                @input="onTitleInput"
                class="w-full text-xs border rounded-lg px-2 py-1.5 bg-background
                       focus:outline-none focus:ring-1 focus:ring-primary"
                :placeholder="t('bi_visual_name_placeholder')"
              />
            </div>

            <!-- Dataset selector -->
            <div v-if="store.datasets.length > 1">
              <p class="text-[10px] font-semibold text-muted-foreground mb-1">Dataset</p>
              <select
                :value="selectedWidget.datasetId"
                @change="onDatasetChange"
                class="w-full text-xs border rounded-lg px-2 py-1.5 bg-background
                       focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option v-for="ds in store.datasets" :key="ds.id" :value="ds.id">{{ ds.name }}</option>
              </select>
            </div>

            <!-- Field wells -->
            <div>
              <p class="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Fields</p>

              <!-- ecOption: raw JSON textarea -->
              <template v-if="selectedWidget.type === 'ecOption'">
                <p class="text-[10px] text-muted-foreground/70 mb-2">{{ t('bi_paste_echart_json') }}</p>
                <textarea
                  rows="10"
                  placeholder="{&#10;  &quot;series&quot;: [...]&#10;}"
                  class="w-full text-[10px] font-mono border rounded-lg px-2 py-1.5 bg-background
                         focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  :value="selectedWidget.fields.ecOptionJson ?? ''"
                  @input="store.updateFields(selectedWidget.id, { ecOptionJson: ($event.target as HTMLTextAreaElement).value })"
                />
              </template>

              <!-- Normal field wells -->
              <template v-else>
                <p class="text-[10px] text-muted-foreground/70 mb-3 leading-relaxed">
                  {{ t('bi_hint_click_field_well') }}
                </p>
                <div class="space-y-2">
                  <div
                    v-for="well in fieldWells[selectedWidget.type]"
                    :key="well.key"
                  >
                    <p class="text-[10px] font-medium text-muted-foreground mb-1">{{ well.label }}</p>
                    <div
                      @click.stop="setActiveField(well.key)"
                      :class="[
                        'flex items-center gap-1.5 rounded-lg border px-2.5 py-2 cursor-pointer transition-all',
                        activeField === well.key
                          ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30 ring-1 ring-orange-400'
                          : 'border-dashed hover:border-border bg-muted/20',
                      ]"
                    >
                      <span class="text-[11px] flex-1 truncate font-mono" :class="getFieldValue(well) ? 'text-foreground' : 'text-muted-foreground/50'">
                        {{ getFieldValue(well) || (well.multi ? t('bi_click_to_select_fields') : t('bi_click_to_select_column')) }}
                      </span>
                      <button
                        v-if="getFieldValue(well)"
                        @click.stop="clearField(well)"
                        class="text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <X class="size-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </template>
            </div>

            <!-- Selected yFields detail (stacked types) -->
            <div v-if="isStackedWidget && selectedWidget.fields.yFields?.length">
              <p class="text-[10px] font-semibold text-muted-foreground mb-1.5">{{ t('bi_selected_y_series') }}</p>
              <div class="space-y-1">
                <div
                  v-for="col in selectedWidget.fields.yFields"
                  :key="col"
                  class="flex items-center gap-1.5 text-[11px] py-0.5"
                >
                  <span class="flex-1 truncate text-foreground/70">
                    {{ store.labelOf(selectedWidget.datasetId, col) }}
                  </span>
                  <button
                    @click.stop="store.updateFields(selectedWidget.id, { yFields: selectedWidget.fields.yFields!.filter(c => c !== col) })"
                    class="text-muted-foreground hover:text-destructive"
                  ><X class="size-3" /></button>
                </div>
              </div>
            </div>

            <!-- Selected columns detail (table type) -->
            <div v-if="selectedWidget.type === 'table' && selectedWidget.fields.columns?.length">
              <p class="text-[10px] font-semibold text-muted-foreground mb-1.5">{{ t('bi_selected_columns') }}</p>
              <div class="space-y-1">
                <div
                  v-for="col in selectedWidget.fields.columns"
                  :key="col"
                  class="flex items-center gap-1.5 text-[11px] py-0.5"
                >
                  <span class="flex-1 truncate text-foreground/70 text-[11px]">
                    {{ store.labelOf(selectedWidget.datasetId, col) }}
                    <span v-if="store.labelOf(selectedWidget.datasetId, col) !== col" class="text-muted-foreground/50 font-mono text-[9px] ml-1">{{ col }}</span>
                  </span>
                  <button
                    @click.stop="store.updateFields(selectedWidget.id, { columns: selectedWidget.fields.columns!.filter(c => c !== col) })"
                    class="text-muted-foreground hover:text-destructive"
                  ><X class="size-3" /></button>
                </div>
              </div>
            </div>

            <!-- ── Group By ────────────────────────────────────────────── -->
            <div v-if="selectedWidget.type !== 'ecOption'" class="border-t pt-3">
              <div class="flex items-center gap-1.5 mb-2">
                <Layers class="size-3 text-muted-foreground" />
                <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Group By</p>
                <span
                  v-if="selectedWidget.fields.groupByField"
                  class="bg-indigo-500 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 leading-none"
                >ON</span>
              </div>

              <div class="space-y-2">
                <!-- Column picker -->
                <div>
                  <p class="text-[10px] font-medium text-muted-foreground mb-1">Column</p>
                  <div class="flex gap-1">
                    <select
                      :value="selectedWidget.fields.groupByField ?? ''"
                      @change="store.updateFields(selectedWidget.id, {
                        groupByField: ($event.target as HTMLSelectElement).value || undefined
                      })"
                      class="flex-1 text-[10px] border rounded-md px-1.5 py-1 bg-background
                             focus:outline-none focus:ring-1 focus:ring-orange-400 min-w-0"
                    >
                      <option value="">— ไม่ใช้ Group By —</option>
                      <option
                        v-for="col in store.columnsOf(selectedWidget.datasetId)"
                        :key="col.name"
                        :value="col.name"
                      >{{ col.label }}</option>
                    </select>
                    <button
                      v-if="selectedWidget.fields.groupByField"
                      @click.stop="store.updateFields(selectedWidget.id, { groupByField: undefined })"
                      class="text-muted-foreground hover:text-destructive shrink-0 px-1"
                    ><X class="size-3" /></button>
                  </div>
                </div>

                <!-- Aggregation -->
                <div v-if="selectedWidget.fields.groupByField">
                  <p class="text-[10px] font-medium text-muted-foreground mb-1">Aggregation</p>
                  <select
                    :value="selectedWidget.fields.aggregation ?? 'sum'"
                    @change="store.updateFields(selectedWidget.id, {
                      aggregation: ($event.target as HTMLSelectElement).value as AggregationType
                    })"
                    class="w-full text-[10px] border rounded-md px-1.5 py-1 bg-background
                           focus:outline-none focus:ring-1 focus:ring-orange-400"
                  >
                    <option value="sum">Sum (ผลรวม)</option>
                    <option value="avg">Average (เฉลี่ย)</option>
                    <option value="count">Count (จำนวนแถว)</option>
                    <option value="min">Min (ต่ำสุด)</option>
                    <option value="max">Max (สูงสุด)</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- ── Filters ─────────────────────────────────────────────── -->
            <div class="border-t pt-3">

              <!-- Header -->
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-1.5">
                  <Filter class="size-3 text-muted-foreground" />
                  <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Filters</p>
                  <span
                    v-if="activeFilterCount"
                    class="bg-orange-500 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 leading-none"
                  >{{ activeFilterCount }}</span>
                </div>
                <!-- AND / OR toggle -->
                <div class="flex text-[9px] border rounded-lg overflow-hidden">
                  <button
                    @click.stop="setFilterLogic('and')"
                    :class="['px-2 py-1 font-semibold transition-colors', filterLogic === 'and' ? 'bg-orange-500 text-white' : 'hover:bg-muted text-muted-foreground']"
                  >AND</button>
                  <button
                    @click.stop="setFilterLogic('or')"
                    :class="['px-2 py-1 font-semibold transition-colors', filterLogic === 'or' ? 'bg-orange-500 text-white' : 'hover:bg-muted text-muted-foreground']"
                  >OR</button>
                </div>
              </div>

              <!-- Column search -->
              <div class="relative flex items-center mb-2">
                <input
                  v-model="filterColSearch"
                  placeholder="Search column..."
                  class="w-full text-[10px] border rounded-md px-2 py-1 pr-6 bg-background
                         focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-muted-foreground/40"
                />
                <button
                  v-if="filterColSearch"
                  @click.stop="filterColSearch = ''"
                  class="absolute right-1.5 text-muted-foreground hover:text-foreground"
                ><X class="size-3" /></button>
              </div>

              <!-- Condition rows -->
              <div class="space-y-2">
                <div
                  v-for="cond in filterConditions"
                  :key="cond.id"
                  class="rounded-lg border bg-muted/20 p-2 space-y-1.5"
                >
                  <!-- Row 1: column + remove -->
                  <div class="flex items-center gap-1">
                    <select
                      :value="cond.column"
                      @change="updateFilterCondition(cond.id, {
                        column: ($event.target as HTMLSelectElement).value,
                        operator: 'eq',
                        value: '',
                        values: [],
                      })"
                      class="flex-1 text-[10px] border rounded-md px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-orange-400 min-w-0 truncate"
                    >
                      <option v-for="col in filteredFilterCols" :key="col.name" :value="col.name">
                        {{ col.label }}{{ col.label !== col.name ? ` (${col.name})` : '' }}
                      </option>
                    </select>
                    <button
                      @click.stop="removeFilterCondition(cond.id)"
                      class="text-muted-foreground hover:text-destructive shrink-0 p-0.5"
                    ><X class="size-3" /></button>
                  </div>

                  <!-- Row 2: operator -->
                  <select
                    :value="cond.operator"
                    @change="updateFilterCondition(cond.id, {
                      operator: ($event.target as HTMLSelectElement).value as FilterOperator,
                      value: '',
                      values: [],
                    })"
                    class="w-full text-[10px] border rounded-md px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-orange-400"
                  >
                    <option v-for="op in opsForCol(cond.column)" :key="op.value" :value="op.value">
                      {{ op.label }}
                    </option>
                  </select>

                  <!-- Row 3: value input / picker -->
                  <!-- Date column: datepicker + Today/Yesterday tokens -->
                  <template v-if="cond.operator !== 'blank' && cond.operator !== 'notBlank'
                                  && cond.operator !== 'in' && cond.operator !== 'notIn'
                                  && getColType(cond.column) === 'date'">
                    <!-- token badge when a dynamic token is selected -->
                    <div v-if="cond.value === DATE_TOKEN_TODAY || cond.value === DATE_TOKEN_YESTERDAY"
                         class="flex items-center gap-1">
                      <span class="inline-flex items-center gap-1 bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300
                                   text-[10px] font-semibold px-2 py-0.5 rounded-full border border-orange-300">
                        {{ DATE_TOKEN_LABELS[cond.value] }}
                        <button @click.stop="updateFilterCondition(cond.id, { value: '' })"
                                class="hover:text-destructive transition-colors"><X class="size-2.5" /></button>
                      </span>
                    </div>
                    <!-- date input -->
                    <input
                      v-else
                      type="date"
                      :value="cond.value"
                      @input="updateFilterCondition(cond.id, { value: ($event.target as HTMLInputElement).value })"
                      class="w-full text-[10px] border rounded-md px-1.5 py-1 bg-background
                             focus:outline-none focus:ring-1 focus:ring-orange-400 font-mono"
                    />
                    <!-- quick token buttons -->
                    <div class="flex gap-1 mt-0.5">
                      <button
                        @click.stop="updateFilterCondition(cond.id, { value: DATE_TOKEN_TODAY })"
                        :class="['text-[9px] px-1.5 py-0.5 rounded border font-semibold transition-colors',
                          cond.value === DATE_TOKEN_TODAY
                            ? 'bg-orange-500 text-white border-orange-500'
                            : 'bg-background text-muted-foreground border-border hover:border-orange-400 hover:text-orange-500']"
                      >{{ t('bi_today') }}</button>
                      <button
                        @click.stop="updateFilterCondition(cond.id, { value: DATE_TOKEN_YESTERDAY })"
                        :class="['text-[9px] px-1.5 py-0.5 rounded border font-semibold transition-colors',
                          cond.value === DATE_TOKEN_YESTERDAY
                            ? 'bg-orange-500 text-white border-orange-500'
                            : 'bg-background text-muted-foreground border-border hover:border-orange-400 hover:text-orange-500']"
                      >{{ t('bi_yesterday') }}</button>
                    </div>
                  </template>
                  <!-- Text / number input (non-date operators) -->
                  <input
                    v-else-if="cond.operator !== 'blank' && cond.operator !== 'notBlank'
                          && cond.operator !== 'in' && cond.operator !== 'notIn'"
                    :value="cond.value"
                    @input="updateFilterCondition(cond.id, { value: ($event.target as HTMLInputElement).value })"
                    :placeholder="t('bi_value_placeholder')"
                    :type="getColType(cond.column) === 'number' ? 'number' : 'text'"
                    class="w-full text-[10px] border rounded-md px-1.5 py-1 bg-background
                           focus:outline-none focus:ring-1 focus:ring-orange-400
                           placeholder:text-muted-foreground/40 font-mono"
                  />
                  <!-- in / notIn: checkbox value picker -->
                  <template v-else-if="cond.operator === 'in' || cond.operator === 'notIn'">
                    <!-- summary + clear -->
                    <div class="flex items-center justify-between text-[10px] mb-1">
                      <span :class="(cond.values ?? []).length ? 'text-orange-500 font-semibold' : 'text-muted-foreground'">
                        {{ (cond.values ?? []).length ? t('bi_selected_count', { count: cond.values!.length }) : t('bi_not_selected') }}
                      </span>
                      <button
                        v-if="(cond.values ?? []).length"
                        @click.stop="updateFilterCondition(cond.id, { values: [] })"
                        class="text-muted-foreground hover:text-destructive transition-colors"
                      >{{ t('bi_clear') }}</button>
                    </div>
                    <!-- search within values -->
                    <input
                      v-model="valuePickerSearch[cond.id]"
                      :placeholder="t('bi_search_value_placeholder')"
                      class="w-full text-[10px] border rounded-md px-1.5 py-1 bg-background mb-1
                             focus:outline-none focus:ring-1 focus:ring-orange-400
                             placeholder:text-muted-foreground/40"
                    />
                    <!-- scrollable checkbox list -->
                    <div class="max-h-28 overflow-y-auto border rounded-md bg-background divide-y divide-border/40">
                      <label
                        v-for="val in filteredPickerValues(cond.id, cond.column)"
                        :key="val"
                        class="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-muted/40 transition-colors"
                      >
                        <input
                          type="checkbox"
                          :checked="(cond.values ?? []).includes(val)"
                          @change="togglePickerValue(cond.id, val, cond.values ?? [])"
                          class="accent-orange-500 shrink-0"
                        />
                        <span class="text-[10px] truncate font-mono" :title="val">{{ val }}</span>
                      </label>
                      <div
                        v-if="!filteredPickerValues(cond.id, cond.column).length"
                        class="text-[10px] text-center text-muted-foreground py-2"
                      >{{ t('bi_no_values_found') }}</div>
                    </div>
                  </template>
                </div>
              </div>

              <!-- Add condition button -->
              <button
                @click.stop="addFilterCondition"
                :disabled="!filterCols.length"
                class="mt-2 w-full flex items-center justify-center gap-1 text-[10px] py-1.5 border border-dashed rounded-lg
                       text-muted-foreground hover:text-foreground hover:border-primary hover:bg-muted/30
                       transition-colors disabled:opacity-40"
              >
                <Plus class="size-3" />
                Add condition
              </button>

            </div>

            <!-- ── X-Axis Rotation (category charts) ───────────────────── -->
            <div
              v-if="selectedWidget && ['bar','line','stackedBar','stackedLine'].includes(selectedWidget.type)"
              class="border-t pt-3"
            >
              <div class="flex items-center justify-between mb-2">
                <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">X-Axis Rotation</p>
                <div class="flex items-center gap-1">
                  <button
                    @click.stop="store.updateWidget(selectedWidget.id, { xAxisRotate: Math.max(-90, (selectedWidget.xAxisRotate ?? 0) - 15) })"
                    class="size-6 flex items-center justify-center rounded border text-muted-foreground hover:bg-muted/50 text-sm font-bold transition-colors"
                  >−</button>
                  <span class="w-10 text-center text-[11px] font-mono font-semibold">
                    {{ selectedWidget.xAxisRotate ?? 0 }}°
                  </span>
                  <button
                    @click.stop="store.updateWidget(selectedWidget.id, { xAxisRotate: Math.min(90, (selectedWidget.xAxisRotate ?? 0) + 15) })"
                    class="size-6 flex items-center justify-center rounded border text-muted-foreground hover:bg-muted/50 text-sm font-bold transition-colors"
                  >+</button>
                  <button
                    v-if="selectedWidget.xAxisRotate"
                    @click.stop="store.updateWidget(selectedWidget.id, { xAxisRotate: 0 })"
                    class="size-6 flex items-center justify-center rounded border text-muted-foreground hover:bg-muted/50 transition-colors"
                    title="Reset to 0°"
                  ><X class="size-3" /></button>
                </div>
              </div>
            </div>

            <!-- ── Font Size (all except ecOption) ─────────────────────── -->
            <div v-if="selectedWidget && selectedWidget.type !== 'ecOption'" class="border-t pt-3">
              <div class="flex items-center justify-between mb-2">
                <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Font Size</p>
                <div class="flex items-center gap-1">
                  <button
                    @click.stop="store.updateWidget(selectedWidget.id, { fontSize: Math.max(8, (selectedWidget.fontSize ?? 11) - 1) })"
                    class="size-6 flex items-center justify-center rounded border text-muted-foreground hover:bg-muted/50 text-sm font-bold transition-colors"
                  >−</button>
                  <span class="w-10 text-center text-[11px] font-mono font-semibold">
                    {{ selectedWidget.fontSize ?? 11 }}px
                  </span>
                  <button
                    @click.stop="store.updateWidget(selectedWidget.id, { fontSize: Math.min(20, (selectedWidget.fontSize ?? 11) + 1) })"
                    class="size-6 flex items-center justify-center rounded border text-muted-foreground hover:bg-muted/50 text-sm font-bold transition-colors"
                  >+</button>
                  <button
                    v-if="selectedWidget.fontSize && selectedWidget.fontSize !== 11"
                    @click.stop="store.updateWidget(selectedWidget.id, { fontSize: 11 })"
                    class="size-6 flex items-center justify-center rounded border text-muted-foreground hover:bg-muted/50 transition-colors"
                    title="Reset to 11px"
                  ><X class="size-3" /></button>
                </div>
              </div>
            </div>

            <!-- ── Cell Click (table only) ──────────────────────────────── -->
            <div v-if="selectedWidget?.type === 'table'" class="border-t pt-3">
              <div class="flex items-center gap-1.5 mb-2">
                <MousePointer2 class="size-3 text-muted-foreground" />
                <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Cell Click</p>
              </div>
              <div class="flex gap-1.5">
                <button
                  @click.stop="store.updateWidget(selectedWidget.id, { cellClickMode: 'none' })"
                  :class="[
                    'flex-1 text-[10px] py-1.5 rounded-lg border transition-colors font-medium',
                    !selectedWidget.cellClickMode || selectedWidget.cellClickMode === 'none'
                      ? 'bg-muted border-muted-foreground/40 text-foreground font-semibold'
                      : 'border-border text-muted-foreground hover:bg-muted/50',
                  ]"
                >None</button>
                <button
                  @click.stop="store.updateWidget(selectedWidget.id, { cellClickMode: 'modal' })"
                  :class="[
                    'flex-1 text-[10px] py-1.5 rounded-lg border transition-colors font-medium',
                    selectedWidget.cellClickMode === 'modal'
                      ? 'bg-indigo-500 border-indigo-500 text-white font-semibold'
                      : 'border-border text-muted-foreground hover:bg-muted/50',
                  ]"
                >Modal</button>
              </div>
              <p v-if="selectedWidget.cellClickMode === 'modal'" class="mt-1.5 text-[9px] text-indigo-500 dark:text-indigo-400">
                Click any cell to open detail modal
              </p>
            </div>

          </div>
        </aside>
      </Transition>

    </div>

    <!-- ── Save Report Dialog ────────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showRpSave" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          @click.self="showRpSave = false">
          <div class="bg-background rounded-xl shadow-2xl w-80 p-5 flex flex-col gap-4">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-sm">{{ t('bi_save_report_title') }}</span>
              <button @click="showRpSave = false" class="text-muted-foreground hover:text-foreground">
                <X class="size-4" />
              </button>
            </div>
            <div>
              <label class="text-[10px] font-semibold text-muted-foreground mb-1 block">{{ t('bi_name') }}</label>
              <input
                v-model="rpSaveName"
                :placeholder="t('bi_report_name_placeholder')"
                class="w-full text-xs border rounded-lg px-3 py-2 bg-background
                       focus:outline-none focus:ring-2 focus:ring-orange-500"
                @keydown.enter="doSaveRp"
              />
            </div>
            <p v-if="rpSaveMsg" class="text-xs text-center"
               :class="rpSaveMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-500'">
              {{ rpSaveMsg }}
            </p>
            <div class="flex gap-2">
              <button @click="showRpSave = false"
                class="flex-1 text-xs py-1.5 rounded-lg border hover:bg-accent transition-colors">
                {{ t('cancel') }}
              </button>
              <button @click="doSaveRp" :disabled="rpSaving"
                class="flex-1 text-xs py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600
                       text-white font-medium transition-colors disabled:opacity-50">
                {{ rpSaving ? t('bi_saving') : t('save') }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Cell Click Detail Modal ───────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="cellClickCtx"
          class="fixed inset-0 z-50 bg-black/60"
          :class="modalX === null ? 'flex items-center justify-center' : ''"
          @click.self="closeCellModal"
        >
          <div
            class="modal-box bg-background rounded-2xl shadow-2xl flex flex-col overflow-hidden select-none"
            :style="{
              width:    modalW + 'px',
              height:   modalH + 'px',
              position: modalX !== null ? 'fixed' : 'relative',
              left:     modalX !== null ? modalX + 'px' : undefined,
              top:      modalY !== null ? modalY + 'px' : undefined,
            }"
          >
            <!-- Header (drag to move) -->
            <div
              class="flex items-center gap-2.5 px-5 py-3 border-b shrink-0 cursor-move"
              @mousedown="startModalMove"
            >
              <MousePointer2 class="size-4 text-indigo-500" />
              <div class="flex items-center gap-1.5 min-w-0 flex-1">
                <span class="text-xs text-muted-foreground truncate">{{ cellClickCtx.widgetTitle }}</span>
                <span class="text-muted-foreground/40">›</span>
                <span class="text-xs font-semibold truncate">
                  {{ store.labelOf(cellClickCtx.datasetId, cellClickCtx.colField) }}
                </span>
                <span class="text-muted-foreground/40">:</span>
                <span class="text-xs font-mono bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 px-2 py-0.5 rounded truncate max-w-[200px]">
                  {{ cellClickCtx.cellValue ?? '—' }}
                </span>
              </div>
              <button @click="closeCellModal" class="text-muted-foreground hover:text-foreground shrink-0">
                <X class="size-4" />
              </button>
            </div>

            <!-- Tabs -->
            <div class="flex border-b shrink-0">
              <button
                v-for="tab in [{ key: 'detail', label: 'Row Detail' }, { key: 'related', label: `Related Rows (${cellRelatedRows.length})` }]"
                :key="tab.key"
                @click="cellClickTab = tab.key as any"
                :class="[
                  'px-5 py-2.5 text-xs font-semibold border-b-2 transition-colors',
                  cellClickTab === tab.key
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                ]"
              >{{ tab.label }}</button>
            </div>

            <!-- Tab: Row Detail -->
            <div v-if="cellClickTab === 'detail'" class="flex-1 overflow-y-auto p-4">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div
                  v-for="entry in cellDetailEntries"
                  :key="entry.key"
                  :class="[
                    'rounded-xl border px-3 py-2.5 flex flex-col gap-0.5 transition-colors',
                    entry.isClicked
                      ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40'
                      : 'border-border bg-muted/20',
                  ]"
                >
                  <span
                    class="font-semibold uppercase tracking-wide"
                    :style="{ fontSize: Math.max(9, modalFontSize - 2) + 'px' }"
                    :class="entry.isClicked ? 'text-indigo-500' : 'text-muted-foreground'"
                  >{{ entry.label }}</span>
                  <span
                    class="font-medium break-all"
                    :style="{ fontSize: modalFontSize + 'px' }"
                    :class="entry.isClicked ? 'text-indigo-700 dark:text-indigo-300' : 'text-foreground'"
                  >{{ entry.value ?? '—' }}</span>
                </div>
              </div>
            </div>

            <!-- Tab: Related Rows -->
            <div v-else-if="cellClickTab === 'related'" class="flex-1 min-h-0 flex flex-col">
              <!-- Search bar -->
              <div class="px-4 py-2 border-b shrink-0 flex items-center gap-2">
                <input
                  v-model="cellRelatedSearch"
                  placeholder="Search..."
                  class="flex-1 text-xs border rounded-lg px-2.5 py-1.5 bg-background
                         focus:outline-none focus:ring-1 focus:ring-indigo-400
                         placeholder:text-muted-foreground/40"
                />
                <span class="text-[10px] text-muted-foreground shrink-0">
                  {{ filteredCellRelatedRows.length }}/{{ cellRelatedRows.length }}
                </span>
              </div>
              <div v-if="!cellRelatedRows.length"
                class="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                No related rows found
              </div>
              <div v-else-if="!filteredCellRelatedRows.length"
                class="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                No results match "{{ cellRelatedSearch }}"
              </div>
              <div v-else-if="cellModalAfterMounted"
                class="flex-1 min-h-0"
                :style="{ '--mf': modalFontSize + 'px', '--mf-h': Math.max(9, modalFontSize - 1) + 'px' }"
              >
                <AgGridVue
                  :class="[cellModalTheme, 'ag-modal-table h-full w-full']"
                  :rowData="filteredCellRelatedRows"
                  :columnDefs="cellRelatedColDefs"
                  :rowHeight="Math.max(28, modalFontSize + 17)"
                  :headerHeight="Math.max(32, modalFontSize + 21)"
                  :suppressMovableColumns="true"
                  :suppressCellFocus="true"
                  :enableCellTextSelection="true"
                  @first-data-rendered="onCellModalFirstData"
                />
              </div>
            </div>

            <!-- Resize handles -->
            <div class="absolute right-0 top-0 bottom-4 w-1.5 cursor-ew-resize hover:bg-indigo-400/30 rounded-r-2xl"
                 @mousedown.stop="startModalResize($event, 'r')" />
            <div class="absolute bottom-0 left-4 right-4 h-1.5 cursor-ns-resize hover:bg-indigo-400/30 rounded-b-2xl"
                 @mousedown.stop="startModalResize($event, 'b')" />
            <div class="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
                 @mousedown.stop="startModalResize($event, 'br')">
              <svg class="absolute bottom-1 right-1 text-muted-foreground/40" width="10" height="10" viewBox="0 0 10 10">
                <path d="M9 1L1 9M9 5L5 9M9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Load Report Dialog ─────────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showRpLoad" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          @click.self="showRpLoad = false">
          <div class="bg-background rounded-xl shadow-2xl w-[420px] flex flex-col max-h-[80vh]">
            <div class="flex items-center justify-between px-5 py-4 border-b">
              <span class="font-semibold text-sm">{{ t('bi_load_report_title') }}</span>
              <button @click="showRpLoad = false" class="text-muted-foreground hover:text-foreground">
                <X class="size-4" />
              </button>
            </div>
            <div class="flex-1 overflow-y-auto p-3">
              <div v-if="rpLoadBusy" class="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                <Loader2 class="size-4 animate-spin" />
                <span class="text-xs">{{ t('bi_loading') }}</span>
              </div>
              <div v-else-if="!rpLoadList.length"
                class="text-center py-10 text-xs text-muted-foreground">{{ t('bi_no_saved_reports') }}</div>
              <div v-else class="flex flex-col gap-1.5">
                <div
                  v-for="item in rpLoadList" :key="item.id"
                  class="flex items-center gap-2 px-3 py-2.5 rounded-lg border hover:bg-accent cursor-pointer transition-colors"
                  @click="doLoadRp(item.id)"
                >
                  <div class="flex-1 min-w-0">
                    <p class="text-xs font-semibold truncate">{{ item.name }}</p>
                    <p class="text-[10px] text-muted-foreground">
                      {{ item.createdBy }} ·
                      {{ new Date(item.updatedAt ?? item.createdAt).toLocaleDateString('th-TH') }}
                    </p>
                  </div>
                  <button
                    @click.stop="doDeleteRp(item.id)"
                    :disabled="rpDeleting === item.id"
                    class="shrink-0 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30
                           text-red-500 transition-colors disabled:opacity-50"
                    :title="t('delete')"
                  >
                    <Trash2 class="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
            <div class="px-5 py-3 border-t flex justify-end">
              <button @click="showRpLoad = false"
                class="text-xs px-4 py-1.5 rounded-lg border hover:bg-accent transition-colors">
                {{ t('close') }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<style scoped>
:deep(.ag-modal-table .ag-header-cell-text) {
  font-size: var(--mf-h, 10px);
  font-weight: 600;
}
:deep(.ag-modal-table .ag-cell) {
  font-size: var(--mf, 11px);
}

.slide-panel-enter-active,
.slide-panel-leave-active { transition: opacity 0.15s ease; }
.slide-panel-enter-from,
.slide-panel-leave-to     { opacity: 0; }

.slide-right-enter-active,
.slide-right-leave-active { transition: opacity 0.15s ease; }
.slide-right-enter-from,
.slide-right-leave-to     { opacity: 0; }
</style>
