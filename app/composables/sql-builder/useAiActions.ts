/**
 * useAiActions — execute AI-suggested canvas actions for SQL Builder
 *
 * Supported action types:
 *   add_edge      — connect two table nodes
 *   add_table     — add new table node
 *   remove_edge   — remove edge between tables
 *   add_group_by  — create Group/By tool node
 *   add_where     — create WHERE filter tool node
 *   add_sort      — create ORDER BY tool node
 *   add_calc      — create Calculator tool node
 *   update_tool   — update config of existing tool node
 */
import { MarkerType } from '@vue-flow/core'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { getEdgeStyle } from '~/types/sql-builder'
import type { JoinType, AggFunc } from '~/types/sql-builder'
import { useDragDrop } from '~/composables/sql-builder/useDragDrop'

// ── Action interfaces ─────────────────────────────────────────────────────
export interface AiActionAddEdge {
  type:      'add_edge'
  source:    string
  target:    string
  joinType?: JoinType
  on?:       Array<{ sourceCol: string; targetCol: string; operator?: string }>
}

export interface AiActionAddTable {
  type:      'add_table'
  tableName: string
}

export interface AiActionRemoveEdge {
  type:   'remove_edge'
  source: string
  target: string
}

export interface AiActionAddGroupBy {
  type:       'add_group_by'
  source:     string          // table name to connect from
  groupCols:  string[]
  aggs:       Array<{ col: string; func: AggFunc; alias: string }>
  having?:    Array<{ column: string; operator: string; value: string }>
}

export interface AiActionAddWhere {
  type:       'add_where'
  source:     string
  conditions: Array<{ column: string; operator: string; value: string }>
}

export interface AiActionAddSort {
  type:   'add_sort'
  source: string
  items:  Array<{ col: string; dir?: 'ASC' | 'DESC' }>
}

export interface AiActionAddCalc {
  type:   'add_calc'
  source: string
  items:  Array<{ col: string; op: string; value: string; alias: string }>
}

export interface AiActionUpdateTool {
  type:       'update_tool'
  toolType:   'group' | 'where' | 'sort' | 'calc'
  // Group By
  groupCols?: string[]
  aggs?:      Array<{ col: string; func: AggFunc; alias: string }>
  having?:    Array<{ column: string; operator: string; value: string }>
  // Where / Having
  conditions?: Array<{ column: string; operator: string; value: string }>
  // Sort
  items?:      Array<{ col: string; dir?: 'ASC' | 'DESC' }>
  // Calc (same field name as Sort for items)
  calcItems?:  Array<{ col: string; op: string; value: string; alias: string }>
}

export interface AiActionSetVisibleCols {
  type:      'set_visible_cols'
  tableName: string
  cols:      Array<{ name: string; alias?: string }>
}

export type AiCanvasAction =
  | AiActionAddEdge
  | AiActionAddTable
  | AiActionRemoveEdge
  | AiActionAddGroupBy
  | AiActionAddWhere
  | AiActionAddSort
  | AiActionAddCalc
  | AiActionUpdateTool
  | AiActionSetVisibleCols

// ── Parse ─────────────────────────────────────────────────────────────────
export function parseAiAction(raw: string): AiCanvasAction | null {
  try {
    const j = JSON.parse(raw)
    if (!j?.type) return null
    return j as AiCanvasAction
  } catch {
    return null
  }
}

// ── Human-readable description ────────────────────────────────────────────
export function describeAction(action: AiCanvasAction): string {
  switch (action.type) {
    case 'add_edge': {
      const jt   = action.joinType ?? 'LEFT JOIN'
      const cols = action.on?.map(o => `${o.sourceCol} = ${o.targetCol}`).join(', ')
      return `เชื่อม ${action.source} → ${action.target} ด้วย ${jt}${cols ? `\nON ${cols}` : ''}`
    }
    case 'add_table':
      return `เพิ่ม table: ${action.tableName}`
    case 'remove_edge':
      return `ลบ edge ระหว่าง ${action.source} กับ ${action.target}`
    case 'add_group_by': {
      const groups = action.groupCols.join(', ')
      const aggs   = action.aggs.map(a => `${a.func}(${a.col}) AS ${a.alias}`).join(', ')
      return `สร้าง Group By บน ${action.source}\nGROUP BY: ${groups}\nAGG: ${aggs}`
    }
    case 'add_where': {
      const conds = action.conditions.map(c => `${c.column} ${c.operator} ${c.value}`).join('\n')
      return `สร้าง WHERE filter บน ${action.source}\n${conds}`
    }
    case 'add_sort': {
      const items = action.items.map(i => `${i.col} ${i.dir ?? 'ASC'}`).join(', ')
      return `สร้าง ORDER BY บน ${action.source}\n${items}`
    }
    case 'add_calc': {
      const items = action.items.map(i => `${i.col} ${i.op} ${i.value} AS ${i.alias}`).join('\n')
      return `สร้าง Calculator บน ${action.source}\n${items}`
    }
    case 'update_tool':
      return `อัปเดต ${action.toolType} node`
    case 'set_visible_cols': {
      const colList = action.cols.map(c => c.alias ? `${c.name} AS ${c.alias}` : c.name).join(', ')
      return `เลือก column จาก ${action.tableName}\n${colList}`
    }
    default:
      return 'Canvas action'
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────
const TOOL_LABEL: Record<string, string> = {
  group: 'Group/By', where: 'Where', sort: 'Sort', calc: 'Calculator',
}

// ── Execute ───────────────────────────────────────────────────────────────
export function useAiActions() {
  const store = useSqlBuilderStore()
  const drag  = useDragDrop()

  function findNodeByTable(name: string) {
    return store.nodes.find((n: any) => n.type === 'sqlTable' && n.data?.tableName === name)
  }

  function findToolNode(toolType: string) {
    return store.nodes.find((n: any) => n.type === 'toolNode' && n.data?.nodeType === toolType)
  }

  /** Place new tool node to the right of a source node */
  function positionRightOf(srcId: string) {
    const src = store.nodes.find((n: any) => n.id === srcId) as any
    if (!src) return { x: 600, y: 200 }
    return { x: (src.position?.x ?? 0) + 320, y: src.position?.y ?? 200 }
  }

  /** Create a tool node and wire edge from source */
  function createToolNode(
    srcId:    string,
    toolType: string,
    data:     Record<string, any>,
  ): string {
    const id  = `ai-tool-${Date.now()}`
    const pos = positionRightOf(srcId)

    store.nodes = [...store.nodes, {
      id,
      type:     'toolNode',
      position: pos,
      data:     { nodeType: toolType, _toolId: toolType, ...data },
    }]

    // Wire edge (dashed tool edge)
    const toolEdge = {
      id:            `ai-tool-edge-${Date.now()}`,
      source:        srcId,
      target:        id,
      type:          'sqlEdge',
      animated:      false,
      style:         { strokeDasharray: '6 3', stroke: '#94a3b8', strokeWidth: 1.5 },
      markerEnd:     MarkerType.ArrowClosed,
      data:          { joinType: 'LEFT JOIN' as JoinType, mappings: [], isTool: true },
    }
    store.edges = [...store.edges, toolEdge]
    return id
  }

  function execute(action: AiCanvasAction): { ok: boolean; message: string } {
    switch (action.type) {

      // ── Existing actions ────────────────────────────────────────────────
      case 'add_edge': {
        const src = findNodeByTable(action.source)
        const tgt = findNodeByTable(action.target)
        if (!src) return { ok: false, message: `ไม่พบ table "${action.source}"` }
        if (!tgt) return { ok: false, message: `ไม่พบ table "${action.target}"` }
        if (store.edges.some((e: any) => e.source === src.id && e.target === tgt.id))
          return { ok: false, message: `มี edge อยู่แล้ว` }

        const jt       = action.joinType ?? 'LEFT JOIN'
        const mappings = (action.on ?? []).map((o, i) => ({
          _id: i + 1, source: o.sourceCol, target: o.targetCol, operator: o.operator ?? '=',
        }))
        store.edges = [...store.edges, {
          id: `ai-edge-${Date.now()}`, source: src.id, target: tgt.id,
          type: 'sqlEdge', ...getEdgeStyle(jt), markerEnd: MarkerType.ArrowClosed,
          data: { joinType: jt, mappings },
        }]
        return { ok: true, message: `เชื่อม ${action.source} → ${action.target} สำเร็จ` }
      }

      case 'add_table': {
        if (findNodeByTable(action.tableName))
          return { ok: false, message: `"${action.tableName}" อยู่บน canvas แล้ว` }
        const maxX = store.nodes.length
          ? Math.max(...store.nodes.map((n: any) => (n.position?.x ?? 0) + 220)) + 60 : 100
        const midY = store.nodes.length
          ? store.nodes.reduce((s: number, n: any) => s + (n.position?.y ?? 0), 0) / store.nodes.length : 200
        const nodeId = `ai-table-${Date.now()}`
        store.nodes = [...store.nodes, {
          id: nodeId, type: 'sqlTable', position: { x: maxX, y: midY },
          data: { label: action.tableName, tableName: action.tableName, objectName: action.tableName,
                  module: '', type: 'T', details: [], visibleCols: [], filters: [], columnsLoading: true },
        }]
        drag.loadColumnsForNode(nodeId, action.tableName)
        return { ok: true, message: `เพิ่ม "${action.tableName}" บน canvas แล้ว` }
      }

      case 'remove_edge': {
        const src  = findNodeByTable(action.source)
        const tgt  = findNodeByTable(action.target)
        const edge = store.edges.find((e: any) => e.source === src?.id && e.target === tgt?.id)
        if (!edge) return { ok: false, message: `ไม่พบ edge` }
        store.edges = store.edges.filter((e: any) => e.id !== edge.id)
        return { ok: true, message: `ลบ edge สำเร็จ` }
      }

      // ── Tool node creation ──────────────────────────────────────────────
      case 'add_group_by': {
        const src = findNodeByTable(action.source)
        if (!src) return { ok: false, message: `ไม่พบ table "${action.source}"` }
        createToolNode(src.id, 'group', {
          groupCols: action.groupCols ?? [],
          aggs:      action.aggs ?? [],
          filters:   action.having ?? [],
        })
        return { ok: true, message: `สร้าง Group By สำเร็จ` }
      }

      case 'add_where': {
        const src = findNodeByTable(action.source)
        if (!src) return { ok: false, message: `ไม่พบ table "${action.source}"` }
        createToolNode(src.id, 'where', { conditions: action.conditions ?? [] })
        return { ok: true, message: `สร้าง WHERE filter สำเร็จ` }
      }

      case 'add_sort': {
        const src = findNodeByTable(action.source)
        if (!src) return { ok: false, message: `ไม่พบ table "${action.source}"` }
        createToolNode(src.id, 'sort', {
          items: (action.items ?? []).map(i => ({ col: i.col, dir: i.dir ?? 'ASC' })),
        })
        return { ok: true, message: `สร้าง ORDER BY สำเร็จ` }
      }

      case 'add_calc': {
        const src = findNodeByTable(action.source)
        if (!src) return { ok: false, message: `ไม่พบ table "${action.source}"` }
        createToolNode(src.id, 'calc', { items: action.items ?? [] })
        return { ok: true, message: `สร้าง Calculator สำเร็จ` }
      }

      // ── Update existing tool node ───────────────────────────────────────
      case 'update_tool': {
        const node = findToolNode(action.toolType) as any
        if (!node) return { ok: false, message: `ไม่พบ ${TOOL_LABEL[action.toolType] ?? action.toolType} node บน canvas` }

        const patch: Record<string, any> = {}
        if (action.groupCols)  patch.groupCols = action.groupCols
        if (action.aggs)       patch.aggs      = action.aggs
        if (action.having)     patch.filters   = action.having
        if (action.conditions) patch.conditions = action.conditions
        if (action.items)      patch.items     = action.items.map(i => ({ ...i, dir: (i as any).dir ?? 'ASC' }))
        if (action.calcItems)  patch.items     = action.calcItems

        store.nodes = store.nodes.map((n: any) =>
          n.id === node.id ? { ...n, data: { ...n.data, ...patch } } : n
        )
        return { ok: true, message: `อัปเดต ${TOOL_LABEL[action.toolType] ?? action.toolType} สำเร็จ` }
      }

      // ── Set visible columns on a table node ────────────────────────────
      case 'set_visible_cols': {
        const node = findNodeByTable(action.tableName) as any
        if (!node) return { ok: false, message: `ไม่พบ table "${action.tableName}"` }

        // Resolve column metadata from node.data.details or columnCache
        const details: any[] = node.data?.details ?? store.columnCache[action.tableName] ?? []

        const visibleCols = action.cols
          .map(c => {
            const d = details.find((r: any) => (r.column_name ?? r.name) === c.name)
            return {
              name:        c.name,
              type:        d?.column_type ?? d?.data_type ?? '',
              remark:      d?.remark ?? '',
              isPk:        d?.data_pk === 'Y',
              alias:       c.alias ?? '',
              sourceTable: action.tableName,
            }
          })
          .filter(c => c.name)

        store.updateNodeData(node.id, { visibleCols })
        return { ok: true, message: `เลือก ${visibleCols.length} column จาก "${action.tableName}" แล้ว` }
      }

      default:
        return { ok: false, message: 'Action ไม่รองรับ' }
    }
  }

  return { execute }
}
