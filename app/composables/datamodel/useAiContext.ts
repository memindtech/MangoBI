/**
 * useAiContext — Data Model
 * Collects data model state and returns a typed AiContext object for the server.
 */
import { useDataModelStore } from '~/stores/datamodel'
import type { AiContext } from '~/composables/useAiChat'

export function useAiContext() {
  const store = useDataModelStore()

  const contextLabel = computed(() => {
    const t = store.tables.length
    const r = Object.keys(store.relations).length
    return t ? `${t} table${t > 1 ? 's' : ''}${r ? ` · ${r} relation${r > 1 ? 's' : ''}` : ''}` : 'ว่าง'
  })

  const context = computed((): AiContext => ({
    type: 'datamodel',
    data: {
      tables: store.tables.map((t: any) => ({
        name:     t.name,
        rowCount: t.rows.length,
      })),
      relations: Object.values(store.relations).map((r: any) => ({
        from:        r.fromTable,
        fromCol:     r.fromColumn ?? '?',
        to:          r.toTable,
        toCol:       r.toColumn ?? '?',
        cardinality: r.cardinality ?? 'N:1',
      })),
      transforms: Object.keys(store.transforms).length,
      filters: Object.entries(store.nodeFilters).filter(([, v]) => (v as any[]).length > 0).length,
    },
  }))

  return { context, contextLabel }
}
