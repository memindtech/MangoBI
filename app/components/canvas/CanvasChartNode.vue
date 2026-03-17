<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { BarChart2, TrendingUp, PieChart, Unplug } from 'lucide-vue-next'
import type { ChartType } from '~/stores/canvas'

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected: boolean
}>()

const canvasStore = useCanvasStore()

const rows     = computed(() => canvasStore.nodeInputs[props.id] ?? [])
const config   = computed(() => canvasStore.nodeConfigs[props.id] ?? {})
const hasData  = computed(() => rows.value.length > 0)

const columns     = computed(() => rows.value.length ? Object.keys(rows.value[0]) : [])
const numericCols = computed(() => columns.value.filter(k => typeof rows.value[0]?.[k] === 'number'))

const xField    = computed(() => config.value.xField ?? columns.value[0] ?? '')
const yField    = computed(() => config.value.yField ?? numericCols.value[0] ?? '')
const chartType = computed<ChartType>(() => config.value.chartType ?? 'bar')

const chartIcon: Record<ChartType, any> = {
  bar:  BarChart2,
  line: TrendingUp,
  pie:  PieChart,
}

const chartColor: Record<ChartType, string> = {
  bar:  'text-blue-500',
  line: 'text-teal-500',
  pie:  'text-violet-500',
}
const headerBg: Record<ChartType, string> = {
  bar:  'bg-blue-50 dark:bg-blue-950/30',
  line: 'bg-teal-50 dark:bg-teal-950/30',
  pie:  'bg-violet-50 dark:bg-violet-950/30',
}
</script>

<template>
  <div
    class="w-72 rounded-xl border-2 bg-background shadow-md transition-all"
    :class="selected ? 'border-primary shadow-lg' : 'border-border'"
  >
    <!-- Input handle -->
    <Handle
      id="in"
      type="target"
      :position="Position.Left"
      style="left: -6px; width: 12px; height: 12px; background: #3b82f6; border: 2px solid white;"
    />

    <!-- Header -->
    <div
      class="flex items-center gap-2 px-3 py-2 rounded-t-xl border-b"
      :class="headerBg[chartType]"
    >
      <component :is="chartIcon[chartType]" class="size-4 shrink-0" :class="chartColor[chartType]" />
      <span class="text-xs font-semibold" :class="chartColor[chartType]">Chart</span>
      <span class="ml-auto text-[10px] px-2 py-0.5 rounded bg-white/60 dark:bg-black/20 font-medium">
        {{ chartType }}
      </span>
    </div>

    <!-- Chart area -->
    <div class="px-2 pt-2 pb-1">
      <!-- No data state -->
      <div
        v-if="!hasData"
        class="h-36 flex flex-col items-center justify-center gap-2 text-muted-foreground rounded-lg border border-dashed"
      >
        <Unplug class="size-6 opacity-25" />
        <p class="text-xs">เชื่อมต่อ Data Source</p>
      </div>

      <!-- Chart -->
      <CanvasMiniChart
        v-else
        :rows="rows"
        :x-field="xField"
        :y-field="yField"
        :chart-type="chartType"
        class="w-full"
      />
    </div>

    <!-- Footer: field labels -->
    <div v-if="hasData" class="px-3 pb-2.5 flex gap-3 text-[10px] text-muted-foreground">
      <span>X: <strong class="text-foreground/70">{{ xField }}</strong></span>
      <span>Y: <strong class="text-foreground/70">{{ yField }}</strong></span>
    </div>
  </div>
</template>
