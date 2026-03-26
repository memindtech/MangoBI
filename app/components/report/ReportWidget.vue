<script setup lang="ts">
import { BarChart2, TrendingUp, PieChart, Table2, Hash, X, Filter, Layers, Activity, Network, Code2 } from 'lucide-vue-next'
import EChart from '~/components/report/EChart.vue'
import { AgGridVue } from 'ag-grid-vue3'
import { ClientSideRowModelModule, CommunityFeaturesModule, ModuleRegistry } from 'ag-grid-community'
import type { ColDef } from 'ag-grid-community'
import { useReportStore } from '~/stores/report'
import type { ReportWidget, WidgetType } from '~/stores/report'
import type { DataRow } from '~/stores/canvas'
import { groupChartData } from '~/utils/groupChartData'
import { formatDateValue, formatNumericValue } from '~/utils/formatValue'

ModuleRegistry.registerModules([ClientSideRowModelModule, CommunityFeaturesModule])

const props = defineProps<{
  widget:   ReportWidget
  rows:     DataRow[]
  selected: boolean
}>()

const emit = defineEmits<{
  (e: 'select'):                       void
  (e: 'delete'):                       void
  (e: 'move',       x: number, y: number): void
  (e: 'resize',     w: number, h: number): void
  (e: 'cell-click', payload: { rowData: Record<string, any>; colField: string; cellValue: any }): void
}>()

const reportStore = useReportStore()
const { t } = useI18n()

// ── Computed ──────────────────────────────────────────────────────────────────
const xField  = computed(() => props.widget.fields.xField  ?? '')
const yField  = computed(() => props.widget.fields.yField  ?? '')
const columns = computed(() => {
  const all = props.rows.length ? Object.keys(props.rows[0]) : []
  const sel = props.widget.fields.columns
  // Preserve click order (first come first serve) — iterate sel, not all
  return (sel?.length ? sel.filter(c => all.includes(c)) : all)
})

// ── AG Grid (table widget) ────────────────────────────────────────────────────
const tableQuickFilter = ref('')

const isCellClickable = computed(() => props.widget.cellClickMode === 'modal')

const datasetFmt   = computed(() => reportStore.numericFormatOf(props.widget.datasetId))
const datasetCols  = computed(() => reportStore.columnsOf(props.widget.datasetId))

const tableColDefs = computed<ColDef[]>(() =>
  columns.value.map(col => {
    const colMeta = datasetCols.value.find(c => c.name === col)
    const isNum   = colMeta?.type === 'number'
    const isDate  = colMeta?.type === 'date' || (
      props.rows.length > 0 &&
      typeof props.rows[0][col] === 'string' &&
      /^\d{4}-\d{2}-\d{2}/.test(String(props.rows[0][col] ?? ''))
    )
    const savedW  = props.widget.columnWidths?.[col]
    const fmt     = datasetFmt.value
    return {
      field:      col,
      headerName: reportStore.labelOf(props.widget.datasetId, col),
      sortable:   true,
      resizable:  true,
      filter:     false,
      minWidth:   72,
      ...(savedW ? { width: savedW } : { flex: 1 }),
      cellStyle: {
        ...(isNum ? { textAlign: 'right', fontFamily: 'monospace' } : {}),
        ...(isCellClickable.value ? { cursor: 'pointer' } : {}),
      },
      valueFormatter: (p: any) => {
        if (p.value === null || p.value === undefined || p.value === '') return ''
        if (isDate && fmt.datePattern)
          return formatDateValue(p.value, fmt.datePattern, fmt.dateEra ?? 'CE')
        const isExcluded = fmt.excludeDecimalCols?.includes(col) ?? false
        if (isNum && !isExcluded && (fmt.comma || fmt.decimals !== undefined))
          return formatNumericValue(p.value, fmt)
        return String(p.value)
      },
    }
  })
)

function onCellClicked(event: any) {
  if (!isCellClickable.value) return
  emit('cell-click', {
    rowData:   event.data,
    colField:  event.colDef.field as string,
    cellValue: event.value,
  })
}

// ── Chart click → find matching row → re-use same cell-click modal ────────────
function onChartClick(params: { name: string; value: any; seriesName: string; dataIndex: number }) {
  const x = xField.value
  // scatter: value is [x, y] — match on xField numeric value
  if (props.widget.type === 'scatter') {
    const xVal = Array.isArray(params.value) ? params.value[0] : params.value
    const row  = props.rows.find(r => Number(r[x]) === Number(xVal))
    if (!row || !x) return
    emit('cell-click', { rowData: row, colField: x, cellValue: xVal })
    return
  }
  // all category charts: params.name = xField label
  if (!x || !params.name) return
  const row = props.rows.find(r => String(r[x] ?? '') === params.name)
  if (!row) return
  emit('cell-click', { rowData: row, colField: x, cellValue: params.name })
}

function onColumnResized(event: any) {
  if (!event.finished || !event.columns?.length) return
  const widths: Record<string, number> = { ...props.widget.columnWidths }
  for (const col of event.columns) {
    const field = col.getColDef().field
    if (field) widths[field] = col.getActualWidth()
  }
  reportStore.updateWidget(props.widget.id, { columnWidths: widths })
}

const tableDefaultColDef: ColDef = { sortable: true, resizable: true, filter: false }

const themeClass = computed(() =>
  isDark.value ? 'ag-theme-quartz-dark' : 'ag-theme-quartz'
)

const activeFilterCount = computed(() => {
  const conds = props.widget.filters?.conditions ?? []
  return conds.filter(c =>
    c.column && (c.operator === 'blank' || c.operator === 'notBlank' || c.value !== ''),
  ).length
})

const kpiValue = computed(() => {
  if (!yField.value || !props.rows.length) return '—'
  const vals  = props.rows.map(r => Number(r[yField.value]) || 0)
  const total = vals.reduce((a, b) => a + b, 0)
  const fmt   = datasetFmt.value
  const excluded = fmt.excludeDecimalCols?.includes(yField.value) ?? false
  if (!excluded && (fmt.comma || fmt.decimals !== undefined)) return formatNumericValue(total, fmt)
  return total.toLocaleString()
})

// ── ECharts option ────────────────────────────────────────────────────────────
const colorMode = useColorMode()
const isDark    = computed(() => colorMode.value === 'dark')

const COLORS = ['#6366f1','#f97316','#10b981','#3b82f6','#a855f7','#ef4444','#f59e0b','#06b6d4']

const chartOption = computed(() => {
  const t     = props.widget.type
  const yList = props.widget.fields.yFields?.length ? props.widget.fields.yFields : [yField.value]

  // Group by xField, sum yField(s) — prevents duplicate x-values showing as separate bars
  const grouped = groupChartData(props.rows, xField.value, [yField.value, ...yList])
  const labels  = grouped.labels
  const values  = grouped.series(yField.value)

  // ── Format config ──────────────────────────────────────────────────────────
  const fmt      = datasetFmt.value
  const cols     = datasetCols.value
  const fs       = props.widget.fontSize ?? 11
  const fsSmall  = Math.max(8, fs - 1)

  const xColType = cols.find(c => c.name === xField.value)?.type
  // Format x-axis label (date → apply datePattern)
  const fmtX = (val: string): string =>
    (xColType === 'date' && fmt.datePattern)
      ? formatDateValue(val, fmt.datePattern, fmt.dateEra ?? 'CE')
      : val
  // Format y value respecting excludeDecimalCols
  const fmtY = (val: any, field: string): string => {
    if (val === null || val === undefined) return ''
    const excluded = fmt.excludeDecimalCols?.includes(field) ?? false
    if (!excluded && (fmt.comma || fmt.decimals !== undefined)) return formatNumericValue(val, fmt)
    return String(val)
  }

  // ── Axis / tooltip base ────────────────────────────────────────────────────
  const tc     = isDark.value ? '#94a3b8' : '#64748b'
  const sc     = isDark.value ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
  const rotate = props.widget.xAxisRotate ?? 0
  const ab = {
    axisLine:  { lineStyle: { color: sc } },
    axisTick:  { show: false },
    axisLabel: { fontSize: fsSmall, color: tc },
    splitLine: { lineStyle: { color: sc } },
  }
  // x-axis: rotation + date formatter
  const abX = {
    ...ab,
    axisLabel: { ...ab.axisLabel, rotate, formatter: fmtX },
  }
  // y-axis: numeric formatter for single-series charts
  const abYNum = {
    ...ab,
    axisLabel: { ...ab.axisLabel, formatter: (v: any) => fmtY(v, yField.value) },
  }
  const tip  = { trigger: 'axis' as const, textStyle: { fontSize: fsSmall }, confine: true }
  // add bottom padding when labels are rotated so they don't get clipped
  const bottomPad = rotate === 0 ? 28 : Math.min(80, Math.abs(rotate))
  const grid = { top: 20, right: 8, bottom: bottomPad, left: 8, containLabel: true }

  if (t === 'ecOption') {
    const json = props.widget.fields.ecOptionJson?.trim()
    if (!json) return {}
    try { return JSON.parse(json) } catch { return {} }
  }

  if (t === 'bar') return {
    color: COLORS, grid,
    tooltip: { ...tip, formatter: (params: any) => {
      const p = Array.isArray(params) ? params[0] : params
      return `${fmtX(p.name)}<br/>${p.marker}${fmtY(p.value, yField.value)}`
    }},
    xAxis: { type: 'category', data: labels, ...abX },
    yAxis: { type: 'value', ...abYNum },
    series: [{ type: 'bar', data: values, barMaxWidth: 48, itemStyle: { borderRadius: [3, 3, 0, 0] } }],
  }

  if (t === 'stackedBar') return {
    color: COLORS, grid,
    tooltip: { ...tip, axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const items = Array.isArray(params) ? params : [params]
        const xLabel = fmtX(items[0]?.name ?? '')
        return [xLabel, ...items.map((p: any) => `${p.marker}${p.seriesName}: ${p.value}%`)].join('<br/>')
      },
    },
    legend: { top: 0, textStyle: { fontSize: fsSmall, color: tc } },
    xAxis: { type: 'category', data: labels, ...abX },
    yAxis: { type: 'value', max: 100, ...ab, axisLabel: { ...ab.axisLabel, formatter: '{value}%' } },
    series: yList.map((f, i) => {
      const seriesVals = grouped.series(f)
      const totals = labels.map((_, li) =>
        yList.reduce((s, yf) => s + (grouped.series(yf)[li] ?? 0), 0)
      )
      return {
        type: 'bar', stack: 'total', name: f, barMaxWidth: 48,
        emphasis: { focus: 'series' },
        itemStyle: { color: COLORS[i % COLORS.length] },
        data: seriesVals.map((v, li) => totals[li] ? +((v / totals[li]) * 100).toFixed(1) : 0),
      }
    }),
  }

  if (t === 'stackedHBar') return {
    color: COLORS, grid: { ...grid, left: 64 },
    tooltip: { ...tip, axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const items = Array.isArray(params) ? params : [params]
        const xLabel = fmtX(items[0]?.name ?? '')
        return [xLabel, ...items.map((p: any) => `${p.marker}${p.seriesName}: ${fmtY(p.value, p.seriesName)}`)].join('<br/>')
      },
    },
    legend: { top: 0, textStyle: { fontSize: fsSmall, color: tc } },
    xAxis: { type: 'value', ...ab,
      axisLabel: { ...ab.axisLabel, formatter: (v: any) => fmtY(v, yField.value) } },
    yAxis: { type: 'category', data: labels, ...ab,
      axisLabel: { ...ab.axisLabel, width: 60, overflow: 'truncate', formatter: fmtX } },
    series: yList.map((f, i) => ({
      type: 'bar', stack: 'total', name: f,
      itemStyle: { color: COLORS[i % COLORS.length] },
      data: grouped.series(f),
    })),
  }

  if (t === 'stackedLine') return {
    color: COLORS, grid,
    tooltip: { ...tip,
      formatter: (params: any) => {
        const items = Array.isArray(params) ? params : [params]
        const xLabel = fmtX(items[0]?.name ?? '')
        return [xLabel, ...items.map((p: any) => `${p.marker}${p.seriesName}: ${fmtY(p.value, p.seriesName)}`)].join('<br/>')
      },
    },
    legend: { top: 0, textStyle: { fontSize: fsSmall, color: tc } },
    xAxis: { type: 'category', data: labels, boundaryGap: false, ...abX },
    yAxis: { type: 'value', ...ab,
      axisLabel: { ...ab.axisLabel, formatter: (v: any) => fmtY(v, yField.value) } },
    series: yList.map((f, i) => ({
      type: 'line', stack: 'total', name: f, smooth: true, symbol: 'none',
      lineStyle: { width: 1.5 }, areaStyle: { opacity: 0.35 },
      itemStyle: { color: COLORS[i % COLORS.length] },
      data: grouped.series(f),
    })),
  }

  if (t === 'line') return {
    color: COLORS, grid,
    tooltip: { ...tip, formatter: (params: any) => {
      const p = Array.isArray(params) ? params[0] : params
      return `${fmtX(p.name)}<br/>${p.marker}${fmtY(p.value, yField.value)}`
    }},
    xAxis: { type: 'category', data: labels, boundaryGap: false, ...abX },
    yAxis: { type: 'value', ...abYNum },
    series: [{ type: 'line', data: values, smooth: true,
      symbol: 'circle', symbolSize: 5, lineStyle: { width: 2 }, areaStyle: { opacity: 0.12 } }],
  }

  if (t === 'pie') return {
    color: COLORS,
    tooltip: { trigger: 'item' as const, confine: true, textStyle: { fontSize: fsSmall },
      formatter: (p: any) => `${p.name}: ${fmtY(p.value, yField.value)} (${p.percent}%)` },
    series: [{
      type: 'pie', radius: ['32%', '66%'], center: ['50%', '50%'],
      data: labels.map((name, i) => ({ name, value: values[i] })),
      label: { fontSize: fsSmall, color: tc }, labelLine: { lineStyle: { color: tc } },
      itemStyle: { borderWidth: 2, borderColor: isDark.value ? '#1e1e2e' : '#fff' },
    }],
  }

  if (t === 'halfDoughnut') return {
    color: COLORS,
    tooltip: { trigger: 'item' as const, confine: true, textStyle: { fontSize: fsSmall },
      formatter: (p: any) => `${p.name}: ${fmtY(p.value, yField.value)} (${p.percent}%)` },
    series: [{
      type: 'pie', radius: ['40%', '72%'], center: ['50%', '72%'],
      startAngle: 180, endAngle: 360,
      data: labels.map((name, i) => ({ name, value: values[i] })),
      label: { fontSize: fsSmall, color: tc },
      itemStyle: { borderWidth: 2, borderColor: isDark.value ? '#1e1e2e' : '#fff' },
    }],
  }

  if (t === 'scatter') return {
    color: COLORS, grid,
    tooltip: { trigger: 'item' as const, confine: true, textStyle: { fontSize: fsSmall },
      formatter: (p: any) => `${fmtX(String(p.value[0]))}, ${fmtY(p.value[1], yField.value)}` },
    xAxis: { type: 'value', ...ab,
      axisLabel: { ...ab.axisLabel, formatter: (v: any) => fmtY(v, xField.value) } },
    yAxis: { type: 'value', ...abYNum },
    series: [{
      type: 'scatter', symbolSize: 7, itemStyle: { color: COLORS[0], opacity: 0.8 },
      data: props.rows.map(r => [Number(r[xField.value] ?? 0), Number(r[yField.value] ?? 0)]),
    }],
  }

  if (t === 'tree') {
    const groups = new Map<string, string[]>()
    for (const r of props.rows) {
      const parent = String(r[xField.value] ?? 'root')
      const child  = String(r[yField.value] ?? parent)
      if (!groups.has(parent)) groups.set(parent, [])
      if (!groups.get(parent)!.includes(child)) groups.get(parent)!.push(child)
    }
    return {
      tooltip: { trigger: 'item' as const, textStyle: { fontSize: fsSmall }, confine: true },
      series: [{
        type: 'tree', edgeShape: 'polyline',
        data: [{ name: 'Root', children: Array.from(groups.entries()).map(([name, children]) => ({
          name, children: children.slice(0, 12).map(c => ({ name: c })),
        })) }],
        top: '4%', left: '12%', bottom: '4%', right: '20%',
        symbolSize: 6, orient: 'LR',
        label:  { position: 'left',  fontSize: fsSmall, color: tc },
        leaves: { label: { position: 'right', fontSize: fsSmall, color: tc } },
        lineStyle: { color: sc, width: 1.5 },
        itemStyle: { color: COLORS[0], borderColor: COLORS[0] },
        expandAndCollapse: true, animationDuration: 200,
      }],
    }
  }

  return {}
})

const typeIconMap: Record<WidgetType, any> = {
  bar: BarChart2, line: TrendingUp, pie: PieChart, table: Table2, kpi: Hash,
  stackedBar: Layers, stackedHBar: Layers, stackedLine: Layers,
  halfDoughnut: PieChart, scatter: Activity, tree: Network, ecOption: Code2,
}
const typeLabelMap: Record<WidgetType, string> = {
  bar: 'Bar', line: 'Line', pie: 'Pie', table: 'Table', kpi: 'KPI',
  stackedBar: 'Stacked 100%', stackedHBar: 'H-Stack', stackedLine: 'Stack Line',
  halfDoughnut: 'Half Donut', scatter: 'Scatter', tree: 'Tree', ecOption: 'ECharts JSON',
}
const headerBg: Record<WidgetType, string> = {
  bar:   'bg-blue-50 dark:bg-blue-950/30',
  line:  'bg-teal-50 dark:bg-teal-950/30',
  pie:   'bg-violet-50 dark:bg-violet-950/30',
  table: 'bg-indigo-50 dark:bg-indigo-950/30',
  kpi:   'bg-amber-50 dark:bg-amber-950/30',
  stackedBar:   'bg-blue-50 dark:bg-blue-950/30',
  stackedHBar:  'bg-blue-50 dark:bg-blue-950/30',
  stackedLine:  'bg-teal-50 dark:bg-teal-950/30',
  halfDoughnut: 'bg-violet-50 dark:bg-violet-950/30',
  scatter:  'bg-orange-50 dark:bg-orange-950/30',
  tree:     'bg-green-50 dark:bg-green-950/30',
  ecOption: 'bg-slate-50 dark:bg-slate-950/30',
}
const headerColor: Record<WidgetType, string> = {
  bar:   'text-blue-500',   line:  'text-teal-500',
  pie:   'text-violet-500', table: 'text-indigo-500',
  kpi:   'text-amber-500',
  stackedBar: 'text-blue-500', stackedHBar: 'text-blue-500', stackedLine: 'text-teal-500',
  halfDoughnut: 'text-violet-500', scatter: 'text-orange-500',
  tree: 'text-green-500', ecOption: 'text-slate-500',
}

// ── Drag to move ──────────────────────────────────────────────────────────────
function onDragHeader(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('button')) return
  e.preventDefault()
  emit('select')
  const startX = e.clientX - props.widget.x
  const startY = e.clientY - props.widget.y
  const onMove = (ev: MouseEvent) =>
    emit('move', Math.max(0, ev.clientX - startX), Math.max(0, ev.clientY - startY))
  const onUp = () => {
    globalThis.removeEventListener('mousemove', onMove)
    globalThis.removeEventListener('mouseup',   onUp)
  }
  globalThis.addEventListener('mousemove', onMove)
  globalThis.addEventListener('mouseup',   onUp)
}

// ── Resize ────────────────────────────────────────────────────────────────────
function onResizeRight(e: MouseEvent) {
  e.preventDefault(); e.stopPropagation()
  const startX = e.clientX; const startW = props.widget.w
  const onMove = (ev: MouseEvent) => emit('resize', Math.max(200, startW + ev.clientX - startX), props.widget.h)
  const onUp = () => { globalThis.removeEventListener('mousemove', onMove); globalThis.removeEventListener('mouseup', onUp) }
  globalThis.addEventListener('mousemove', onMove); globalThis.addEventListener('mouseup', onUp)
}
function onResizeBottom(e: MouseEvent) {
  e.preventDefault(); e.stopPropagation()
  const startY = e.clientY; const startH = props.widget.h
  const onMove = (ev: MouseEvent) => emit('resize', props.widget.w, Math.max(120, startH + ev.clientY - startY))
  const onUp = () => { globalThis.removeEventListener('mousemove', onMove); globalThis.removeEventListener('mouseup', onUp) }
  globalThis.addEventListener('mousemove', onMove); globalThis.addEventListener('mouseup', onUp)
}
function onResizeCorner(e: MouseEvent) {
  e.preventDefault(); e.stopPropagation()
  const sx = e.clientX; const sy = e.clientY; const sw = props.widget.w; const sh = props.widget.h
  const onMove = (ev: MouseEvent) => emit('resize', Math.max(200, sw + ev.clientX - sx), Math.max(120, sh + ev.clientY - sy))
  const onUp = () => { globalThis.removeEventListener('mousemove', onMove); globalThis.removeEventListener('mouseup', onUp) }
  globalThis.addEventListener('mousemove', onMove); globalThis.addEventListener('mouseup', onUp)
}
</script>

<template>
  <div
    class="absolute select-none"
    :style="{ left: `${widget.x}px`, top: `${widget.y}px`, width: `${widget.w}px`, height: `${widget.h}px`, '--rw-font-size': `${widget.fontSize ?? 11}px`, '--rw-header-font-size': `${(widget.fontSize ?? 11) - 1}px` }"
    @mousedown.stop="emit('select')"
    @click.stop
  >
    <!-- Card -->
    <div
      class="w-full h-full rounded-xl border-2 bg-background shadow-md overflow-hidden flex flex-col transition-[border-color,box-shadow]"
      :class="selected ? 'border-primary shadow-lg' : 'border-border'"
    >
      <!-- Header (drag handle) -->
      <div
        class="flex items-center gap-2 px-3 py-2 border-b shrink-0 cursor-grab active:cursor-grabbing"
        :class="headerBg[widget.type]"
        @mousedown.stop="onDragHeader"
      >
        <component :is="typeIconMap[widget.type]" class="size-4 shrink-0" :class="headerColor[widget.type]" />
        <span class="text-xs font-semibold truncate flex-1" :class="headerColor[widget.type]" :title="widget.title">
          {{ widget.title || typeLabelMap[widget.type] }}
        </span>
        <!-- Filter badge -->
        <span
          v-if="activeFilterCount"
          class="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-orange-500/90 text-white font-bold shrink-0"
          :title="t('bi_filters_active', { count: activeFilterCount })"
        >
          <Filter class="size-2.5" />
          {{ activeFilterCount }}
        </span>
        <span class="text-[10px] px-1.5 py-0.5 rounded bg-white/60 dark:bg-black/20 font-medium shrink-0">
          {{ rows.length.toLocaleString() }}r
        </span>
        <button
          class="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
          @click.stop="emit('delete')"
        >
          <X class="size-3.5" />
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 min-h-0 overflow-hidden p-2">

        <!-- No data / no field configured -->
        <div
          v-if="!rows.length && widget.type !== 'ecOption'"
          class="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground text-[11px] rounded-lg border border-dashed"
        >
          <component :is="typeIconMap[widget.type]" class="size-6 opacity-25" />
          <span>{{ t('bi_no_data') }}</span>
        </div>

        <!-- Charts (all ECharts-backed types) -->
        <EChart
          v-else-if="widget.type !== 'table' && widget.type !== 'kpi'"
          :option="chartOption"
          @chart-click="onChartClick"
          @wheel.stop
        />

        <!-- TABLE -->
        <div v-else-if="widget.type === 'table'" class="h-full flex flex-col">
          <input
            v-model="tableQuickFilter"
            :placeholder="t('bi_search_placeholder')"
            class="text-[10px] border-b px-2 py-1 bg-transparent outline-none shrink-0
                   placeholder:text-muted-foreground/40 focus:ring-0"
            @mousedown.stop @click.stop @wheel.stop
          />
          <AgGridVue
            :class="[themeClass, 'ag-report-table flex-1 min-h-0 w-full']"
            :rowData="rows"
            :columnDefs="tableColDefs"
            :defaultColDef="tableDefaultColDef"
            :quickFilterText="tableQuickFilter"
            :rowHeight="Math.max(26, (widget.fontSize ?? 11) + 15)"
            :headerHeight="Math.max(30, (widget.fontSize ?? 11) + 19)"
            :suppressMovableColumns="true"
            :suppressCellFocus="true"
            :enableCellTextSelection="!isCellClickable"
            @cell-clicked="onCellClicked"
            @column-resized="onColumnResized"
            @wheel.stop
            @click.stop
          />
        </div>

        <!-- KPI -->
        <div
          v-else-if="widget.type === 'kpi'"
          class="h-full flex flex-col items-center justify-center gap-1"
        >
          <span class="text-3xl font-bold tabular-nums" :class="headerColor[widget.type]">{{ kpiValue }}</span>
          <span class="text-xs text-muted-foreground">{{ yField || t('bi_define_field') }}</span>
        </div>

      </div>
    </div>

    <!-- Resize strips -->
    <div class="absolute right-0 top-0 h-full w-2 cursor-ew-resize hover:bg-primary/20 rounded-r-xl z-10"
         @mousedown.stop="onResizeRight" />
    <div class="absolute bottom-0 left-0 w-full h-2 cursor-ns-resize hover:bg-primary/20 rounded-b-xl z-10"
         @mousedown.stop="onResizeBottom" />
    <div class="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize z-20"
         @mousedown.stop="onResizeCorner" />
  </div>
</template>

<style>
.ag-report-table .ag-root-wrapper,
.ag-report-table .ag-root,
.ag-report-table .ag-body-viewport {
  background: transparent !important;
}
.ag-report-table .ag-root-wrapper {
  border: none !important;
}
.ag-report-table .ag-header-cell-text {
  font-size: var(--rw-header-font-size, 10px);
  font-weight: 600;
}
.ag-report-table .ag-cell {
  font-size: var(--rw-font-size, 11px);
}
</style>
