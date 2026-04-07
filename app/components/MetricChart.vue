<script setup lang="ts">
const props = withDefaults(defineProps<{
  data:     number[]
  label:    string
  unit:     string
  color?:   string
  max?:     number
  current?: number | string
}>(), {
  color: '#22c55e',
})

const colorMode = useColorMode()
const isDark    = computed(() => colorMode.value === 'dark')

const effectiveMax = computed(() =>
  props.max ?? Math.max(...(props.data.length ? props.data : [100]), 1)
)

const displayVal = computed(() => {
  if (props.current !== undefined) return props.current
  return props.data.at(-1) ?? '—'
})

const option = computed(() => ({
  animation: false,
  grid: { top: 4, bottom: 4, left: 4, right: 4 },
  xAxis: {
    type: 'category',
    show: false,
    data: props.data.map((_, i) => i),
    boundaryGap: false,
  },
  yAxis: {
    type:    'value',
    show:    false,
    min:     0,
    max:     effectiveMax.value,
    splitLine: { show: true, lineStyle: { color: isDark.value ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)', width: 1 } },
  },
  series: [{
    type:      'line',
    data:      props.data,
    smooth:    0.3,
    symbol:    'none',
    lineStyle: { color: props.color, width: 2 },
    areaStyle: {
      color: {
        type:       'linear',
        x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0,   color: props.color + '55' },
          { offset: 1,   color: props.color + '08' },
        ],
      },
    },
  }],
  tooltip: {
    trigger:   'axis',
    formatter: (p: any) => `${p[0]?.value ?? '—'}${props.unit}`,
    backgroundColor: isDark.value ? '#1e1e2e' : '#fff',
    borderColor:     isDark.value ? '#333' : '#e2e8f0',
    textStyle:       { color: isDark.value ? '#e2e8f0' : '#1e293b', fontSize: 11 },
  },
}))
</script>

<template>
  <div class="rounded-2xl border border-border/60 bg-card p-4 flex flex-col gap-2 min-w-0">
    <!-- header -->
    <div class="flex items-center justify-between text-xs">
      <span class="text-muted-foreground font-medium tracking-wide uppercase text-[10px]">{{ label }}</span>
      <span class="font-mono font-bold text-sm" :style="{ color }">{{ displayVal }}{{ unit }}</span>
    </div>

    <!-- echarts -->
    <div class="h-20 w-full">
      <ReportEChart :option="option" />
    </div>

    <!-- footer slot -->
    <slot />
  </div>
</template>
