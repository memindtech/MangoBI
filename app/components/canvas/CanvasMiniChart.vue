<script setup lang="ts">
import type { ChartType, DataRow } from '~/stores/canvas'
import EChart from '~/components/report/EChart.vue'
import { groupChartData } from '~/utils/groupChartData'

const props = defineProps<{
  rows:          DataRow[]
  xField:        string
  yField:        string
  chartType:     ChartType
  yFields?:      string[]
  ecOptionJson?: string
}>()

const colorMode = useColorMode()
const isDark    = computed(() => colorMode.value === 'dark')

const COLORS = ['#6366f1','#f97316','#10b981','#3b82f6','#a855f7','#ef4444','#f59e0b','#06b6d4']

const tc   = computed(() => isDark.value ? '#94a3b8' : '#64748b')
const sc   = computed(() => isDark.value ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)')
const ab   = computed(() => ({
  axisLine:  { lineStyle: { color: sc.value } },
  axisTick:  { show: false },
  axisLabel: { fontSize: 9, color: tc.value },
  splitLine: { lineStyle: { color: sc.value } },
}))
const tip  = { trigger: 'axis' as const, textStyle: { fontSize: 10 }, confine: true }
const grid = { top: 20, right: 8, bottom: 28, left: 8, containLabel: true }

const yList = computed(() => props.yFields?.length ? props.yFields : [props.yField])

// Group rows by xField, sum yField(s) — fixes duplicate x-value issue
const grouped = computed(() =>
  groupChartData(props.rows, props.xField, [props.yField, ...(props.yFields ?? [])]),
)
const labels = computed(() => grouped.value.labels)
const values = computed(() => grouped.value.series(props.yField))

const option = computed<Record<string, any>>(() => {
  const t = props.chartType

  // ── ECharts raw JSON ──────────────────────────────────────────────────────
  if (t === 'ecOption') {
    if (!props.ecOptionJson?.trim()) return {}
    try { return JSON.parse(props.ecOptionJson) } catch { return {} }
  }

  // ── Bar ──────────────────────────────────────────────────────────────────
  if (t === 'bar') return {
    color: COLORS, grid, tooltip: tip,
    xAxis: { type: 'category', data: labels.value, ...ab.value },
    yAxis: { type: 'value', ...ab.value },
    series: [{ type: 'bar', data: values.value, barMaxWidth: 32,
      itemStyle: { borderRadius: [2, 2, 0, 0] } }],
  }

  // ── Stacked Bar Normalization (100%) ──────────────────────────────────────
  if (t === 'stackedBar') return {
    color: COLORS, grid,
    tooltip: { ...tip, axisPointer: { type: 'shadow' } },
    legend: { top: 0, textStyle: { fontSize: 9, color: tc.value } },
    xAxis: { type: 'category', data: labels.value, ...ab.value },
    yAxis: { type: 'value', max: 100, ...ab.value,
      axisLabel: { ...ab.value.axisLabel, formatter: '{value}%' } },
    series: yList.value.map((f, i) => {
      const seriesVals = grouped.value.series(f)
      const totals = labels.value.map((_, li) =>
        yList.value.reduce((s, yf) => s + (grouped.value.series(yf)[li] ?? 0), 0)
      )
      return {
        type: 'bar', stack: 'total', name: f,
        emphasis: { focus: 'series' }, barMaxWidth: 48,
        itemStyle: { color: COLORS[i % COLORS.length] },
        data: seriesVals.map((v, li) => totals[li] ? +((v / totals[li]) * 100).toFixed(1) : 0),
      }
    }),
  }

  // ── Stacked Horizontal Bar ────────────────────────────────────────────────
  if (t === 'stackedHBar') return {
    color: COLORS, grid: { ...grid, left: 64 },
    tooltip: { ...tip, axisPointer: { type: 'shadow' } },
    legend: { top: 0, textStyle: { fontSize: 9, color: tc.value } },
    xAxis: { type: 'value', ...ab.value },
    yAxis: { type: 'category', data: labels.value, ...ab.value,
      axisLabel: { ...ab.value.axisLabel, width: 60, overflow: 'truncate' } },
    series: yList.value.map((f, i) => ({
      type: 'bar', stack: 'total', name: f,
      itemStyle: { color: COLORS[i % COLORS.length] },
      data: grouped.value.series(f),
    })),
  }

  // ── Stacked Line ─────────────────────────────────────────────────────────
  if (t === 'stackedLine') return {
    color: COLORS, grid,
    tooltip: { ...tip },
    legend: { top: 0, textStyle: { fontSize: 9, color: tc.value } },
    xAxis: { type: 'category', data: labels.value, boundaryGap: false, ...ab.value },
    yAxis: { type: 'value', ...ab.value },
    series: yList.value.map((f, i) => ({
      type: 'line', stack: 'total', name: f,
      smooth: true, symbol: 'none',
      lineStyle: { width: 1.5 }, areaStyle: { opacity: 0.35 },
      itemStyle: { color: COLORS[i % COLORS.length] },
      data: grouped.value.series(f),
    })),
  }

  // ── Line ─────────────────────────────────────────────────────────────────
  if (t === 'line') return {
    color: COLORS, grid, tooltip: tip,
    xAxis: { type: 'category', data: labels.value, boundaryGap: false, ...ab.value },
    yAxis: { type: 'value', ...ab.value },
    series: [{ type: 'line', data: values.value, smooth: true,
      symbol: 'circle', symbolSize: 4,
      lineStyle: { width: 2 }, areaStyle: { opacity: 0.12 } }],
  }

  // ── Pie ──────────────────────────────────────────────────────────────────
  if (t === 'pie') return {
    color: COLORS,
    tooltip: { trigger: 'item' as const, formatter: '{b}: {c} ({d}%)',
      textStyle: { fontSize: 10 }, confine: true },
    series: [{
      type: 'pie', radius: ['32%', '64%'], center: ['50%', '52%'],
      data: labels.value.map((name, i) => ({ name, value: values.value[i] })),
      label: { fontSize: 9, color: tc.value },
      labelLine: { lineStyle: { color: tc.value } },
      itemStyle: { borderWidth: 2, borderColor: isDark.value ? '#1e1e2e' : '#fff' },
    }],
  }

  // ── Half Doughnut ────────────────────────────────────────────────────────
  if (t === 'halfDoughnut') return {
    color: COLORS,
    tooltip: { trigger: 'item' as const, formatter: '{b}: {c} ({d}%)',
      textStyle: { fontSize: 10 }, confine: true },
    series: [{
      type: 'pie', radius: ['40%', '72%'],
      center: ['50%', '72%'],
      startAngle: 180, endAngle: 360,
      data: labels.value.map((name, i) => ({ name, value: values.value[i] })),
      label: { fontSize: 9, color: tc.value },
      itemStyle: { borderWidth: 2, borderColor: isDark.value ? '#1e1e2e' : '#fff' },
    }],
  }

  // ── Scatter ──────────────────────────────────────────────────────────────
  if (t === 'scatter') return {
    color: COLORS, grid,
    tooltip: { trigger: 'item' as const, confine: true,
      formatter: (p: any) => `${p.value[0]}, ${p.value[1]}`,
      textStyle: { fontSize: 10 } },
    xAxis: { type: 'value', ...ab.value },
    yAxis: { type: 'value', ...ab.value },
    series: [{
      type: 'scatter', symbolSize: 6,
      itemStyle: { color: COLORS[0], opacity: 0.8 },
      data: props.rows.map(r => [Number(r[props.xField] ?? 0), Number(r[props.yField] ?? 0)]),
    }],
  }

  // ── Tree with Polyline Edge ───────────────────────────────────────────────
  if (t === 'tree') {
    const groups = new Map<string, string[]>()
    for (const r of props.rows) {
      const parent = String(r[props.xField] ?? 'root')
      const child  = String(r[props.yField] ?? parent)
      if (!groups.has(parent)) groups.set(parent, [])
      if (!groups.get(parent)!.includes(child)) groups.get(parent)!.push(child)
    }
    const treeData = {
      name: 'Root',
      children: Array.from(groups.entries()).map(([name, children]) => ({
        name,
        children: children.slice(0, 12).map(c => ({ name: c })),
      })),
    }
    return {
      tooltip: { trigger: 'item' as const, textStyle: { fontSize: 10 }, confine: true },
      series: [{
        type: 'tree', edgeShape: 'polyline',
        data: [treeData],
        top: '4%', left: '12%', bottom: '4%', right: '20%',
        symbolSize: 5, orient: 'LR',
        label:  { position: 'left',  fontSize: 9, color: tc.value },
        leaves: { label: { position: 'right', fontSize: 9, color: tc.value } },
        lineStyle: { color: sc.value, width: 1.5 },
        itemStyle: { color: COLORS[0], borderColor: COLORS[0] },
        expandAndCollapse: true, animationDuration: 200,
      }],
    }
  }

  return {}
})
</script>

<template>
  <EChart :option="option" />
</template>
