<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { BarChart2, TrendingUp, PieChart, Unplug, Layers, Activity, Network, Code2 } from 'lucide-vue-next'
import type { ChartType } from '~/stores/canvas'

const { nodeEl, width, height, onDragStart, onDragStartHeight, onDragStartCorner } = useNodeResize(200, 80)
const isSized = computed(() => height.value !== 'auto')

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected: boolean
  dragging?: boolean
}>()

const canvasStore = useCanvasStore()

const rows     = computed(() => canvasStore.nodeInputs[props.id] ?? [])
const config   = computed(() => canvasStore.nodeConfigs[props.id] ?? {})
const hasData  = computed(() => rows.value.length > 0)

const columns     = computed(() => rows.value.length ? Object.keys(rows.value[0]!) : [])
const numericCols = computed(() => columns.value.filter(k => typeof rows.value[0]?.[k] === 'number'))

const xField    = computed(() => config.value.xField    ?? '')
const yField    = computed(() => config.value.yField    ?? '')
const yFields   = computed(() => config.value.yFields   ?? [])
const ecOptionJson = computed(() => config.value.ecOptionJson ?? '')
const chartType = computed<ChartType>(() => config.value.chartType ?? 'bar')

// ต้อง configure แล้วเท่านั้นถึงจะ render chart
const isConfigured = computed(() => {
  if (chartType.value === 'ecOption') return ecOptionJson.value.trim().length > 0
  const stackedTypes: ChartType[] = ['stackedBar', 'stackedHBar', 'stackedLine']
  if (stackedTypes.includes(chartType.value)) return xField.value !== '' && yFields.value.length > 0
  return xField.value !== '' && yField.value !== ''
})

// ── Limit data points sent to chart (prevents browser freeze) ────────────────
// Can be overridden per-node via config: { maxChartPoints: N }
const MAX_CHART_POINTS = computed(() => config.value.maxChartPoints ?? 50)

const chartRows = computed(() => {
  const all = rows.value
  if (!all.length || all.length <= MAX_CHART_POINTS.value) return all

  const limit = MAX_CHART_POINTS.value
  const x = xField.value
  const y = yField.value

  if (chartType.value === 'line') {
    // Evenly sample across full range
    const step = Math.ceil(all.length / limit)
    const sampled: typeof all = []
    for (let i = 0; i < all.length && sampled.length < limit; i += step)
      sampled.push(all[i]!)
    return sampled
  }

  // bar / pie: group by xField → sum yField → top N
  const groups = new Map<string, number>()
  for (const row of all) {
    const key = String(row[x] ?? '')
    groups.set(key, (groups.get(key) ?? 0) + (Number(row[y]) || 0))
  }
  return Array.from(groups.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([xVal, yVal]) => ({ [x]: xVal, [y]: yVal } as any))
})

const isSampled = computed(() => rows.value.length > MAX_CHART_POINTS.value)

const chartIcon: Record<ChartType, any> = {
  bar: BarChart2, line: TrendingUp, pie: PieChart,
  stackedBar: Layers, stackedHBar: Layers, stackedLine: Layers,
  halfDoughnut: PieChart, scatter: Activity, tree: Network, ecOption: Code2,
}
const chartColor: Record<ChartType, string> = {
  bar: 'text-blue-500',   line: 'text-teal-500',   pie: 'text-violet-500',
  stackedBar: 'text-blue-500', stackedHBar: 'text-blue-500', stackedLine: 'text-teal-500',
  halfDoughnut: 'text-violet-500', scatter: 'text-orange-500', tree: 'text-green-500', ecOption: 'text-slate-500',
}
const headerBg: Record<ChartType, string> = {
  bar:  'bg-blue-50 dark:bg-blue-950/30',
  line: 'bg-teal-50 dark:bg-teal-950/30',
  pie:  'bg-violet-50 dark:bg-violet-950/30',
  stackedBar:  'bg-blue-50 dark:bg-blue-950/30',
  stackedHBar: 'bg-blue-50 dark:bg-blue-950/30',
  stackedLine: 'bg-teal-50 dark:bg-teal-950/30',
  halfDoughnut: 'bg-violet-50 dark:bg-violet-950/30',
  scatter:  'bg-orange-50 dark:bg-orange-950/30',
  tree:     'bg-green-50 dark:bg-green-950/30',
  ecOption: 'bg-slate-50 dark:bg-slate-950/30',
}
</script>

<template>
  <div ref="nodeEl" class="relative" :style="{ width, height }" style="will-change: transform; contain: layout;">

    <div
      class="rounded-xl border-2 bg-background shadow-md overflow-hidden flex flex-col"
      :style="isSized ? { height: '100%' } : {}"
      :class="[
        dragging ? '' : 'transition-[border-color,box-shadow]',
        selected  ? 'border-primary shadow-lg' : 'border-border',
      ]"
      @wheel.stop
    >
      <!-- Header -->
      <div class="flex items-center gap-2 px-3 py-2 rounded-t-xl border-b" :class="headerBg[chartType]">
        <component :is="chartIcon[chartType]" class="size-4 shrink-0" :class="chartColor[chartType]" />
        <span class="text-xs font-semibold" :class="chartColor[chartType]">Chart</span>
        <span class="ml-auto text-[10px] px-2 py-0.5 rounded bg-white/60 dark:bg-black/20 font-medium">
          {{ chartType }}
        </span>
      </div>

      <!-- Drag placeholder -->
      <div v-if="dragging" class="px-3 py-4 text-center text-[10px] text-muted-foreground">
        {{ hasData ? `${rows.length.toLocaleString()} rows` : 'ไม่มีข้อมูล' }}
      </div>

      <template v-else>
        <div class="px-2 pt-2 pb-1">
          <div
            v-if="!hasData"
            class="h-36 flex flex-col items-center justify-center gap-2 text-muted-foreground rounded-lg border border-dashed"
          >
            <Unplug class="size-6 opacity-25" />
            <p class="text-xs">เชื่อมต่อ Data Source</p>
          </div>

          <div
            v-else-if="!isConfigured"
            class="h-36 flex flex-col items-center justify-center gap-2 text-muted-foreground rounded-lg border border-dashed"
          >
            <component :is="chartIcon[chartType]" class="size-5 opacity-25" />
            <p class="text-xs">กำหนด Field ที่แผงซ้าย</p>
          </div>

          <CanvasMiniChart
            v-else
            :rows="chartRows"
            :x-field="xField"
            :y-field="yField"
            :y-fields="yFields"
            :ec-option-json="ecOptionJson"
            :chart-type="chartType"
            :class="['w-full', isSized ? 'flex-1 min-h-0' : '']"
          />
        </div>

        <div v-if="hasData" class="px-3 pb-2.5 flex gap-3 text-[10px] text-muted-foreground shrink-0">
          <span>X: <strong class="text-foreground/70">{{ xField }}</strong></span>
          <span>Y: <strong class="text-foreground/70">{{ yField }}</strong></span>
          <span v-if="isSampled" class="ml-auto text-amber-500 font-medium">
            sample {{ MAX_CHART_POINTS }}/{{ rows.length.toLocaleString() }}
          </span>
        </div>
      </template>
    </div>

    <Handle
      id="in"
      type="target"
      :position="Position.Left"
      style="left: -6px; width: 12px; height: 12px; background: #3b82f6; border: 2px solid white;"
    />

    <div
      class="absolute right-0 top-0 h-full w-2 cursor-ew-resize hover:bg-blue-400/40 rounded-r-xl nodrag z-10"
      @mousedown.stop="onDragStart"
    />
    <!-- Bottom-edge resize -->
    <div
      class="absolute bottom-0 left-0 w-full h-2 cursor-ns-resize hover:bg-blue-400/40 rounded-b-xl nodrag z-10"
      @mousedown.stop="onDragStartHeight"
    />
    <!-- Corner resize -->
    <div
      class="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize nodrag z-20"
      @mousedown.stop="onDragStartCorner"
    />
  </div>
</template>
