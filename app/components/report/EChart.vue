<script setup lang="ts">
import * as echarts from 'echarts'

const props = defineProps<{ option: Record<string, any> }>()

const emit = defineEmits<{
  (e: 'chart-click', params: { name: string; value: any; seriesName: string; dataIndex: number }): void
}>()

const el        = ref<HTMLDivElement | null>(null)
const colorMode = useColorMode()
let   chart: echarts.ECharts | null = null
let   ro:    ResizeObserver  | null = null

const isDark = computed(() => colorMode.value === 'dark')

// Merge transparent bg + themed text into every option
const mergedOption = computed(() => ({
  backgroundColor: 'transparent',
  textStyle: { color: isDark.value ? '#94a3b8' : '#64748b', fontSize: 11 },
  ...props.option,
}))

function registerClick() {
  if (!chart) return
  chart.off('click')
  chart.on('click', (params: any) => {
    emit('chart-click', {
      name:       String(params.name ?? ''),
      value:      params.value,
      seriesName: String(params.seriesName ?? ''),
      dataIndex:  params.dataIndex ?? 0,
    })
  })
}

function init() {
  if (!el.value) return
  chart = echarts.init(el.value, null, { renderer: 'canvas' })
  chart.setOption(mergedOption.value)
  registerClick()
}

watch(mergedOption, opt => { chart?.setOption(opt, { notMerge: true }); registerClick() }, { deep: true })

// Re-init on theme switch so axis/label colours update properly
watch(isDark, () => {
  chart?.dispose(); chart = null
  nextTick(init)
})

onMounted(() => {
  init()
  ro = new ResizeObserver(() => chart?.resize())
  if (el.value) ro.observe(el.value)
})

onUnmounted(() => {
  ro?.disconnect()
  chart?.dispose(); chart = null
})
</script>

<template>
  <div ref="el" class="w-full h-full" />
</template>
