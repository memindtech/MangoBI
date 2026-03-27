/**
 * SQL Builder — Drag & Drop + onRead flow
 * Based on ChartDB: useDrag_Drop.js + useNodeFactory.js
 *
 * onRead flow (per CHARTDB_SYSTEM_WORKFLOW.md §6.2):
 *   1. Addspec_Object_Read  → header.table_name + object_table[] + relationships
 *   2. Addspec_Table_Read   → actual DB column types (merged into columns)
 *   3. Auto-create related nodes (grid layout) + edges with mappings
 */
import { MarkerType } from '@vue-flow/core'
import {
  TOOL_NODE_DEFAULTS, getEdgeStyle,
  OBJECT_TYPE_LABELS, USE_TYPE_LABELS,
} from '~/types/sql-builder'
import type { ToolId, VisibleCol, GroupRelation } from '~/types/sql-builder'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { useErpData } from '~/composables/sql-builder/useErpData'

// Priority order for primary table selection (H = Header first)
const USE_TYPE_PRIORITY = ['H', 'D', 'M', 'O', 'V', 'U']

export function useDragDrop() {
  const store   = useSqlBuilderStore()
  const erpData = useErpData()

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
    const bounds = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = Math.max(0, e.clientX - bounds.left - 110)
    const y = Math.max(0, e.clientY - bounds.top  - 40)

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

      // Label priority: remark → use_type_name → [use_type] table_name
      const useTypeLabel = rel.use_type ? `[${rel.use_type}] ` : ''
      const label = rel.remark?.split('\n')[0]?.replace(/^[-–•]\s*/, '').trim()
        || rel.use_type_name
        || `${useTypeLabel}${relTable}`

      const srcCol = rel.col_relation   ?? rel.source_column ?? rel.link_column  ?? rel.from_column ?? ''
      const tgtCol = rel.col_relation2  ?? rel.target_column ?? rel.to_column    ?? ''

      relations.push({ rel, relTable, label, srcCol, tgtCol })
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

    for (let i = 0; i < selected.length; i++) {
      const { rel, relTable, label, srcCol, tgtCol } = selected[i]!

      // Skip if already on canvas
      if (store.nodes.some((n: any) => n.data?.tableName === relTable)) continue

      const col   = i % COLS
      const row   = Math.floor(i / COLS)
      const relId = store.nextNodeId('node')

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

      const edgeId = `e-${primaryId}-${relId}`
      if (!store.edges.some((ex: any) => ex.id === edgeId)) {
        store.edges = [...store.edges, {
          id: edgeId,
          source: primaryId,
          target: relId,
          type: 'sqlEdge',
          ...getEdgeStyle('LEFT JOIN'),
          markerEnd: MarkerType.ArrowClosed,
          data: {
            joinType: 'LEFT JOIN',
            mappings: srcCol && tgtCol
              ? [{ _id: 1, source: srcCol, target: tgtCol, operator: '=' }]
              : [],
          },
        } as any]
      }
    }

    store.groupModalData = null
  }

  // ── Load columns for a node (Addspec_Table_Read) ─────────────────────────
  async function loadColumnsForNode(nodeId: string, tableName: string) {
    if (!tableName) {
      store.updateNodeData(nodeId, { columnsLoading: false })
      return
    }
    const cols = await erpData.loadTableColumnsEnriched(tableName)
    const visibleCols: VisibleCol[] = cols
      .filter(c => c.data_pk === 'Y')
      .map(c => ({
        name:   c.column_name,
        type:   c.column_type || c.data_type,
        remark: c.remark,
        isPk:   true,
        alias:  '',
      }))
    store.updateNodeData(nodeId, {
      details:        cols,
      visibleCols,
      columnsLoading: false,
    })
  }

  // ── Add tool node ────────────────────────────────────────────────────────
  // If a node is currently selected, the tool node is placed to its right
  // and auto-connected so that upstream columns are immediately available.
  function addToolNode(toolId: string, viewportX: number, viewportY: number, zoom: number) {
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
      const targets = store.nodes.filter((n: any) =>
        n.type === 'sqlTable' && (selIds.has(n.id) || n.selected)
      )

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

    // Resolve selected parent node
    const parentNode = store.selectedNodeId
      ? store.nodes.find((n: any) => n.id === store.selectedNodeId) ?? null
      : null

    // Position: right of parent (offset 340px) or centre of viewport
    const position = parentNode
      ? { x: parentNode.position.x + 340, y: parentNode.position.y }
      : { x: (-viewportX + 400) / zoom, y: (-viewportY + 200) / zoom }

    store.addNode({
      id,
      type: 'toolNode',
      position,
      data: { ...JSON.parse(JSON.stringify(defaults)) },
    })

    // Auto-connect parent → tool node with a neutral dashed edge
    if (parentNode) {
      const edgeId = `e-${parentNode.id}-${id}`
      if (!store.edges.some((e: any) => e.id === edgeId)) {
        store.edges = [...store.edges, {
          id:        edgeId,
          source:    parentNode.id,
          target:    id,
          type:      'sqlEdge',
          animated:  false,
          style:     { stroke: 'hsl(var(--muted-foreground) / 0.4)', strokeWidth: 1.5, strokeDasharray: '5 4' },
          markerEnd: MarkerType.ArrowClosed,
          data:      { joinType: 'LEFT JOIN', mappings: [], isTool: true },
        } as any]
      }
    }

    store.modalNodeId = id
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

  return { onDragStart, onDrop, addToolNode, loadColumnsForNode, createGroupFromSelection, expandNodeRelations }
}
