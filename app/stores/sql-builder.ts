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
  const savedId           = ref<string | null>(null)   // current cloud-saved record id
  const savedName         = ref('')
  const savedIsPublic     = ref(false)
  const showFinishModal   = ref(false)               // shared trigger: open save-to-API modal
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
    const seen      = new Set<string>()   // dedup: "table:column"
    const usedNames = new Set<string>()   // collision aliasing: plain output name
    const visited   = new Set<string>()

    // Collect ALL columns from a sqlTable node (details = full DB column list).
    // Applies the same collision-aliasing as buildJoinBlock so that column names
    // returned here match what the upstream _src CTE will actually output.
    function collectTableCols(tbl: Node) {
      const details          = tbl.data.details as any[] | undefined
      const sourceTable      = tbl.data.tableName as string | undefined
      const sourceTableLabel = tbl.data.label    as string | undefined
      const tblAlias         = sourceTable ?? ''
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
      for (const col of colsToUse) {
        const key = `${col.sourceTable ?? ''}:${col.name.toLowerCase()}`
        if (seen.has(key)) continue
        seen.add(key)
        // Apply the same collision-aliasing logic as buildJoinBlock.
        // Case-insensitive: 'DD_mango' and 'dd_mango' are treated as duplicates.
        let outName: string
        if (col.alias) {
          outName = col.alias
        } else if (usedNames.has(col.name.toLowerCase())) {
          let a = `${tblAlias}_${col.name}`; let i = 2
          while (usedNames.has(a.toLowerCase())) a = `${tblAlias}_${col.name}_${i++}`
          outName = a
        } else {
          outName = col.name
        }
        usedNames.add(outName.toLowerCase())
        cols.push({ ...col, name: outName })
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

    // Collect all JOIN-connected table nodes, processing them in primary-first BFS
    // order (matching buildJoinBlock) so collision aliasing is consistent.
    function collectJoinCluster(startNode: Node) {
      // Step 1: gather all unvisited nodes in the cluster (undirected BFS)
      const clusterNodes: Node[] = []
      const clusterSeen = new Set<string>()
      const q0: Node[] = [startNode]
      clusterSeen.add(startNode.id as string)
      while (q0.length) {
        const n = q0.shift()!
        if (visited.has(n.id as string)) continue
        clusterNodes.push(n)
        for (const e of edges.value) {
          if ((e as any).data?.isTool) continue
          let nb: Node | undefined
          if ((e as any).source === (n.id as string))
            nb = nodes.value.find((x: Node) => x.id === (e as any).target)
          else if ((e as any).target === (n.id as string))
            nb = nodes.value.find((x: Node) => x.id === (e as any).source)
          if (nb?.type === 'sqlTable' && !clusterSeen.has(nb.id as string)) {
            clusterSeen.add(nb.id as string)
            q0.push(nb)
          }
        }
      }
      if (!clusterNodes.length) return

      // Step 2: find primary using the same heuristic as buildJoinBlock
      const clusterIds = new Set(clusterNodes.map(n => n.id as string))
      const hasIncoming = new Set(
        edges.value
          .filter(e => !(e as any).data?.isTool
            && clusterIds.has((e as any).source as string)
            && clusterIds.has((e as any).target as string))
          .map(e => (e as any).target as string)
      )
      const primary = clusterNodes.find(n => (n.data as any)?.isHeaderNode)
        ?? clusterNodes.find(n => !hasIncoming.has(n.id as string))
        ?? clusterNodes[0]!

      // Step 3: directed BFS from primary → same column order as buildJoinBlock
      const adjMap = new Map<string, string[]>()
      for (const n of clusterNodes) adjMap.set(n.id as string, [])
      for (const e of edges.value) {
        if ((e as any).data?.isTool) continue
        const src = (e as any).source as string
        const tgt = (e as any).target as string
        if (clusterIds.has(src) && clusterIds.has(tgt)) adjMap.get(src)?.push(tgt)
      }
      const bfsVisited = new Set<string>([primary.id as string])
      const bfsQ: string[] = [primary.id as string]
      const ordered: Node[] = [primary]
      while (bfsQ.length) {
        const cur = bfsQ.shift()!
        for (const tgtId of (adjMap.get(cur) ?? [])) {
          if (!bfsVisited.has(tgtId)) {
            bfsVisited.add(tgtId)
            bfsQ.push(tgtId)
            const n = clusterNodes.find(x => x.id === tgtId)
            if (n) ordered.push(n)
          }
        }
      }
      for (const n of clusterNodes) {
        if (!bfsVisited.has(n.id as string)) ordered.push(n)
      }

      // Step 4: collect columns in primary-first order
      for (const n of ordered) {
        visited.add(n.id as string)
        collectTableCols(n)
      }
    }

    // Collect output columns of a GROUP BY node (groupCols + agg aliases)
    // These are the only columns visible to nodes downstream of a GROUP BY.
    function collectGroupOutputCols(groupNode: Node) {
      const label     = 'GROUP BY'
      const groupCols = (groupNode.data.groupCols ?? []) as string[]
      const aggs      = ((groupNode.data.aggs ?? []) as any[]).filter((a: any) => a.col && a.func)
      for (const col of groupCols) {
        const key = `grp:${col}`
        if (!seen.has(key)) {
          seen.add(key)
          cols.push({ name: col, type: '', remark: '', isPk: false, alias: '',
            sourceTable: label, sourceTableLabel: label })
        }
      }
      for (const agg of aggs) {
        const alias = agg.alias || `${agg.func}_${agg.col}`
        const key   = `grp:${alias}`
        if (!seen.has(key)) {
          seen.add(key)
          cols.push({ name: alias, type: 'numeric',
            remark: `${agg.func}(${agg.col})`,
            isPk: false, alias: '',
            sourceTable: label, sourceTableLabel: label })
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
        } else if (src.type === 'toolNode' && (src.data?.nodeType as string) === 'group') {
          // GROUP BY is a column boundary — downstream nodes see only its output
          collectGroupOutputCols(src)
        } else {
          collect(src.id)
        }
      }
    }

    // cteFrame has no edges — child tables are detected by spatial bounds
    if (node.type === 'cteFrame') {
      for (const child of getCteChildren(node)) {
        collectTableCols(child)
      }
      return cols
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

  // ── Finish Modal ────────────────────────────────────────────────────────
  function openFinishModal()  { showFinishModal.value = true  }
  function closeFinishModal() { showFinishModal.value = false }

  // ── Column Cache ────────────────────────────────────────────────────────
  function cacheColumns(tableName: string, cols: ColumnInfo[]) {
    columnCache.value = { ...columnCache.value, [tableName]: cols }
  }

  function getCachedColumns(tableName: string): ColumnInfo[] | null {
    return columnCache.value[tableName] ?? null
  }

  return {
    // State
    nodes, edges, generatedSQL, sqlPanelOpen, savedId, savedName, savedIsPublic, showFinishModal,
    activeEdgeId, selectedNodeId, selectedNodeIds,
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
    openFinishModal, closeFinishModal,
    saveToStorage, loadFromStorage, clearStorage,
    cacheColumns, getCachedColumns,
    listTemplates, saveTemplate, loadTemplate, deleteTemplate,
  }
})
