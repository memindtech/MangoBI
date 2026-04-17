/**
 * useAiContext — SQL Builder
 * สร้าง system prompt จาก state ปัจจุบันของ SQL Builder
 */
import { useSqlBuilderStore } from '~/stores/sql-builder'

export function useAiContext() {
  const store = useSqlBuilderStore()

  const contextLabel = computed(() => {
    const n = store.tableNodes.length
    return n ? `${n} table${n > 1 ? 's' : ''}` : 'ว่าง'
  })

  const systemPrompt = computed(() => {
    const tables = store.tableNodes
      .map((n: any) => {
        const tname = n.data?.tableName ?? n.id
        const allCols = store.columnCache[tname] ?? []
        const colNames = allCols.map((c: any) => c.column_name ?? c.name).filter(Boolean)
        const visibleCols: string[] = (n.data?.visibleCols ?? []).map((c: any) => c.alias ? `${c.name}→${c.alias}` : c.name)
        const colStr = colNames.slice(0, 20).join(', ') + (colNames.length > 20 ? '…' : '')
        const selStr = visibleCols.length ? ` [selected: ${visibleCols.join(', ')}]` : ' [selected: all]'
        return `- ${tname}${colStr ? ` (${colStr})` : ''}${selStr}`
      })
      .join('\n')

    // Edges: join connections already on canvas
    const edges = store.edges
      .filter((e: any) => !e.data?.isTool)
      .map((e: any) => {
        const srcNode = store.nodes.find((n: any) => n.id === e.source)
        const tgtNode = store.nodes.find((n: any) => n.id === e.target)
        const src = srcNode?.data?.tableName ?? e.source
        const tgt = tgtNode?.data?.tableName ?? e.target
        const jt  = e.data?.joinType ?? 'JOIN'
        const on  = (e.data?.mappings ?? [])
          .filter((m: any) => m.source && m.target)
          .map((m: any) => `${src}.${m.source} ${m.operator ?? '='} ${tgt}.${m.target}`)
          .join(', ')
        return `- ${src} →[${jt}]→ ${tgt}${on ? ` ON ${on}` : ''}`
      })
      .join('\n')

    const sql = store.generatedSQL
      ? `\nGenerated SQL (ล่าสุด):\n\`\`\`sql\n${store.generatedSQL.slice(0, 800)}${store.generatedSQL.length > 800 ? '\n…(truncated)' : ''}\n\`\`\``
      : '\nGenerated SQL: ยังไม่ได้ generate'

    const modules = [...new Set(store.tableNodes.map((n: any) => {
      const name = n.data?.tableName ?? ''
      return name.split('_')[0] ?? name
    }))].filter(Boolean).join(', ')

    return `You are an AI assistant for SQL Builder in MangoBI ERP system.
Respond in Thai unless asked otherwise.

════════════════════════════════════════
CANVAS STATE (source of truth — use ONLY this data)
════════════════════════════════════════
${tables || '(ว่าง — ยังไม่มี table)'}
${edges ? `\nExisting joins:\n${edges}` : '\nNo joins yet.'}
${sql}
${modules ? `\nERP modules: ${modules}` : ''}

════════════════════════════════════════
STRICT RULES — NEVER BREAK THESE
════════════════════════════════════════
1. ONLY use table names listed in CANVAS STATE above. Never invent table names.
2. ONLY use column names shown in parentheses for each table above. Never guess or invent column names.
3. If a column you need is NOT listed, say so explicitly — do not substitute a made-up name.
4. ONLY reference joins listed in "Existing joins". Do not assume joins that aren't there.
5. If canvas is empty, say so — do not make up example tables.

════════════════════════════════════════
CANVAS ACTIONS
════════════════════════════════════════
When user asks to build/modify the canvas, output ONE action block after your explanation.
User must click "Apply" — never say the action was applied automatically.

\`\`\`action
{ "type": "..." }
\`\`\`

--- Available action types ---

Connect tables (joinType: "LEFT JOIN"|"INNER JOIN"|"RIGHT JOIN"|"FULL JOIN"|"CROSS JOIN"):
{"type":"add_edge","source":"<table>","target":"<table>","joinType":"LEFT JOIN","on":[{"sourceCol":"<col>","targetCol":"<col>"}]}

Add table to canvas:
{"type":"add_table","tableName":"<table>"}

Remove connection:
{"type":"remove_edge","source":"<table>","target":"<table>"}

Select specific columns (cols must exist in canvas column list):
{"type":"set_visible_cols","tableName":"<table>","cols":[{"name":"<col>"},{"name":"<col>","alias":"<alias>"}]}
Use cols:[] to show all columns again.

Create Group By node:
{"type":"add_group_by","source":"<table>","groupCols":["<col>"],"aggs":[{"col":"<col>","func":"SUM","alias":"<alias>"}]}
func options: "SUM"|"AVG"|"COUNT"|"MIN"|"MAX"|"COUNT DISTINCT"

Create WHERE filter node:
{"type":"add_where","source":"<table>","conditions":[{"column":"<col>","operator":"=","value":"<val>"}]}
operator options: "="|"!="|">"|"<"|">="|"<="|"LIKE"|"IN"|"IS NULL"|"IS NOT NULL"

Create ORDER BY node:
{"type":"add_sort","source":"<table>","items":[{"col":"<col>","dir":"DESC"}]}

Create Calculator node:
{"type":"add_calc","source":"<table>","items":[{"col":"<col>","op":"*","value":"1.07","alias":"<alias>"}]}

Update existing tool node:
{"type":"update_tool","toolType":"group"|"where"|"sort"|"calc", ...same fields as above}

--- Action rules ---
- One action block per response
- Always explain WHAT and WHY first
- Only reference tables/columns that exist in CANVAS STATE`
  })

  return { systemPrompt, contextLabel }
}
