/**
 * SQL Builder — Drag & Drop + onRead flow
 * Based on ChartDB: useDrag_Drop.js + useNodeFactory.js
 *
 * onRead flow (per CHARTDB_SYSTEM_WORKFLOW.md §6.2):
 *   1. Addspec_Object_Read  → header.table_name + object_table[] + relationships
 *   2. Addspec_Table_Read   → actual DB column types (merged into columns)
 *   3. Auto-create related nodes (grid layout) + edges with mappings
 */
import { nextTick } from 'vue'
import { MarkerType, useVueFlow } from '@vue-flow/core'
import {
  TOOL_NODE_DEFAULTS, getEdgeStyle, getToolEdgeStyle,
  OBJECT_TYPE_LABELS, USE_TYPE_LABELS,
} from '~/types/sql-builder'
import type { ToolId, VisibleCol, GroupRelation } from '~/types/sql-builder'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { useErpData } from '~/composables/sql-builder/useErpData'

// Priority order for primary table selection (H = Header first)
const USE_TYPE_PRIORITY = ['H', 'D', 'M', 'O', 'V', 'U']

// Only these use_types are included as related nodes
const RELATED_USE_TYPES = new Set(['H', 'D', 'M'])

export function useDragDrop() {
  const store   = useSqlBuilderStore()
  const erpData = useErpData()
  const { screenToFlowCoordinate, updateNodeInternals } = useVueFlow('sql-builder')

  // ── Drag start from left panel ──────────────────────────────────────────
  function onDragStart(e: DragEvent, obj: any) {
    e.dataTransfer?.setData('application/json', JSON.stringify(obj))
  }

  // ── Drop on canvas ───────────────────────────────────────────────────────
  function onDrop(e: DragEvent) {
    e.preventDefault()
    const raw = e.dataTransfer?.getData('application/json')
    if (!raw) return

    const obj: any = JSON.parse(raw)
    const id = store.nextNodeId('node')
    const { x, y } = screenToFlowCoordinate({ x: e.clientX - 110, y: e.clientY - 40 })

    // Create placeholder node immediately (shows loading state)
    store.addNode({
      id,
      type: 'sqlTable',
      position: { x, y },
      data: {
        label:           erpData.objDisplayName(obj),
        tableName:       obj.object_name,
        objectName:      obj.object_name,
        module:          obj.module,
        type:            obj.object_type,
        ttype:           obj.t_object_name,
        objectTypeLabel: OBJECT_TYPE_LABELS[obj.object_type] ?? obj.object_type,
        details:         [],
        visibleCols:     [],
        filters:         [],
        columnsLoading:  true,
      },
    })

    // Full onRead flow (async, doesn't block UI)
    onReadObject(id, obj)
  }

  // ── Full onRead flow (ChartDB §6.2) ─────────────────────────────────────
  async function onReadObject(primaryId: string, obj: any) {
    // Step 1: Fetch object header + object_table[]
    const { header, objectTable } = await erpData.loadObjectDetail(obj.object_name, obj.module)

    // Step 2: Resolve actual primary table name
    //   Priority: header.table_name → primary use_type by H→D→M→O→V → fallback to object_name
    const primaryTableName = resolvePrimaryTable(header, objectTable, obj.object_name)

    // Step 3: Update primary node with real tableName + labels
    store.updateNodeData(primaryId, {
      tableName:       primaryTableName,
      objectTypeLabel: OBJECT_TYPE_LABELS[obj.object_type] ?? obj.object_type,
      isHeaderNode:    true,
    })

    // Step 4: Load columns for primary table (Addspec_Table_Read)
    loadColumnsForNode(primaryId, primaryTableName)

    // Step 5: Create related sub-nodes
    if (objectTable?.length) {
      createRelatedNodes(primaryId, primaryTableName, obj, objectTable)
    }
  }

  // ── Resolve primary table name ───────────────────────────────────────────
  function resolvePrimaryTable(header: any, objectTable: any[], fallback: string): string {
    // Prefer header.table_name if present
    if (header?.table_name) return header.table_name

    // Otherwise pick by use_type priority
    if (objectTable?.length) {
      for (const priority of USE_TYPE_PRIORITY) {
        const match = objectTable.find((t: any) => t.use_type === priority)
        if (match?.table_name) return match.table_name
      }
      // Fallback to first entry
      if (objectTable[0]?.table_name) return objectTable[0].table_name
    }

    return fallback
  }

  // ── Build relations list → show Group Select Modal ───────────────────────
  function createRelatedNodes(
    primaryId: string,
    primaryTableName: string,
    obj: any,
    objectTable: any[],
  ) {
    const sorted = [...objectTable].sort((a, b) => {
      const ai = USE_TYPE_PRIORITY.indexOf(a.use_type ?? '')
      const bi = USE_TYPE_PRIORITY.indexOf(b.use_type ?? '')
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })

    const relations: GroupRelation[] = []
    for (const rel of sorted) {
      const relTable = rel.table_name ?? rel.object_name ?? ''
      if (!relTable) continue
      if (relTable === primaryTableName) continue
      if (rel.use_type && !RELATED_USE_TYPES.has(rel.use_type)) continue

      // Label priority: remark → use_type_name → [use_type] table_name
      const useTypeLabel = rel.use_type ? `[${rel.use_type}] ` : ''
      const label = rel.remark?.split('\n')[0]?.replace(/^[-–•]\s*/, '').trim()
        || rel.use_type_name
        || `${useTypeLabel}${relTable}`

      const srcColRaw = rel.col_relation  ?? rel.source_column ?? rel.link_column  ?? rel.from_column ?? ''
      const tgtColRaw = rel.col_relation2 ?? rel.target_column ?? rel.to_column    ?? ''

      // col_relation may be comma-separated (e.g. "maincode,pono") — use first for display
      const srcCols = String(srcColRaw).split(',').map((s: string) => s.trim()).filter(Boolean)
      const tgtCols = String(tgtColRaw).split(',').map((s: string) => s.trim()).filter(Boolean)
      const srcCol  = srcCols[0] ?? ''
      const tgtCol  = tgtCols[0] ?? ''

      // table_relation = which table this joins FROM
      // If self-referencing (table_relation === relTable) or empty → joins from the H (primary) table
      const tableRelation = (rel.table_relation && rel.table_relation !== relTable)
        ? rel.table_relation as string
        : primaryTableName
      const joinType = rel.relation || 'LEFT JOIN'

      relations.push({ rel, relTable, label, srcCol, tgtCol, srcCols, tgtCols, tableRelation, joinType })
    }

    if (!relations.length) return

    const primaryNode = store.nodes.find((n: any) => n.id === primaryId)
    store.groupModalData = {
      primaryId,
      primaryTableName,
      primaryLabel: primaryNode?.data?.label ?? primaryTableName,
      obj,
      relations,
    }
  }

  // ── Actually create selected nodes + edges (called from GroupSelectModal) ─
  async function createGroupFromSelection(selected: GroupRelation[]) {
    if (!store.groupModalData) return
    const { primaryId, obj } = store.groupModalData
    const pos = store.nodes.find((n: any) => n.id === primaryId)?.position ?? { x: 200, y: 200 }

    const COLS  = 3
    const GAP_X = 320
    const GAP_Y = 240

    // Pass 1: create all nodes first (so Pass 2 can find them by tableName)
    const newNodeIds = new Map<string, string>() // tableName → nodeId
    for (let i = 0; i < selected.length; i++) {
      const { rel, relTable, label } = selected[i]!
      if (store.nodes.some((n: any) => n.data?.tableName === relTable)) continue

      const col   = i % COLS
      const row   = Math.floor(i / COLS)
      const relId = store.nextNodeId('node')
      newNodeIds.set(relTable, relId)

      store.addNode({
        id: relId,
        type: 'sqlTable',
        position: {
          x: pos.x + (col + 1) * GAP_X,
          y: pos.y + row * GAP_Y,
        },
        data: {
          label,
          tableName:       relTable,
          objectName:      rel.object_name ?? '',
          module:          obj.module,
          type:            rel.object_type ?? obj.object_type,
          ttype:           rel.t_object_name ?? obj.t_object_name,
          useType:         rel.use_type ?? '',
          objectTypeLabel: OBJECT_TYPE_LABELS[rel.object_type ?? obj.object_type] ?? '',
          useTypeLabel:    rel.use_type_name ?? USE_TYPE_LABELS[rel.use_type] ?? rel.use_type ?? '',
          isHeaderNode:    rel.use_type === 'H',
          details:         [],
          visibleCols:     [],
          filters:         [],
          columnsLoading:  true,
        },
      })

      loadColumnsForNode(relId, relTable)
    }

    // Pass 2: create edges with correct source node from tableRelation (already resolved)
    for (let i = 0; i < selected.length; i++) {
      const { relTable, srcCol, tgtCol, srcCols, tgtCols, tableRelation, joinType } = selected[i]!

      // Find target node id (may be new or already on canvas)
      const relId = newNodeIds.get(relTable)
        ?? store.nodes.find((n: any) => n.data?.tableName === relTable)?.id
      if (!relId) continue

      // Resolve source node from pre-computed tableRelation
      const srcNodeId = (tableRelation
        ? (newNodeIds.get(tableRelation)
          ?? store.nodes.find((n: any) => n.data?.tableName === tableRelation)?.id)
        : null) ?? primaryId

      const jt = joinType === 'INNER JOIN' ? 'INNER JOIN' : 'LEFT JOIN'
      const edgeId = `e-${srcNodeId}-${relId}`
      if (!store.edges.some((ex: any) => ex.id === edgeId)) {
        store.edges = [...store.edges, {
          id: edgeId,
          source: srcNodeId,
          target: relId,
          type: 'sqlEdge',
          ...getEdgeStyle(jt as any),
          markerEnd: MarkerType.ArrowClosed,
          data: {
            joinType: jt,
            mappings: (() => {
              const sCols = srcCols?.length ? srcCols : (srcCol ? [srcCol] : [])
              const tCols = tgtCols?.length ? tgtCols : (tgtCol ? [tgtCol] : [])
              const len = Math.min(sCols.length, tCols.length)
              return len > 0
                ? Array.from({ length: len }, (_, idx) => ({
                    _id: idx + 1, source: sCols[idx]!, target: tCols[idx]!, operator: '=',
                  }))
                : []
            })(),
          },
        } as any]
      }
    }

    store.groupModalData = null
  }

  // ── Load columns for a node (Addspec_Table_Read) ─────────────────────────
  // A5: on failure (empty result due to network/API error, or thrown error)
  //     mark node with `columnsLoadFailed=true` and surface a retry UI in
  //     SqlTableNode. SQL generation is gated on this flag so we never
  //     produce SQL using a table with unknown schema.
  async function loadColumnsForNode(nodeId: string, tableName: string) {
    if (!tableName) {
      store.updateNodeData(nodeId, { columnsLoading: false, columnsLoadFailed: false })
      return
    }
    store.updateNodeData(nodeId, { columnsLoading: true, columnsLoadFailed: false })
    let cols: Awaited<ReturnType<typeof erpData.loadTableColumnsEnriched>> = []
    let failed = false
    try {
      // loadTableColumnsEnriched now throws on network / shape errors (B2+B4).
      // Empty cols = table legitimately has no columns (rare but valid), not
      // an error state — so don't set failed on empty.
      cols = await erpData.loadTableColumnsEnriched(tableName)
    } catch (err) {
      console.error('[loadColumnsForNode] failed', tableName, err)
      failed = true
    }
    if (failed) {
      store.updateNodeData(nodeId, {
        details:           [],
        visibleCols:       [],
        columnsLoading:    false,
        columnsLoadFailed: true,
      })
      return
    }
    // If the node carries _importedCols (set by SQL import), use those
    // as the visible selection instead of the PK-only default.
    const nodeNow      = store.nodes.find((n: any) => n.id === nodeId)
    const importedCols = nodeNow?.data?._importedCols as string[] | undefined
    const colMap       = new Map(cols.map(c => [c.column_name.toLowerCase(), c]))

    const visibleCols: VisibleCol[] = importedCols?.length
      ? importedCols.map(name => {
          const schema = colMap.get(name.toLowerCase())
          return schema
            ? { name: schema.column_name, type: schema.column_type || schema.data_type,
                remark: schema.remark, isPk: schema.data_pk === 'Y', alias: '' }
            : { name, alias: '' }
        })
      : cols
          .filter(c => c.data_pk === 'Y')
          .map(c => ({ name: c.column_name, type: c.column_type || c.data_type,
                       remark: c.remark, isPk: true, alias: '' }))

    store.updateNodeData(nodeId, {
      details:           cols,
      visibleCols,
      _importedCols:     undefined,   // clear after applying
      columnsLoading:    false,
      columnsLoadFailed: false,
    })
  }

  // Expose so UI (SqlTableNode retry button) can re-trigger a failed load
  // without needing to know about the onRead flow.
  async function retryLoadColumns(nodeId: string) {
    const node = store.nodes.find((n: any) => n.id === nodeId)
    const tableName = node?.data?.tableName as string | undefined
    if (!tableName) return
    await loadColumnsForNode(nodeId, tableName)
  }

  // ── Add tool node ────────────────────────────────────────────────────────
  // If a node is currently selected, the tool node is placed to its right
  // and auto-connected so that upstream columns are immediately available.
  async function addToolNode(toolId: string, viewportX: number, viewportY: number, zoom: number) {
    const id = store.nextNodeId('tool')
    const defaults = TOOL_NODE_DEFAULTS[toolId as ToolId]
    if (!defaults) return

    // CTE → frame node (bounds-based, NO parentNode — avoids Vue Flow position transforms)
    if (toolId === 'cte') {
      const PAD   = 32   // padding around selected nodes
      const BAR_H = 40   // title bar height

      // Use selectedNodeIds (most reliable — set before button press via onSelectionChange)
      const selIds = new Set([
        ...store.selectedNodeIds,
        ...(store.selectedNodeId ? [store.selectedNodeId] : []),
      ])
      const selectedTargets = store.nodes.filter((n: any) =>
        n.type === 'sqlTable' && (selIds.has(n.id) || n.selected)
      )

      // Flood-fill all sqlTable nodes connected to the selected targets via JOIN edges
      const connectedNodes: any[] = []
      if (selectedTargets.length) {
        const visited = new Set<string>()
        const queue = [...selectedTargets]
        while (queue.length) {
          const n = queue.shift()!
          if (visited.has(n.id)) continue
          visited.add(n.id)
          connectedNodes.push(n)
          for (const e of store.edges) {
            if ((e as any).data?.isTool) continue
            if ((e as any).source === n.id) {
              const tgt = store.nodes.find((x: any) => x.id === (e as any).target)
              if (tgt?.type === 'sqlTable' && !visited.has(tgt.id)) queue.push(tgt)
            }
            if ((e as any).target === n.id) {
              const src2 = store.nodes.find((x: any) => x.id === (e as any).source)
              if (src2?.type === 'sqlTable' && !visited.has(src2.id)) queue.push(src2)
            }
          }
        }
      }

      const targets = connectedNodes.length ? connectedNodes : selectedTargets

      let position: { x: number; y: number }
      let width  = 200
      let height = 56
      let isOpen = false

      if (targets.length) {
        const NODE_W = 224
        const NODE_H = 160

        const minX = Math.min(...targets.map((n: any) => n.position.x))
        const minY = Math.min(...targets.map((n: any) => n.position.y))
        const maxX = Math.max(...targets.map((n: any) => n.position.x + NODE_W))
        const maxY = Math.max(...targets.map((n: any) => n.position.y + NODE_H))

        position = { x: minX - PAD, y: minY - PAD - BAR_H }
        width    = (maxX - minX) + PAD * 2
        height   = (maxY - minY) + PAD * 2 + BAR_H
        isOpen   = true
      } else {
        position = { x: (-viewportX + 200) / zoom, y: (-viewportY + 150) / zoom }
      }

      // Nodes stay at their absolute positions — no parentNode, no position transform
      store.addNode({
        id,
        type:   'cteFrame',
        position,
        zIndex: -1,
        style:  { width: `${width}px`, height: `${height}px` },
        data:   { ...JSON.parse(JSON.stringify(defaults)), isOpen,
                  _expandedW: isOpen ? width : 420, _expandedH: isOpen ? height : 280 },
      })

      store.modalNodeId = id
      return
    }

    // ── Collect source nodes ──────────────────────────────────────────────
    // selectedNodeId = the node the user last explicitly clicked — use it alone.
    // selectedNodeIds can drift (stale multi-select from VueFlow events) so don't union them.
    // No selection → fallback: biggest JOIN cluster on canvas.
    const sourceNodes: any[] = []
    const anchorNode = store.selectedNodeId
      ? store.nodes.find((n: any) => n.id === store.selectedNodeId) ?? null
      : null

    if (anchorNode && (anchorNode.type === 'sqlTable' || anchorNode.type === 'toolNode')) {
      sourceNodes.push(anchorNode)
    }

    if (!sourceNodes.length) {
      // No selection — auto-connect to the biggest JOIN cluster
      const allTables = store.nodes.filter((n: any) => n.type === 'sqlTable')
      if (allTables.length > 0) {
        const seen = new Set<string>()
        let biggestCluster: any[] = []
        for (const tbl of allTables) {
          if (seen.has(tbl.id)) continue
          const cluster: any[] = []
          const q: any[] = [tbl]
          while (q.length) {
            const n = q.shift()!
            if (seen.has(n.id)) continue
            seen.add(n.id)
            cluster.push(n)
            for (const e of store.edges) {
              if ((e as any).data?.isTool) continue
              if ((e as any).source === n.id) {
                const tgt = store.nodes.find((x: any) => x.id === (e as any).target)
                if (tgt?.type === 'sqlTable' && !seen.has(tgt.id)) q.push(tgt)
              }
              if ((e as any).target === n.id) {
                const src2 = store.nodes.find((x: any) => x.id === (e as any).source)
                if (src2?.type === 'sqlTable' && !seen.has(src2.id)) q.push(src2)
              }
            }
          }
          if (cluster.length > biggestCluster.length) biggestCluster = cluster
        }
        sourceNodes.push(...biggestCluster)
      }
    }

    // ── Position: right of rightmost source, or viewport centre ───────────
    let position: { x: number; y: number }
    if (sourceNodes.length) {
      const maxX = Math.max(...sourceNodes.map((n: any) => n.position.x))
      const ref   = sourceNodes.find((n: any) => n.position.x === maxX) ?? sourceNodes[0]!
      position = { x: ref.position.x + 360, y: ref.position.y }
    } else {
      position = { x: (-viewportX + 400) / zoom, y: (-viewportY + 200) / zoom }
    }

    // Collect upstream columns from source nodes so the tool node and the SQL
    // generator can detect alias conflicts (e.g. CALC col alias = existing col name).
    const upstreamCols: any[] = []
    const seenColNames = new Set<string>()
    for (const src of sourceNodes) {
      const srcCols: any[] = src.type === 'sqlTable'
        ? (src.data.visibleCols ?? [])
        : (src.data.availableCols ?? [])
      for (const col of srcCols) {
        if (!seenColNames.has(col.name)) {
          seenColNames.add(col.name)
          upstreamCols.push(col)
        }
      }
    }

    store.addNode({
      id,
      type: 'toolNode',
      position,
      data: {
        ...JSON.parse(JSON.stringify(defaults)),
        ...(upstreamCols.length ? { availableCols: upstreamCols } : {}),
      },
    })

    // Track this as an unsaved (new) node so cancel can delete it
    store.newToolNodeId = id

    // ── Connect every source → new tool node ──────────────────────────────
    // Build the edge objects now (before nextTick so IDs are captured)
    const toolEdgeStyle = getToolEdgeStyle(toolId)
    const edgesToAdd: any[] = []
    for (const src of sourceNodes) {
      const edgeId = `e-${src.id}-${id}`
      if (store.edges.some((e: any) => e.id === edgeId)) continue
      edgesToAdd.push({
        id:        edgeId,
        source:    src.id,
        target:    id,
        type:      'sqlEdge',
        ...toolEdgeStyle,
        markerEnd: MarkerType.ArrowClosed,
        data:      {
          joinType: 'LEFT JOIN', mappings: [], isTool: true,
          tgtToolId: toolId,
          srcCat: src.type === 'toolNode' ? 'other' : 'table',
        },
      })
    }

    // Open modal immediately
    store.modalNodeId = id

    // nextTick() resolves after ALL pre-flush watchers complete, including VueFlow's internal
    // nodes watcher that runs setNodes() and populates nodeLookup. Only after that point will
    // VueFlow's createGraphEdges accept the new tool node as a valid edge target.
    if (edgesToAdd.length) {
      await nextTick()
      if (!store.nodes.some((n: any) => n.id === id)) return  // node was cancelled
      store.edges = [...store.edges, ...edgesToAdd]
      nextTick(() => updateNodeInternals(store.nodes.map((n: any) => n.id)))
    }
  }

  // ── Manual expand: fetch Addspec_Object_Read for an existing canvas node ─
  async function expandNodeRelations(nodeId: string) {
    const node = store.nodes.find((n: any) => n.id === nodeId)
    if (!node) return

    const objectName = node.data.objectName || node.data.tableName
    if (!objectName) return

    const { header, objectTable } = await erpData.loadObjectDetail(objectName, node.data.module)

    const primaryTableName = node.data.tableName
      ?? header?.table_name
      ?? objectName

    if (!objectTable?.length) return

    createRelatedNodes(nodeId, primaryTableName, {
      module:        node.data.module,
      object_type:   node.data.type,
      t_object_name: node.data.ttype,
    }, objectTable)
  }

  return { onDragStart, onDrop, addToolNode, loadColumnsForNode, retryLoadColumns, createGroupFromSelection, expandNodeRelations }
}
