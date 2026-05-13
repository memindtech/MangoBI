/**
 * useAiContext — Report Builder
 * Collects report state and returns a typed AiContext object for the server.
 */
import { useReportStore } from '~/stores/report'
import type { AiContext } from '~/composables/useAiChat'

export function useAiContext() {
  const store = useReportStore()

  const contextLabel = computed(() => {
    const w = store.widgets.length
    const d = store.datasets.length
    return w ? `${w} widget${w > 1 ? 's' : ''} · ${d} dataset${d > 1 ? 's' : ''}` : 'ว่าง'
  })

  const context = computed((): AiContext => ({
    type: 'report',
    data: {
      widgets: store.widgets.map((w: any) => ({
        type:  w.type,
        title: w.title || 'ไม่มีชื่อ',
      })),
      datasets: store.datasets.map((ds: any) => ({
        name:     ds.name,
        rowCount: ds.rows.length,
        columns:  Object.keys(ds.columnLabels ?? {}).slice(0, 20),
      })),
    },
  }))

  return { context, contextLabel }
}
