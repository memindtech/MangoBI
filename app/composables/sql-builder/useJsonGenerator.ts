/**
 * SQL Builder — JSON Export
 * Generates structured JSON payload from canvas diagram
 * Based on ChartDB: useJsonGenerator.js §6.12
 *
 * Output:
 * {
 *   sources:  [{ id, table_name, display_label, alias, type }]
 *   joins:    [{ join_type, source_table, target_table, conditions }]
 *   columns:  [{ expression, alias, source_table }]
 *   filters:  [{ column, operator, value, type }]
 *   group_by: string[]
 *   having:   [{ column, operator, value }]
 *   order_by: [{ column, direction }]
 * }
 */
import type { Node, Edge } from '@vue-flow/core'
import type { VisibleCol } from '~/types/sql-builder'
import { useSqlBuilderStore } from '~/stores/sql-builder'

export function useJsonGenerator() {
  const store = useSqlBuilderStore()

  function generateJSON(): object {
    const { nodes, edges } = store

    const tableNodes = nodes.filter((n: Node) => n.type === 'sqlTable')
    const toolNodes  = nodes.filter((n: Node) => n.type === 'toolNode')

    // ── sources ─────────────────────────────────────────────────────────
    const sources = tableNodes.map((n: Node) => ({
      id:            n.id,
      table_name:    n.data.tableName ?? n.data.label,
      display_label: n.data.label,
      alias:         n.data.tableName ?? n.data.label,
      type:          n.data.objectTypeLabel ?? n.data.type ?? '',
      use_type:      n.data.useTypeLabel ?? n.data.useType ?? '',
      module:        n.data.module ?? '',
    }))

    // ── joins (table→table edges) ────────────────────────────────────────
    const tableIds = new Set(tableNodes.map((n: Node) => n.id))
    const joins = edges
      .filter((e: Edge) => tableIds.has(e.source) && tableIds.has(e.target))
      .map((e: Edge) => {
        const srcNode = tableNodes.find((n: Node) => n.id === e.source)
        const tgtNode = tableNodes.find((n: Node) => n.id === e.target)
        return {
          join_type:    e.data?.joinType ?? 'LEFT JOIN',
          source_table: srcNode?.data?.tableName ?? '',
          target_table: tgtNode?.data?.tableName ?? '',
          conditions:   (e.data?.mappings ?? []).map((m: any) => ({
            left:     `${srcNode?.data?.tableName}.${m.source}`,
            operator: m.operator ?? '=',
            right:    `${tgtNode?.data?.tableName}.${m.target}`,
          })),
        }
      })

    // ── columns (from visibleCols) ───────────────────────────────────────
    const columns: object[] = []
    for (const tn of tableNodes) {
      const visible = tn.data.visibleCols as VisibleCol[] | undefined
      if (visible?.length) {
        for (const col of visible) {
          columns.push({
            expression:   `${tn.data.tableName}.${col.name}`,
            alias:        col.alias || col.name,
            source_table: tn.data.tableName,
            type:         col.type,
            is_pk:        col.isPk,
          })
        }
      }
    }

    // ── filters (table-level) ────────────────────────────────────────────
    const filters: object[] = []
    for (const tn of tableNodes) {
      for (const f of (tn.data.filters ?? [])) {
        if (f.column && f.operator) {
          filters.push({ ...f, source_table: tn.data.tableName })
        }
      }
    }

    // ── group_by / having (from group tool node) ─────────────────────────
    const groupNode = toolNodes.find((n: Node) => n.data.nodeType === 'group')
    const group_by  = (groupNode?.data?.groupCols ?? []).filter(Boolean)
    const having    = (groupNode?.data?.filters ?? [])
      .filter((f: any) => f.column && f.operator)
      .map((f: any) => ({ column: f.column, operator: f.operator, value: f.value }))

    // ── order_by (from sort tool node) ───────────────────────────────────
    const sortNode = toolNodes.find((n: Node) => n.data.nodeType === 'sort')
    const order_by = (sortNode?.data?.items ?? [])
      .filter((s: any) => s.col)
      .map((s: any) => ({ column: s.col, direction: s.dir ?? 'ASC' }))

    // ── calc expressions ─────────────────────────────────────────────────
    const calcNode = toolNodes.find((n: Node) => n.data.nodeType === 'calc')
    const calc_cols = (calcNode?.data?.items ?? [])
      .filter((c: any) => c.expr)
      .map((c: any) => ({ expression: c.expr, alias: c.alias || 'calculated_col', source_table: null }))
    columns.push(...calc_cols)

    return { sources, joins, columns, filters, group_by, having, order_by }
  }

  function downloadJSON() {
    const payload = JSON.stringify(generateJSON(), null, 2)
    const blob    = new Blob([payload], { type: 'application/json' })
    const url     = URL.createObjectURL(blob)
    const a       = document.createElement('a')
    a.href        = url
    a.download    = 'sql-builder-export.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return { generateJSON, downloadJSON }
}
