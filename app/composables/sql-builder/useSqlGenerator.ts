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

  // Warnings accumulated during a single generateSQL() run (cleared at the
  // start of each run). Populated by buildCTESQL / buildJoinBlock when they
  // notice a problem that would otherwise fail silently (e.g. unreachable
  // upstream CTE). Surfaced to the user via store.lastGenerationWarnings.
  const runWarnings: string[] = []
  function pushWarning(msg: string) {
    if (!runWarnings.includes(msg)) runWarnings.push(msg)
  }

  // ── Main generate function ────────────────────────────────────────────
  function generateSQL() {
    const { nodes, edges } = store

    const tableNodes     = nodes.filter((n: Node) => n.type === 'sqlTable')
    const toolNodes      = nodes.filter((n: Node) => n.type === 'toolNode')
    const cteFrameNodes  = nodes.filter((n: Node) => n.type === 'cteFrame')

    runWarnings.length = 0

    // A5: block SQL generation when any table still has a pending column-load
    // failure — user should click retry before we regenerate with stale schema.
    const failedTables = tableNodes.filter((n: Node) => n.data?.columnsLoadFailed === true)
    if (failedTables.length) {
      const names = failedTables.map((n: Node) => n.data?.label ?? n.data?.tableName ?? n.id).join(', ')
      store.generatedSQL = `-- ⚠ โหลดคอลัมน์ไม่สำเร็จ: ${names}\n-- กรุณากด "ลองใหม่" ที่ตารางนั้น ๆ ก่อนสร้าง SQL`
      store.lastGenerationWarnings = [`โหลดคอลัมน์ไม่สำเร็จ: ${names}`]
      store.sqlPanelOpen = true
      return
    }

    if (!tableNodes.length && !cteFrameNodes.length) {
      store.generatedSQL = '-- ลาก Table ลงบน Canvas ก่อน'
      store.lastGenerationWarnings = []
      store.sqlPanelOpen = true
      return
    }

    // No tool/frame nodes → simple flat SQL
    if (!toolNodes.length && !cteFrameNodes.length) {
      store.generatedSQL = buildDirectSQL(tableNodes, edges)
      store.lastGenerationWarnings = [...runWarnings]
      store.sqlPanelOpen = true
      return
    }

    // CTE pipeline
    store.generatedSQL = buildCTESQL(nodes, edges, tableNodes, cteFrameNodes)
    store.lastGenerationWarnings = [...runWarnings]
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
    // strictCols mirrors buildJoinBlock's strictCols param: skip tables with no visibleCols.
    function computeOutputCols(tNodes: Node[], tEdges: Edge[], strictCols = false): string[] {
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
      // Case-insensitive: store lowercase keys so 'DD_mango' and 'dd_mango' collide.
      const used    = new Set<string>()
      const uHas    = (n: string) => used.has(n.toLowerCase())
      const uAdd    = (n: string) => used.add(n.toLowerCase())
      for (const tn of orderedNodes) {
        const tbl     = alias(tn)
        const visible = tn.data.visibleCols as VisibleCol[] | undefined
        const details = tn.data.details     as any[]       | undefined
        if (visible?.length) {
          // explicit user-selected cols — mirror buildJoinBlock visibleCols path
          for (const col of visible) {
            if (col.alias) {
              cols.push(col.alias); uAdd(col.alias)
            } else if (uHas(col.name)) {
              let a = `${tbl}_${col.name}`; let i = 2
              while (uHas(a)) a = `${tbl}_${col.name}_${i++}`
              cols.push(a); uAdd(a)
            } else {
              cols.push(col.name); uAdd(col.name)
            }
          }
        } else if (!strictCols && details?.length) {
          // full DB metadata — mirror buildJoinBlock details path (skip in strict mode)
          for (const col of details) {
            const colName: string = col.column_name
            if (uHas(colName)) {
              let a = `${tbl}_${colName}`; let i = 2
              while (uHas(a)) a = `${tbl}_${colName}_${i++}`
              cols.push(a); uAdd(a)
            } else {
              cols.push(colName); uAdd(colName)
            }
          }
        }
        // no metadata or strictCols with no visibleCols → skip this table
      }
      return cols
    }

    // ── Bounds helper: find sqlTable nodes inside a cteFrame ────────────
    // Uses Vue Flow's measured `dimensions` when available (more accurate
    // than the hardcoded 224×160 assumption). Falls back to 112/80 half-sizes.
    // 8px tolerance on all sides so sub-pixel drag positions don't drop
    // a node out of its frame silently.
    function getFrameChildren(frame: Node): Node[] {
      const fw = parseFloat(String((frame.style as any)?.width  ?? '420'))
      const fh = parseFloat(String((frame.style as any)?.height ?? '280'))
      const fx = frame.position.x
      const fy = frame.position.y
      const TOL = 8
      return tableNodes.filter((n: Node) => {
        const dim = (n as any).dimensions as { width?: number; height?: number } | undefined
        const nw = (dim?.width  && dim.width  > 0) ? dim.width  / 2 : 112
        const nh = (dim?.height && dim.height > 0) ? dim.height / 2 : 80
        const cx = n.position.x + nw
        const cy = n.position.y + nh
        return cx >= (fx - TOL) && cx <= (fx + fw + TOL)
          && cy >= (fy - TOL) && cy <= (fy + fh + TOL)
      })
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
      // Track output cols: selectedCols override takes priority.
      // Strip "tableName." prefix and deduplicate to get the actual SQL output column names
      // (mirrors the aliasing logic in buildCteFrameBlock's selectedCols path above).
      const frameSelected = ((frame.data as any).selectedCols ?? []) as string[]
      if (frameSelected.length) {
        const usedNames = new Set<string>()
        const nHas = (n: string) => usedNames.has(n.toLowerCase())
        const nAdd = (n: string) => usedNames.add(n.toLowerCase())
        const outputCols = frameSelected.map(c => {
          const dot = c.indexOf('.')
          const tblPart = dot > -1 ? c.slice(0, dot) : ''
          const colPart = dot > -1 ? c.slice(dot + 1) : c
          if (nHas(colPart)) {
            let alias = tblPart ? `${tblPart}_${colPart}` : `${colPart}_2`
            let i = 2
            while (nHas(alias)) alias = `${tblPart ? tblPart + '_' : ''}${colPart}_${i++}`
            nAdd(alias)
            return alias
          }
          nAdd(colPart)
          return colPart
        })
        cteOutputCols.set(frameName, outputCols)
      } else {
        cteOutputCols.set(frameName, computeOutputCols(childTables, childEdges, true))
      }
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

      // Determine upstream CTE name.
      // A1: previously `nodeOutput.get(upIds[0]!) ?? lastCTE` silently
      //     fell back to the last CTE when the user's actual upstream hadn't
      //     produced a CTE yet (e.g. upstream was a table not in any component
      //     or topologically unreachable). This produced syntactically valid
      //     SQL that referenced the wrong upstream. Now we warn instead.
      const upIds = upstreamOf.get(node.id) ?? []
      const toolLabel = (node.data?.label ?? node.data?.nodeType ?? node.id) as string
      let upName: string
      if (upIds.length) {
        const resolved = nodeOutput.get(upIds[0]!)
        if (resolved) {
          upName = resolved
        } else if (lastCTE) {
          pushWarning(`เครื่องมือ "${toolLabel}" ต่อกับ node ที่ยังไม่ได้สร้าง CTE — กำลังใช้ "${lastCTE}" แทน ตรวจเส้นเชื่อมอีกครั้ง`)
          upName = lastCTE
        } else {
          pushWarning(`เครื่องมือ "${toolLabel}" ไม่พบ upstream ที่ใช้งานได้ — ข้ามเครื่องมือนี้`)
          continue
        }
      } else if (lastCTE) {
        upName = lastCTE
      } else {
        pushWarning(`เครื่องมือ "${toolLabel}" ไม่มี upstream — ลาก Table มาเชื่อมต่อก่อน`)
        continue
      }

      const nt = node.data.nodeType as string

      // sort node: ORDER BY goes to final SELECT; WHERE pre-filter (if any) gets its own CTE
      if (nt === 'sort') {
        const items = (node.data.items ?? []).filter((s: any) => s.col && s.dir)
        if (items.length) {
          sortOrder = items.map((s: any) => `${s.col} ${s.dir}`).join(', ')
        }
        const sortConds = (node.data.conditions ?? []).filter(hasCondValue)
        if (sortConds.length) {
          // Pre-filter: create a WHERE CTE so the conditions are actually applied
          const filterName = nextCteIdx()
          const filterSql  = `SELECT *\nFROM ${upName}\nWHERE ${sortConds.map(formatCondClause).join('\n  AND ')}`
          ctes.push({ name: filterName, sql: filterSql })
          nodeOutput.set(node.id, filterName)
          lastCTE = filterName
          cteOutputCols.set(filterName, cteOutputCols.get(upName) ?? [])
        } else {
          nodeOutput.set(node.id, upName)  // pass-through
        }
        continue
      }

      const cteName = (nt === 'cte' || nt === 'union') && node.data.name
        ? uniqueName(sanitizeCteName(node.data.name))
        : nextCteIdx()

      let cteSql = ''
      let _groupResolvedCols: string[] | null = null
      switch (nt) {
        case 'cte':    cteSql = buildCteToolBlock(node, upName); break
        case 'where':  cteSql = buildWhereBlock(node, upName);   break
        case 'group': {
          const gr = buildGroupBlock(node, upName, cteOutputCols.get(upName) ?? [])
          cteSql = gr.sql
          _groupResolvedCols = gr.resolvedCols
          break
        }
        case 'calc':   cteSql = buildCalcBlock(node, upName, cteOutputCols.get(upName) ?? []);    break
        case 'union': {
          const upPairs = upIds
            .map(id => ({ id, name: nodeOutput.get(id) ?? '' }))
            .filter(p => p.name)
          // Deduplicate by CTE name — two edges pointing to same upstream CTE → one arm
          const seenCte = new Set<string>()
          const dedupedPairs = upPairs.filter(p => {
            if (seenCte.has(p.name)) return false
            seenCte.add(p.name)
            return true
          })
          if (!dedupedPairs.length) dedupedPairs.push({ id: '', name: lastCTE })
          cteSql = buildUnionBlock(node, dedupedPairs, cteOutputCols)
          break
        }
      }

      if (cteSql) {
        ctes.push({ name: cteName, sql: cteSql })
        nodeOutput.set(node.id, cteName)
        lastCTE = cteName
        // Track output cols for this CTE
        if (nt === 'union') {
          // union output — prefer new columnMapping model, fall back to legacy
          const columnMapping = (node.data.columnMapping ?? []) as Array<{ outputName: string; picks: Record<string, string> }>
          if (columnMapping.length) {
            cteOutputCols.set(cteName, columnMapping.map(r => r.outputName))
          } else {
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
          }
        } else if (nt === 'cte' || nt === 'where' || nt === 'calc') {
          const sel = (node.data.selectedCols ?? []).filter(Boolean) as string[]
          cteOutputCols.set(cteName, sel.length ? sel : (cteOutputCols.get(upName) ?? []))
        } else if (nt === 'group') {
          const resolvedCols = _groupResolvedCols ?? []
          // Fallback to raw groupCols + agg aliases when custom SQL used (resolvedCols empty)
          if (resolvedCols.length) {
            cteOutputCols.set(cteName, resolvedCols)
          } else {
            const rawGrp = (node.data.groupCols ?? []).filter(Boolean) as string[]
            const aggAliases = (node.data.aggs ?? []).filter((a: any) => a.col && a.func)
              .map((a: any) => a.alias || `${a.func}_${a.col}`)
            cteOutputCols.set(cteName, [...rawGrp, ...aggAliases])
          }
          // Persist resolved col names so modalNodeUpstreamCols (store) stays in sync
          store.updateNodeData(node.id, { _resolvedGroupCols: cteOutputCols.get(cteName) })
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
  // strictCols=true → tables with no visibleCols contribute NO columns to SELECT
  //   (used inside CTE frames so only explicitly-ticked cols appear)
  // strictCols=false (default) → falls through to DB details or * wildcard
  function buildJoinBlock(tableNodes: Node[], edges: Edge[], strictCols = false): string {
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
    // Case-insensitive collision tracking: store lowercase keys so that
    // 'dd_mango' and 'DD_mango' are treated as the same column name.
    const usedOutputNames = new Set<string>()
    const ciHas  = (name: string) => usedOutputNames.has(name.toLowerCase())
    const ciAdd  = (name: string) => usedOutputNames.add(name.toLowerCase())

    // Order SELECT by BFS visit order (primary first, then its children)
    const orderedNodes = [primary, ...sortedEdges
      .map(e => tableNodes.find(n => n.id === e.target)!)
      .filter((n, i, arr) => n && arr.indexOf(n) === i)  // deduplicate
    ]
    for (const tn of orderedNodes) {
      if (!tn || !joinedTableIds.has(tn.id)) continue
      const tbl     = alias(tn)
      const qtbl    = q(tbl)
      const visible = tn.data.visibleCols as VisibleCol[] | undefined
      if (visible?.length) {
        for (const col of visible) {
          if (col.alias) {
            selectCols.push(`  ${qtbl}.${col.name} AS ${col.alias}`)
            ciAdd(col.alias)
          } else if (ciHas(col.name)) {
            let aliasName = `${tbl}_${col.name}`
            let idx = 2
            while (ciHas(aliasName)) aliasName = `${tbl}_${col.name}_${idx++}`
            selectCols.push(`  ${qtbl}.${col.name} AS ${aliasName}`)
            ciAdd(aliasName)
          } else {
            selectCols.push(`  ${qtbl}.${col.name}`)
            ciAdd(col.name)
          }
        }
      } else if (!strictCols) {
        // No visibleCols — try details metadata to generate explicit cols (avoid ambiguous * when joining)
        const details = tn.data.details as any[] | undefined
        if (details?.length) {
          for (const col of details) {
            const colName: string = col.column_name
            if (ciHas(colName)) {
              let aliasName = `${tbl}_${colName}`
              let idx = 2
              while (ciHas(aliasName)) aliasName = `${tbl}_${colName}_${idx++}`
              selectCols.push(`  ${qtbl}.${colName} AS ${aliasName}`)
              ciAdd(aliasName)
            } else {
              selectCols.push(`  ${qtbl}.${colName}`)
              ciAdd(colName)
            }
          }
        } else {
          // No metadata at all — fall back to wildcard (may cause ambiguity if cols overlap)
          selectCols.push(`  ${qtbl}.*`)
        }
      }
      // strictCols + no visibleCols → this table contributes nothing to SELECT
    }

    // strictCols safety: if no table had visibleCols, nothing was added → fall back to SELECT *
    if (strictCols && selectCols.length === 0) selectCols.push('  *')

    const useAlias = primaryA !== primaryT
    let sql = `SELECT\n${selectCols.join(',\n')}\nFROM ${q(primaryT)}${useAlias ? ` AS ${q(primaryA)}` : ''}`

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
          `${q(tgtA)}.${m.target} ${m.operator || '='} ${q(srcA)}.${m.source}`
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
          ? autoMaps.map((name: string) => `${q(tgtA)}.${name} = ${q(srcA)}.${name}`).join(' AND ')
          : `/* ⚠ ไม่พบ common columns — กรุณากำหนด JOIN mapping สำหรับ ${tgtT} */ 1=1`
      }

      const aliasClause = tgtA !== tgtT ? ` AS ${q(tgtA)}` : ''
      if (jt === 'CROSS JOIN') {
        sql += `\n  CROSS JOIN ${q(tgtT)}${aliasClause}`
      } else {
        sql += `\n  ${jt} ${q(tgtT)}${aliasClause} ON ${onClause}`
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
    const conditions = (node.data.conditions  ?? []).filter(hasCondValue)

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
    if (!childTables.length) {
      const frameName = (frame.data as any).name ?? 'CTE Frame'
      return `SELECT NULL AS _empty_frame -- ⚠ "${frameName}" ไม่มี Table อยู่ในกรอบ กรุณาลาก Table เข้ามา`
    }

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

    // Build the JOIN SQL — strict mode: only visibleCols, no details fallback
    let sql = buildJoinBlock(childTables, childEdges, true)

    // ── Apply selectedCols override ───────────────────────────────────────
    // selectedCols may be stored as "tableName.colName" (qualified) or plain "colName" (legacy).
    const selectedCols = ((frame.data as any).selectedCols ?? []) as string[]
    if (selectedCols.length) {
      const colTableMap = buildColTableMap()
      // Duplicate-aware column list: same ciHas/ciAdd pattern as buildJoinBlock
      const usedOut = new Set<string>()
      const ciHas2  = (n: string) => usedOut.has(n.toLowerCase())
      const ciAdd2  = (n: string) => usedOut.add(n.toLowerCase())
      const qualifiedCols = selectedCols.map(c => {
        let tblPart: string
        let colPart: string
        if (c.includes('.')) {
          const dot = c.indexOf('.')
          tblPart = c.slice(0, dot)
          colPart = c.slice(dot + 1)
        } else {
          colPart = c
          tblPart = colTableMap.get(c) ?? ''
        }
        const ref = tblPart ? `  ${q(tblPart)}.${colPart}` : `  ${colPart}`
        if (ciHas2(colPart)) {
          // Duplicate column name across tables → auto-alias
          let aliasName = tblPart ? `${tblPart}_${colPart}` : `${colPart}_2`
          let i = 2
          while (ciHas2(aliasName)) aliasName = `${tblPart ? tblPart + '_' : ''}${colPart}_${i++}`
          ciAdd2(aliasName)
          return `${ref} AS ${aliasName}`
        }
        ciAdd2(colPart)
        return ref
      })
      // Replace SELECT … FROM with the user-chosen columns.
      // A2: line-by-line search for the top-level FROM (a line that starts
      // with "FROM " and has no leading whitespace). buildJoinBlock always
      // emits column lines indented with two spaces, so this cannot match
      // inside the SELECT list even if a col expression contains "\nFROM".
      const lines = sql.split('\n')
      const fromLine = lines.findIndex(l => l.startsWith('FROM '))
      if (fromLine > -1) {
        sql = `SELECT\n${qualifiedCols.join(',\n')}\n${lines.slice(fromLine).join('\n')}`
      }
    }

    // ── Append WHERE conditions (qualify column names) ────────────────────
    const conditions = ((frame.data as any).conditions ?? []).filter(hasCondValue)
    if (conditions.length) {
      const colTableMap = buildColTableMap()
      const whereClauses = conditions.map((c: any) => {
        let col = c.column as string
        if (!col.includes('.')) {
          const tbl = colTableMap.get(col)
          if (tbl) col = `${q(tbl)}.${col}`
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
    const conds = (node.data.conditions ?? []).filter(hasCondValue)
    if (!conds.length) return `SELECT * FROM ${upstream}`
    return `SELECT *\nFROM ${upstream}\nWHERE ${conds.map(formatCondClause).join('\n  AND ')}`
  }

  // ── GROUP BY CTE block ────────────────────────────────────────────────
  // upstreamColNames: actual output column names of the upstream CTE.
  // Used to remap stored groupCol names (which may be raw DB names) to the
  // collision-aliased names that the upstream CTE actually outputs (e.g. b_dd).
  // Returns { sql, resolvedCols } so the caller can track exact CTE output names.
  function buildGroupBlock(
    node: Node, upstream: string, upstreamColNames: string[] = [],
  ): { sql: string; resolvedCols: string[] } {
    const custom = (node.data.customGroupSql as string | undefined)?.trim()
    if (custom) return { sql: custom, resolvedCols: [] }

    const rawGroupCols = (node.data.groupCols ?? []).filter(Boolean) as string[]
    const aggs         = (node.data.aggs ?? []).filter((a: any) => a.col && a.func)

    if (!rawGroupCols.length && !aggs.length)
      return { sql: `SELECT * FROM ${upstream}`, resolvedCols: [] }

    // Map each stored groupCol name to the actual column name in the upstream CTE.
    // Case-insensitive: 'DD_mango' and 'dd_mango' are treated as the same column.
    //
    // A4: resolveCol is now *idempotent per raw name*. Previous behavior
    //     claimed on every call, so calling resolveCol('id') for a groupCol
    //     and then again for SUM(id) would return different columns (the
    //     second call would fall through to a suffix match on 'tbl_id').
    //     Now we cache (raw lowercase → resolved) so the same raw always
    //     returns the same column. Duplicate raw entries in groupCols still
    //     map to the same resolution and will be deduplicated by the caller.
    const upstreamMap      = new Map(upstreamColNames.map(n => [n.toLowerCase(), n]))
    const assignedUpstream = new Set<string>()   // stores lowercase keys
    const resolveCache     = new Map<string, string | null>()
    function resolveCol(raw: string): string | null {
      if (!upstreamColNames.length) return raw
      const rawLower = raw.toLowerCase()
      if (resolveCache.has(rawLower)) return resolveCache.get(rawLower)!
      // 1. Exact match (case-insensitive) that hasn't been claimed yet
      const exactOrig = upstreamMap.get(rawLower)
      if (exactOrig && !assignedUpstream.has(rawLower)) {
        assignedUpstream.add(rawLower)
        resolveCache.set(rawLower, exactOrig)
        return exactOrig
      }
      // 2. Exact match already claimed or missing →
      //    find an unclaimed upstream col whose LAST segment matches (case-insensitive)
      //    e.g. raw='maincode' matches 'ibrcode_maincode' via endsWith('_maincode')
      //    but only if the full name is specifically tableName_colName format
      const aliased = upstreamColNames.find(n => {
        const nLower = n.toLowerCase()
        return !assignedUpstream.has(nLower)
          && nLower.endsWith(`_${rawLower}`)
          && nLower.length > rawLower.length + 1
      })
      if (aliased) {
        assignedUpstream.add(aliased.toLowerCase())
        resolveCache.set(rawLower, aliased)
        return aliased
      }
      resolveCache.set(rawLower, null)
      return null
    }

    // Resolve, validate against upstream, and deduplicate.
    // Track dropped cols so we can emit a SQL comment warning (Bug 4 fix).
    const seenResolved = new Set<string>()
    const droppedCols:  string[] = []
    const groupCols = rawGroupCols
      .map(raw => ({ raw, resolved: resolveCol(raw) }))
      .filter(({ raw, resolved }) => {
        if (resolved === null) { droppedCols.push(raw); return false }
        if (upstreamColNames.length > 0 && !upstreamMap.has(resolved.toLowerCase())) {
          droppedCols.push(raw); return false
        }
        if (seenResolved.has(resolved.toLowerCase())) return false
        seenResolved.add(resolved.toLowerCase()); return true
      })
      .map(({ resolved }) => resolved as string)

    // Remap agg column references too (fall back to raw name if resolveCol returns null)
    const resolvedAggs = aggs.map((a: any) => ({ ...a, col: resolveCol(a.col) ?? a.col }))
    const aggAliases   = resolvedAggs.map((a: any) => a.alias || `${a.func}_${a.col}`)

    const selectParts = [
      ...groupCols.map((c: string) => `  ${c}`),
      ...resolvedAggs.map((a: any) => {
        const fn = a.func === 'COUNT DISTINCT'
          ? `COUNT(DISTINCT ${a.col})`
          : `${a.func}(${a.col})`
        return a.alias ? `  ${fn} AS ${a.alias}` : `  ${fn}`
      }),
    ]

    let sql = ''
    // Warn in generated SQL when stored GROUP BY columns couldn't be matched to upstream
    if (droppedCols.length) {
      sql += `-- ⚠ GROUP BY: columns not found in upstream CTE and were dropped: ${droppedCols.join(', ')}\n`
    }
    sql += `SELECT\n${selectParts.join(',\n')}\nFROM ${upstream}`

    const preConds = (node.data.conditions ?? []).filter(hasCondValue)
    if (preConds.length) sql += `\nWHERE ${preConds.map(formatCondClause).join('\n  AND ')}`

    if (groupCols.length) sql += `\nGROUP BY ${groupCols.join(', ')}`

    const having = (node.data.filters ?? [])
      .filter(hasCondValue)
      .map(formatCondClause)
    if (having.length) sql += `\nHAVING ${having.join('\n  AND ')}`

    return { sql, resolvedCols: [...groupCols, ...aggAliases] }
  }

  // ── CALC CTE block ────────────────────────────────────────────────────
  // upstreamColNames: actual output column names from the upstream CTE (from cteOutputCols map).
  // Using this instead of node.data.availableCols ensures we have the complete + accurate list,
  // including JOIN-aliased columns (e.g. tbl_id), not just the subset stored at node creation.
  function buildCalcBlock(node: Node, upstream: string, upstreamColNames: string[] = []): string {
    const items = (node.data.items ?? []).filter((c: any) => c.col && c.op)
    const filters = (node.data.filters ?? []).filter(hasCondValue)

    if (!items.length) {
      if (!filters.length) return `SELECT * FROM ${upstream}`
      return `SELECT *\nFROM ${upstream}\nWHERE ${filters.map(formatCondClause).join('\n  AND ')}`
    }

    const calcItems = items.map((c: any) => {
      const expr  = calcExpr(c.op, c.col, c.value ?? '')
      const alias = c.alias || `${c.col}_calc`
      return { col: c.col as string, expr, alias }
    })

    const aliasSet = new Set(calcItems.map(i => i.alias))

    // Check if any calc alias conflicts with an existing upstream column name.
    // upstreamColNames comes from cteOutputCols (the generator's own computed col list),
    // so it reflects JOIN aliases and is always complete.
    const conflictingAliases = upstreamColNames.length
      ? new Set(upstreamColNames.filter(n => aliasSet.has(n)))
      : new Set<string>()

    let sql: string
    if (conflictingAliases.size > 0 && upstreamColNames.length > 0) {
      // Build explicit SELECT: list all upstream cols except the ones being replaced,
      // then append the calc expressions with their aliases.
      const upCols    = upstreamColNames.filter(n => !conflictingAliases.has(n)).map(n => `  ${n}`)
      const calcExprs = calcItems.map(i => `  (${i.expr}) AS ${i.alias}`)
      sql = `SELECT\n${[...upCols, ...calcExprs].join(',\n')}\nFROM ${upstream}`
    } else {
      // No known conflicts — use SELECT * and add calculated columns.
      // Safety: if alias still equals the source col name, auto-suffix to prevent
      // SQL Server "column specified multiple times" error.
      const safeExprs = calcItems.map(i => {
        const safeAlias = i.alias === i.col ? `${i.col}_calc` : i.alias
        return `  (${i.expr}) AS ${safeAlias}`
      })
      sql = `SELECT *,\n${safeExprs.join(',\n')}\nFROM ${upstream}`
    }

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
    const uType         = node.data.unionType ?? 'UNION ALL'
    const upstreamNames = upstreams.map(u => u.name)

    // ── columnMapping model (new) ─────────────────────────────────────
    const columnMapping = (node.data.columnMapping ?? []) as Array<{
      outputName: string
      picks: Record<string, string>  // sourceId → fieldName ('' = NULL)
    }>

    if (columnMapping.length > 0 && upstreams.length > 0) {
      const parts = upstreams.map(({ id, name }) => {
        const selects = columnMapping.map(row => {
          const field = row.picks[id] ?? ''
          if (!field) return `  NULL AS ${row.outputName}`
          const alias = field !== row.outputName ? ` AS ${row.outputName}` : ''
          return `  ${field}${alias}`
        })
        return `SELECT\n${selects.join(',\n')}\nFROM ${name}`
      })
      if (parts.length === 0) return `SELECT * FROM ${upstreamNames[0] ?? '_src'}`
      const unionSql = parts.join(`\n${uType}\n`)
      const conditions = (node.data.conditions ?? []).filter(hasCondValue)
      if (!conditions.length) return unionSql
      return `SELECT * FROM (\n${indent(unionSql)}\n) _u\nWHERE ${conditions.map(formatCondClause).join('\n  AND ')}`
    }

    // ── Legacy selectedColsMap / selectedCols model ───────────────────
    const colsMap    = (node.data.selectedColsMap ?? {}) as Record<string, string[]>
    const globalCols = (node.data.selectedCols ?? []).filter(Boolean) as string[]

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
    const conditions = (node.data.conditions ?? []).filter(hasCondValue)
    if (!conditions.length) return unionSql

    return `SELECT * FROM (\n${indent(unionSql)}\n) _u\nWHERE ${conditions.map(formatCondClause).join('\n  AND ')}`
  }

  // ── Table-level filters ───────────────────────────────────────────────
  // Always qualify column with table alias to avoid ambiguity when multiple
  // tables in a JOIN share the same column name (SQL Server error 209).
  function buildTableFilters(tableNodes: Node[]): string[] {
    // Build a global column→(tableAlias, rawType) map across ALL joined tables.
    // This way, a filter added on the wrong node (e.g. "itemno" stored on ap_poheader
    // but actually owned by ap_podetail) still resolves to the correct table alias.
    const colOwner = new Map<string, { tbl: string; rawType: string }>()
    for (const tn of tableNodes) {
      const tbl     = alias(tn)
      const details = (tn.data.details ?? []) as any[]
      for (const d of details) {
        if (!colOwner.has(d.column_name)) {
          colOwner.set(d.column_name, { tbl, rawType: d.column_type ?? d.data_type ?? '' })
        }
      }
      // Fall back to visibleCols if details missing
      if (!details.length) {
        const visible = (tn.data.visibleCols ?? []) as any[]
        for (const col of visible) {
          if (!colOwner.has(col.name)) {
            colOwner.set(col.name, { tbl, rawType: col.type ?? '' })
          }
        }
      }
    }

    const clauses: string[] = []
    for (const tn of tableNodes) {
      const filters = tn.data.filters as any[] | undefined
      if (!filters?.length) continue
      const fallbackTbl = alias(tn)

      for (const f of filters) {
        if (!hasCondValue(f)) continue
        const owner   = colOwner.get(f.column)
        const tbl     = owner?.tbl ?? fallbackTbl
        const rawType = owner?.rawType ?? f.type ?? ''
        clauses.push(formatCondClause({
          column: `${q(tbl)}.${f.column}`,
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
  // SQL Server bracket-quote: wraps name in [brackets], escaping any embedded ].
  // Applied to table/alias references in FROM, JOIN, ON, and WHERE qualifiers so that
  // names containing spaces, reserved words, or special characters are always safe.
  function q(name: string): string {
    if (!name) return name
    if (name.startsWith('[') && name.endsWith(']')) return name   // already quoted
    return `[${name.replace(/\]/g, ']]')}]`
  }
  function escapeSQL(v: string): string { return String(v ?? '').replace(/'/g, "''") }
  function indent(sql: string): string  { return sql.split('\n').map(l => `    ${l}`).join('\n') }

  // Returns true when a condition has a usable value (or doesn't need one).
  // Prevents generating broken SQL like `[col] = ` when value is empty.
  function hasCondValue(c: { column?: any; operator?: any; value?: any }): boolean {
    if (!c.column || !c.operator) return false
    if (c.operator === 'IS NULL' || c.operator === 'IS NOT NULL') return true
    const v = c.value
    return v !== undefined && v !== null && String(v) !== ''
  }

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
    // Boolean/BIT: convert true/false strings to 1/0
    if (ct === 'boolean') {
      const boolVal = ['true', 'yes', '1'].includes(val.toLowerCase()) ? '1' : '0'
      return `${col} ${op} ${boolVal}`
    }
    // Explicit numeric type → no quotes
    if (ct && NUMERIC_TYPES.test(ct))  return `${col} ${op} ${val}`
    // Explicit date/string type → always quote
    if (ct && (DATE_TYPES.test(ct) || STRING_TYPES.test(ct))) return `${col} ${op} '${escapeSQL(val)}'`
    // No type info → use regex on value: pure integer/decimal → no quotes
    return /^-?\d+(\.\d+)?$/.test(val)
      ? `${col} ${op} ${val}`
      : `${col} ${op} '${escapeSQL(val)}'`
  }
  const SQL_RESERVED = new Set([
    'ALL','AND','ANY','AS','ASC','BEGIN','BETWEEN','BY','CASE','CHECK',
    'COALESCE','COLUMN','COMMIT','CONVERT','CREATE','CROSS','CURSOR',
    'DATABASE','DEFAULT','DELETE','DESC','DISTINCT','DROP','ELSE','END',
    'EXEC','EXISTS','FETCH','FOR','FOREIGN','FROM','FULL','FUNCTION',
    'GO','GRANT','GROUP','HAVING','IN','INDEX','INNER','INSERT','INTO',
    'IS','JOIN','KEY','LEFT','LIKE','NOT','NULL','ON','OR','ORDER',
    'OUTER','PRIMARY','PROCEDURE','REFERENCES','RETURN','RIGHT','ROLLBACK',
    'SELECT','SET','SOME','TABLE','THEN','TO','TRANSACTION','TRIGGER',
    'UNION','UNIQUE','UPDATE','USE','VALUES','VIEW','WHEN','WHERE','WITH',
  ])

  function sanitizeCteName(name: string): string {
    const clean = name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').replace(/^([0-9])/, '_$1') || 'cte_group'
    return SQL_RESERVED.has(clean.toUpperCase()) ? `cte_${clean}` : clean
  }

  function copySQL() {
    navigator.clipboard.writeText(store.generatedSQL)
  }

  return { generateSQL, copySQL }
}
