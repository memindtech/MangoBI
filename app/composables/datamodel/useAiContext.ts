/**
 * useAiContext — Datamodel
 * สร้าง system prompt จาก state ของ Data Model canvas
 */
import { useDataModelStore } from '~/stores/datamodel'

export function useAiContext() {
  const store = useDataModelStore()

  const contextLabel = computed(() => {
    const t = store.tables.length
    const r = Object.keys(store.relations).length
    return t ? `${t} table${t > 1 ? 's' : ''}${r ? ` · ${r} relation${r > 1 ? 's' : ''}` : ''}` : 'ว่าง'
  })

  const systemPrompt = computed(() => {
    const tables = store.tables
      .map(t => `- ${t.name} (${t.rows.length.toLocaleString()} rows)`)
      .join('\n')

    const relations = Object.values(store.relations)
      .map((r: any) => `- ${r.fromTable} [${r.fromColumn ?? '?'}] → ${r.toTable} [${r.toColumn ?? '?'}] (${r.cardinality ?? 'N:1'})`)
      .join('\n')

    const transforms = Object.keys(store.transforms).length
    const filters    = Object.entries(store.nodeFilters)
      .filter(([, v]) => (v as any[]).length > 0).length

    return `You are an AI assistant for Data Model in MangoBI ERP system.
Your role: help users design data models, plan table joins, configure transforms, and understand data relationships.
Answer ONLY questions related to data modeling and the current canvas. Respond in Thai unless asked otherwise.

Current data model:
Tables (${store.tables.length}):
${tables || '(ว่าง)'}

Relations (${Object.keys(store.relations).length}):
${relations || '(ยังไม่มี relation)'}

Transforms configured: ${transforms} component${transforms !== 1 ? 's' : ''}
Pre-filters active: ${filters} table${filters !== 1 ? 's' : ''}

Guidelines:
- Suggest practical join strategies based on the actual table names
- Recommend transform types (filter, group by, computed columns) where useful
- Explain cardinality (1:1, 1:N, N:M) simply
- Keep responses concise and actionable`
  })

  return { systemPrompt, contextLabel }
}
