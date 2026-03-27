/**
 * SQL Builder — SQL Generation (CTE-based, Topological Sort)
 * Converts diagram nodes + edges → SQL with CTEs
 * Based on ChartDB: useSqlGenerator.js + §6.3 + §12.1
 *
 * Algorithm:
 *  1. Topological sort all nodes (Kahn's algorithm)
 *  2. Table nodes → base JOIN query (_src CTE)
 *  3. Each tool node → its own CTE referencing upstream
 *  4. sort nodes → ORDER BY in final SELECT (cannot be inside CTE)
 *  5. Final: WITH ... SELECT * FROM <lastCte> [ORDER BY ...]
 */
import type { Node, Edge } from '@vue-flow/core'
import type { VisibleCol } from '~/types/sql-builder'
import { useSqlBuilderStore } from '~/stores/sql-builder'

export function useSqlGenerator() {
  const store = useSqlBuilderStore()

  // ── Main generate function ────────────────────────────────────────────
  function generateSQL() {
    const { nodes, edges } = store

    const tableNodes     = nodes.filter((n: Node) => n.type === 'sqlTable')
    const toolNodes      = nodes.filter((n: Node) => n.type === 'toolNode')
    const cteFrameNodes  = nodes.filter((n: Node) => n.type === 'cteFrame')

    if (!tableNodes.length && !cteFrameNodes.length) {
      store.generatedSQL = '-- ลาก Table ลงบน Canvas ก่อน'
      store.sqlPanelOpen = true
      return
    }

    // No tool/frame nodes → simple flat SQL
    if (!toolNodes.length && !cteFrameNodes.length) {
      store.generatedSQL = buildDirectSQL(tableNodes, edges)
      store.sqlPanelOpen = true
      return
    }

    // CTE pipeline
    store.generatedSQL = buildCTESQL(nodes, edges, tableNodes, toolNodes, cteFrameNodes)
    store.sqlPanelOpen = true
  }

  // ── Topological sort (Kahn's algorithm §12.1) ─────────────────────────
  function topologicalSort(nodes: Node[], edges: Edge[]): Node[] {
    const inDegree = new Map<string, number>()
    const adj      = new Map<string, string[]>()

    for (const n of nodes) { inDegree.set(n.id, 0); adj.set(n.id, []) }
    for (const e of edges) {
      adj.get(e.source)?.push(e.target)
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
    }

    const queue = nodes.filter(n => inDegree.get(n.id) === 0).map(n => n.id)
    const result: Node[]           = []
    const nodeMap = new Map(nodes.map(n => [n.id, n]))

    while (queue.length) {
      const id   = queue.shift()!
      const node = nodeMap.get(id)
      if (node) result.push(node)
      for (const tgt of (adj.get(id) ?? [])) {
        const deg = (inDegree.get(tgt) ?? 1) - 1
        inDegree.set(tgt, deg)
        if (deg === 0) queue.push(tgt)
      }
    }
    return result
  }

  // ── CTE-based SQL ─────────────────────────────────────────────────────
  function buildCTESQL(
    nodes: Node[], edges: Edge[],
    tableNodes: Node[], toolNodes: Node[], cteFrameNodes: Node[],
  ): string {
    const sorted = topologicalSort(nodes, edges)

    // Reverse-edge map: nodeId → upstream nodeIds
    const upstreamOf = new Map<string, string[]>()
    for (const e of edges) {
      const list = upstreamOf.get(e.target) ?? []
      list.push(e.source)
      upstreamOf.set(e.target, list)
    }

    // Track which CTE name each node outputs
    const nodeOutput = new Map<string, string>()

    const ctes: { name: string; sql: string }[] = []
    let cteIdx    = 0
    let sortOrder = ''
    let lastCTE   = ''

    // ── Bounds helper: find sqlTable nodes inside a cteFrame ────────────
    function getFrameChildren(frame: Node): Node[] {
      const fw = parseFloat(String((frame.style as any)?.width  ?? '420'))
      const fh = parseFloat(String((frame.style as any)?.height ?? '280'))
      const fx = frame.position.x
      const fy = frame.position.y
      const NW = 112   // half node card width
      const NH = 80    // half node card height
      return tableNodes.filter((n: Node) =>
        (n.position.x + NW) >= fx && (n.position.x + NW) <= fx + fw &&
        (n.position.y + NH) >= fy && (n.position.y + NH) <= fy + fh
      )
    }

    // ── Step 1: cteFrame nodes → each builds its own JOIN CTE ──────────
    const framedTableIds = new Set<string>()
    for (const frame of cteFrameNodes) {
      const childTables = getFrameChildren(frame)
      childTables.forEach(t => framedTableIds.add(t.id))
      const childEdges  = edges.filter(e => {
        const s = nodes.find((n: Node) => n.id === e.source)
        const t = nodes.find((n: Node) => n.id === e.target)
        return s?.type === 'sqlTable' && t?.type === 'sqlTable'
          && childTables.some(c => c.id === e.source)
          && childTables.some(c => c.id === e.target)
      })
      const frameName = (frame.data as any).name
        ? sanitizeCteName((frame.data as any).name)
        : `_cte${++cteIdx}`
      const frameSql = buildCteFrameBlock(frame, childTables, childEdges)
      ctes.push({ name: frameName, sql: frameSql })
      nodeOutput.set(frame.id, frameName)
      lastCTE = frameName
    }

    // ── Step 1b: table nodes NOT inside any cteFrame → _src ─────────────
    const standaloneTables = tableNodes.filter((n: Node) => !framedTableIds.has(n.id))
    if (standaloneTables.length) {
      const tableEdges = edges.filter(e => {
        const s = nodes.find((n: Node) => n.id === e.source)
        const t = nodes.find((n: Node) => n.id === e.target)
        return s?.type === 'sqlTable' && t?.type === 'sqlTable'
          && standaloneTables.some(x => x.id === e.source)
          && standaloneTables.some(x => x.id === e.target)
      })
      const baseName = '_src'
      const baseSQL  = buildJoinBlock(standaloneTables, tableEdges)
      ctes.push({ name: baseName, sql: baseSQL })
      for (const tn of standaloneTables) nodeOutput.set(tn.id, baseName)
      if (!lastCTE) lastCTE = baseName
    }

    // ── Step 2: each tool node → CTE ───────────────────────────────────
    for (const node of sorted) {
      if (node.type !== 'toolNode') continue

      // Determine upstream CTE name
      const upIds  = upstreamOf.get(node.id) ?? []
      const upName = upIds.length ? (nodeOutput.get(upIds[0]!) ?? lastCTE) : lastCTE

      const nt = node.data.nodeType as string

      // sort node: not a CTE — just captures ORDER BY for the final SELECT
      if (nt === 'sort') {
        const items = (node.data.items ?? []).filter((s: any) => s.col)
        if (items.length) {
          sortOrder = items.map((s: any) => `${s.col} ${s.dir}`).join(', ')
        }
        nodeOutput.set(node.id, upName)  // pass-through
        continue
      }

      const cteName = (nt === 'cte' || nt === 'union') && node.data.name
        ? sanitizeCteName(node.data.name)
        : `_cte${++cteIdx}`

      let cteSql = ''
      switch (nt) {
        case 'cte':    cteSql = buildCteToolBlock(node, upName); break
        case 'where':  cteSql = buildWhereBlock(node, upName);   break
        case 'group':  cteSql = buildGroupBlock(node, upName);   break
        case 'calc':   cteSql = buildCalcBlock(node, upName);    break
        case 'union': {
          const allUpNames = upIds
            .map(id => nodeOutput.get(id))
            .filter((n): n is string => !!n)
          if (!allUpNames.length) allUpNames.push(lastCTE)
          cteSql = buildUnionBlock(node, allUpNames)
          break
        }
      }

      if (cteSql) {
        ctes.push({ name: cteName, sql: cteSql })
        nodeOutput.set(node.id, cteName)
        lastCTE = cteName
      }
    }

    // ── Step 3: assemble ───────────────────────────────────────────────
    const withBlock  = ctes.map(c => `  ${c.name} AS (\n${indent(c.sql)}\n  )`).join(',\n')
    const orderClause = sortOrder ? `\nORDER BY ${sortOrder}` : ''
    return `WITH\n${withBlock}\nSELECT * FROM ${lastCTE}${orderClause}`
  }

  // ── Direct SQL (no tool nodes) ────────────────────────────────────────
  function buildDirectSQL(tableNodes: Node[], edges: Edge[]): string {
    const tableEdges = edges.filter(e => {
      const ids = tableNodes.map((n: Node) => n.id)
      return ids.includes(e.source) && ids.includes(e.target)
    })
    return buildJoinBlock(tableNodes, tableEdges)
  }

  // ── JOIN block (SELECT … FROM … JOIN … WHERE …) ───────────────────────
  function buildJoinBlock(tableNodes: Node[], edges: Edge[]): string {
    if (!tableNodes.length) return 'SELECT 1'

    // SELECT columns
    const selectCols: string[] = []
    for (const tn of tableNodes) {
      const tbl     = alias(tn)
      const visible = tn.data.visibleCols as VisibleCol[] | undefined
      if (visible?.length) {
        for (const col of visible) {
          const expr = col.alias
            ? `${tbl}.${col.name} AS ${col.alias}`
            : `${tbl}.${col.name}`
          selectCols.push(`  ${expr}`)
        }
      } else {
        selectCols.push(`  ${tbl}.*`)
      }
    }

    const primary  = tableNodes[0]!
    const primaryT = tableName(primary)
    const primaryA = alias(primary)
    const useAlias = primaryA !== primaryT

    let sql = `SELECT\n${selectCols.join(',\n')}\nFROM ${primaryT}${useAlias ? ` AS ${primaryA}` : ''}`

    // JOINs
    for (const e of edges) {
      const srcNode = tableNodes.find((n: Node) => n.id === e.source)
      const tgtNode = tableNodes.find((n: Node) => n.id === e.target)
      if (!srcNode || !tgtNode) continue

      const tgtT = tableName(tgtNode)
      const tgtA = alias(tgtNode)
      const srcA = alias(srcNode)
      const jt   = e.data?.joinType ?? 'LEFT JOIN'

      const mappings = e.data?.mappings
      const onClause = mappings?.length
        ? mappings.map((m: any) =>
            `${tgtA}.${m.target} ${m.operator || '='} ${srcA}.${m.source}`
          ).join(' AND ')
        : `${tgtA}.id = ${srcA}.${tgtT}_id`

      const aliasClause = tgtA !== tgtT ? ` AS ${tgtA}` : ''
      sql += `\n  ${jt} ${tgtT}${aliasClause} ON ${onClause}`
    }

    // WHERE from table filters
    const whereClauses = buildTableFilters(tableNodes)
    if (whereClauses.length) sql += `\nWHERE ${whereClauses.join('\n  AND ')}`

    return sql
  }

  // ── Named CTE tool block ──────────────────────────────────────────────
  function buildCteToolBlock(node: Node, upstream: string): string {
    const selectedCols = (node.data.selectedCols ?? []) as string[]
    const conditions   = (node.data.conditions  ?? []).filter((c: any) => c.column && c.operator)

    const selectPart = selectedCols.length
      ? selectedCols.map(c => `  ${c}`).join(',\n')
      : '  *'

    let sql = `SELECT\n${selectPart}\nFROM ${upstream}`

    if (conditions.length) {
      const whereClauses = conditions.map((c: any) => {
        if (c.operator === 'IS NULL')     return `${c.column} IS NULL`
        if (c.operator === 'IS NOT NULL') return `${c.column} IS NOT NULL`
        if (c.operator === 'LIKE')        return `${c.column} LIKE N'${c.value}'`
        if (c.operator === 'IN')          return `${c.column} IN (${c.value})`
        return `${c.column} ${c.operator} '${c.value}'`
      })
      sql += `\nWHERE ${whereClauses.join('\n  AND ')}`
    }

    return sql
  }

  // ── CTE Frame block: JOIN from child tables + optional col/filter ────
  function buildCteFrameBlock(frame: Node, childTables: Node[], childEdges: Edge[]): string {
    if (!childTables.length) return 'SELECT 1 -- no tables in frame'

    // Build the JOIN part (reuse buildJoinBlock)
    let sql = buildJoinBlock(childTables, childEdges)

    // Apply selectedCols override
    const selectedCols = ((frame.data as any).selectedCols ?? []) as string[]
    if (selectedCols.length) {
      // Replace SELECT * / SELECT cols with explicit cols
      sql = sql.replace(/^SELECT\n[\s\S]*?\nFROM/, `SELECT\n${selectedCols.map(c => `  ${c}`).join(',\n')}\nFROM`)
    }

    // Append WHERE conditions
    const conditions = ((frame.data as any).conditions ?? []).filter((c: any) => c.column && c.operator)
    if (conditions.length) {
      const whereClauses = conditions.map((c: any) => {
        if (c.operator === 'IS NULL')     return `${c.column} IS NULL`
        if (c.operator === 'IS NOT NULL') return `${c.column} IS NOT NULL`
        if (c.operator === 'LIKE')        return `${c.column} LIKE N'${c.value}'`
        if (c.operator === 'IN')          return `${c.column} IN (${c.value})`
        return `${c.column} ${c.operator} '${c.value}'`
      })
      // Append or merge WHERE
      if (sql.includes('\nWHERE ')) {
        sql += `\n  AND ${whereClauses.join('\n  AND ')}`
      } else {
        sql += `\nWHERE ${whereClauses.join('\n  AND ')}`
      }
    }

    return sql
  }

  // ── WHERE CTE block ───────────────────────────────────────────────────
  function buildWhereBlock(node: Node, upstream: string): string {
    const conds = (node.data.conditions ?? []).filter((c: any) => c.column && c.operator)
    if (!conds.length) return `SELECT * FROM ${upstream}`
    const clauses = conds.map((c: any) =>
      ['IS NULL', 'IS NOT NULL'].includes(c.operator)
        ? `${c.column} ${c.operator}`
        : `${c.column} ${c.operator} '${escapeSQL(c.value)}'`
    )
    return `SELECT *\nFROM ${upstream}\nWHERE ${clauses.join('\n  AND ')}`
  }

  // ── GROUP BY CTE block ────────────────────────────────────────────────
  function buildGroupBlock(node: Node, upstream: string): string {
    const groupCols = (node.data.groupCols ?? []).filter(Boolean) as string[]
    const aggs      = (node.data.aggs ?? []).filter((a: any) => a.col && a.func)

    if (!groupCols.length && !aggs.length) return `SELECT * FROM ${upstream}`

    const selectParts = [
      ...groupCols.map((c: string) => `  ${c}`),
      ...aggs.map((a: any) => {
        const fn = a.func === 'COUNT DISTINCT'
          ? `COUNT(DISTINCT ${a.col})`
          : `${a.func}(${a.col})`
        return a.alias ? `  ${fn} AS ${a.alias}` : `  ${fn}`
      }),
    ]

    let sql = `SELECT\n${selectParts.join(',\n')}\nFROM ${upstream}`
    if (groupCols.length) sql += `\nGROUP BY ${groupCols.join(', ')}`

    // HAVING from agg filters
    const having = (node.data.filters ?? [])
      .filter((f: any) => f.column && f.operator)
      .map((f: any) => `${f.column} ${f.operator} ${f.value}`)
    if (having.length) sql += `\nHAVING ${having.join('\n  AND ')}`

    return sql
  }

  // ── CALC CTE block ────────────────────────────────────────────────────
  function buildCalcBlock(node: Node, upstream: string): string {
    const items = (node.data.items ?? []).filter((c: any) => c.col && c.op)
    if (!items.length) return `SELECT * FROM ${upstream}`
    const exprs = items.map((c: any) => {
      const expr = calcExpr(c.op, c.col, c.value ?? '')
      const as = c.alias || `${c.col}_calc`
      return `  (${expr}) AS ${as}`
    })
    let sql = `SELECT *,\n${exprs.join(',\n')}\nFROM ${upstream}`
    const filters = (node.data.filters ?? []).filter((f: any) => f.column && f.operator)
    if (filters.length) {
      const clauses = filters.map((f: any) =>
        ['IS NULL', 'IS NOT NULL'].includes(f.operator)
          ? `${f.column} ${f.operator}`
          : `${f.column} ${f.operator} '${escapeSQL(f.value)}'`
      )
      sql += `\nWHERE ${clauses.join('\n  AND ')}`
    }
    return sql
  }

  function calcExpr(op: string, col: string, val: string): string {
    switch (op) {
      case 'multiply': return `${col} * ${val || '1'}`
      case 'add':      return `${col} + ${val || '0'}`
      case 'subtract': return `${col} - ${val || '0'}`
      case 'divide':   return `${col} / ${val || '1'}`
      case 'isnull':   return `ISNULL(${col}, ${val || '0'})`
      case 'coalesce': return `COALESCE(${col}, ${val || '0'})`
      case 'cast_int': return `CAST(${col} AS INT)`
      case 'cast_text':return `CAST(${col} AS NVARCHAR(255))`
      case 'cast_dec': return `CAST(${col} AS DECIMAL(18,2))`
      case 'upper':    return `UPPER(${col})`
      case 'lower':    return `LOWER(${col})`
      case 'trim':     return `LTRIM(RTRIM(${col}))`
      case 'year':     return `YEAR(${col})`
      case 'month':    return `MONTH(${col})`
      case 'day':      return `DAY(${col})`
      default:         return col
    }
  }

  // ── UNION CTE block ───────────────────────────────────────────────────
  function buildUnionBlock(node: Node, upstreamNames: string[]): string {
    const uType = node.data.unionType ?? 'UNION ALL'
    const selectedCols = (node.data.selectedCols ?? []).filter(Boolean) as string[]
    const colSelect = selectedCols.length
      ? `SELECT\n  ${selectedCols.join(',\n  ')}`
      : 'SELECT *'
    const parts = upstreamNames.map(name => `${colSelect}\nFROM ${name}`)
    if (parts.length === 0) return `SELECT * FROM ${upstreamNames[0] ?? '_src'}`

    const unionSql = parts.join(`\n${uType}\n`)

    // Optional WHERE filter — wrap in subquery
    const conditions = (node.data.conditions ?? []).filter((c: any) => c.column && c.operator)
    if (!conditions.length) return unionSql

    const whereClauses = conditions.map((c: any) => {
      if (c.operator === 'IS NULL')     return `${c.column} IS NULL`
      if (c.operator === 'IS NOT NULL') return `${c.column} IS NOT NULL`
      if (c.operator === 'LIKE')        return `${c.column} LIKE N'${c.value}'`
      if (c.operator === 'IN')          return `${c.column} IN (${c.value})`
      return `${c.column} ${c.operator} '${escapeSQL(c.value)}'`
    })

    return `SELECT * FROM (\n${indent(unionSql)}\n) _u\nWHERE ${whereClauses.join('\n  AND ')}`
  }

  // ── Table-level filters ───────────────────────────────────────────────
  function buildTableFilters(tableNodes: Node[]): string[] {
    const clauses: string[] = []
    for (const tn of tableNodes) {
      const filters = tn.data.filters as any[] | undefined
      if (!filters?.length) continue
      for (const f of filters) {
        if (!f.column || !f.operator) continue
        if (['IS NULL', 'IS NOT NULL'].includes(f.operator)) {
          clauses.push(`${f.column} ${f.operator}`)
        } else {
          const val = f.type === 'int' ? f.value : `'${escapeSQL(f.value)}'`
          clauses.push(`${f.column} ${f.operator} ${val}`)
        }
      }
    }
    return clauses
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  function tableName(n: Node): string { return n.data.tableName ?? n.data.label ?? '' }
  function alias(n: Node): string     { return tableName(n) }  // can extend to t1/t2 aliases
  function escapeSQL(v: string): string { return String(v ?? '').replace(/'/g, "''") }
  function indent(sql: string): string  { return sql.split('\n').map(l => `    ${l}`).join('\n') }
  function sanitizeCteName(name: string): string {
    return name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').replace(/^([0-9])/, '_$1') || 'cte_group'
  }

  function copySQL() {
    navigator.clipboard.writeText(store.generatedSQL)
  }

  return { generateSQL, copySQL }
}
