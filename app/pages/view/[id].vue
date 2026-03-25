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
import { MousePointer2, X, LayoutDashboard, Loader2 } from 'lucide-vue-next'
import { metaToColType, isDateMeta } from '~/utils/columnMapping'

ModuleRegistry.registerModules([ClientSideRowModelModule, CommunityFeaturesModule])

definePageMeta({ layout: false })

const route     = useRoute()
const biApi     = useMangoBIApi()
const colorMode = useColorMode()
const isDark    = computed(() => colorMode.value === 'dark')

// ── Types ─────────────────────────────────────────────────────────────────────
interface Dataset {
  id: string; name: string; rows: any[]
  columnLabels?: Record<string, any>
  columnSources?: Record<string, string>
  numericFormat?: NumericFormat
}
interface Widget {
  id: string; type: string; title: string; datasetId: string
  fields: { xField?: string; yField?: string; yFields?: string[]; columns?: string[]; ecOptionJson?: string }
  filters?: { logic: 'and' | 'or'; conditions: FilterCondition[] }
  columnWidths?: Record<string, number>
  xAxisRotate?: number
  cellClickMode?: 'none' | 'modal'
  x: number; y: number; w: number; h: number
}

// ── State ─────────────────────────────────────────────────────────────────────
const loading    = ref(true)
const error      = ref('')
const reportName = ref('')
const datasets   = ref<Dataset[]>([])
const widgets    = ref<Widget[]>([])

onMounted(async () => {
  try {
    const row = await biApi.loadReport(route.params.id as string)
    if (!row) { error.value = 'Report not found'; return }
    reportName.value = row.name ?? ''
    const payload = JSON.parse(row.widgetsJson ?? '{}')
    datasets.value  = payload.datasets ?? []
    widgets.value   = payload.widgets  ?? []
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
  const first = ds.rows[0]
  return Object.keys(first).map(name => {
    const meta = ds.columnLabels?.[name]
    return { name, label: meta?.label || name,
      type: isDateMeta(meta, first[name]) ? 'date' : metaToColType(meta, first[name]) }
  })
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

// ── Chart option ──────────────────────────────────────────────────────────────
const COLORS = ['#6366f1','#f97316','#10b981','#3b82f6','#a855f7','#ef4444','#f59e0b','#06b6d4']

function makeAxisBase(tc: string, sc: string) {
  return {
    axisLine:  { lineStyle: { color: sc } },
    axisTick:  { show: false },
    axisLabel: { fontSize: 10, color: tc },
    splitLine: { lineStyle: { color: sc } },
  }
}

function makePieSeries(labels: string[], values: number[], tc: string, radius: string[], center: string[], extra = {}) {
  return {
    type: 'pie', radius, center,
    data: labels.map((n, i) => ({ name: n, value: values[i] })),
    label: { fontSize: 10, color: tc },
    itemStyle: { borderWidth: 2, borderColor: isDark.value ? '#1e1e2e' : '#fff' },
    ...extra,
  }
}

function chartOption(w: Widget) {
  const rows   = filteredRows(w)
  const t      = w.type
  const xField = w.fields.xField ?? ''
  const yField = w.fields.yField ?? ''
  const yList  = w.fields.yFields?.length ? w.fields.yFields : [yField]
  const grouped = groupChartData(rows, xField, [yField, ...yList])
  const labels  = grouped.labels
  const values  = grouped.series(yField)
  const tc      = isDark.value ? '#94a3b8' : '#64748b'
  const sc      = isDark.value ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
  const rotate  = w.xAxisRotate ?? 0
  const ab      = makeAxisBase(tc, sc)
  const abX     = { ...ab, axisLabel: { ...ab.axisLabel, rotate } }
  const tip     = { trigger: 'axis' as const, textStyle: { fontSize: 11 }, confine: true }
  const bottomPad = rotate === 0 ? 28 : Math.min(80, Math.abs(rotate))
  const grid    = { top: 20, right: 8, bottom: bottomPad, left: 8, containLabel: true }
  const legend  = { top: 0, textStyle: { fontSize: 10, color: tc } }
  const itemTip = { trigger: 'item' as const, formatter: '{b}: {c} ({d}%)', textStyle: { fontSize: 11 }, confine: true }

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
      { labelLine: { lineStyle: { color: tc } } })] }
  if (t === 'halfDoughnut') return { color: COLORS, tooltip: itemTip,
    series: [makePieSeries(labels, values, tc, ['40%','72%'], ['50%','72%'],
      { startAngle: 180, endAngle: 360 })] }
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
      formatter: (p: any) => `${p.value[0]}, ${p.value[1]}`, textStyle: { fontSize: 11 } },
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
    }
  })
}

// ── KPI ───────────────────────────────────────────────────────────────────────
function kpiValue(w: Widget): string {
  const yf = w.fields.yField
  if (!yf) return '—'
  const rows = filteredRows(w)
  if (!rows.length) return '—'
  return rows.map(r => Number(r[yf]) || 0).reduce((a, b) => a + b, 0).toLocaleString()
}

// ── Click modal ───────────────────────────────────────────────────────────────
interface ClickCtx {
  datasetId: string; rowData: any; colField: string; cellValue: any; widgetRows: any[]
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
  const colFmt  = isExcluded ? { ...fmt, decimals: undefined } : fmt
  if (raw === null || raw === undefined) return '—'
  if (isDate && fmt.datePattern) return formatDateValue(raw, fmt.datePattern, fmt.dateEra ?? 'CE')
  if (isNum && (colFmt.comma || colFmt.decimals !== undefined)) return formatNumericValue(raw, colFmt)
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
  const strVal = String(cellValue ?? '')
  return widgetRows.filter(r => String(r[colField] ?? '') === strVal)
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
      cellStyle: isNum ? { textAlign: 'right', fontFamily: 'monospace' } : {},
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

function openModal(dsId: string, rowData: any, colField: string, cellValue: any, widgetRows: any[]) {
  clickCtx.value = { datasetId: dsId, rowData, colField, cellValue, widgetRows }
}

// table cell click — only when cellClickMode === 'modal'
function onCellClicked(w: Widget, e: any) {
  if (w.cellClickMode !== 'modal') return
  if (!e?.data) return
  openModal(w.datasetId, e.data, e.colDef?.field ?? '', e.value, filteredRows(w))
}

// chart click — always opens modal (mirrors ReportWidget.vue — no cellClickMode gate for charts)
function onChartClick(w: Widget, params: { name: string; value: any; seriesName: string; dataIndex: number }) {
  const x    = w.fields.xField ?? ''
  const rows = filteredRows(w)
  if (w.type === 'scatter') {
    const xVal = Array.isArray(params.value) ? params.value[0] : params.value
    const row  = rows.find(r => Number(r[x]) === Number(xVal))
    if (!row || !x) return
    openModal(w.datasetId, row, x, xVal, rows)
    return
  }
  if (!x || !params.name) return
  const row = rows.find(r => String(r[x] ?? '') === params.name)
  if (!row) return
  openModal(w.datasetId, row, x, params.name, rows)
}

function onRelatedFirstData(e: any) { e.api.autoSizeAllColumns() }
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
    </header>

    <!-- Loading -->
    <div v-if="loading" class="flex-1 flex items-center justify-center gap-2 text-muted-foreground">
      <Loader2 class="size-5 animate-spin" />
      <span class="text-sm">Loading…</span>
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
              {{ filteredRows(w).length.toLocaleString() }}r
            </span>
          </div>

          <!-- Body -->
          <div class="flex-1 min-h-0 overflow-hidden p-2">

            <div
              v-if="!filteredRows(w).length && w.type !== 'ecOption'"
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
            <div v-else-if="w.type === 'table'" class="h-full flex flex-col">
              <AgGridVue
                :class="[themeClass, 'flex-1 min-h-0 w-full']"
                :rowData="filteredRows(w)"
                :columnDefs="tableColDefs(w)"
                :rowHeight="26"
                :headerHeight="30"
                :suppressMovableColumns="true"
                :suppressCellFocus="true"
                :enableCellTextSelection="w.cellClickMode !== 'modal'"
                @cell-clicked="(e: any) => onCellClicked(w, e)"
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
                  <p class="text-[10px] text-muted-foreground truncate">{{ entry.label }}</p>
                  <p class="text-xs font-semibold break-all">{{ entry.value }}</p>
                </div>
              </div>
            </div>

            <!-- Tab: Related Rows -->
            <div v-else-if="clickTab === 'related'" class="flex-1 min-h-0 flex flex-col">
              <div
                v-if="!relatedRows.length"
                class="flex-1 flex items-center justify-center text-sm text-muted-foreground"
              >No related rows found</div>
              <AgGridVue
                v-else-if="showRelated"
                :class="[themeClass, 'flex-1 min-h-0 w-full']"
                :rowData="relatedRows"
                :columnDefs="relatedColDefs"
                :rowHeight="28"
                :headerHeight="32"
                :suppressMovableColumns="true"
                :suppressCellFocus="true"
                @first-data-rendered="onRelatedFirstData"
              />
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
  </div>
</template>

<style>
.fade-enter-active, .fade-leave-active { transition: opacity .15s }
.fade-enter-from, .fade-leave-to { opacity: 0 }
</style>
