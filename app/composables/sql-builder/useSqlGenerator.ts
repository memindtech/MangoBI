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
    // Track output column names per CTE name (for union intersection)
    const cteOutputCols = new Map<string, string[]>()

    const ctes: { name: string; sql: string }[] = []
    const usedNames = new Set<string>()   // guard against duplicate CTE names
    let cteIdx    = 0
    let sortOrder = ''
    let lastCTE   = ''

    // ── Unique name helper ───────────────────────────────────────────────
    function uniqueName(base: string): string {
      if (!usedNames.has(base)) { usedNames.add(base); return base }
      let i = 2
      while (usedNames.has(`${base}_${i}`)) i++
      const name = `${base}_${i}`
      usedNames.add(name)
      return name
    }

    function nextCteIdx(): string {
      return uniqueName(`_cte${++cteIdx}`)
    }

    // ── Compute output column names for a set of table nodes ─────────────
    function computeOutputCols(tNodes: Node[], tEdges: Edge[]): string[] {
      const primary = tNodes[0]
      if (!primary) return []
      const joinedIds = new Set<string>([primary.id])
      for (const e of tEdges) {
        if (tNodes.some(n => n.id === e.source) && tNodes.some(n => n.id === e.target)) {
          joinedIds.add(e.source); joinedIds.add(e.target)
        }
      }
      const cols: string[] = []
      const used = new Set<string>()
      for (const tn of tNodes) {
        if (!joinedIds.has(tn.id)) continue
        const tbl     = alias(tn)
        const visible = tn.data.visibleCols as VisibleCol[] | undefined
        if (visible?.length) {
          for (const col of visible) {
            const outName = col.alias || col.name
            if (col.alias) {
              cols.push(col.alias); used.add(col.alias)
            } else if (used.has(col.name)) {
              let a = `${tbl}_${col.name}`; let i = 2
              while (used.has(a)) a = `${tbl}_${col.name}_${i++}`
              cols.push(a); used.add(a)
            } else {
              cols.push(col.name); used.add(col.name)
            }
          }
        }
        // wildcard → unknown cols, skip
      }
      return cols
    }

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
      const rawName  = (frame.data as any).name
        ? sanitizeCteName((frame.data as any).name)
        : `_cte${++cteIdx}`
      const frameName = uniqueName(rawName)
      const frameSql  = buildCteFrameBlock(frame, childTables, childEdges)
      ctes.push({ name: frameName, sql: frameSql })
      nodeOutput.set(frame.id, frameName)
      lastCTE = frameName
      // Track output cols: selectedCols override takes priority
      const frameSelected = ((frame.data as any).selectedCols ?? []) as string[]
      cteOutputCols.set(frameName, frameSelected.length ? frameSelected : computeOutputCols(childTables, childEdges))
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
      const baseName = uniqueName('_src')
      const baseSQL  = buildJoinBlock(standaloneTables, tableEdges)
      ctes.push({ name: baseName, sql: baseSQL })
      for (const tn of standaloneTables) nodeOutput.set(tn.id, baseName)
      if (!lastCTE) lastCTE = baseName
      cteOutputCols.set(baseName, computeOutputCols(standaloneTables, tableEdges))
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
        ? uniqueName(sanitizeCteName(node.data.name))
        : nextCteIdx()

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
          cteSql = buildUnionBlock(node, allUpNames, cteOutputCols)
          break
        }
      }

      if (cteSql) {
        ctes.push({ name: cteName, sql: cteSql })
        nodeOutput.set(node.id, cteName)
        lastCTE = cteName
        // Track output cols for this CTE
        if (nt === 'union') {
          // union output = the cols actually used (intersection computed inside buildUnionBlock)
          const unionSelected = (node.data.selectedCols ?? []).filter(Boolean) as string[]
          if (unionSelected.length) {
            cteOutputCols.set(cteName, unionSelected)
          } else {
            // compute intersection of upstreams
            const upNames = upIds.map(id => nodeOutput.get(id)).filter((n): n is string => !!n)
            const sets = upNames.map(n => cteOutputCols.get(n) ?? [])
            const common = sets.length ? sets.reduce((a, b) => a.filter(c => b.includes(c))) : []
            cteOutputCols.set(cteName, common)
          }
        } else if (nt === 'cte' || nt === 'where' || nt === 'calc') {
          const sel = (node.data.selectedCols ?? []).filter(Boolean) as string[]
          cteOutputCols.set(cteName, sel.length ? sel : (cteOutputCols.get(upName) ?? []))
        } else if (nt === 'group') {
          const grpCols = (node.data.groupCols ?? []).filter(Boolean) as string[]
          const aggAliases = (node.data.aggs ?? []).filter((a: any) => a.col && a.func)
            .map((a: any) => a.alias || `${a.func}_${a.col}`)
          cteOutputCols.set(cteName, [...grpCols, ...aggAliases])
        }
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

    // ── Fix 1: Smart primary selection ──────────────────────────────────
    // Priority: isHeaderNode (H) → node with no incoming edges (root) → [0]
    const nodeIds = new Set(tableNodes.map(n => n.id))
    const hasIncoming = new Set(edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target)).map(e => e.target))
    const primary = tableNodes.find(n => n.data?.isHeaderNode)
      ?? tableNodes.find(n => !hasIncoming.has(n.id))
      ?? tableNodes[0]!
    const primaryT = tableName(primary)
    const primaryA = alias(primary)

    // ── Fix 2: Topological sort edges (BFS from primary) ────────────────
    // Build adjacency: nodeId → outgoing edges
    const adjEdges = new Map<string, Edge[]>()
    for (const n of tableNodes) adjEdges.set(n.id, [])
    for (const e of edges) {
      if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
        adjEdges.get(e.source)?.push(e)
      }
    }
    // BFS from primary to get edges in join-safe order
    const sortedEdges: Edge[] = []
    const visited = new Set<string>([primary.id])
    const queue   = [primary.id]
    while (queue.length) {
      const cur = queue.shift()!
      for (const e of (adjEdges.get(cur) ?? [])) {
        sortedEdges.push(e)
        if (!visited.has(e.target)) {
          visited.add(e.target)
          queue.push(e.target)
        }
      }
    }
    // Append any edges not reachable from primary (disconnected subgraph)
    for (const e of edges) {
      if (nodeIds.has(e.source) && nodeIds.has(e.target) && !sortedEdges.includes(e)) {
        sortedEdges.push(e)
      }
    }

    // ── Joined table IDs (for SELECT column filtering) ───────────────────
    const joinedTableIds = new Set<string>([primary.id])
    for (const e of sortedEdges) {
      joinedTableIds.add(e.source)
      joinedTableIds.add(e.target)
    }

    // ── SELECT columns (in topological node order) ───────────────────────
    const selectCols: string[] = []
    const usedOutputNames = new Set<string>()

    // Order SELECT by BFS visit order (primary first, then its children)
    const orderedNodes = [primary, ...sortedEdges
      .map(e => tableNodes.find(n => n.id === e.target)!)
      .filter((n, i, arr) => n && arr.indexOf(n) === i)  // deduplicate
    ]
    for (const tn of orderedNodes) {
      if (!tn || !joinedTableIds.has(tn.id)) continue
      const tbl     = alias(tn)
      const visible = tn.data.visibleCols as VisibleCol[] | undefined
      if (visible?.length) {
        for (const col of visible) {
          if (col.alias) {
            selectCols.push(`  ${tbl}.${col.name} AS ${col.alias}`)
            usedOutputNames.add(col.alias)
          } else if (usedOutputNames.has(col.name)) {
            let aliasName = `${tbl}_${col.name}`
            let idx = 2
            while (usedOutputNames.has(aliasName)) aliasName = `${tbl}_${col.name}_${idx++}`
            selectCols.push(`  ${tbl}.${col.name} AS ${aliasName}`)
            usedOutputNames.add(aliasName)
          } else {
            selectCols.push(`  ${tbl}.${col.name}`)
            usedOutputNames.add(col.name)
          }
        }
      } else {
        selectCols.push(`  ${tbl}.*`)
      }
    }

    const useAlias = primaryA !== primaryT
    let sql = `SELECT\n${selectCols.join(',\n')}\nFROM ${primaryT}${useAlias ? ` AS ${primaryA}` : ''}`

    // ── JOINs in topological order ────────────────────────────────────────
    for (const e of sortedEdges) {
      const srcNode = tableNodes.find((n: Node) => n.id === e.source)
      const tgtNode = tableNodes.find((n: Node) => n.id === e.target)
      if (!srcNode || !tgtNode) continue

      const tgtT = tableName(tgtNode)
      const tgtA = alias(tgtNode)
      const srcA = alias(srcNode)
      const jt   = e.data?.joinType ?? 'LEFT JOIN'

      const userMappings = (e.data?.mappings ?? []).filter((m: any) => m.source && m.target)
      let onClause: string
      if (userMappings.length) {
        onClause = userMappings.map((m: any) =>
          `${tgtA}.${m.target} ${m.operator || '='} ${srcA}.${m.source}`
        ).join(' AND ')
      } else {
        // Auto-detect from common column names (details first, fall back to visibleCols)
        const srcDetails  = (srcNode.data.details ?? []) as any[]
        const tgtDetails  = (tgtNode.data.details ?? []) as any[]
        const srcColNames = srcDetails.length
          ? srcDetails.map((c: any) => c.column_name)
          : ((srcNode.data.visibleCols ?? []) as any[]).map((c: any) => c.name)
        const tgtColNames = tgtDetails.length
          ? tgtDetails.map((c: any) => c.column_name)
          : ((tgtNode.data.visibleCols ?? []) as any[]).map((c: any) => c.name)
        const tgtNames = new Set(tgtColNames)
        const autoMaps = srcColNames.filter((name: string) => tgtNames.has(name))
        onClause = autoMaps.length
          ? autoMaps.map((name: string) => `${tgtA}.${name} = ${srcA}.${name}`).join(' AND ')
          : `/* TODO: กำหนด JOIN mapping สำหรับ ${tgtT} */ 1=1`
      }

      const aliasClause = tgtA !== tgtT ? ` AS ${tgtA}` : ''
      sql += `\n  ${jt} ${tgtT}${aliasClause} ON ${onClause}`
    }

    // WHERE from table filters (only joined tables)
    const whereClauses = buildTableFilters(tableNodes.filter(n => joinedTableIds.has(n.id)))
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

    // Build column → table alias map for qualifying selected cols
    function buildColTableMap(tables: Node[]): Map<string, string> {
      const map = new Map<string, string>()
      for (const tn of tables) {
        const tbl     = alias(tn)
        const details = (tn.data.details ?? []) as any[]
        const visible = (tn.data.visibleCols ?? []) as any[]
        const cols    = details.length
          ? details.map((c: any) => c.column_name)
          : visible.map((c: any) => c.name)
        for (const col of cols) {
          if (!map.has(col)) map.set(col, tbl)
        }
      }
      return map
    }

    // Build the JOIN part (reuse buildJoinBlock)
    let sql = buildJoinBlock(childTables, childEdges)

    // Apply selectedCols override — qualify each col with table prefix to avoid ambiguity
    const selectedCols = ((frame.data as any).selectedCols ?? []) as string[]
    if (selectedCols.length) {
      const colTableMap = buildColTableMap(childTables)
      const qualifiedCols = selectedCols.map(c => {
        const tbl = colTableMap.get(c)
        return tbl ? `  ${tbl}.${c}` : `  ${c}`
      })
      sql = sql.replace(/^SELECT\n[\s\S]*?\nFROM/, `SELECT\n${qualifiedCols.join(',\n')}\nFROM`)
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
  function buildUnionBlock(node: Node, upstreamNames: string[], cteOutputCols?: Map<string, string[]>): string {
    const uType = node.data.unionType ?? 'UNION ALL'
    const selectedCols = (node.data.selectedCols ?? []).filter(Boolean) as string[]

    // Auto-intersect: find common columns across all upstreams when no user selection
    let effectiveCols = selectedCols
    if (!effectiveCols.length && cteOutputCols) {
      const sets = upstreamNames.map(n => cteOutputCols.get(n) ?? [])
      const allHaveCols = sets.every(s => s.length > 0)
      if (allHaveCols) {
        effectiveCols = sets.reduce((a, b) => a.filter(c => b.includes(c)))
      }
    }

    const colSelect = effectiveCols.length
      ? `SELECT\n  ${effectiveCols.join(',\n  ')}`
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
