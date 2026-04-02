/**
 * SQL Builder — Flow Events
 * Handles edge connections, edge clicks, node clicks
 * Based on ChartDB: useFlowEvents.js
 */
import { MarkerType, type Connection, type Node, type Edge } from '@vue-flow/core'
import { getEdgeStyle } from '~/types/sql-builder'
import type { JoinType, VisibleCol } from '~/types/sql-builder'
import { useSqlBuilderStore } from '~/stores/sql-builder'

export function useFlowEvents() {
  const store = useSqlBuilderStore()
  const router = useRouter()

  // ── Extract available columns from a node ─────────────────────────────
  function getCols(node: Node): VisibleCol[] {
    if (node.type === 'sqlTable') {
      return (node.data.visibleCols as VisibleCol[] | undefined) ?? []
    }
    // Tool nodes: pass through whatever they received upstream
    return (node.data.availableCols as VisibleCol[] | undefined) ?? []
  }

  // ── New connection → default LEFT JOIN + propagate availableCols ───────
  function onConnect(conn: Connection) {
    const id = `e-${conn.source}-${conn.target}`

    // Prevent duplicate edges
    if (store.edges.some((e: any) => e.id === id)) return

    const sourceNode = store.nodes.find((n: Node) => n.id === conn.source)
    const targetNode = store.nodes.find((n: Node) => n.id === conn.target)

    const isSrcTable  = sourceNode?.type === 'sqlTable'
    const isTgtTable  = targetNode?.type === 'sqlTable'
    const isTgtTool   = targetNode?.type === 'toolNode'
    const isSrcFrame  = sourceNode?.type === 'cteFrame'
    const isSrcTool   = sourceNode?.type === 'toolNode'

    // Tool edge: cteFrame/toolNode → toolNode  OR  sqlTable → toolNode
    const isToolEdge  = (isSrcFrame || isSrcTool || isSrcTable) && isTgtTool
    // Table edge: sqlTable → sqlTable (needs JOIN modal)
    const isTableEdge = isSrcTable && isTgtTable

    const edgeStyle = isToolEdge
      ? { animated: false, style: { stroke: 'hsl(var(--muted-foreground) / 0.4)', strokeWidth: 1.5, strokeDasharray: '5 4' } }
      : getEdgeStyle('LEFT JOIN')

    const edgeData = isToolEdge
      ? { joinType: 'LEFT JOIN' as JoinType, mappings: [], isTool: true, unionSrc: true, srcCat: isSrcFrame ? 'cte' : isSrcTool ? 'other' : 'table' }
      : { joinType: 'LEFT JOIN' as JoinType, mappings: [] }

    const finalEdge = {
      id,
      source: conn.source!,
      target: conn.target!,
      sourceHandle: conn.sourceHandle ?? undefined,
      targetHandle: conn.targetHandle ?? undefined,
      type: 'sqlEdge',
      ...edgeStyle,
      markerEnd: MarkerType.ArrowClosed,
      data: edgeData,
    }
    store.edges = [...store.edges, finalEdge as any]

    // Propagate availableCols from source to target tool node
    if (sourceNode && isTgtTool) {
      store.updateNodeData(conn.target!, { availableCols: getCols(sourceNode) })
    }

    // Open relation modal only for table-to-table edges
    if (isTableEdge) {
      store.relationEdgeId = id
    }
  }

  // ── Edge click → open Relation modal (skip tool-connection edges) ─────
  function onEdgeClick(event: any) {
    const edge = event.edge ?? event
    const edgeId = edge?.id ?? event?.id
    if (!edgeId) return
    const edgeData = store.edges.find((e: any) => e.id === edgeId)
    if (edgeData?.data?.isTool) return   // tool connections are not JOIN edges
    store.relationEdgeId = edgeId
  }

  // ── Node click → highlight + open tool config if tool node ───────────
  function onNodeClick(event: any) {
    const node = event.node ?? event
    if (!node?.id) return

    // Track selected node (for tool auto-connect etc.)
    store.selectedNodeId = node.id

    // Tool nodes open their config modal on click
    if (node.type === 'toolNode') {
      store.modalNodeId = node.id
    }
  }

  // ── Selection change → track all selected node IDs ────────────────────
  function onSelectionChange({ nodes }: { nodes: Node[] }) {
    store.selectedNodeIds = nodes.map((n: Node) => n.id)
    if (nodes.length === 1) store.selectedNodeId = nodes[0]!.id
  }

  // ── Pane click → deselect ─────────────────────────────────────────────
  function onPaneClick() {
    store.selectedNodeId  = null
    store.selectedNodeIds = []
  }

  // ── Set JOIN type on active edge ──────────────────────────────────────
  function setJoinType(type: JoinType) {
    if (!store.activeEdgeId) return
    store.setJoinType(store.activeEdgeId, type)
    store.activeEdgeId = null
  }

  // ── Remove node ───────────────────────────────────────────────────────
  function removeNode(id: string) {
    store.removeNode(id)
  }

  // ── Send generated SQL to DataModel page ──────────────────────────────
  function sendToDataModel() {
    if (!store.generatedSQL) return
    router.push({ path: '/datamodel', query: { sql: store.generatedSQL } })
  }

  // ── Reset canvas ──────────────────────────────────────────────────────
  function resetCanvas() {
    store.resetCanvas()
  }

  return {
    onConnect, onEdgeClick, onNodeClick, onPaneClick, onSelectionChange,
    setJoinType, removeNode, sendToDataModel, resetCanvas, getCols,
  }
}
