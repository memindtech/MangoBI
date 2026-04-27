<script setup lang="ts">
import { AgGridVue } from 'ag-grid-vue3'
import { ClientSideRowModelModule, CommunityFeaturesModule, ModuleRegistry } from 'ag-grid-community'
import type { ColDef } from 'ag-grid-community'
import EChart from '~/components/report/EChart.vue'
import { groupChartData } from '~/utils/groupChartData'
import { formatDateValue, formatNumericValue } from '~/utils/formatValue'
import type { NumericFormat } from '~/utils/formatValue'
import { useMangoBIApi } from '~/composables/useMangoBIApi'
import type { FilterCondition, FilterOperator } from '~/stores/report'
import { MousePointer2, X, LayoutDashboard, Loader2, Sun, Moon, Filter, Plus, Trash2, Bot } from 'lucide-vue-next'
import { useViewAiContext } from '~/composables/view/useViewAiContext'
import { useAiChatStore } from '~/stores/ai-chat'
import { useAiFeature } from '~/composables/useAiFeature'
import { metaToColType, isDateMeta } from '~/utils/columnMapping'
import { resolveDynamicValue, DATE_TOKEN_TODAY, DATE_TOKEN_YESTERDAY } from '~/utils/transformData'

ModuleRegistry.registerModules([ClientSideRowModelModule, CommunityFeaturesModule])

definePageMeta({ layout: false })

const route     = useRoute()
const biApi     = useMangoBIApi()
const colorMode = useColorMode()
const isDark    = computed(() => colorMode.value === 'dark')

// ── Theme toggle ──────────────────────────────────────────────────────────────
function toggleTheme() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Dataset {
  id: string; name: string; rows: any[]
  columnLabels?: Record<string, any>
  columnSources?: Record<string, string>
  numericFormat?: NumericFormat
}
interface Widget {
  id: string; type: string; title: string; datasetId: string
  fields: { xField?: string; yField?: string; yFields?: string[]; columns?: string[]; ecOptionJson?: string; groupByField?: string; aggregation?: string }
  filters?: { logic: 'and' | 'or'; conditions: FilterCondition[] }
  columnWidths?: Record<string, number>
  xAxisRotate?: number
  fontSize?: number
  cellClickMode?: 'none' | 'modal'
  x: number; y: number; w: number; h: number
}

// ── State ─────────────────────────────────────────────────────────────────────
const loading    = ref(true)
const error      = ref('')
const expired    = ref(false)
const expiresAt  = ref<Date | null>(null)
const reportName = ref('')
const datasets   = ref<Dataset[]>([])
const widgets    = ref<Widget[]>([])

onMounted(async () => {
  // ── ตรวจสอบ link expiry ─────────────────────────────────────────────────
  const expParam = route.query.exp
  if (expParam) {
    const expSec = Number(expParam)
    const expDate = new Date(expSec * 1000)
    expiresAt.value = expDate
    if (Date.now() > expSec * 1000) {
      expired.value = true
      loading.value = false
      return
    }
  }

  try {
    const row = await biApi.loadPublicReport(route.params.id as string)
    if (!row) { error.value = 'Report not found'; return }
    reportName.value = row.name ?? ''
    const payload     = JSON.parse(row.widgetsJson  ?? '{}')
    const cachedRows: any[] = row.datasetsJson ? JSON.parse(row.datasetsJson) : []

    // Merge: config metadata from widgetsJson, rows from cache snapshot
    const configDs: any[] = payload.datasets ?? []
    datasets.value = configDs.map((ds: any) => {
      const cached = cachedRows.find((c: any) => c.id === ds.id)
      return cached ? { ...ds, rows: cached.rows ?? [] } : ds
    })
    widgets.value   = payload.widgets  ?? []
    // Init view filters from defaults set by report sender
    if (payload.defaultViewFilters && Object.keys(payload.defaultViewFilters).length) {
      viewFilters.value = payload.defaultViewFilters
    }
  } catch (e: any) {
    error.value = e?.message ?? 'Failed to load report'
  } finally {
    loading.value = false
  }
})

// ── Data helpers ──────────────────────────────────────────────────────────────
function rowsOf(dsId: string)           { return datasets.value.find(d => d.id === dsId)?.rows ?? [] }
function fmtOf(dsId: string): NumericFormat { return datasets.value.find(d => d.id === dsId)?.numericFormat ?? {} }
function labelOf(dsId: string, col: string) {
  return datasets.value.find(d => d.id === dsId)?.columnLabels?.[col]?.label ?? col
}
function colsOf(dsId: string) {
  const ds = datasets.value.find(d => d.id === dsId)
  if (!ds?.rows.length) return []
  const first   = ds.rows[0]
  const samples = ds.rows.slice(0, 20)
  return Object.keys(first).map(name => {
    const meta     = ds.columnLabels?.[name]
    const fallback = meta
      ? first[name]
      : (samples.find(r => r[name] !== null && r[name] !== undefined)?.[name] ?? first[name])
    return { name, label: meta?.label || name,
      type: isDateMeta(meta, fallback) ? 'date' : metaToColType(meta, fallback) }
  })
}

function applyGroupBy(rows: any[], w: Widget): any[] {
  const { groupByField, aggregation = 'sum' } = w.fields
  if (!groupByField) return rows

  const cols       = colsOf(w.datasetId)
  const numCols    = cols.filter(c => c.type === 'number').map(c => c.name)
  const nonNumCols = cols.filter(c => c.type !== 'number').map(c => c.name)

  const groups = new Map<string, any[]>()
  for (const row of rows) {
    const key = String(row[groupByField] ?? '').trim().replace(/\s+/g, ' ')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }

  return [...groups.entries()].map(([key, groupRows]) => {
    const result: any = { [groupByField]: key }
    for (const col of nonNumCols) {
      if (col !== groupByField) result[col] = groupRows[0]?.[col] ?? ''
    }
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

// rows after filter + groupBy — used for charts and tables
function groupedRows(w: Widget): any[] {
  return applyGroupBy(viewFilteredRows(w), w)
}

// ── Filter ────────────────────────────────────────────────────────────────────
function compareNum(cell: any, v: string, op: string): boolean {
  const n = Number(v)
  if (op === 'gt')  return typeof cell === 'number' ? cell > n  : String(cell) > v
  if (op === 'gte') return typeof cell === 'number' ? cell >= n : String(cell) >= v
  if (op === 'lt')  return typeof cell === 'number' ? cell < n  : String(cell) < v
  return           typeof cell === 'number' ? cell <= n : String(cell) <= v
}

function matchCondition(row: any, c: FilterCondition): boolean {
  const raw  = row[c.column]
  const op   = c.operator as FilterOperator
  const v    = c.value ?? ''
  const str  = String(raw ?? '')
  if (op === 'blank')       return raw === null || raw === undefined || raw === ''
  if (op === 'notBlank')    return raw !== null && raw !== undefined && raw !== ''
  if (op === 'in')          return (c.values ?? []).includes(str)
  if (op === 'notIn')       return !(c.values ?? []).includes(str)
  const cell = typeof raw === 'number' ? raw : str
  if (op === 'eq')          return str === v
  if (op === 'neq')         return str !== v
  if (op === 'contains')    return str.toLowerCase().includes(v.toLowerCase())
  if (op === 'notContains') return !str.toLowerCase().includes(v.toLowerCase())
  return compareNum(cell, v, op)
}

function isConditionValid(c: FilterCondition): boolean {
  if (!c.column) return false
  if (c.operator === 'blank' || c.operator === 'notBlank') return true
  if (c.operator === 'in'    || c.operator === 'notIn')    return (c.values?.length ?? 0) > 0
  return c.value !== ''
}

function filteredRows(w: Widget): any[] {
  const rows  = rowsOf(w.datasetId)
  const f     = w.filters
  if (!f?.conditions.length) return rows
  const valid = f.conditions.filter(isConditionValid)
  if (!valid.length) return rows
  const match = (r: any) => matchCondition(r, valid[0]!)
  if (valid.length === 1) return rows.filter(match)
  return rows.filter(r =>
    f.logic === 'and'
      ? valid.every(c => matchCondition(r, c))
      : valid.some(c => matchCondition(r, c)),
  )
}

// ── View-time filters ─────────────────────────────────────────────────────────
interface ViewFilter { column: string; operator: FilterOperator; value: string; values?: string[] }

const showFilterPanel = ref(false)
const viewFilters = ref<Record<string, ViewFilter[]>>({})

const VIEW_FILTER_OPS: { value: FilterOperator; label: string }[] = [
  { value: 'contains',    label: 'contains' },
  { value: 'notContains', label: 'not contains' },
  { value: 'eq',          label: '= equals' },
  { value: 'neq',         label: '≠ not equals' },
  { value: 'gt',          label: '> greater' },
  { value: 'gte',         label: '>= greater eq' },
  { value: 'lt',          label: '< less' },
  { value: 'lte',         label: '<= less eq' },
  { value: 'in',          label: 'in list' },
  { value: 'notIn',       label: 'not in list' },
  { value: 'blank',       label: 'is blank' },
  { value: 'notBlank',    label: 'not blank' },
]

const filterableDatasets = computed(() => {
  const seen = new Set<string>()
  return widgets.value
    .filter(w => { if (seen.has(w.datasetId)) return false; seen.add(w.datasetId); return true })
    .map(w => datasets.value.find(d => d.id === w.datasetId))
    .filter(Boolean) as Dataset[]
})

const activeViewFilterCount = computed(() =>
  Object.values(viewFilters.value).flat()
    .filter(f => f.column && (
      ['blank', 'notBlank'].includes(f.operator) ||
      (['in', 'notIn'].includes(f.operator) ? (f.values?.length ?? 0) > 0 : f.value !== '')
    )).length,
)

const viewPickerSearch = reactive<Record<string, string>>({})

function uniqueViewValuesFor(dsId: string, colName: string): string[] {
  if (!colName) return []
  const rows = datasets.value.find(d => d.id === dsId)?.rows ?? []
  const seen = new Set<string>()
  for (const row of rows) seen.add(String(row[colName] ?? ''))
  return [...seen].sort((a, b) => a.localeCompare(b, 'th'))
}

function filteredPickerViewValues(key: string, dsId: string, colName: string): string[] {
  const q = (viewPickerSearch[key] ?? '').trim().toLowerCase()
  const vals = uniqueViewValuesFor(dsId, colName)
  return q ? vals.filter(v => v.toLowerCase().includes(q)) : vals
}

function toggleViewPickerValue(f: ViewFilter, val: string) {
  const cur = f.values ?? []
  f.values = cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val]
}

function addViewFilter(dsId: string) {
  const cur = viewFilters.value[dsId] ?? []
  viewFilters.value = { ...viewFilters.value, [dsId]: [...cur, { column: '', operator: 'contains' as FilterOperator, value: '' }] }
}

function removeViewFilter(dsId: string, idx: number) {
  viewFilters.value = { ...viewFilters.value, [dsId]: (viewFilters.value[dsId] ?? []).filter((_, i) => i !== idx) }
}

function clearAllViewFilters() { viewFilters.value = {} }

// Returns 'date' | 'number' | 'string' for the selected column in a view filter
function viewFilterColType(dsId: string, colName: string): 'date' | 'number' | 'string' {
  if (!colName) return 'string'
  return colsOf(dsId).find(c => c.name === colName)?.type as any ?? 'string'
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)   // YYYY-MM-DD
}

function setTodayFilter(f: ViewFilter) {
  f.value = DATE_TOKEN_TODAY
}
function setYesterdayFilter(f: ViewFilter) {
  f.value = DATE_TOKEN_YESTERDAY
}
function isTokenValue(v: string) { return v === DATE_TOKEN_TODAY || v === DATE_TOKEN_YESTERDAY }
function tokenLabel(v: string) { return v === DATE_TOKEN_TODAY ? 'Today' : 'Yesterday' }

// Normalize ISO datetime → YYYY-MM-DD for date-type comparisons
function normDate(raw: any): string {
  const s = String(raw ?? '')
  return s.length >= 10 ? s.slice(0, 10) : s
}

function viewFilteredRows(w: Widget): any[] {
  const rows = filteredRows(w)
  const dsFilters = (viewFilters.value[w.datasetId] ?? [])
    .filter(f => f.column && (
      ['blank', 'notBlank'].includes(f.operator) ||
      (['in', 'notIn'].includes(f.operator) ? (f.values?.length ?? 0) > 0 : f.value !== '')
    ))
  if (!dsFilters.length) return rows

  return rows.filter(r => dsFilters.every(f => {
    if (f.operator === 'in')    return (f.values ?? []).includes(String(r[f.column] ?? ''))
    if (f.operator === 'notIn') return !(f.values ?? []).includes(String(r[f.column] ?? ''))
    const colType  = viewFilterColType(w.datasetId, f.column)
    const resolved = resolveDynamicValue(f.value)   // resolve __TODAY__ / __YESTERDAY__ at query time
    if (colType === 'date') {
      const cell = normDate(r[f.column])
      const v    = normDate(resolved)
      const op   = f.operator
      if (op === 'blank')    return cell === ''
      if (op === 'notBlank') return cell !== ''
      if (op === 'eq')       return cell === v
      if (op === 'neq')      return cell !== v
      if (op === 'gt')       return cell > v
      if (op === 'gte')      return cell >= v
      if (op === 'lt')       return cell < v
      if (op === 'lte')      return cell <= v
      if (op === 'contains') return cell.includes(v)
      return cell === v
    }
    return matchCondition(r, { column: f.column, operator: f.operator, value: resolved, values: [] })
  }))
}

// ── Chart option ──────────────────────────────────────────────────────────────
const COLORS = ['#6366f1','#f97316','#10b981','#3b82f6','#a855f7','#ef4444','#f59e0b','#06b6d4']

function makeAxisBase(tc: string, sc: string, fs = 10) {
  return {
    axisLine:  { lineStyle: { color: sc } },
    axisTick:  { show: false },
    axisLabel: { fontSize: fs, color: tc },
    splitLine: { lineStyle: { color: sc } },
  }
}

function makePieSeries(labels: string[], values: number[], tc: string, radius: string[], center: string[], extra = {}, fs = 10) {
  return {
    type: 'pie', radius, center,
    data: labels.map((n, i) => ({ name: n, value: values[i] })),
    label: { fontSize: fs, color: tc },
    itemStyle: { borderWidth: 2, borderColor: isDark.value ? '#1e1e2e' : '#fff' },
    ...extra,
  }
}

function chartOption(w: Widget) {
  const rows   = groupedRows(w)
  const t      = w.type
  const xField = w.fields.xField ?? ''
  const yField = w.fields.yField ?? ''
  const yList  = w.fields.yFields?.length ? w.fields.yFields : [yField]
  const yFieldsForGroup = [...new Set([yField, ...yList].filter(Boolean))]
  const grouped = groupChartData(rows, xField, yFieldsForGroup, (w.fields as any).aggregation ?? 'sum')
  const labels  = grouped.labels
  const values  = grouped.series(yField)
  const tc      = isDark.value ? '#94a3b8' : '#64748b'
  const sc      = isDark.value ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
  const rotate  = w.xAxisRotate ?? 0
  const fs      = w.fontSize ?? 11
  const fsSmall = Math.max(8, fs - 1)
  const ab      = makeAxisBase(tc, sc, fsSmall)
  const abX     = { ...ab, axisLabel: { ...ab.axisLabel, rotate } }
  const tip     = { trigger: 'axis' as const, textStyle: { fontSize: fsSmall }, confine: true }
  const bottomPad = rotate === 0 ? 28 : Math.min(80, Math.abs(rotate))
  const grid    = { top: 20, right: 8, bottom: bottomPad, left: 8, containLabel: true }
  const legend  = { top: 0, textStyle: { fontSize: fsSmall, color: tc } }
  const itemTip = { trigger: 'item' as const, formatter: '{b}: {c} ({d}%)', textStyle: { fontSize: fsSmall }, confine: true }

  if (t === 'ecOption') { try { return JSON.parse(w.fields.ecOptionJson?.trim() ?? '') } catch { return {} } }
  if (t === 'bar')  return { color: COLORS, grid, tooltip: tip,
    xAxis: { type: 'category', data: labels, ...abX }, yAxis: { type: 'value', ...ab },
    series: [{ type: 'bar', data: values, barMaxWidth: 48, itemStyle: { borderRadius: [3,3,0,0] } }] }
  if (t === 'line') return { color: COLORS, grid, tooltip: tip,
    xAxis: { type: 'category', data: labels, boundaryGap: false, ...abX }, yAxis: { type: 'value', ...ab },
    series: [{ type: 'line', data: values, smooth: true, symbol: 'circle', symbolSize: 5,
      lineStyle: { width: 2 }, areaStyle: { opacity: 0.12 } }] }
  if (t === 'pie')         return { color: COLORS, tooltip: itemTip,
    series: [makePieSeries(labels, values, tc, ['32%','66%'], ['50%','50%'],
      { labelLine: { lineStyle: { color: tc } } }, fsSmall)] }
  if (t === 'halfDoughnut') return { color: COLORS, tooltip: itemTip,
    series: [makePieSeries(labels, values, tc, ['40%','72%'], ['50%','72%'],
      { startAngle: 180, endAngle: 360 }, fsSmall)] }
  if (t === 'stackedBar') {
    const totals = labels.map((_: any, li: number) =>
      yList.reduce((s: number, yf: string) => s + (grouped.series(yf)[li] ?? 0), 0))
    return { color: COLORS, grid, tooltip: { ...tip, axisPointer: { type: 'shadow' } }, legend,
      xAxis: { type: 'category', data: labels, ...abX },
      yAxis: { type: 'value', max: 100, ...ab, axisLabel: { ...ab.axisLabel, formatter: '{value}%' } },
      series: yList.map((f: string, i: number) => ({ type: 'bar', stack: 'total', name: f, barMaxWidth: 48,
        emphasis: { focus: 'series' }, itemStyle: { color: COLORS[i % COLORS.length] },
        data: grouped.series(f).map((v: number, li: number) => totals[li] ? +((v/totals[li])*100).toFixed(1) : 0) })) }
  }
  if (t === 'stackedHBar') return { color: COLORS, grid: { ...grid, left: 64 },
    tooltip: { ...tip, axisPointer: { type: 'shadow' } }, legend,
    xAxis: { type: 'value', ...ab },
    yAxis: { type: 'category', data: labels, ...ab, axisLabel: { ...ab.axisLabel, width: 60, overflow: 'truncate' } },
    series: yList.map((f: string, i: number) => ({ type: 'bar', stack: 'total', name: f,
      itemStyle: { color: COLORS[i % COLORS.length] }, data: grouped.series(f) })) }
  if (t === 'stackedLine') return { color: COLORS, grid, tooltip: tip, legend,
    xAxis: { type: 'category', data: labels, boundaryGap: false, ...abX }, yAxis: { type: 'value', ...ab },
    series: yList.map((f: string, i: number) => ({ type: 'line', stack: 'total', name: f, smooth: true, symbol: 'none',
      lineStyle: { width: 1.5 }, areaStyle: { opacity: 0.35 }, itemStyle: { color: COLORS[i % COLORS.length] },
      data: grouped.series(f) })) }
  if (t === 'scatter') return { color: COLORS, grid,
    tooltip: { trigger: 'item' as const, confine: true,
      formatter: (p: any) => `${p.value[0]}, ${p.value[1]}`, textStyle: { fontSize: fsSmall } },
    xAxis: { type: 'value', ...ab }, yAxis: { type: 'value', ...ab },
    series: [{ type: 'scatter', symbolSize: 7, itemStyle: { color: COLORS[0], opacity: 0.8 },
      data: rows.map(r => [Number(r[xField] ?? 0), Number(r[yField] ?? 0)]) }] }
  return {}
}

// ── AG Grid ───────────────────────────────────────────────────────────────────
const themeClass = computed(() => isDark.value ? 'ag-theme-quartz-dark' : 'ag-theme-quartz')

function tableColDefs(w: Widget): ColDef[] {
  const all  = rowsOf(w.datasetId)
  const fallback = all.length ? Object.keys(all[0]) : []
  const cols = w.fields.columns?.length ? w.fields.columns : fallback
  const fmt  = fmtOf(w.datasetId)
  const meta = colsOf(w.datasetId)
  const clickable = w.cellClickMode === 'modal'
  return cols.map(col => {
    const colMeta    = meta.find(c => c.name === col)
    const isNum      = colMeta?.type === 'number'
    const isDate     = colMeta?.type === 'date' || (all.length > 0 && typeof all[0][col] === 'string' && /^\d{4}-\d{2}-\d{2}/.test(String(all[0][col] ?? '')))
    const isExcluded = fmt.excludeDecimalCols?.includes(col) ?? false
    const savedW     = w.columnWidths?.[col]
    return {
      field: col, headerName: labelOf(w.datasetId, col),
      sortable: true, resizable: true, filter: false, minWidth: 72,
      ...(savedW ? { width: savedW } : { flex: 1 }),
      cellStyle: { ...(isNum ? { textAlign: 'right', fontFamily: 'monospace' } : {}), ...(clickable ? { cursor: 'pointer' } : {}) },
      valueFormatter: (p: any) => {
        if (p.value === null || p.value === undefined || p.value === '') return ''
        if (isDate && fmt.datePattern) return formatDateValue(p.value, fmt.datePattern, fmt.dateEra ?? 'CE')
        if (isNum && !isExcluded && (fmt.comma || fmt.decimals !== undefined)) return formatNumericValue(p.value, fmt)
        return String(p.value)
      },
      // bind click at column level — more reliable than Vue @cell-clicked event in AG Grid 32
      onCellClicked: clickable ? (e: any) => {
        if (!e.data) return
        openModal(w.datasetId, e.data, col, e.data[col], viewFilteredRows(w), w.fontSize)
      } : undefined,
    }
  })
}

// ── KPI ───────────────────────────────────────────────────────────────────────
function kpiValue(w: Widget): string {
  const yf = w.fields.yField
  if (!yf) return '—'
  const rows = groupedRows(w)
  if (!rows.length) return '—'
  const total    = rows.map(r => Number(r[yf]) || 0).reduce((a, b) => a + b, 0)
  const fmt      = fmtOf(w.datasetId)
  const excluded = fmt.excludeDecimalCols?.includes(yf) ?? false
  if (!excluded && (fmt.comma || fmt.decimals !== undefined)) return formatNumericValue(total, fmt)
  return total.toLocaleString()
}

// ── Click modal ───────────────────────────────────────────────────────────────
interface ClickCtx {
  datasetId: string; rowData: any; colField: string; cellValue: any; widgetRows: any[]
  fontSize?: number
}
const clickCtx  = ref<ClickCtx | null>(null)
const clickTab  = ref<'detail' | 'related'>('detail')
const showRelated = ref(false)

// ── Modal resize / move ───────────────────────────────────────────────────────
const modalW = ref(720)
const modalH = ref(560)
const modalX = ref<number | null>(null)
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
  const startX = e.clientX; const startY = e.clientY
  const startW = modalW.value; const startH = modalH.value
  const onMove = (me: MouseEvent) => {
    const dx = me.clientX - startX; const dy = me.clientY - startY
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
  const startX = e.clientX - modalX.value; const startY = e.clientY - modalY.value
  const onMove = (me: MouseEvent) => {
    const { nx, ny } = clampModal(modalW.value, modalH.value, me.clientX - startX, me.clientY - startY)
    modalX.value = nx; modalY.value = ny
  }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    absorbNextClick()
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

watch(clickCtx, v => {
  if (v) {
    clickTab.value = 'detail'
    showRelated.value = false
    modalX.value = null
    modalY.value = null
  }
})
watch(clickTab, t => { if (t === 'related') showRelated.value = true })

function formatCell(dsId: string, key: string, raw: any): string {
  const fmt     = fmtOf(dsId)
  const cols    = colsOf(dsId)
  const colMeta = cols.find(c => c.name === key)
  const isDate  = colMeta?.type === 'date' || (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw))
  const isNum   = colMeta?.type === 'number' || typeof raw === 'number'
  const isExcluded = fmt.excludeDecimalCols?.includes(key) ?? false
  if (raw === null || raw === undefined) return '—'
  if (isDate && fmt.datePattern) return formatDateValue(raw, fmt.datePattern, fmt.dateEra ?? 'CE')
  if (isNum && !isExcluded && (fmt.comma || fmt.decimals !== undefined)) return formatNumericValue(raw, fmt)
  return String(raw)
}

const clickEntries = computed(() => {
  if (!clickCtx.value) return []
  const { datasetId, rowData, colField } = clickCtx.value
  if (!rowData) return []
  return Object.entries(rowData).map(([key, raw]) => ({
    key,
    label:     labelOf(datasetId, key),
    value:     formatCell(datasetId, key, raw),
    isClicked: key === colField,
  }))
})

const relatedRows = computed(() => {
  if (!clickCtx.value) return []
  const { colField, cellValue, widgetRows } = clickCtx.value
  const norm   = (v: unknown) => String(v ?? '').trim().replaceAll(/\s+/g, ' ')
  const strVal = norm(cellValue)
  return widgetRows.filter(r => norm(r[colField]) === strVal)
})

const relatedSearch = ref('')
watch(clickCtx, v => { if (v) relatedSearch.value = '' })

const filteredRelatedRows = computed(() => {
  const q = relatedSearch.value.trim().toLowerCase()
  if (!q) return relatedRows.value
  return relatedRows.value.filter(r =>
    Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q)),
  )
})

const relatedColDefs = computed<ColDef[]>(() => {
  if (!clickCtx.value || !relatedRows.value.length) return []
  const { datasetId, rowData } = clickCtx.value
  const fmt  = fmtOf(datasetId)
  const meta = colsOf(datasetId)
  return Object.keys(rowData).map(col => {
    const colMeta    = meta.find(c => c.name === col)
    const isNum      = colMeta?.type === 'number'
    const isDate     = colMeta?.type === 'date'
    const isExcluded = fmt.excludeDecimalCols?.includes(col) ?? false
    return {
      field: col, headerName: labelOf(datasetId, col),
      sortable: true, resizable: true, filter: false, minWidth: 60,
      cellStyle: isNum ? { textAlign: 'right' as const, fontFamily: 'monospace' } : undefined,
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

function openModal(dsId: string, rowData: any, colField: string, cellValue: any, widgetRows: any[], fontSize?: number) {
  clickCtx.value = { datasetId: dsId, rowData, colField, cellValue, widgetRows, fontSize }
}

const modalFontSize = computed(() => clickCtx.value?.fontSize ?? 11)

// chart click — always opens modal (mirrors ReportWidget.vue — no cellClickMode gate for charts)
function onChartClick(w: Widget, params: { name: string; value: any; seriesName: string; dataIndex: number }) {
  const x       = w.fields.xField ?? ''
  const gRows   = groupedRows(w)   // grouped — for finding the clicked row
  const rawRows = viewFilteredRows(w)  // raw — for related rows detail in modal
  if (w.type === 'scatter') {
    const xVal = Array.isArray(params.value) ? params.value[0] : params.value
    const row  = gRows.find(r => Number(r[x]) === Number(xVal))
    if (!row || !x) return
    openModal(w.datasetId, row, x, xVal, rawRows, w.fontSize)
    return
  }
  if (!x || !params.name) return
  const norm = (v: unknown) => String(v ?? '').trim().replaceAll(/\s+/g, ' ')
  const row = gRows.find(r => norm(r[x]) === params.name)
  if (!row) return
  openModal(w.datasetId, row, x, norm(row[x]), rawRows, w.fontSize)
}

function onRelatedFirstData(e: any) { e.api.autoSizeAllColumns() }

// ── AI Assistant ──────────────────────────────────────────────────────────────
const aiStore = useAiChatStore()
const { enabled: aiEnabled } = useAiFeature()
const { systemPrompt: aiSystemPrompt, contextLabel: aiContextLabel } = useViewAiContext(
  reportName,
  datasets,
  widgets,
  groupedRows,
)
</script>

<template>
  <div class="min-h-screen bg-muted/30 dark:bg-background flex flex-col">

    <!-- Header -->
    <header class="h-12 px-4 flex items-center gap-3 border-b bg-background shrink-0">
      <LayoutDashboard class="size-4 text-indigo-500" />
      <span class="text-sm font-semibold truncate flex-1">{{ reportName || 'Report Viewer' }}</span>
      <span class="text-[11px] text-muted-foreground">
        {{ widgets.length }} visual{{ widgets.length !== 1 ? 's' : '' }}
      </span>
      <span v-if="expiresAt && !expired"
        class="text-[11px] text-amber-600 dark:text-amber-400 ml-2"
        :title="`ลิ้งค์หมดอายุ: ${expiresAt.toLocaleString('th-TH')}`"
      >
        หมดอายุ {{ expiresAt.toLocaleDateString('th-TH') }}
      </span>

      <!-- Filter toggle -->
      <button
        @click="showFilterPanel = !showFilterPanel"
        class="relative p-1.5 rounded-lg hover:bg-muted transition-colors"
        :title="showFilterPanel ? 'Close filters' : 'View filters'"
      >
        <Filter class="size-4" :class="activeViewFilterCount > 0 ? 'text-indigo-500' : 'text-muted-foreground'" />
        <span
          v-if="activeViewFilterCount > 0"
          class="absolute -top-0.5 -right-0.5 size-3.5 bg-indigo-500 text-white text-[9px] font-bold
                 flex items-center justify-center rounded-full leading-none"
        >{{ activeViewFilterCount }}</span>
      </button>

      <!-- AI toggle -->
      <button
        v-if="aiEnabled"
        @click="aiStore.togglePanel('view')"
        class="relative p-1.5 rounded-lg hover:bg-muted transition-colors"
        :class="aiStore.openPage === 'view' ? 'text-violet-500' : 'text-muted-foreground'"
        title="AI Analyst"
      >
        <Bot class="size-4" />
        <span
          v-if="aiStore.openPage === 'view'"
          class="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-violet-500"
        />
      </button>

      <!-- Theme toggle -->
      <button
        @click="toggleTheme"
        class="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
        :title="isDark ? 'Switch to Light mode' : 'Switch to Dark mode'"
      >
        <Sun v-if="isDark" class="size-4" />
        <Moon v-else class="size-4" />
      </button>
    </header>

    <!-- Loading -->
    <div v-if="loading" class="flex-1 flex items-center justify-center gap-2 text-muted-foreground">
      <Loader2 class="size-5 animate-spin" />
      <span class="text-sm">Loading…</span>
    </div>

    <!-- Link Expired -->
    <div v-else-if="expired" class="flex-1 flex items-center justify-center p-8">
      <div class="text-center space-y-4 max-w-sm">
        <div class="mx-auto flex size-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/40">
          <svg class="size-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
          </svg>
        </div>
        <div>
          <p class="text-lg font-bold text-foreground">ลิ้งค์หมดอายุแล้ว</p>
          <p class="text-sm text-muted-foreground mt-1">
            ลิ้งค์นี้หมดอายุเมื่อ
            {{ expiresAt ? expiresAt.toLocaleString('th-TH') : '' }}
          </p>
        </div>
        <p class="text-xs text-muted-foreground">กรุณาติดต่อผู้ส่งรายงานเพื่อขอลิ้งค์ใหม่</p>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="flex-1 flex items-center justify-center">
      <div class="text-center space-y-2">
        <p class="text-destructive font-semibold">{{ error }}</p>
        <p class="text-xs text-muted-foreground">Please check the URL or contact the report owner.</p>
      </div>
    </div>

    <!-- Canvas -->
    <div v-else class="flex-1 relative overflow-auto">
      <div
        class="relative"
        :style="{
          width:  Math.max(...widgets.map(w => w.x + w.w), 800) + 32 + 'px',
          height: Math.max(...widgets.map(w => w.y + w.h), 600) + 32 + 'px',
        }"
      >
        <div
          v-for="w in widgets"
          :key="w.id"
          class="absolute rounded-xl border bg-background shadow-md overflow-hidden flex flex-col"
          :style="{ left: `${w.x}px`, top: `${w.y}px`, width: `${w.w}px`, height: `${w.h}px` }"
        >
          <!-- Widget header -->
          <div class="flex items-center gap-2 px-3 py-2 border-b shrink-0 bg-muted/30">
            <span class="text-xs font-semibold truncate flex-1">{{ w.title || w.type }}</span>
            <span class="text-[10px] text-muted-foreground">
              {{ groupedRows(w).length.toLocaleString() }}r
            </span>
          </div>

          <!-- Body -->
          <div class="flex-1 min-h-0 overflow-hidden p-2">

            <div
              v-if="!groupedRows(w).length && w.type !== 'ecOption'"
              class="h-full flex items-center justify-center text-[11px] text-muted-foreground
                     border border-dashed rounded-lg"
            >No data</div>

            <!-- Charts -->
            <EChart
              v-else-if="w.type !== 'table' && w.type !== 'kpi'"
              :option="chartOption(w)"
              @chart-click="(p) => onChartClick(w, p)"
              @wheel.stop
            />

            <!-- Table -->
            <div v-else-if="w.type === 'table'" class="h-full flex flex-col"
              :style="{ '--vw-fs': (w.fontSize ?? 11) + 'px', '--vw-fsh': Math.max(8, (w.fontSize ?? 11) - 1) + 'px' }"
            >
              <AgGridVue
                :class="[themeClass, 'ag-view-table flex-1 min-h-0 w-full']"
                :rowData="groupedRows(w)"
                :columnDefs="tableColDefs(w)"
                :rowHeight="Math.max(26, (w.fontSize ?? 11) + 15)"
                :headerHeight="Math.max(30, (w.fontSize ?? 11) + 19)"
                :suppressMovableColumns="true"
                :suppressCellFocus="true"
                :enableCellTextSelection="w.cellClickMode !== 'modal'"
                @wheel.stop
              />
            </div>

            <!-- KPI -->
            <div
              v-else-if="w.type === 'kpi'"
              class="h-full flex flex-col items-center justify-center gap-1"
            >
              <span class="text-3xl font-bold tabular-nums text-amber-500">{{ kpiValue(w) }}</span>
              <span class="text-xs text-muted-foreground">{{ w.fields.yField || 'No field' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Filter Panel -->
    <Teleport to="body">
      <Transition name="slide-right">
        <div
          v-if="showFilterPanel"
          class="fixed right-0 top-0 bottom-0 z-40 w-80 bg-background border-l shadow-2xl flex flex-col"
        >
          <!-- Panel header -->
          <div class="flex items-center gap-2 px-4 py-3 border-b shrink-0">
            <Filter class="size-4 text-indigo-500" />
            <span class="text-sm font-semibold flex-1">View Filters</span>
            <span v-if="activeViewFilterCount > 0"
              class="text-[10px] bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300
                     px-1.5 py-0.5 rounded-full font-semibold"
            >{{ activeViewFilterCount }} active</span>
            <button @click="showFilterPanel = false" class="text-muted-foreground hover:text-foreground p-0.5">
              <X class="size-4" />
            </button>
          </div>

          <!-- Per-dataset filters -->
          <div class="flex-1 overflow-y-auto p-3 space-y-5">
            <div v-if="!filterableDatasets.length" class="text-xs text-muted-foreground text-center pt-8">
              No datasets loaded
            </div>
            <div v-for="ds in filterableDatasets" :key="ds.id" class="space-y-2">
              <div class="flex items-center gap-1.5">
                <span class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex-1 truncate">
                  {{ ds.name }}
                </span>
                <button
                  @click="addViewFilter(ds.id)"
                  class="flex items-center gap-0.5 text-[10px] text-indigo-500 hover:text-indigo-600 font-semibold"
                >
                  <Plus class="size-3" />Add
                </button>
              </div>

              <div
                v-for="(f, i) in viewFilters[ds.id] ?? []"
                :key="i"
                class="rounded-lg border bg-muted/20 p-2 space-y-1.5"
              >
                <!-- Column select -->
                <select
                  v-model="f.column"
                  class="w-full text-[11px] border rounded-md px-2 py-1 bg-background
                         focus:outline-none focus:ring-1 focus:ring-indigo-400"
                >
                  <option value="">— column —</option>
                  <option v-for="col in colsOf(ds.id)" :key="col.name" :value="col.name">
                    {{ col.label }}
                  </option>
                </select>

                <!-- Operator + delete -->
                <div class="flex gap-1">
                  <select
                    v-model="f.operator"
                    class="flex-1 text-[11px] border rounded-md px-2 py-1 bg-background
                           focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  >
                    <option v-for="op in VIEW_FILTER_OPS" :key="op.value" :value="op.value">
                      {{ op.label }}
                    </option>
                  </select>
                  <button
                    @click="removeViewFilter(ds.id, i)"
                    class="p-1 text-muted-foreground hover:text-destructive rounded"
                  >
                    <Trash2 class="size-3.5" />
                  </button>
                </div>

                <!-- Value input — in/notIn picker, date picker, or text -->
                <template v-if="!['blank','notBlank'].includes(f.operator)">

                  <!-- in / notIn: checkbox value picker -->
                  <template v-if="f.operator === 'in' || f.operator === 'notIn'">
                    <div class="flex items-center justify-between text-[10px] mb-1">
                      <span :class="(f.values ?? []).length ? 'text-indigo-500 font-semibold' : 'text-muted-foreground'">
                        {{ (f.values ?? []).length ? `${f.values!.length} selected` : 'none selected' }}
                      </span>
                      <button
                        v-if="(f.values ?? []).length"
                        @click.stop="f.values = []"
                        class="text-muted-foreground hover:text-destructive transition-colors"
                      >clear</button>
                    </div>
                    <input
                      v-model="viewPickerSearch[`${ds.id}_${i}`]"
                      placeholder="search values..."
                      class="w-full text-[10px] border rounded-md px-1.5 py-1 bg-background mb-1
                             focus:outline-none focus:ring-1 focus:ring-indigo-400
                             placeholder:text-muted-foreground/40"
                    />
                    <div class="max-h-36 overflow-y-auto border rounded-md divide-y">
                      <label
                        v-for="val in filteredPickerViewValues(`${ds.id}_${i}`, ds.id, f.column)"
                        :key="val"
                        class="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-muted/40 transition-colors"
                      >
                        <input
                          type="checkbox"
                          :checked="(f.values ?? []).includes(val)"
                          @change="toggleViewPickerValue(f, val)"
                          class="accent-indigo-500 shrink-0"
                        />
                        <span class="text-[10px] truncate font-mono" :title="val">{{ val }}</span>
                      </label>
                      <div
                        v-if="!filteredPickerViewValues(`${ds.id}_${i}`, ds.id, f.column).length"
                        class="text-[10px] text-center text-muted-foreground py-2"
                      >No values found</div>
                    </div>
                  </template>

                  <!-- Date picker -->
                  <div
                    v-else-if="viewFilterColType(ds.id, f.column) === 'date'"
                    class="space-y-1"
                  >
                    <!-- token badge when token is selected -->
                    <div v-if="isTokenValue(f.value)" class="flex items-center gap-1">
                      <span class="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700
                                   dark:bg-indigo-900/40 dark:text-indigo-300
                                   text-[10px] font-semibold px-2 py-0.5 rounded-full border border-indigo-300">
                        ⚡ {{ tokenLabel(f.value) }}
                      </span>
                      <button @click="f.value = ''" class="text-[10px] text-muted-foreground hover:text-foreground">
                        ✕ แก้ไข
                      </button>
                    </div>
                    <!-- date input when not a token -->
                    <input
                      v-else
                      v-model="f.value"
                      type="date"
                      class="w-full text-[11px] border rounded-md px-2 py-1 bg-background
                             focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                    <!-- quick token buttons -->
                    <div class="flex gap-1">
                      <button
                        @click="setTodayFilter(f)"
                        :class="['flex-1 text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors',
                          f.value === DATE_TOKEN_TODAY
                            ? 'bg-indigo-500 border-indigo-500 text-white'
                            : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100']"
                      >⚡ Today</button>
                      <button
                        @click="setYesterdayFilter(f)"
                        :class="['flex-1 text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors',
                          f.value === DATE_TOKEN_YESTERDAY
                            ? 'bg-indigo-500 border-indigo-500 text-white'
                            : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100']"
                      >⚡ Yesterday</button>
                    </div>
                  </div>

                  <!-- Text input (default) -->
                  <input
                    v-else
                    v-model="f.value"
                    placeholder="value..."
                    class="w-full text-[11px] border rounded-md px-2 py-1 bg-background
                           focus:outline-none focus:ring-1 focus:ring-indigo-400
                           placeholder:text-muted-foreground/40"
                  />
                </template>
              </div>

              <p v-if="!(viewFilters[ds.id] ?? []).length" class="text-[10px] text-muted-foreground/60 text-center py-1">
                No filters — click Add
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div class="border-t px-4 py-3 shrink-0 flex items-center justify-between">
            <span class="text-[11px] text-muted-foreground">
              {{ activeViewFilterCount }} filter{{ activeViewFilterCount !== 1 ? 's' : '' }} active
            </span>
            <button
              v-if="activeViewFilterCount > 0"
              @click="clearAllViewFilters"
              class="text-[11px] text-destructive hover:underline font-semibold"
            >
              Clear all
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Click modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="clickCtx"
          class="fixed inset-0 z-50 bg-black/60"
          :class="modalX === null ? 'flex items-center justify-center' : ''"
          @click.self="clickCtx = null"
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
                <span class="text-xs font-semibold truncate">
                  {{ labelOf(clickCtx.datasetId, clickCtx.colField) }}
                </span>
                <span class="text-muted-foreground/40">:</span>
                <span class="text-xs font-mono bg-indigo-50 dark:bg-indigo-950/40
                             text-indigo-600 dark:text-indigo-300 px-2 py-0.5 rounded truncate max-w-[200px]">
                  {{ clickCtx.cellValue ?? '—' }}
                </span>
              </div>
              <button @click="clickCtx = null" class="text-muted-foreground hover:text-foreground shrink-0">
                <X class="size-4" />
              </button>
            </div>

            <!-- Tabs -->
            <div class="flex border-b shrink-0 text-xs">
              <button
                v-for="tab in [
                  { key: 'detail',  label: 'Row Detail' },
                  { key: 'related', label: `Related Rows (${relatedRows.length})` },
                ]"
                :key="tab.key"
                @click="clickTab = tab.key as any"
                :class="[
                  'px-5 py-2.5 font-semibold border-b-2 transition-colors',
                  clickTab === tab.key
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                ]"
              >{{ tab.label }}</button>
            </div>

            <!-- Tab: Row Detail -->
            <div v-if="clickTab === 'detail'" class="flex-1 overflow-y-auto p-4">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div
                  v-for="entry in clickEntries"
                  :key="entry.key"
                  class="rounded-lg border p-2.5 space-y-0.5"
                  :class="entry.isClicked
                    ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30'
                    : 'border-border bg-muted/20'"
                >
                  <p class="text-muted-foreground truncate" :style="{ fontSize: Math.max(9, modalFontSize - 2) + 'px' }">{{ entry.label }}</p>
                  <p class="font-semibold break-all" :style="{ fontSize: modalFontSize + 'px' }">{{ entry.value }}</p>
                </div>
              </div>
            </div>

            <!-- Tab: Related Rows -->
            <div v-else-if="clickTab === 'related'" class="flex-1 min-h-0 flex flex-col">
              <!-- Search bar -->
              <div class="px-4 py-2 border-b shrink-0 flex items-center gap-2">
                <input
                  v-model="relatedSearch"
                  placeholder="Search..."
                  class="flex-1 text-xs border rounded-lg px-2.5 py-1.5 bg-background
                         focus:outline-none focus:ring-1 focus:ring-indigo-400
                         placeholder:text-muted-foreground/40"
                />
                <span class="text-[10px] text-muted-foreground shrink-0">
                  {{ filteredRelatedRows.length }}/{{ relatedRows.length }}
                </span>
              </div>
              <div
                v-if="!relatedRows.length"
                class="flex-1 flex items-center justify-center text-sm text-muted-foreground"
              >No related rows found</div>
              <div
                v-else-if="!filteredRelatedRows.length"
                class="flex-1 flex items-center justify-center text-sm text-muted-foreground"
              >No results match "{{ relatedSearch }}"</div>
              <div v-else-if="showRelated"
                class="flex-1 min-h-0"
                :style="{ '--mf': modalFontSize + 'px', '--mf-h': Math.max(9, modalFontSize - 1) + 'px' }"
              >
                <AgGridVue
                  :class="[themeClass, 'ag-modal-table h-full w-full']"
                  :rowData="filteredRelatedRows"
                  :columnDefs="relatedColDefs"
                  :rowHeight="Math.max(28, modalFontSize + 17)"
                  :headerHeight="Math.max(32, modalFontSize + 21)"
                  :suppressMovableColumns="true"
                  :suppressCellFocus="true"
                  @first-data-rendered="onRelatedFirstData"
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

    <!-- AI Analyst Panel -->
    <AiPanel
      v-if="aiEnabled && aiStore.openPage === 'view'"
      page="view"
      :system-prompt="aiSystemPrompt"
      :context-label="aiContextLabel"
    />
  </div>
</template>

<style>
.fade-enter-active, .fade-leave-active { transition: opacity .15s }
.fade-enter-from, .fade-leave-to { opacity: 0 }

.slide-right-enter-active, .slide-right-leave-active { transition: transform .2s ease, opacity .2s ease }
.slide-right-enter-from, .slide-right-leave-to { transform: translateX(100%); opacity: 0 }

.ag-view-table .ag-header-cell-text {
  font-size: var(--vw-fsh, 10px);
  font-weight: 600;
}
.ag-view-table .ag-cell {
  font-size: var(--vw-fs, 11px);
}

.ag-modal-table .ag-header-cell-text {
  font-size: var(--mf-h, 10px);
  font-weight: 600;
}
.ag-modal-table .ag-cell {
  font-size: var(--mf, 11px);
}
</style>
