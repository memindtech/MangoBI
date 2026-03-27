<script setup lang="ts">
import * as echarts from 'echarts'

const props = defineProps<{ option: Record<string, any> }>()

const emit = defineEmits<{
  (e: 'chart-click', params: { name: string; value: any; seriesName: string; dataIndex: number }): void
}>()

const el        = ref<HTMLDivElement | null>(null)
const colorMode = useColorMode()
let   chart:          echarts.ECharts | null = null
let   ro:             ResizeObserver  | null = null
let   zrClickHandler: ((e: any) => void) | null = null
let   suppressZrClick = false

const isDark = computed(() => colorMode.value === 'dark')

// Merge transparent bg + themed text into every option
const mergedOption = computed(() => ({
  backgroundColor: 'transparent',
  textStyle: { color: isDark.value ? '#94a3b8' : '#64748b', fontSize: 11 },
  ...props.option,
}))

function resolveClickParams(params: any): { name: string; value: any; seriesName: string; dataIndex: number } {
  let name = String(params.name ?? '')
  // Line chart: clicking on the line/area gives empty name — resolve via dataIndex
  if (!name && typeof params.dataIndex === 'number' && params.dataIndex >= 0) {
    try {
      const opt   = chart?.getOption() as any
      const xData = opt?.xAxis?.[0]?.data
      if (Array.isArray(xData)) name = String(xData[params.dataIndex] ?? '')
    } catch {}
  }
  return { name, value: params.value, seriesName: String(params.seriesName ?? ''), dataIndex: params.dataIndex ?? 0 }
}

function registerClick() {
  if (!chart) return
  chart.off('click')
  chart.on('click', (params: any) => {
    // Suppress the ZRender fallback — this element-level click already handled it
    suppressZrClick = true
    setTimeout(() => { suppressZrClick = false }, 50)
    emit('chart-click', resolveClickParams(params))
  })

  // Line chart: clicking between symbols (on the line/area) doesn't fire chart.on('click').
  // Use ZRender canvas-level click as fallback to find nearest category by x-pixel.
  // IMPORTANT: off() only our specific handler, NOT all ZRender handlers (that breaks bar/pie clicks).
  if (zrClickHandler) {
    chart.getZr().off('click', zrClickHandler)
    zrClickHandler = null
  }
  zrClickHandler = (e: any) => {
    if (suppressZrClick || !chart) return
    const opt = chart.getOption() as any
    if (!opt?.series?.some((s: any) => s.type === 'line')) return
    // Only handle clicks inside the actual plot/grid area — ignores legend, title, axis labels
    if (!chart.containPixel('grid', [e.offsetX, e.offsetY])) return
    try {
      const [dataX] = chart.convertFromPixel({ seriesIndex: 0 }, [e.offsetX, e.offsetY])
      const xData   = opt.xAxis?.[0]?.data
      if (!Array.isArray(xData) || typeof dataX !== 'number') return
      const idx = Math.max(0, Math.min(Math.round(dataX), xData.length - 1))
      const s0  = opt.series[0]
      emit('chart-click', {
        name:       String(xData[idx] ?? ''),
        value:      Array.isArray(s0?.data) ? s0.data[idx] : undefined,
        seriesName: String(s0?.name ?? ''),
        dataIndex:  idx,
      })
    } catch {}
  }
  chart.getZr().on('click', zrClickHandler)
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
  if (zrClickHandler) { chart?.getZr().off('click', zrClickHandler); zrClickHandler = null }
  chart?.dispose(); chart = null
})
</script>

<template>
  <div ref="el" class="w-full h-full" />
</template>
