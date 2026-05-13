/**
 * useAiContext — SQL Builder
 * Collects canvas state and returns a typed AiContext object for the server.
 */
import { useSqlBuilderStore } from '~/stores/sql-builder'
import type { AiContext } from '~/composables/useAiChat'

export function useAiContext() {
  const store = useSqlBuilderStore()

  const contextLabel = computed(() => {
    const n = store.tableNodes.length
    return n ? `${n} table${n > 1 ? 's' : ''}` : 'ว่าง'
  })

  const context = computed((): AiContext => ({
    type: 'sql-builder',
    data: {
      tables: store.tableNodes.map((n: any) => {
        const tname = n.data?.tableName ?? n.id
        const allCols = store.columnCache[tname] ?? []
        return {
          name:        tname,
          columns:     allCols.map((c: any) => c.column_name ?? c.name).filter(Boolean),
          visibleCols: (n.data?.visibleCols ?? []).map((c: any) => ({ name: c.name, alias: c.alias || undefined })),
        }
      }),
      joins: store.edges
        .filter((e: any) => !e.data?.isTool)
        .map((e: any) => {
          const srcNode = store.nodes.find((n: any) => n.id === e.source)
          const tgtNode = store.nodes.find((n: any) => n.id === e.target)
          return {
            source:   srcNode?.data?.tableName ?? e.source,
            target:   tgtNode?.data?.tableName ?? e.target,
            joinType: e.data?.joinType ?? 'JOIN',
            on: (e.data?.mappings ?? [])
              .filter((m: any) => m.source && m.target)
              .map((m: any) => ({ sourceCol: m.source, targetCol: m.target })),
          }
        }),
      tools: store.nodes
        .filter((n: any) => n.type === 'toolNode')
        .map((n: any) => {
          const t = n.data?.nodeType as string
          const base: Record<string, any> = { nodeType: t }
          if      (t === 'cte')   { base.name = n.data?.name ?? '' }
          else if (t === 'group') { base.groupCols = n.data?.groupCols ?? []; base.aggs = n.data?.aggs ?? [] }
          else if (t === 'where') { base.conditions = n.data?.conditions ?? [] }
          else if (t === 'sort')  { base.items = n.data?.items ?? [] }
          else if (t === 'calc')  { base.items = n.data?.items ?? [] }
          return base
        }),
      sql: store.generatedSQL ?? '',
    },
  }))

  return { context, contextLabel }
}
