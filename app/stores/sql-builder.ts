/**
 * SQL Builder — Pinia Store
 * Centralized state management following ChartDB architecture
 */
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Node, Edge } from '@vue-flow/core'
import type {
  JoinType, ToolNodeData, SqlTableNodeData, HistorySnapshot,
  SavedFlowState, ColumnInfo, SavedTemplate, GroupModalData, VisibleCol,
} from '~/types/sql-builder'
import { STORAGE_KEY, TEMPLATES_KEY, getEdgeStyle } from '~/types/sql-builder'

export const useSqlBuilderStore = defineStore('sql-builder', () => {
  // ── Flow State ──────────────────────────────────────────────────────────
  const nodes = ref<Node[]>([])
  const edges = ref<Edge[]>([])

  // ── UI State ────────────────────────────────────────────────────────────
  const generatedSQL   = ref('')
  const sqlPanelOpen   = ref(true)
  const activeEdgeId    = ref<string | null>(null)
  const selectedNodeId  = ref<string | null>(null)
  const selectedNodeIds = ref<string[]>([])
  const modalNodeId    = ref<string | null>(null)
  const filterNodeId   = ref<string | null>(null)
  const pendingToolId  = ref<string | null>(null)
  const pendingVp      = ref<{ x: number; y: number; zoom: number } | null>(null)
  const relationEdgeId = ref<string | null>(null)
  // Tracks the ID of a freshly-created tool node (not yet confirmed by finish())
  // so close() can delete it if the user cancels.
  const newToolNodeId  = ref<string | null>(null)
  const search         = ref('')

  // ── Clipboard (copy-paste) ───────────────────────────────────────────────
  const clipboard = ref<{ nodes: Node[]; edges: Edge[]; pasteCount: number }>({
    nodes: [], edges: [], pasteCount: 0,
  })

  // ── Group Create Modal ──────────────────────────────────────────────────
  const groupModalData = ref<GroupModalData | null>(null)

  // ── ERP Data ────────────────────────────────────────────────────────────
  const modules        = ref<string[]>([])
  const objects        = ref<Record<string, any[]>>({})
  const expandedMods   = ref<Set<string>>(new Set())
  const loadingMods    = ref(false)
  const loadingObjs    = ref<Record<string, boolean>>({})
  const searchLoading  = ref(false)

  // ── Mango Schema Sync Status ─────────────────────────────────────────────
  // idle     = ยังไม่เริ่ม
  // syncing  = กำลัง fetch จาก Mango
  // ok       = fetch สำเร็จ ข้อมูลสด
  // stale    = ใช้ cache เก่า (Mango ไม่ตอบ)
  // error    = ไม่มี cache + Mango ไม่ตอบ
  const syncStatus     = ref<'idle' | 'syncing' | 'ok' | 'stale' | 'error'>('idle')
  const syncLastAt     = ref<Date | null>(null)

  // ── Column Cache (table_name → columns) ─────────────────────────────────
  const columnCache    = ref<Record<string, ColumnInfo[]>>({})

  // ── History ─────────────────────────────────────────────────────────────
  const history        = ref<HistorySnapshot[]>([])
  const historyIndex   = ref(-1)
  const isUndoing      = ref(false)
  const MAX_HISTORY    = 50

  // ── Node Counter ────────────────────────────────────────────────────────
  const nodeCounter    = ref(0)

  // ── Getters ─────────────────────────────────────────────────────────────
  const tableNodes = computed((): Node[] =>
    nodes.value.filter((n: Node) => n.type === 'sqlTable')
  )
  const toolNodes = computed((): Node[] =>
    nodes.value.filter((n: Node) => n.type === 'toolNode')
  )
  const modalNode = computed((): Node | null =>
    nodes.value.find((n: Node) => n.id === modalNodeId.value) ?? null
  )
  const filterNode = computed((): Node | null =>
    nodes.value.find((n: Node) => n.id === filterNodeId.value) ?? null
  )
  const canvasTableNames = computed((): { label: string; value: string }[] =>
    tableNodes.value.map((n: Node) => ({
      label: n.data.label as string,
      value: (n.data.tableName ?? n.data.label) as string,
    }))
  )
  const hasNodes = computed((): boolean => nodes.value.length > 0)

  /**
   * Traverse upstream edges from the current modal node and collect all
   * VisibleCol entries from connected table nodes (recursive).
   */
  const modalNodeUpstreamCols = computed((): VisibleCol[] => {
    if (!modalNodeId.value) return []
    const node = nodes.value.find((n: Node) => n.id === modalNodeId.value)
    if (!node) return []

    const cols: VisibleCol[] = []
    const seen    = new Set<string>()
    const visited = new Set<string>()

    // Collect ALL columns from a sqlTable node (details = full DB column list)
    // Tool modals need all available columns, not just the user-selected subset.
    function collectTableCols(tbl: Node) {
      const details          = tbl.data.details as any[] | undefined
      const sourceTable      = tbl.data.tableName as string | undefined
      const sourceTableLabel = tbl.data.label    as string | undefined
      const colsToUse: VisibleCol[] = details?.length
        ? details.map((c: any) => ({
            name:             c.column_name,
            type:             c.column_type || c.data_type,
            remark:           c.remark ?? '',
            isPk:             c.data_pk === 'Y',
            alias:            '',
            sourceTable,
            sourceTableLabel,
          }))
        : ((tbl.data.visibleCols as VisibleCol[] | undefined) ?? []).map((c: VisibleCol) => ({
            ...c, sourceTable, sourceTableLabel,
          }))
      // Dedup by "table:column" so same-named columns from different tables both appear
      for (const col of colsToUse) {
        const key = `${col.sourceTable ?? ''}:${col.name}`
        if (!seen.has(key)) { seen.add(key); cols.push(col) }
      }
    }

    // Bounds-based: find sqlTable nodes inside a cteFrame
    function getCteChildren(frame: Node): Node[] {
      const fw = parseFloat(String((frame.style as any)?.width  ?? '420'))
      const fh = parseFloat(String((frame.style as any)?.height ?? '280'))
      const fx = frame.position.x
      const fy = frame.position.y
      const NW = 112, NH = 80
      return nodes.value.filter((n: Node) =>
        n.type === 'sqlTable' &&
        (n.position.x + NW) >= fx && (n.position.x + NW) <= fx + fw &&
        (n.position.y + NH) >= fy && (n.position.y + NH) <= fy + fh
      )
    }

    // Flood-fill through all JOIN-connected table nodes (bidirectional)
    function collectJoinCluster(startNode: Node) {
      const q: Node[] = [startNode]
      while (q.length) {
        const n = q.shift()!
        if (visited.has(n.id as string)) continue
        visited.add(n.id as string)
        collectTableCols(n)
        for (const e of edges.value) {
          if ((e as any).data?.isTool) continue   // skip pipe/tool edges
          let neighbour: Node | undefined
          if ((e as any).source === n.id)
            neighbour = nodes.value.find((x: Node) => x.id === (e as any).target)
          else if ((e as any).target === n.id)
            neighbour = nodes.value.find((x: Node) => x.id === (e as any).source)
          if (neighbour?.type === 'sqlTable' && !visited.has(neighbour.id as string))
            q.push(neighbour)
        }
      }
    }

    function collect(nodeId: string) {
      if (visited.has(nodeId)) return
      visited.add(nodeId)
      for (const edge of edges.value) {
        if ((edge as any).target !== nodeId) continue
        const src = nodes.value.find((n: Node) => n.id === (edge as any).source)
        if (!src) continue
        if (src.type === 'sqlTable') {
          collectJoinCluster(src)   // collect src + all JOIN-connected tables
        } else if (src.type === 'cteFrame') {
          for (const child of getCteChildren(src)) {
            if (!visited.has(child.id)) {
              visited.add(child.id)
              collectTableCols(child)
            }
          }
        } else {
          collect(src.id)
        }
      }
    }

    collect(node.id)
    return cols
  })

  // ── Node CRUD ───────────────────────────────────────────────────────────
  function addNode(node: Node) {
    nodes.value = [...nodes.value, node]
  }

  function removeNode(id: string) {
    nodes.value = nodes.value.filter((n: Node) => n.id !== id)
    edges.value = edges.value.filter((e: Edge) => e.source !== id && e.target !== id)
    if (modalNodeId.value === id) modalNodeId.value = null
  }

  function updateNodeData(id: string, patch: Record<string, any>) {
    nodes.value = nodes.value.map((n: Node) =>
      n.id === id ? { ...n, data: { ...n.data, ...patch } } : n
    )
  }

  function nextNodeId(prefix = 'node') {
    return `${prefix}-${++nodeCounter.value}`
  }

  // ── Edge CRUD ───────────────────────────────────────────────────────────
  function setJoinType(edgeId: string, type: JoinType) {
    const style = getEdgeStyle(type)
    edges.value = edges.value.map(e =>
      e.id === edgeId ? { ...e, ...style, data: { ...e.data, joinType: type } } : e
    )
  }

  function updateEdgeData(id: string, patch: Record<string, any>) {
    edges.value = edges.value.map((e: any) =>
      e.id === id ? { ...e, ...patch, data: { ...e.data, ...(patch.data ?? {}) } } : e
    )
  }

  // ── Reset ───────────────────────────────────────────────────────────────
  function resetCanvas() {
    nodes.value = []
    edges.value = []
    generatedSQL.value = ''
    modalNodeId.value = null
    filterNodeId.value = null
    activeEdgeId.value = null
    relationEdgeId.value = null
  }

  // ── Template System ──────────────────────────────────────────────────────
  function listTemplates(): SavedTemplate[] {
    try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY) ?? '[]') } catch { return [] }
  }

  function saveTemplate(name: string) {
    const tpls = listTemplates()
    tpls.push({
      id:        Date.now().toString(),
      name,
      nodes:     JSON.parse(JSON.stringify(nodes.value)),
      edges:     JSON.parse(JSON.stringify(edges.value)),
      createdAt: new Date().toISOString(),
    })
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(tpls))
  }

  function loadTemplate(id: string) {
    const tpl = listTemplates().find(t => t.id === id)
    if (!tpl) return
    nodes.value = tpl.nodes.map((n: Node) =>
      n.type === 'sqlTable' && n.data?.columnsLoading
        ? { ...n, data: { ...n.data, columnsLoading: false } }
        : n
    )
    edges.value = tpl.edges
  }

  function deleteTemplate(id: string) {
    localStorage.setItem(TEMPLATES_KEY,
      JSON.stringify(listTemplates().filter(t => t.id !== id))
    )
  }

  // ── Persistence ─────────────────────────────────────────────────────────
  function saveToStorage() {
    const state: SavedFlowState = {
      nodes: JSON.parse(JSON.stringify(nodes.value)),
      edges: JSON.parse(JSON.stringify(edges.value)),
      viewport: { x: 0, y: 0, zoom: 1 },
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }

  function loadFromStorage(): boolean {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    try {
      const state: SavedFlowState = JSON.parse(raw)
      nodes.value = state.nodes.map((n: Node) =>
        n.type === 'sqlTable' && n.data?.columnsLoading
          ? { ...n, data: { ...n.data, columnsLoading: false } }
          : n
      )
      edges.value = state.edges
      return true
    } catch { return false }
  }

  function clearStorage() {
    localStorage.removeItem(STORAGE_KEY)
  }

  // ── Column Cache ────────────────────────────────────────────────────────
  function cacheColumns(tableName: string, cols: ColumnInfo[]) {
    columnCache.value = { ...columnCache.value, [tableName]: cols }
  }

  function getCachedColumns(tableName: string): ColumnInfo[] | null {
    return columnCache.value[tableName] ?? null
  }

  return {
    // State
    nodes, edges, generatedSQL, sqlPanelOpen, activeEdgeId, selectedNodeId, selectedNodeIds,
    modalNodeId, filterNodeId, pendingToolId, pendingVp, relationEdgeId, newToolNodeId, search, clipboard, groupModalData,
    modules, objects, expandedMods, loadingMods, loadingObjs, searchLoading,
    syncStatus, syncLastAt,
    columnCache, history, historyIndex, isUndoing, MAX_HISTORY, nodeCounter,

    // Getters
    tableNodes, toolNodes, modalNode, filterNode, canvasTableNames, hasNodes,
    modalNodeUpstreamCols,

    // Actions
    addNode, removeNode, updateNodeData, nextNodeId,
    setJoinType, updateEdgeData, resetCanvas,
    saveToStorage, loadFromStorage, clearStorage,
    cacheColumns, getCachedColumns,
    listTemplates, saveTemplate, loadTemplate, deleteTemplate,
  }
})
