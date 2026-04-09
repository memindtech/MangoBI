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
    store.generatedSQL = buildCTESQL(nodes, edges, tableNodes, cteFrameNodes)
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
    tableNodes: Node[], cteFrameNodes: Node[],
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
    // Must mirror buildJoinBlock's primary selection + BFS order exactly so that
    // auto-aliased duplicate column names (e.g. tbl_id) match the actual SELECT output.
    function computeOutputCols(tNodes: Node[], tEdges: Edge[]): string[] {
      if (!tNodes.length) return []

      // Same smart primary selection as buildJoinBlock
      const nodeIds = new Set(tNodes.map(n => n.id))
      const hasIncoming = new Set(
        tEdges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target)).map(e => e.target)
      )
      const primary = tNodes.find(n => n.data?.isHeaderNode)
        ?? tNodes.find(n => !hasIncoming.has(n.id))
        ?? tNodes[0]!

      // BFS from primary → same orderedNodes as buildJoinBlock
      const adjMap = new Map<string, string[]>()
      for (const n of tNodes) adjMap.set(n.id, [])
      for (const e of tEdges) {
        if (nodeIds.has(e.source) && nodeIds.has(e.target))
          adjMap.get(e.source)?.push(e.target)
      }
      const visited = new Set<string>([primary.id])
      const queue   = [primary.id]
      const orderedNodes: Node[] = [primary]
      while (queue.length) {
        const cur = queue.shift()!
        for (const tgtId of (adjMap.get(cur) ?? [])) {
          if (!visited.has(tgtId)) {
            visited.add(tgtId)
            queue.push(tgtId)
            const n = tNodes.find(n => n.id === tgtId)
            if (n) orderedNodes.push(n)
          }
        }
      }
      for (const n of tNodes) {
        if (!visited.has(n.id)) orderedNodes.push(n)  // disconnected nodes last
      }

      const cols: string[] = []
      const used = new Set<string>()
      for (const tn of orderedNodes) {
        const tbl     = alias(tn)
        const visible = tn.data.visibleCols as VisibleCol[] | undefined
        if (visible?.length) {
          for (const col of visible) {
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

    // ── Step 1b: table nodes NOT inside any cteFrame → one _src per connected component ──
    // Tables connected by JOIN edges share one CTE; isolated tables (e.g. separate UNION inputs)
    // each get their own _src CTE so that UNION can reference distinct upstreams.
    const standaloneTables = tableNodes.filter((n: Node) => !framedTableIds.has(n.id))
    if (standaloneTables.length) {
      const tableEdges = edges.filter(e => {
        const s = nodes.find((n: Node) => n.id === e.source)
        const t = nodes.find((n: Node) => n.id === e.target)
        return s?.type === 'sqlTable' && t?.type === 'sqlTable'
          && standaloneTables.some(x => x.id === e.source)
          && standaloneTables.some(x => x.id === e.target)
      })

      // Build undirected adjacency for component detection
      const adjComp = new Map<string, Set<string>>()
      for (const n of standaloneTables) adjComp.set(n.id, new Set())
      for (const e of tableEdges) {
        adjComp.get(e.source)?.add(e.target)
        adjComp.get(e.target)?.add(e.source)
      }

      // BFS to find each connected component
      const assigned = new Set<string>()
      const components: Node[][] = []
      for (const n of standaloneTables) {
        if (assigned.has(n.id)) continue
        const comp: Node[] = []
        const q = [n.id]
        assigned.add(n.id)
        while (q.length) {
          const cur = q.shift()!
          const curNode = standaloneTables.find(x => x.id === cur)
          if (curNode) comp.push(curNode)
          for (const nb of (adjComp.get(cur) ?? [])) {
            if (!assigned.has(nb)) { assigned.add(nb); q.push(nb) }
          }
        }
        components.push(comp)
      }

      // Create one _src CTE per component (_src, _src_2, _src_3, …)
      for (const comp of components) {
        const compEdges = tableEdges.filter(e =>
          comp.some(n => n.id === e.source) && comp.some(n => n.id === e.target)
        )
        const baseName = uniqueName('_src')
        const baseSQL  = buildJoinBlock(comp, compEdges)
        ctes.push({ name: baseName, sql: baseSQL })
        for (const tn of comp) nodeOutput.set(tn.id, baseName)
        if (!lastCTE) lastCTE = baseName
        cteOutputCols.set(baseName, computeOutputCols(comp, compEdges))
      }
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
          const upPairs = upIds
            .map(id => ({ id, name: nodeOutput.get(id) ?? '' }))
            .filter(p => p.name)
          if (!upPairs.length) upPairs.push({ id: '', name: lastCTE })
          cteSql = buildUnionBlock(node, upPairs, cteOutputCols)
          break
        }
      }

      if (cteSql) {
        ctes.push({ name: cteName, sql: cteSql })
        nodeOutput.set(node.id, cteName)
        lastCTE = cteName
        // Track output cols for this CTE
        if (nt === 'union') {
          // union output = union of all per-source selections, or global, or intersection
          const colsMap = (node.data.selectedColsMap ?? {}) as Record<string, string[]>
          const perSourceCols = [...new Set(Object.values(colsMap).flat().filter(Boolean))]
          const globalSel = (node.data.selectedCols ?? []).filter(Boolean) as string[]
          if (perSourceCols.length) {
            cteOutputCols.set(cteName, perSourceCols)
          } else if (globalSel.length) {
            cteOutputCols.set(cteName, globalSel)
          } else {
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
    const withBlock  = ctes.map(c => `  ${c.name} AS (\n${indent(c.sql)}\n  )`).join(',\n\n')
    const orderClause = sortOrder ? `\nORDER BY ${sortOrder}` : ''
    return `WITH\n${withBlock}\n\nSELECT\n  *\nFROM ${lastCTE}${orderClause}`
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
        // No visibleCols — try details metadata to generate explicit cols (avoid ambiguous * when joining)
        const details = tn.data.details as any[] | undefined
        if (details?.length) {
          for (const col of details) {
            const colName: string = col.column_name
            if (usedOutputNames.has(colName)) {
              let aliasName = `${tbl}_${colName}`
              let idx = 2
              while (usedOutputNames.has(aliasName)) aliasName = `${tbl}_${colName}_${idx++}`
              selectCols.push(`  ${tbl}.${colName} AS ${aliasName}`)
              usedOutputNames.add(aliasName)
            } else {
              selectCols.push(`  ${tbl}.${colName}`)
              usedOutputNames.add(colName)
            }
          }
        } else {
          // No metadata at all — fall back to wildcard (may cause ambiguity if cols overlap)
          selectCols.push(`  ${tbl}.*`)
        }
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
      if (jt === 'CROSS JOIN') {
        sql += `\n  CROSS JOIN ${tgtT}${aliasClause}`
      } else {
        sql += `\n  ${jt} ${tgtT}${aliasClause} ON ${onClause}`
      }
    }

    // WHERE from table filters (only joined tables)
    const whereClauses = buildTableFilters(tableNodes.filter(n => joinedTableIds.has(n.id)))
    if (whereClauses.length) sql += `\nWHERE ${whereClauses.join('\n  AND ')}`

    return sql
  }

  // ── Named CTE tool block ──────────────────────────────────────────────
  function buildCteToolBlock(node: Node, upstream: string): string {
    const rawCols    = (node.data.selectedCols ?? []) as string[]
    const conditions = (node.data.conditions  ?? []).filter((c: any) => c.column && c.operator)

    // selectedCols may be "tableName.colName" (from CTE frame picker) — strip prefix
    // when referencing the upstream CTE (which already resolved the real column names).
    // Also build the output column name: if there was a dot (qualified), keep original col name
    // unless it's a duplicate, then use the stored alias from the frame's auto-aliasing.
    const selectParts: string[] = []
    if (rawCols.length) {
      const usedAliases = new Set<string>()
      for (const raw of rawCols) {
        const dotIdx = raw.indexOf('.')
        if (dotIdx > -1) {
          // qualified: "tableName.colName" → in CTE context, just "colName" (frame already aliased dups)
          const colName = raw.slice(dotIdx + 1)
          selectParts.push(`  ${colName}`)
          usedAliases.add(colName)
        } else {
          selectParts.push(`  ${raw}`)
          usedAliases.add(raw)
        }
      }
    }

    const selectPart = selectParts.length ? selectParts.join(',\n') : '  *'
    let sql = `SELECT\n${selectPart}\nFROM ${upstream}`

    if (conditions.length) {
      // Strip table prefix from condition columns too — we're querying an upstream CTE
      const normConds = conditions.map((c: any) => {
        const col = String(c.column ?? '')
        const normCol = col.includes('.') ? col.slice(col.indexOf('.') + 1) : col
        return { ...c, column: normCol }
      })
      sql += `\nWHERE ${normConds.map(formatCondClause).join('\n  AND ')}`
    }

    return sql
  }

  // ── CTE Frame block: JOIN from child tables + optional col/filter ────
  function buildCteFrameBlock(frame: Node, childTables: Node[], childEdges: Edge[]): string {
    if (!childTables.length) return 'SELECT NULL AS _empty_frame -- ไม่มี Table ในกรอบ CTE นี้'

    // ── Build BFS-ordered node list starting from header ─────────────────
    const nodeIds  = new Set(childTables.map(n => n.id))
    const hasIncoming = new Set(
      childEdges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target)).map(e => e.target)
    )
    const header = childTables.find(n => n.data?.isHeaderNode)
      ?? childTables.find(n => !hasIncoming.has(n.id))
      ?? childTables[0]!

    const adjBfs = new Map<string, string[]>()
    for (const n of childTables) adjBfs.set(n.id, [])
    for (const e of childEdges) {
      if (nodeIds.has(e.source) && nodeIds.has(e.target))
        adjBfs.get(e.source)?.push(e.target)
    }
    const visitedBfs = new Set<string>([header.id])
    const qBfs = [header.id]
    const orderedNodes: Node[] = [header]
    while (qBfs.length) {
      const cur = qBfs.shift()!
      for (const tgtId of (adjBfs.get(cur) ?? [])) {
        if (!visitedBfs.has(tgtId)) {
          visitedBfs.add(tgtId)
          qBfs.push(tgtId)
          const n = childTables.find(x => x.id === tgtId)
          if (n) orderedNodes.push(n)
        }
      }
    }
    for (const n of childTables) if (!visitedBfs.has(n.id)) orderedNodes.push(n)

    // ── Build col → table map in header-first BFS order ───────────────────
    // Maps raw column name to the FIRST (header-priority) table that has it.
    function buildColTableMap(): Map<string, string> {
      const map = new Map<string, string>()
      for (const tn of orderedNodes) {
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

    // Build the JOIN SQL
    let sql = buildJoinBlock(childTables, childEdges)

    // ── Apply selectedCols override ───────────────────────────────────────
    // selectedCols may be stored as "tableName.colName" (qualified) or plain "colName" (legacy).
    const selectedCols = ((frame.data as any).selectedCols ?? []) as string[]
    if (selectedCols.length) {
      const colTableMap = buildColTableMap()
      const qualifiedCols = selectedCols.map(c => {
        if (c.includes('.')) {
          // Already qualified — use as-is: "table.col" → "  table.col"
          return `  ${c}`
        }
        const tbl = colTableMap.get(c)
        return tbl ? `  ${tbl}.${c}` : `  ${c}`
      })
      // Replace SELECT … FROM with the user-chosen columns
      sql = sql.replace(/^SELECT\n[\s\S]*?\nFROM /, `SELECT\n${qualifiedCols.join(',\n')}\nFROM `)
    }

    // ── Append WHERE conditions (qualify column names) ────────────────────
    const conditions = ((frame.data as any).conditions ?? []).filter((c: any) => c.column && c.operator)
    if (conditions.length) {
      const colTableMap = buildColTableMap()
      const whereClauses = conditions.map((c: any) => {
        let col = c.column as string
        if (!col.includes('.')) {
          const tbl = colTableMap.get(col)
          if (tbl) col = `${tbl}.${col}`
        }
        return formatCondClause({ ...c, column: col })
      })
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
    return `SELECT *\nFROM ${upstream}\nWHERE ${conds.map(formatCondClause).join('\n  AND ')}`
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
      .map(formatCondClause)
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
      sql += `\nWHERE ${filters.map(formatCondClause).join('\n  AND ')}`
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
  function buildUnionBlock(
    node: Node,
    upstreams: { id: string; name: string }[],
    cteOutputCols?: Map<string, string[]>,
  ): string {
    const uType        = node.data.unionType ?? 'UNION ALL'
    const colsMap      = (node.data.selectedColsMap ?? {}) as Record<string, string[]>
    const globalCols   = (node.data.selectedCols ?? []).filter(Boolean) as string[]
    const upstreamNames = upstreams.map(u => u.name)

    // Auto-intersect fallback (used when neither per-source nor global cols set)
    let autoIntersect: string[] = []
    if (cteOutputCols) {
      const sets = upstreamNames.map(n => cteOutputCols.get(n) ?? [])
      if (sets.every(s => s.length > 0))
        autoIntersect = sets.reduce((a, b) => a.filter(c => b.includes(c)))
    }

    // Build each UNION arm with its own column list
    const parts = upstreams.map(({ id, name }) => {
      const srcCols = id ? (colsMap[id] ?? []).filter(Boolean) : []
      const effectiveCols = srcCols.length ? srcCols
        : globalCols.length               ? globalCols
        : autoIntersect
      const colSelect = effectiveCols.length
        ? `SELECT\n  ${effectiveCols.join(',\n  ')}`
        : 'SELECT *'
      return `${colSelect}\nFROM ${name}`
    })
    if (parts.length === 0) return `SELECT * FROM ${upstreamNames[0] ?? '_src'}`

    const unionSql = parts.join(`\n${uType}\n`)

    // Optional WHERE filter — wrap in subquery
    const conditions = (node.data.conditions ?? []).filter((c: any) => c.column && c.operator)
    if (!conditions.length) return unionSql

    return `SELECT * FROM (\n${indent(unionSql)}\n) _u\nWHERE ${conditions.map(formatCondClause).join('\n  AND ')}`
  }

  // ── Table-level filters ───────────────────────────────────────────────
  // Always qualify column with table alias to avoid ambiguity when multiple
  // tables in a JOIN share the same column name (SQL Server error 209).
  function buildTableFilters(tableNodes: Node[]): string[] {
    const clauses: string[] = []
    for (const tn of tableNodes) {
      const filters = tn.data.filters as any[] | undefined
      if (!filters?.length) continue
      const tbl = alias(tn)   // table name / alias used in FROM clause
      // Build column→raw-type lookup from details (authoritative schema)
      const details = (tn.data.details ?? []) as any[]
      const rawTypeOf = new Map<string, string>()
      for (const d of details) rawTypeOf.set(d.column_name, d.column_type ?? d.data_type ?? '')

      for (const f of filters) {
        if (!f.column || !f.operator) continue
        // Prefer raw DB type (from details) over stored f.type which may be stale
        const rawType = rawTypeOf.get(f.column) || f.type || ''
        clauses.push(formatCondClause({
          column: `${tbl}.${f.column}`,
          operator: f.operator,
          value: f.value,
          colType: rawType,
        }))
      }
    }
    return clauses
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  function tableName(n: Node): string { return n.data.tableName ?? n.data.label ?? '' }
  function alias(n: Node): string     { return tableName(n) }  // can extend to t1/t2 aliases
  function escapeSQL(v: string): string { return String(v ?? '').replace(/'/g, "''") }
  function indent(sql: string): string  { return sql.split('\n').map(l => `    ${l}`).join('\n') }

  // ── Shared condition clause formatter ─────────────────────────────────
  // Handles IS NULL, IS NOT NULL, LIKE (N'...'), IN (...), and smart numeric quoting.
  // colType (e.g. 'int', 'decimal') → no quotes for numeric types.
  // Falls back to regex detection when colType is unknown.
  const NUMERIC_TYPES = /^(int|integer|bigint|smallint|tinyint|decimal|numeric|float|double|real|money|smallmoney|number|bit)(\s|\(|$)/i
  const DATE_TYPES    = /^(datetime2|datetimeoffset|smalldatetime|datetime|date|time|timestamp)(\s|\(|$)/i
  const STRING_TYPES  = /^(varchar|nvarchar|char|nchar|text|ntext|xml|uniqueidentifier)/i
  function formatCondClause(c: { column: string; operator: string; value?: any; colType?: string }): string {
    const col = c.column
    const op  = c.operator
    const val = String(c.value ?? '')
    if (op === 'IS NULL')     return `${col} IS NULL`
    if (op === 'IS NOT NULL') return `${col} IS NOT NULL`
    if (op === 'LIKE')        return `${col} LIKE N'${escapeSQL(val)}'`
    if (op === 'IN')          return `${col} IN (${val})`
    const ct = c.colType ?? ''
    // Explicit numeric type → no quotes
    if (ct && NUMERIC_TYPES.test(ct))  return `${col} ${op} ${val}`
    // Explicit date/string type → always quote
    if (ct && (DATE_TYPES.test(ct) || STRING_TYPES.test(ct))) return `${col} ${op} '${escapeSQL(val)}'`
    // No type info → use regex on value: pure integer/decimal → no quotes
    return /^-?\d+(\.\d+)?$/.test(val)
      ? `${col} ${op} ${val}`
      : `${col} ${op} '${escapeSQL(val)}'`
  }
  function sanitizeCteName(name: string): string {
    return name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').replace(/^([0-9])/, '_$1') || 'cte_group'
  }

  function copySQL() {
    navigator.clipboard.writeText(store.generatedSQL)
  }

  return { generateSQL, copySQL }
}
