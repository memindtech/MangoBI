<script setup lang="ts">
/**
 * SQL Builder — Tool Config Modal
 * Configuration dialog for CTE, Calc, Group, Sort, Union, Where nodes
 */
import {
  X, Plus, Layers, Calculator, Database, SortAsc, GitMerge, Filter,
  ChevronDown, Key, Search, Sparkles, Calendar, Play,
} from 'lucide-vue-next'
import { MarkerType } from '@vue-flow/core'
import { AGG_FUNCS, getColTypeBadge } from '~/types/sql-builder'
import type { VisibleCol } from '~/types/sql-builder'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { useToolNodes } from '~/composables/sql-builder/useToolNodes'
import { useSqlGenerator } from '~/composables/sql-builder/useSqlGenerator'

const store = useSqlBuilderStore()
const tn = useToolNodes()
const { generateSQL } = useSqlGenerator()

const TOOL_META: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
  cte:   { label: 'Named CTE', color: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500/30', icon: Layers     },
  calc:  { label: 'Calculator', color: 'text-teal-500',   bg: 'bg-teal-500/10',   border: 'border-teal-500/30',   icon: Calculator },
  group: { label: 'GROUP BY',  color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30', icon: Database   },
  sort:  { label: 'ORDER BY',  color: 'text-green-500',  bg: 'bg-green-500/10',  border: 'border-green-500/30',  icon: SortAsc    },
  union: { label: 'UNION',     color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', icon: GitMerge   },
  where: { label: 'WHERE',     color: 'text-rose-500',   bg: 'bg-rose-500/10',   border: 'border-rose-500/30',   icon: Filter     },
}

// WHERE operator groups with colors
const WHERE_OP_GROUPS = [
  { ops: ['=', '!='],               color: 'rose'   },
  { ops: ['>', '<', '>=', '<='],    color: 'sky'    },
  { ops: ['LIKE', 'IN'],            color: 'violet' },
  { ops: ['IS NULL', 'IS NOT NULL'],color: 'amber'  },
] as const

const WHERE_OP_COLOR: Record<string, string> = {
  '=': 'rose', '!=': 'rose',
  '>': 'sky', '<': 'sky', '>=': 'sky', '<=': 'sky',
  'LIKE': 'violet', 'IN': 'violet',
  'IS NULL': 'amber', 'IS NOT NULL': 'amber',
}
const WHERE_OP_ACTIVE: Record<string, string> = {
  rose:   'bg-rose-500 text-white border-rose-500',
  sky:    'bg-sky-500 text-white border-sky-500',
  violet: 'bg-violet-500 text-white border-violet-500',
  amber:  'bg-amber-500 text-white border-amber-500',
}
const WHERE_OP_HOVER: Record<string, string> = {
  rose:   'border-border text-muted-foreground hover:border-rose-400/60 hover:text-rose-500 hover:bg-rose-500/8',
  sky:    'border-border text-muted-foreground hover:border-sky-400/60 hover:text-sky-500 hover:bg-sky-500/8',
  violet: 'border-border text-muted-foreground hover:border-violet-400/60 hover:text-violet-500 hover:bg-violet-500/8',
  amber:  'border-border text-muted-foreground hover:border-amber-400/60 hover:text-amber-500 hover:bg-amber-500/8',
}

function whereOpClass(currentOp: string, op: string): string {
  const color = WHERE_OP_COLOR[op] ?? 'rose'
  return currentOp === op
    ? (WHERE_OP_ACTIVE[color] ?? WHERE_OP_ACTIVE['rose']!)
    : (WHERE_OP_HOVER[color]  ?? WHERE_OP_HOVER['rose']!)
}

const whereCondCount = computed(() =>
  (store.modalNode?.data?.conditions ?? []).filter((c: any) => c.column && c.operator).length
)

// Column dropdown for CTE WHERE conditions
const openCteCondColIdx = ref<number | null>(null)
const cteCondColDropPos = ref<{ top: number; left: number; width: number } | null>(null)

function toggleCteCondColDropdown(i: number, e: MouseEvent) {
  if (openCteCondColIdx.value === i) { openCteCondColIdx.value = null; cteCondColDropPos.value = null; return }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  cteCondColDropPos.value = { top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 240) }
  openCteCondColIdx.value = i
}
function closeCteCondColDropdown() { openCteCondColIdx.value = null; cteCondColDropPos.value = null }
function selectCteCondCol(i: number, col: VisibleCol) {
  tn.setCteCondition(i, { column: col.name, colType: col.type })
  closeCteCondColDropdown()
}

// Mapping pick dropdown (replaces <select> in source picks grid)
const openPickKey  = ref<string | null>(null)
const pickDropRow  = ref(-1)
const pickDropSrc  = ref('')
const pickDropPos  = ref<{ top: number; left: number; width: number } | null>(null)

function openMappingPickDrop(ri: number, sourceId: string, e: MouseEvent) {
  const key = `${ri}-${sourceId}`
  if (openPickKey.value === key) { openPickKey.value = null; pickDropPos.value = null; return }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  pickDropPos.value  = { top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 200) }
  openPickKey.value  = key
  pickDropRow.value  = ri
  pickDropSrc.value  = sourceId
}
function closeMappingPickDrop() { openPickKey.value = null; pickDropPos.value = null }
function selectMappingPick(field: string) {
  setUnionMappingPick(pickDropRow.value, pickDropSrc.value, field)
  closeMappingPickDrop()
}

// Column dropdown for Union WHERE conditions
const openUnionCondColIdx = ref<number | null>(null)
const unionCondColDropPos = ref<{ top: number; left: number; width: number } | null>(null)

function toggleUnionCondColDropdown(i: number, e: MouseEvent) {
  if (openUnionCondColIdx.value === i) { openUnionCondColIdx.value = null; unionCondColDropPos.value = null; return }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  unionCondColDropPos.value = { top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 240) }
  openUnionCondColIdx.value = i
}
function closeUnionCondColDropdown() { openUnionCondColIdx.value = null; unionCondColDropPos.value = null }
function selectUnionCondCol(i: number, col: VisibleCol) {
  tn.setUnionCondition(i, { column: col.name, colType: col.type })
  closeUnionCondColDropdown()
}

// Column dropdown for WHERE conditions
const openWhereColIdx = ref<number | null>(null)
const whereColDropPos = ref<{ top: number; left: number; width: number } | null>(null)

function toggleWhereColDropdown(i: number, e: MouseEvent) {
  if (openWhereColIdx.value === i) { openWhereColIdx.value = null; whereColDropPos.value = null; return }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  whereColDropPos.value = { top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 240) }
  openWhereColIdx.value = i
}

function closeWhereColDropdown() { openWhereColIdx.value = null; whereColDropPos.value = null }

function selectWhereCol(i: number, col: VisibleCol) {
  tn.setWhereCondition(i, { column: col.name, colType: col.type })
  closeWhereColDropdown()
}

const meta     = computed(() => (TOOL_META[store.modalNode?.data?._toolId] ?? TOOL_META.calc) as NonNullable<typeof TOOL_META[string]>)
const nodeType = computed(() => store.modalNode?.data?.nodeType as string | undefined)

// ── Upstream columns (from connected table nodes) ─────────────────────────
const upstreamCols = computed((): VisibleCol[] => store.modalNodeUpstreamCols)

// ── CTE: column search ────────────────────────────────────────────────────
const cteColSearch = ref('')

// ── CTE: grouped cols by source table (for hierarchical picker) ───────────
interface CteColGroup {
  sourceId:    string
  sourceLabel: string   // table name (used as qualifier in SQL)
  isHeader:    boolean  // true if this table has isHeaderNode = true
  cteLabel?:   string
  cols:        VisibleCol[]
}

const cteChildTableNodes = computed(() =>
  store.modalNode ? getCteFrameChildren(store.modalNode) : []
)

const cteGroupedCols = computed((): CteColGroup[] => {
  const groups: CteColGroup[] = []
  const visited = new Set<string>()

  function getTableCols(node: any): VisibleCol[] {
    // Always use full details list — so all columns are available to pick
    const details = node.data.details as any[] | undefined
    if (details?.length) {
      return details.map((c: any) => ({
        name:   c.column_name,
        type:   c.column_type || c.data_type,
        remark: c.remark ?? '',
        isPk:   c.data_pk === 'Y',
        alias:  '',
      }))
    }
    // Fallback to visibleCols if details not loaded yet
    const visible = node.data.visibleCols as VisibleCol[] | undefined
    return visible ?? []
  }

  // Show ONLY nodes inside this CTE frame — header table first
  const nodes = [...cteChildTableNodes.value]
  // Sort: isHeaderNode first
  nodes.sort((a, b) => (b.data?.isHeaderNode ? 1 : 0) - (a.data?.isHeaderNode ? 1 : 0))
  for (const node of nodes) {
    if (visited.has(node.id as string)) continue
    visited.add(node.id as string)
    const cols = getTableCols(node)
    if (cols.length) {
      groups.push({
        sourceId:    node.id as string,
        sourceLabel: (node.data.tableName || node.data.label || node.id) as string,
        isHeader:    !!(node.data?.isHeaderNode),
        cols,
      })
    }
  }

  return groups
})

// ── CTE: filtered groups (by search) ─────────────────────────────────────
const cteFilteredGroups = computed((): CteColGroup[] => {
  const q = cteColSearch.value.toLowerCase().trim()
  if (!q) return cteGroupedCols.value
  return cteGroupedCols.value
    .map(g => ({ ...g, cols: g.cols.filter(c => c.name.toLowerCase().includes(q) || (c.remark ?? '').toLowerCase().includes(q)) }))
    .filter(g => g.cols.length)
})

// ── CTE: active group selection (after cteGroupedCols is declared) ────────
const selectedCteGroup = ref<string | null>(null)
watch(() => store.modalNodeId, () => { selectedCteGroup.value = null })
watch(cteGroupedCols, (groups) => {
  if (!selectedCteGroup.value && groups.length) {
    selectedCteGroup.value = groups[0]!.sourceId
  }
}, { immediate: true })

const activeCteGroup = computed(() =>
  cteGroupedCols.value.find(g => g.sourceId === selectedCteGroup.value) ?? cteGroupedCols.value[0] ?? null
)

const filteredActiveCols = computed(() => {
  const q = cteColSearch.value.toLowerCase().trim()
  if (!activeCteGroup.value) return []
  return q
    ? activeCteGroup.value.cols.filter(c => c.name.toLowerCase().includes(q) || (c.remark ?? '').toLowerCase().includes(q))
    : activeCteGroup.value.cols
})

// ── CTE: qualified key for a col in a group ("tableName.colName") ─────────
function cteQualKey(group: CteColGroup, colName: string): string {
  return `${group.sourceLabel}.${colName}`
}
function isCteColSelected(group: CteColGroup, colName: string): boolean {
  const sel = (store.modalNode?.data?.selectedCols ?? []) as string[]
  return sel.includes(cteQualKey(group, colName))
}
function toggleCteQualCol(group: CteColGroup, colName: string) {
  const qKey = cteQualKey(group, colName)
  const sel = [...(store.modalNode?.data?.selectedCols ?? [])] as string[]
  const wasSelected = sel.includes(qKey)
  // Remove only the exact qualified key (or legacy plain name for this group's col)
  const filtered = sel.filter(s => s !== qKey)
  if (!wasSelected) filtered.push(qKey)
  tn.setModalData({ selectedCols: filtered })
}
// ── CTE: select / clear all cols from a specific group ───────────────────
function selectAllFromCteGroup(group: CteColGroup) {
  const qKeys = group.cols.map(c => cteQualKey(group, c.name))
  const current = (store.modalNode?.data?.selectedCols ?? []) as string[]
  // Remove any old plain-name entries for these cols, then add qualified
  const prefix = `${group.sourceLabel}.`
  const filtered = current.filter(s => !qKeys.includes(s) && !group.cols.some(c => s === c.name) && !s.startsWith(prefix))
  tn.setModalData({ selectedCols: [...filtered, ...qKeys] })
}
function clearAllFromCteGroup(group: CteColGroup) {
  const prefix = `${group.sourceLabel}.`
  const plainNames = new Set(group.cols.map(c => c.name))
  const current = ((store.modalNode?.data?.selectedCols ?? []) as string[]).filter(
    s => !s.startsWith(prefix) && !plainNames.has(s)
  )
  tn.setModalData({ selectedCols: current })
}

// ── Union: get sqlTable nodes inside a cteFrame by bounds ─────────────────
function getCteFrameChildren(frame: any): any[] {
  const fw = parseFloat(String(frame.style?.width  ?? '420'))
  const fh = parseFloat(String(frame.style?.height ?? '280'))
  const fx = frame.position.x
  const fy = frame.position.y
  const NW = 112
  const NH = 80
  return store.nodes.filter((n: any) =>
    n.type === 'sqlTable' &&
    (n.position.x + NW) >= fx && (n.position.x + NW) <= fx + fw &&
    (n.position.y + NH) >= fy && (n.position.y + NH) <= fy + fh
  )
}

// ── Union: traverse a node upstream → collect tables + columns ───────────
function collectNodeInfo(rootId: string): { tables: string[]; colNames: Set<string> } {
  const tables: string[] = []
  const colNames = new Set<string>()
  const visited  = new Set<string>()

  function walk(id: string) {
    if (visited.has(id)) return
    visited.add(id)
    const node = store.nodes.find((n: any) => n.id === id)
    if (!node) return
    if (node.type === 'sqlTable') {
      tables.push((node.data.tableName || node.data.label || id) as string)
      const visible = node.data.visibleCols as any[] | undefined
      const details = node.data.details as any[] | undefined
      const names = visible?.length
        ? visible.map((c: any) => c.name as string)
        : (details ?? []).map((c: any) => c.column_name as string)
      names.forEach(n => colNames.add(n))
    } else if (node.type === 'cteFrame') {
      // bounds-based: no edges connect cteFrame to its children
      const children = getCteFrameChildren(node)
      for (const child of children) {
        tables.push((child.data.tableName || child.data.label || child.id) as string)
        const visible = child.data.visibleCols as any[] | undefined
        const details = child.data.details as any[] | undefined
        const names = visible?.length
          ? visible.map((c: any) => c.name as string)
          : (details ?? []).map((c: any) => c.column_name as string)
        names.forEach((n: string) => colNames.add(n))
      }
    } else {
      // recurse into upstream
      store.edges
        .filter((e: any) => e.target === id)
        .forEach((e: any) => walk(e.source as string))
    }
  }

  walk(rootId)
  return { tables, colNames }
}

// ── IDs of sqlTable nodes that live inside a cteFrame (hidden from flat list)
const cteChildTableIds = computed((): Set<string> => {
  const ids = new Set<string>()
  for (const node of store.nodes) {
    if (node.type === 'cteFrame') {
      for (const child of getCteFrameChildren(node)) {
        ids.add(child.id as string)
      }
    }
  }
  return ids
})

// ── Union: ALL canvas nodes available as sources (except self & cte-children)
const allUnionSources = computed(() => {
  if (!store.modalNodeId) return []
  return store.nodes
    .filter((n: any) => n.id !== store.modalNodeId && !cteChildTableIds.value.has(n.id as string))
    .map((n: any) => {
      const nt  = n.data?.nodeType as string | undefined
      const tag = n.type === 'sqlTable' ? 'TABLE' : (nt ?? n.type ?? '').toUpperCase()
      const nameProp = n.type !== 'sqlTable' && (n.data?.name as string) ? n.data.name as string : undefined
      const label    = nameProp ?? n.data?.label ?? n.data?.tableName ?? n.id
      const { tables } = collectNodeInfo(n.id as string)
      return { id: n.id as string, label: String(label), tag, tables }
    })
})

// ── Union: toggle a source — add or remove edge ───────────────────────────
function toggleUnionSource(srcId: string) {
  const edgeId = `e-${srcId}-${store.modalNodeId}`
  const exists  = store.edges.some((e: any) => e.id === edgeId)
  if (exists) {
    store.edges = store.edges.filter((e: any) => e.id !== edgeId)
    // Clean up columnMapping picks for the removed source
    const current = unionColMapping.value.map(r => {
      const picks = { ...r.picks }
      delete picks[srcId]
      return { ...r, picks }
    })
    tn.setModalData({ columnMapping: current })
    return
  }

  // Determine source category for distinct coloring
  const srcNode = store.nodes.find((n: any) => n.id === srcId)
  const srcCat  = srcNode?.type === 'cteFrame'
    ? 'cte'
    : srcNode?.type === 'sqlTable'
      ? 'table'
      : (srcNode?.data?.nodeType as string | undefined) ?? 'other'

  const UNION_SRC_COLORS: Record<string, string> = {
    cte:   '#a78bfa',  // violet — CTE Frame
    union: '#eab308',  // yellow — Union node
    table: '#38bdf8',  // sky    — standalone table
    where: '#f87171',  // rose   — where node
    group: '#fb923c',  // orange — group-by node
    calc:  '#2dd4bf',  // teal   — calc node
    other: '#94a3b8',  // slate  — fallback
  }
  const stroke = UNION_SRC_COLORS[srcCat] ?? UNION_SRC_COLORS.other

  store.edges = [...store.edges, {
    id:        edgeId,
    source:    srcId,
    target:    store.modalNodeId!,
    type:      'sqlEdge',
    animated:  true,
    style:     { stroke, strokeWidth: 2, strokeDasharray: '6 4' },
    markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 16, height: 16 },
    data:      { isTool: true, unionSrc: true, srcCat },
  } as any]
}

function isUnionSourceConnected(srcId: string): boolean {
  const edgeId = `e-${srcId}-${store.modalNodeId}`
  return store.edges.some((e: any) => e.id === edgeId)
}

// ── Union: rich source list with breakdown + columns ─────────────────────
const unionSources = computed(() => {
  if (!store.modalNodeId) return []
  return store.edges
    .filter((e: any) => e.target === store.modalNodeId)
    .map((e: any) => {
      const src = store.nodes.find((n: any) => n.id === e.source)
      if (!src) return null
      const nt  = src.data?.nodeType as string | undefined
      const tag = src.type === 'sqlTable' ? 'TABLE' : (nt ?? src.type ?? '').toUpperCase()
      const cteName = src.type !== 'sqlTable' && (src.data?.name as string) ? src.data.name as string : undefined
      const label   = cteName ?? src.data?.label ?? src.data?.tableName ?? src.id
      const { tables, colNames } = collectNodeInfo(src.id as string)
      return { id: src.id as string, label: String(label), tag, cteName, tables, colNames }
    })
    .filter(Boolean) as Array<{
      id: string; label: string; tag: string
      cteName?: string; tables: string[]; colNames: Set<string>
    }>
})

// ── Union: column coverage — which sources have each column ───────────────
const unionColCoverage = computed(() => {
  const map = new Map<string, number>()   // colName → count of sources that have it
  const total = unionSources.value.length
  if (!total) return { map, total }
  for (const src of unionSources.value) {
    for (const col of src.colNames) {
      map.set(col, (map.get(col) ?? 0) + 1)
    }
  }
  return { map, total }
})

// ── Union: total unique cols selected across all sources (selectedColsMap) ──
const unionSelectedCount = computed((): number => {
  const colsMap = (store.modalNode?.data?.selectedColsMap ?? {}) as Record<string, string[]>
  const all = [...new Set(Object.values(colsMap).flat().filter(Boolean))]
  return all.length
})

// ── Union: selected cols that are missing from ≥1 source ─────────────────
const unionColWarnings = computed((): Set<string> => {
  const { map, total } = unionColCoverage.value
  if (!total) return new Set()
  // Check both per-source selections and global selectedCols
  const colsMap = (store.modalNode?.data?.selectedColsMap ?? {}) as Record<string, string[]>
  const perSrc  = [...new Set(Object.values(colsMap).flat().filter(Boolean))]
  const global  = (store.modalNode?.data?.selectedCols ?? []) as string[]
  const sel = perSrc.length ? perSrc : global
  return new Set(sel.filter(c => (map.get(c) ?? 0) < total))
})

// ── Union: columns that exist in ALL connected sources ────────────────────
const unionCommonCols = computed((): string[] => {
  const { map, total } = unionColCoverage.value
  if (!total) return []
  return [...map.entries()].filter(([, cnt]) => cnt === total).map(([name]) => name)
})

function selectUnionCommonCols() {
  const sourceIds = unionSources.value.map(s => s.id)
  tn.selectAllUnionSourcesWithCols(sourceIds, unionCommonCols.value)
}

// ── Union column source: upstream if connected, else all canvas cols ──────
const unionAvailableCols = computed((): VisibleCol[] => {
  if (upstreamCols.value.length) return upstreamCols.value
  const seen = new Set<string>()
  const cols: VisibleCol[] = []
  for (const node of store.tableNodes) {
    const visible = node.data.visibleCols as VisibleCol[] | undefined
    const details = node.data.details as any[] | undefined
    const src: VisibleCol[] = visible?.length
      ? visible
      : (details ?? []).map((c: any) => ({
          name:   c.column_name,
          type:   c.column_type || c.data_type,
          remark: c.remark ?? '',
          isPk:   c.data_pk === 'Y',
          alias:  '',
        }))
    for (const col of src) {
      if (!seen.has(col.name)) { seen.add(col.name); cols.push(col) }
    }
  }
  return cols
})

// ── Union: collect full VisibleCol[] from any node (recursive upstream) ──
function collectVisibleCols(rootId: string): VisibleCol[] {
  const cols: VisibleCol[] = []
  const seen    = new Set<string>()
  const visited = new Set<string>()

  function addTableCols(node: any) {
    const tableLabel = String(node.data.tableName || node.data.label || node.id)
    const visible = node.data.visibleCols as VisibleCol[] | undefined
    const details = node.data.details as any[] | undefined
    const src: VisibleCol[] = visible?.length
      ? visible
      : (details ?? []).map((c: any) => ({
          name:   c.column_name,
          type:   c.column_type || c.data_type,
          remark: c.remark ?? '',
          isPk:   c.data_pk === 'Y',
          alias:  '',
        }))
    for (const col of src) {
      if (!seen.has(col.name)) {
        seen.add(col.name)
        cols.push({ ...col, sourceTableLabel: col.sourceTableLabel || tableLabel })
      }
    }
  }

  function walk(id: string) {
    if (visited.has(id)) return
    visited.add(id)
    const node = store.nodes.find((n: any) => n.id === id)
    if (!node) return
    if (node.type === 'sqlTable') {
      addTableCols(node)
    } else if (node.type === 'cteFrame') {
      // bounds-based child detection — no edges connect frame to its tables
      for (const child of getCteFrameChildren(node)) {
        if (!visited.has(child.id as string)) {
          visited.add(child.id as string)
          addTableCols(child)
        }
      }
    } else {
      // toolNode / union — recurse into each upstream source
      store.edges
        .filter((e: any) => e.target === id)
        .forEach((e: any) => walk(e.source as string))
    }
  }

  walk(rootId)
  return cols
}

// ── Union: collect table-grouped VisibleCol[] for expanded display ────────
interface TableColGroup { tableId: string; tableLabel: string; cols: VisibleCol[] }

function collectTableGroups(rootId: string): TableColGroup[] {
  const groups: TableColGroup[] = []
  const visited = new Set<string>()

  function addGroup(node: any) {
    const tableLabel = String(node.data.tableName || node.data.label || node.id)
    const visible = node.data.visibleCols as VisibleCol[] | undefined
    const details = node.data.details as any[] | undefined
    const cols: VisibleCol[] = visible?.length
      ? visible
      : (details ?? []).map((c: any) => ({
          name:   c.column_name,
          type:   c.column_type || c.data_type,
          remark: c.remark ?? '',
          isPk:   c.data_pk === 'Y',
          alias:  '',
        }))
    groups.push({ tableId: node.id as string, tableLabel, cols })
  }

  function walk(id: string) {
    if (visited.has(id)) return
    visited.add(id)
    const node = store.nodes.find((n: any) => n.id === id)
    if (!node) return
    if (node.type === 'sqlTable') {
      addGroup(node)
    } else if (node.type === 'cteFrame') {
      for (const child of getCteFrameChildren(node)) {
        if (!visited.has(child.id as string)) {
          visited.add(child.id as string)
          addGroup(child)
        }
      }
    } else {
      store.edges
        .filter((e: any) => e.target === id)
        .forEach((e: any) => walk(e.source as string))
    }
  }

  walk(rootId)
  return groups
}

// ── Union: grouped cols — one group per connected source node ─────────────
interface UnionColGroup {
  sourceId:  string
  label:     string
  tag:       string
  tables:    string[]
  cols:      VisibleCol[]
}

const unionGroupedCols = computed((): UnionColGroup[] => {
  if (!store.modalNodeId) return []
  return store.edges
    .filter((e: any) => e.target === store.modalNodeId)
    .map((e: any) => {
      const src = store.nodes.find((n: any) => n.id === e.source)
      if (!src) return null
      const nt    = src.data?.nodeType as string | undefined
      const tag   = src.type === 'sqlTable' ? 'TABLE' : (nt ?? src.type ?? '').toUpperCase()
      const label = (src.data?.name || src.data?.label || src.data?.tableName || src.id) as string
      const { tables } = collectNodeInfo(src.id as string)
      const cols  = collectVisibleCols(src.id as string)
      return { sourceId: src.id as string, label: String(label), tag, tables, cols }
    })
    .filter(Boolean) as UnionColGroup[]
})

// ── Union: expandable group cards ──────────────────────────────────────
const unionExpandedSources = ref(new Set<string>())

function toggleUnionSourceExpanded(id: string) {
  const s = new Set(unionExpandedSources.value)
  s.has(id) ? s.delete(id) : s.add(id)
  unionExpandedSources.value = s
}

// Rich source list (all available nodes) including their visible cols
const allUnionSourcesRich = computed(() =>
  allUnionSources.value.map(src => ({
    ...src,
    cols:        collectVisibleCols(src.id),
    tableGroups: collectTableGroups(src.id),
  }))
)

// Track which table sub-groups are expanded (key = sourceId:tableId)
const expandedTableGroups = ref(new Set<string>())
function toggleTableGroup(sourceId: string, tableId: string) {
  const key = `${sourceId}:${tableId}`
  const s   = new Set(expandedTableGroups.value)
  s.has(key) ? s.delete(key) : s.add(key)
  expandedTableGroups.value = s
}

// ── Union: column mapping model ───────────────────────────────────────
interface UnionColMap {
  outputName: string
  picks: Record<string, string>  // sourceId → fieldName ('' = NULL)
}

const unionColMapping = computed((): UnionColMap[] =>
  (store.modalNode?.data?.columnMapping ?? []) as UnionColMap[]
)

function addUnionMappingRow() {
  const current = unionColMapping.value.map(r => ({ ...r, picks: { ...r.picks } }))
  current.push({ outputName: `column_${current.length + 1}`, picks: {} })
  tn.setModalData({ columnMapping: current })
}

function removeUnionMappingRow(i: number) {
  const current = unionColMapping.value.map(r => ({ ...r, picks: { ...r.picks } }))
  current.splice(i, 1)
  tn.setModalData({ columnMapping: current })
}

function setUnionMappingRowName(i: number, name: string) {
  const current = unionColMapping.value.map(r => ({ ...r, picks: { ...r.picks } }))
  if (current[i]) current[i]!.outputName = name
  tn.setModalData({ columnMapping: current })
}

function setUnionMappingPick(rowIdx: number, sourceId: string, field: string) {
  const current = unionColMapping.value.map(r => ({ ...r, picks: { ...r.picks } }))
  if (current[rowIdx]) current[rowIdx]!.picks[sourceId] = field
  tn.setModalData({ columnMapping: current })
}

function autoDetectUnionMapping() {
  const sources = unionGroupedCols.value
  if (!sources.length) return
  const allColNames = new Set<string>()
  for (const src of sources) {
    for (const col of src.cols) allColNames.add(col.name)
  }
  // Sort: full coverage (all sources have the column) first, then partial by coverage count desc
  const colList = [...allColNames].sort((a, b) => {
    const covA = sources.filter(s => s.cols.some(c => c.name === a)).length
    const covB = sources.filter(s => s.cols.some(c => c.name === b)).length
    return covB - covA
  })
  const mapping: UnionColMap[] = []
  for (const colName of colList) {
    const picks: Record<string, string> = {}
    for (const src of sources) {
      picks[src.sourceId] = src.cols.some(c => c.name === colName) ? colName : ''
    }
    mapping.push({ outputName: colName, picks })
  }
  tn.setModalData({ columnMapping: mapping })
}

function clearUnionMapping() {
  tn.setModalData({ columnMapping: [] })
}

function selectAllUnionSources() {
  for (const src of allUnionSourcesRich.value) {
    if (!isUnionSourceConnected(src.id)) toggleUnionSource(src.id)
  }
}

function clearAllUnionSources() {
  store.edges = store.edges.filter((e: any) => e.target !== store.modalNodeId)
  tn.setModalData({ columnMapping: [] })
}

// Rows where every source pick is empty string (all NULL) — invalid
const unionMappingHasAllNullRows = computed((): string[] =>
  unionColMapping.value
    .filter(row => !Object.values(row.picks).some(v => v))
    .map(row => row.outputName)
)

function moveUnionMappingRow(i: number, dir: -1 | 1) {
  const current = unionColMapping.value.map(r => ({ ...r, picks: { ...r.picks } }))
  const j = i + dir
  if (j < 0 || j >= current.length) return
  ;[current[i], current[j]] = [current[j]!, current[i]!]
  tn.setModalData({ columnMapping: current })
}

// Auto-select only columns that exist in ALL connected sources (exact name match, full coverage)
function autoSelectExactMatch() {
  const sources = unionGroupedCols.value
  if (!sources.length) return
  const mapping: UnionColMap[] = []
  for (const col of unionAllSourceCols.value) {
    if (col.coveredCount < sources.length) continue
    const picks: Record<string, string> = {}
    for (const src of sources) picks[src.sourceId] = col.name
    mapping.push({ outputName: col.name, picks })
  }
  tn.setModalData({ columnMapping: mapping })
}

// Check if two SQL types are compatible (same group = numeric/string/date)
function isTypeCompatible(t1: string, t2: string): boolean {
  const base = (t: string) => t.toLowerCase().split('(')[0]?.trim() ?? ''
  const b1 = base(t1), b2 = base(t2)
  if (!b1 || !b2 || b1 === b2) return true
  const NUM  = ['int','integer','bigint','smallint','tinyint','decimal','numeric','float','double','real','money','smallmoney','number','bit']
  const STR  = ['varchar','nvarchar','char','nchar','text','ntext','xml','uniqueidentifier']
  const DATE = ['datetime','datetime2','smalldatetime','datetimeoffset','date','time','timestamp']
  const grp  = (b: string) => NUM.some(t => b.startsWith(t)) ? 'num' : STR.some(t => b.startsWith(t)) ? 'str' : DATE.some(t => b.startsWith(t)) ? 'date' : 'other'
  return grp(b1) === grp(b2)
}

// Determine reference type for a mapping row (first non-empty pick)
function getRowReferenceType(row: UnionColMap): string {
  for (const src of unionGroupedCols.value) {
    const f = row.picks[src.sourceId]
    if (f) return getUnionPickType(src.sourceId, f)
  }
  return ''
}

// Per-pick status: matched | mismatch | null
function getPickStatus(row: UnionColMap, sourceId: string): 'matched' | 'mismatch' | 'null' {
  const field = row.picks[sourceId] ?? ''
  if (!field) return 'null'
  const refType = getRowReferenceType(row)
  if (!refType) return 'matched'
  return isTypeCompatible(refType, getUnionPickType(sourceId, field)) ? 'matched' : 'mismatch'
}

const unionAllSourceCols = computed(() => {
  const sources = unionGroupedCols.value
  if (!sources.length) return []
  const colMap = new Map<string, { name: string; type: string; coveredCount: number; hasMismatch: boolean }>()
  for (const src of sources) {
    for (const col of src.cols) {
      if (!colMap.has(col.name)) colMap.set(col.name, { name: col.name, type: col.type, coveredCount: 0, hasMismatch: false })
    }
  }
  for (const [name, entry] of colMap) {
    entry.coveredCount = sources.filter(s => s.cols.some(c => c.name === name)).length
    const types = sources
      .map(s => s.cols.find(c => c.name === name)?.type ?? '')
      .filter(Boolean)
      .map(t => t.toLowerCase().split('(')[0] ?? '')
    entry.hasMismatch = types.length >= 2 && !types.every(t => t === types[0])
  }
  return [...colMap.values()].sort((a, b) => b.coveredCount - a.coveredCount)
})

function isColumnMapped(colName: string): boolean {
  return unionColMapping.value.some(r => r.outputName === colName)
}

// Check if a specific table's column is mapped (per-table, no cross-table sync)
function isTableColMapped(tableId: string, colName: string): boolean {
  return unionColMapping.value.some(r => r.picks[tableId] === colName)
}

// Toggle a column from a specific table — independent per table, no name collision
function toggleTableColMapping(tableId: string, colName: string) {
  const current = unionColMapping.value.map(r => ({ ...r, picks: { ...r.picks } }))
  const idx     = current.findIndex(r => r.picks[tableId] === colName)
  if (idx >= 0) {
    current.splice(idx, 1)
    // Auto-disconnect table if it has no more mapped columns
    const stillHasCols = current.some(r => r.picks[tableId])
    if (!stillHasCols && isUnionSourceConnected(tableId)) {
      toggleUnionSource(tableId)
    }
  } else {
    // Auto-connect the table source if not yet connected
    if (!isUnionSourceConnected(tableId)) {
      toggleUnionSource(tableId)
    }
    const picks: Record<string, string> = { [tableId]: colName }
    current.push({ outputName: colName, picks })
  }
  tn.setModalData({ columnMapping: current })
}

function toggleColumnInMapping(colName: string) {
  const current = unionColMapping.value.map(r => ({ ...r, picks: { ...r.picks } }))
  const idx = current.findIndex(r => r.outputName === colName)
  if (idx >= 0) {
    current.splice(idx, 1)
  } else {
    const picks: Record<string, string> = {}
    for (const src of unionGroupedCols.value) {
      picks[src.sourceId] = src.cols.some(c => c.name === colName) ? colName : ''
    }
    current.push({ outputName: colName, picks })
  }
  tn.setModalData({ columnMapping: current })
}

function getUnionPickType(sourceId: string, fieldName: string): string {
  const group = unionGroupedCols.value.find(g => g.sourceId === sourceId)
  return group?.cols.find(c => c.name === fieldName)?.type ?? ''
}

function hasUnionTypeMismatch(row: UnionColMap): boolean {
  const types = Object.entries(row.picks)
    .filter(([, f]) => f)
    .map(([srcId, field]) => {
      const t = getUnionPickType(srcId, field).toLowerCase()
      return t.split('(')[0] ?? ''
    })
    .filter(Boolean)
  if (types.length < 2) return false
  return !types.every(t => t === types[0])
}

function getUnionRowOutputType(row: UnionColMap): string {
  for (const src of unionGroupedCols.value) {
    const field = row.picks[src.sourceId]
    if (field) return getUnionPickType(src.sourceId, field)
  }
  return ''
}

const unmappedSourceCols = computed(() =>
  unionAllSourceCols.value.filter(col => !isColumnMapped(col.name))
)

const unionReadiness = computed(() => {
  const srcCount  = unionGroupedCols.value.length
  const colCount  = unionColMapping.value.length
  const nullRows  = unionMappingHasAllNullRows.value.length
  const mismatch  = unionAllSourceCols.value.some(c => c.hasMismatch && isColumnMapped(c.name))
  if (srcCount === 0)
    return { level: 'error', msg: 'ยังไม่มี source เชื่อมต่อ — กลับไป Step 1' }
  if (colCount === 0)
    return { level: 'info',  msg: `เชื่อม ${srcCount} source แล้ว — กด Auto Group หรือเพิ่ม column` }
  if (nullRows > 0)
    return { level: 'error', msg: `${nullRows} column ไม่มี source ส่งข้อมูลเลย (ทุก source = NULL)` }
  if (mismatch)
    return { level: 'warn',  msg: `พร้อมทำ UNION — ${unionColMapping.value.length} cols (มี type mismatch บางส่วน)` }
  return   { level: 'ok',   msg: `พร้อมทำ UNION — ${colCount} cols ครบถ้วน ไม่มี mismatch` }
})

function groupColsByTable(cols: VisibleCol[]): { tableLabel: string; cols: VisibleCol[] }[] {
  const order: string[] = []
  const map = new Map<string, VisibleCol[]>()
  for (const col of cols) {
    const key = col.sourceTableLabel || col.sourceTable || ''
    if (!map.has(key)) { map.set(key, []); order.push(key) }
    map.get(key)!.push(col)
  }
  return order.map(k => ({ tableLabel: k, cols: map.get(k)! }))
}

const showAddSourceDropdown  = ref(false)
const showStep2SrcDropdown   = ref(false)
const showUnionSqlPreview    = ref(true)
const unionViewMode          = ref<'output' | 'mapping'>('output')
const unionStep             = ref(1)
const UNION_STEPS = [
  { id: 1, label: 'เลือกข้อมูล'   },
  { id: 2, label: 'เลือก Columns' },
  { id: 3, label: 'ตั้งค่า'        },
  { id: 4, label: 'เงื่อนไข'       },
  { id: 5, label: 'ตรวจสอบ SQL'  },
]

const availableUnconnectedSources = computed(() =>
  allUnionSourcesRich.value.filter(src => !isUnionSourceConnected(src.id))
)

// ── Union: source compatibility map ──────────────────────────────────────
// Returns per-source-id: 'selected' | 'compatible' | 'incompatible' | undefined (nothing selected yet)
const unionCompatibilityMap = computed((): Map<string, 'selected' | 'compatible' | 'incompatible'> => {
  const map = new Map<string, 'selected' | 'compatible' | 'incompatible'>()
  if (!unionSources.value.length) return map   // nothing selected — all neutral

  // Build union of all column names from selected sources
  const selectedCols = new Set<string>()
  for (const src of unionSources.value) {
    for (const col of src.colNames) selectedCols.add(col)
  }

  for (const src of allUnionSourcesRich.value) {
    if (src.tag === 'CTE') {
      for (const tg of src.tableGroups) {
        if (isUnionSourceConnected(tg.tableId)) {
          map.set(tg.tableId, 'selected')
        } else {
          const overlap = tg.cols.filter(c => selectedCols.has(c.name)).length
          map.set(tg.tableId, overlap > 0 ? 'compatible' : 'incompatible')
        }
      }
    } else {
      if (isUnionSourceConnected(src.id)) {
        map.set(src.id, 'selected')
      } else {
        const overlap = src.cols.filter(c => selectedCols.has(c.name)).length
        map.set(src.id, overlap > 0 ? 'compatible' : 'incompatible')
      }
    }
  }
  return map
})

// Columns available for the Union WHERE filter = the UNION output column names.
// The WHERE clause is applied to the subquery `SELECT * FROM (...) _u WHERE ...`
// so column names must match outputName (the AS alias in the subquery), not source field names.
// Falls back to unionAvailableCols when no mapping has been defined yet.
const unionOutputCols = computed((): VisibleCol[] => {
  if (!unionColMapping.value.length) return unionAvailableCols.value
  return unionColMapping.value.map(row => ({
    name:   row.outputName,
    type:   getUnionRowOutputType(row),
    remark: '',
    isPk:   false,
    alias:  '',
  }))
})

function unionOverlapCount(srcId: string, cols: { name: string }[]): number {
  if (!unionSources.value.length) return 0
  const selectedCols = new Set<string>()
  for (const src of unionSources.value) {
    for (const col of src.colNames) selectedCols.add(col)
  }
  return cols.filter(c => selectedCols.has(c.name)).length
}

// ── Union: search + filtered groups ──────────────────────────────────────
const unionColSearch = ref('')
const unionColTab    = ref('__all__')

// Filtered column list for Step 2 (tab + search)
const unionColTabFiltered = computed(() => {
  const q    = unionColSearch.value.toLowerCase().trim()
  const all  = unionAllSourceCols.value
  let list   = unionColTab.value === '__all__'
    ? all
    : all.filter(c => {
        const grp = unionGroupedCols.value.find(g => g.sourceId === unionColTab.value)
        return grp ? grp.cols.some(sc => sc.name === c.name) : true
      })
  if (q) list = list.filter(c => c.name.toLowerCase().includes(q))
  return list
})

// Count of exact-match (all-source) columns not yet mapped
const exactMatchCols = computed(() =>
  unionAllSourceCols.value.filter(c => c.coveredCount === unionGroupedCols.value.length)
)

// Get remark for a column name (first source that has it)
function getColRemark(colName: string): string {
  for (const grp of unionGroupedCols.value) {
    const col = grp.cols.find(c => c.name === colName)
    if (col?.remark) return col.remark
  }
  return ''
}

const unionFilteredGroups = computed((): UnionColGroup[] => {
  const q = unionColSearch.value.toLowerCase().trim()
  if (!q) return unionGroupedCols.value
  return unionGroupedCols.value
    .map(g => ({ ...g, cols: g.cols.filter(c => c.name.toLowerCase().includes(q) || (c.remark ?? '').toLowerCase().includes(q)) }))
    .filter(g => g.cols.length)
})

// ── Union SQL preview (dynamic, per-source cols + WHERE) ─────────────────
const unionSqlPreview = computed(() => {
  const uType   = store.modalNode?.data?.unionType ?? 'UNION ALL'
  const conds   = ((store.modalNode?.data?.conditions ?? []) as any[]).filter(c => c.column && c.operator)
  const sources = unionSources.value.length
    ? unionSources.value
    : [{ id: '', label: 'source1' }, { id: '', label: 'source2' }]

  let unionPart: string
  const mapping = unionColMapping.value

  if (mapping.length > 0 && unionGroupedCols.value.length > 0) {
    // Use columnMapping model
    const parts = unionGroupedCols.value.map(group => {
      const selects = mapping.map(row => {
        const field = row.picks[group.sourceId] ?? ''
        if (!field) return `  NULL AS ${row.outputName}`
        const alias = field !== row.outputName ? ` AS ${row.outputName}` : ''
        return `  ${field}${alias}`
      })
      return `SELECT\n${selects.join(',\n')}\nFROM ${group.label}`
    })
    unionPart = parts.join(`\n${uType}\n`)
  } else {
    // Fall back to selectedColsMap / selectedCols
    const colsMap = (store.modalNode?.data?.selectedColsMap ?? {}) as Record<string, string[]>
    const global  = (store.modalNode?.data?.selectedCols ?? []) as string[]
    const parts = sources.map((s: any) => {
      const srcCols = s.id ? (colsMap[s.id] ?? []).filter(Boolean) : []
      const cols    = srcCols.length ? srcCols : global.filter(Boolean)
      const sel     = cols.length ? `SELECT\n  ${cols.join(',\n  ')}` : 'SELECT *'
      return `${sel}\nFROM ${s.label}`
    })
    unionPart = parts.join(`\n${uType}\n`)
  }

  if (!conds.length) return unionPart
  const wherePart = conds.map((c: any) => condPreview(c)).join('\n  AND ')
  return `SELECT * FROM (\n  ${unionPart.replace(/\n/g, '\n  ')}\n) _u\nWHERE ${wherePart}`
})

// ── CTE SQL preview ───────────────────────────────────────────────────────
const cteSqlPreview = computed(() => {
  const rawCols  = (store.modalNode?.data?.selectedCols ?? []) as string[]
  const conds    = ((store.modalNode?.data?.conditions ?? []) as any[]).filter(c => c.column && c.operator)
  const srcLabel = cteGroupedCols.value[0]?.sourceLabel ?? 'cte_source'
  const selectParts = rawCols.map((raw: string) => {
    const dotIdx = raw.indexOf('.')
    return `  ${dotIdx > -1 ? raw.slice(dotIdx + 1) : raw}`
  })
  const selectPart = selectParts.length ? selectParts.join(',\n') : '  *'
  let sql = `SELECT\n${selectPart}\nFROM ${srcLabel}`
  if (conds.length) {
    const normConds = conds.map((c: any) => ({
      ...c,
      column: String(c.column ?? '').includes('.') ? String(c.column).slice(String(c.column).indexOf('.') + 1) : c.column,
    }))
    sql += `\nWHERE ${normConds.map((c: any) => condPreview(c)).join('\n  AND ')}`
  }
  return sql
})

// ── Calc SQL preview ──────────────────────────────────────────────────────
const calcSqlPreview = computed(() => {
  const items   = ((store.modalNode?.data?.items ?? []) as any[]).filter((c: any) => c.col && c.op)
  const filters = ((store.modalNode?.data?.filters ?? []) as any[]).filter((f: any) => f.column && f.operator)
  const src     = upstreamCols.value[0]?.sourceTable ?? 'upstream'
  if (!items.length) return `SELECT *\nFROM ${src}`
  const exprs = items.map((c: any) => {
    const expr  = calcExprPreview(c.op, c.col, c.value ?? '')
    const alias = c.alias || `${c.col}_calc`
    return `  (${expr}) AS ${alias}`
  })
  let sql = `SELECT *,\n${exprs.join(',\n')}\nFROM ${src}`
  if (filters.length) sql += `\nWHERE ${filters.map((f: any) => condPreview(f)).join('\n  AND ')}`
  return sql
})

// ── Group SQL preview ─────────────────────────────────────────────────────
const groupSqlPreview = computed(() => {
  const groupCols = ((store.modalNode?.data?.groupCols ?? []) as string[]).filter(Boolean)
  const aggs      = ((store.modalNode?.data?.aggs ?? []) as any[]).filter((a: any) => a.col && a.func)
  const preConds  = ((store.modalNode?.data?.conditions ?? []) as any[]).filter((c: any) => c.column && c.operator)
  const having    = ((store.modalNode?.data?.filters ?? []) as any[]).filter((f: any) => f.column && f.operator)
  const src       = upstreamCols.value[0]?.sourceTable ?? 'upstream'
  if (!groupCols.length && !aggs.length) return `SELECT *\nFROM ${src}`
  const selectParts = [
    ...groupCols.map((c: string) => `  ${c}`),
    ...aggs.map((a: any) => {
      const fn = a.func === 'COUNT DISTINCT' ? `COUNT(DISTINCT ${a.col})` : `${a.func}(${a.col})`
      return a.alias ? `  ${fn} AS ${a.alias}` : `  ${fn}`
    }),
  ]
  let sql = `SELECT\n${selectParts.join(',\n')}\nFROM ${src}`
  if (preConds.length) sql += `\nWHERE ${preConds.map((c: any) => condPreview(c)).join('\n  AND ')}`
  if (groupCols.length) sql += `\nGROUP BY ${groupCols.join(', ')}`
  if (having.length) sql += `\nHAVING ${having.map((f: any) => condPreview(f)).join('\n  AND ')}`
  return sql
})

// ── Sort SQL preview ──────────────────────────────────────────────────────
const sortSqlPreview = computed(() => {
  const items = ((store.modalNode?.data?.items ?? []) as any[]).filter((s: any) => s.col)
  const conds = ((store.modalNode?.data?.conditions ?? []) as any[]).filter((c: any) => c.column && c.operator)
  const src   = upstreamCols.value[0]?.sourceTable ?? 'upstream'
  let sql = `SELECT *\nFROM ${src}`
  if (conds.length) sql += `\nWHERE ${conds.map((c: any) => condPreview(c)).join('\n  AND ')}`
  if (items.length) sql += `\nORDER BY ${items.map((s: any) => `${s.col} ${s.dir}`).join(', ')}`
  return sql
})

// ── Where SQL preview ────────────────────────────────────────────────────
const whereSqlPreview = computed(() => {
  const conds = ((store.modalNode?.data?.conditions ?? []) as any[]).filter(c => c.column && c.operator)
  const srcLabel = upstreamCols.value[0]?.sourceTable ?? 'source'
  if (!conds.length) return `SELECT *\nFROM ${srcLabel}`
  const wherePart = conds.map((c: any) => condPreview(c)).join('\n  AND ')
  return `SELECT *\nFROM ${srcLabel}\nWHERE ${wherePart}`
})

// ── Group By / Sort: field search ────────────────────────────────────────
const colSearch     = ref('')
const sortColSearch = ref('')

// ── Grouped by source table ───────────────────────────────────────────────
interface ColGroup { tableId: string; tableLabel: string; cols: VisibleCol[] }

const groupedUpstreamCols = computed((): ColGroup[] => {
  const map = new Map<string, ColGroup>()
  for (const col of upstreamCols.value) {
    const key   = col.sourceTable ?? '__unknown__'
    const label = col.sourceTableLabel ?? col.sourceTable ?? 'Table'
    if (!map.has(key)) map.set(key, { tableId: key, tableLabel: label, cols: [] })
    map.get(key)!.cols.push(col)
  }
  return [...map.values()]
})

function applyGroupSearch(q: string): ColGroup[] {
  if (!q) return groupedUpstreamCols.value
  const lq = q.toLowerCase()
  return groupedUpstreamCols.value
    .map(g => ({ ...g, cols: g.cols.filter(c =>
      c.name.toLowerCase().includes(lq) || (c.remark ?? '').toLowerCase().includes(lq)
    )}))
    .filter(g => g.cols.length > 0)
}

const filteredGroupedCols     = computed(() => applyGroupSearch(colSearch.value.trim()))
const filteredGroupedSortCols = computed(() => applyGroupSearch(sortColSearch.value.trim()))

// keep flat versions for dropdowns / datalists
const filteredCols = computed(() => {
  const q = colSearch.value.toLowerCase().trim()
  if (!q) return upstreamCols.value
  return upstreamCols.value.filter(c =>
    c.name.toLowerCase().includes(q) || (c.remark ?? '').toLowerCase().includes(q)
  )
})
const filteredSortCols = computed(() => {
  const q = sortColSearch.value.toLowerCase().trim()
  if (!q) return upstreamCols.value
  return upstreamCols.value.filter(c =>
    c.name.toLowerCase().includes(q) || (c.remark ?? '').toLowerCase().includes(q)
  )
})

const sortItems = computed(() =>
  (store.modalNode?.data?.items ?? []) as Array<{ col: string; dir: 'ASC' | 'DESC' }>
)

const sortItemCount = computed(() => sortItems.value.length)

function isSortSelected(colName: string) {
  return sortItems.value.some(s => s.col === colName)
}

function getSortDir(colName: string): 'ASC' | 'DESC' {
  return sortItems.value.find(s => s.col === colName)?.dir ?? 'ASC'
}

function toggleSortCol(colName: string, checked: boolean) {
  const current = sortItems.value.map(s => ({ ...s }))
  if (checked) {
    if (!current.some(s => s.col === colName)) current.push({ col: colName, dir: 'ASC' })
  } else {
    const idx = current.findIndex(s => s.col === colName)
    if (idx >= 0) current.splice(idx, 1)
  }
  store.updateNodeData(store.modalNodeId!, { items: current })
}

function setSortDir(colName: string, dir: 'ASC' | 'DESC') {
  const current = sortItems.value.map(s => s.col === colName ? { ...s, dir } : s)
  store.updateNodeData(store.modalNodeId!, { items: current })
}

function selectAllSortCols() {
  store.updateNodeData(store.modalNodeId!, {
    items: upstreamCols.value.map(c => ({
      col: c.name,
      dir: (sortItems.value.find(s => s.col === c.name)?.dir ?? 'ASC') as 'ASC' | 'DESC',
    })),
  })
}

function clearSortCols() {
  store.updateNodeData(store.modalNodeId!, { items: [] })
}

// ── Calculator ────────────────────────────────────────────────────────────
const calcItems = computed(() =>
  (store.modalNode?.data?.items ?? []) as Array<{ col: string; op: string; value: string; alias: string }>
)
const calcItemCount = computed(() => calcItems.value.filter(c => c.col && c.op).length)

const CALC_OPS = [
  { id: 'multiply', label: '×',        group: 'math',   needsValue: true,  ph: 'เช่น 1.07' },
  { id: 'add',      label: '+',        group: 'math',   needsValue: true,  ph: 'เช่น 100'  },
  { id: 'subtract', label: '−',        group: 'math',   needsValue: true,  ph: 'เช่น 50'   },
  { id: 'divide',   label: '÷',        group: 'math',   needsValue: true,  ph: 'เช่น 100'  },
  { id: 'isnull',   label: 'ISNULL',   group: 'null',   needsValue: true,  ph: 'ค่า default' },
  { id: 'coalesce', label: 'COALESCE', group: 'null',   needsValue: true,  ph: 'ค่า fallback' },
  { id: 'cast_int', label: 'AS INT',   group: 'cast',   needsValue: false, ph: '' },
  { id: 'cast_text',label: 'AS TEXT',  group: 'cast',   needsValue: false, ph: '' },
  { id: 'cast_dec', label: 'AS DEC',   group: 'cast',   needsValue: false, ph: '' },
  { id: 'upper',    label: 'UPPER',    group: 'string', needsValue: false, ph: '' },
  { id: 'lower',    label: 'LOWER',    group: 'string', needsValue: false, ph: '' },
  { id: 'trim',     label: 'TRIM',     group: 'string', needsValue: false, ph: '' },
  { id: 'year',     label: 'YEAR',     group: 'date',   needsValue: false, ph: '' },
  { id: 'month',    label: 'MONTH',    group: 'date',   needsValue: false, ph: '' },
  { id: 'day',      label: 'DAY',      group: 'date',   needsValue: false, ph: '' },
] as const

// Colors per group — active (selected) vs hover
const OP_ACTIVE: Record<string, string> = {
  math:   'bg-blue-500 text-white border-blue-500',
  null:   'bg-amber-500 text-white border-amber-500',
  cast:   'bg-violet-500 text-white border-violet-500',
  string: 'bg-pink-500 text-white border-pink-500',
  date:   'bg-cyan-500 text-white border-cyan-500',
}
const OP_HOVER: Record<string, string> = {
  math:   'border-border text-muted-foreground hover:border-blue-400/60 hover:text-blue-500 hover:bg-blue-500/8',
  null:   'border-border text-muted-foreground hover:border-amber-400/60 hover:text-amber-500 hover:bg-amber-500/8',
  cast:   'border-border text-muted-foreground hover:border-violet-400/60 hover:text-violet-500 hover:bg-violet-500/8',
  string: 'border-border text-muted-foreground hover:border-pink-400/60 hover:text-pink-500 hover:bg-pink-500/8',
  date:   'border-border text-muted-foreground hover:border-cyan-400/60 hover:text-cyan-500 hover:bg-cyan-500/8',
}

function opClass(itemOp: string, op: typeof CALC_OPS[number]) {
  const isActive = itemOp === op.id
  return isActive ? OP_ACTIVE[op.group] : OP_HOVER[op.group]
}

function calcExprPreview(op: string, col: string, val: string): string {
  if (!col || !op) return '—'
  switch (op) {
    case 'multiply': return `${col} * ${val || '?'}`
    case 'add':      return `${col} + ${val || '?'}`
    case 'subtract': return `${col} - ${val || '?'}`
    case 'divide':   return `${col} / ${val || '?'}`
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

function calcNeedsValue(op: string): boolean {
  return CALC_OPS.find(o => o.id === op)?.needsValue ?? false
}

function calcValuePlaceholder(op: string): string {
  return CALC_OPS.find(o => o.id === op)?.ph ?? ''
}

// Helper: format condition value for SQL preview (mirrors formatCondClause in useSqlGenerator)
const NUMERIC_TYPES_RE = /^(int|bigint|smallint|tinyint|decimal|numeric|float|real|money|smallmoney|bit)/i
function condPreview(cond: any): string {
  const col = cond.column, op = cond.operator, val = String(cond.value ?? '')
  if (['IS NULL', 'IS NOT NULL'].includes(op)) return `${col} ${op}`
  if (op === 'LIKE') return `${col} LIKE N'${val || '?'}'`
  if (op === 'IN')   return `${col} IN (${val || '?'})`
  const isNumeric = cond.colType
    ? NUMERIC_TYPES_RE.test(cond.colType)
    : /^-?\d+(\.\d+)?$/.test(val)
  return isNumeric
    ? `${col} ${op} ${val || '?'}`
    : `${col} ${op} '${val || '?'}'`
}

// Helper: check if a column is date type (for date picker)
function isDateCol(colName: string): boolean {
  const col = upstreamCols.value.find(c => c.name === colName)
  if (!col) return false
  const t = col.type?.toLowerCase() ?? ''
  return ['date','datetime','datetime2','datetimeoffset','smalldatetime','timestamp'].includes(t)
}

// Date input refs — WHERE conditions
const whereDateRefs = ref<Map<number, HTMLInputElement>>(new Map())
function setWhereDateRef(i: number, el: any) {
  if (el) whereDateRefs.value.set(i, el as HTMLInputElement)
  else whereDateRefs.value.delete(i)
}
function openWhereDatePicker(i: number) {
  const input = whereDateRefs.value.get(i)
  if (!input) return
  try { input.showPicker() } catch { input.click() }
}

// Date input refs — Calc filters
const calcFilterDateRefs = ref<Map<number, HTMLInputElement>>(new Map())
function setCalcFilterDateRef(i: number, el: any) {
  if (el) calcFilterDateRefs.value.set(i, el as HTMLInputElement)
  else calcFilterDateRefs.value.delete(i)
}
function openCalcFilterDatePicker(i: number) {
  const input = calcFilterDateRefs.value.get(i)
  if (!input) return
  try { input.showPicker() } catch { input.click() }
}

// Date input refs — HAVING filters
const groupFilterDateRefs = ref<Map<number, HTMLInputElement>>(new Map())
function setGroupFilterDateRef(i: number, el: any) {
  if (el) groupFilterDateRefs.value.set(i, el as HTMLInputElement)
  else groupFilterDateRefs.value.delete(i)
}
function openGroupFilterDatePicker(i: number) {
  const input = groupFilterDateRefs.value.get(i)
  if (!input) return
  try { input.showPicker() } catch { input.click() }
}

// Date input refs — CTE conditions
const cteDateRefs = ref<Map<number, HTMLInputElement>>(new Map())
function setCteDateRef(i: number, el: any) {
  if (el) cteDateRefs.value.set(i, el as HTMLInputElement)
  else cteDateRefs.value.delete(i)
}
function openCteDatePicker(i: number) {
  const input = cteDateRefs.value.get(i)
  if (!input) return
  try { input.showPicker() } catch { input.click() }
}

// Calc filters
const calcFilters = computed(() =>
  (store.modalNode?.data?.filters ?? []) as Array<{ column: string; operator: string; value: string }>
)
const calcFilterCount = computed(() => calcFilters.value.filter(f => f.column && f.operator).length)

// HAVING filters (for GROUP BY)
const groupFilters = computed(() =>
  (store.modalNode?.data?.filters ?? []) as Array<{ column: string; operator: string; value: string }>
)
const groupFilterCount = computed(() => groupFilters.value.filter(f => f.column && f.operator).length)

// Available columns for HAVING: agg aliases + groupCols
const havingCols = computed(() => {
  const aggAliases = (store.modalNode?.data?.aggs ?? [])
    .filter((a: any) => a.col && a.func)
    .map((a: any) => ({
      name: a.alias || `${a.func}(${a.col})`,
      type: 'number',
      remark: `${a.func}(${a.col})`,
      isPk: false,
    }))
  const groupColNames = (store.modalNode?.data?.groupCols ?? [])
    .filter(Boolean)
    .map((name: string) => {
      const upstream = upstreamCols.value.find(c => c.name === name)
      return upstream ?? { name, type: '', remark: '', isPk: false }
    })
  return [...aggAliases, ...groupColNames]
})

// HAVING column dropdown
const openGroupFilterColIdx = ref<number | null>(null)
const groupFilterColDropPos = ref<{ top: number; left: number; width: number } | null>(null)

function toggleGroupFilterColDropdown(i: number, e: MouseEvent) {
  if (openGroupFilterColIdx.value === i) { openGroupFilterColIdx.value = null; groupFilterColDropPos.value = null; return }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  groupFilterColDropPos.value = { top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 240) }
  openGroupFilterColIdx.value = i
}
function closeGroupFilterColDropdown() { openGroupFilterColIdx.value = null; groupFilterColDropPos.value = null }
function selectGroupFilterCol(i: number, colName: string) {
  const col = havingCols.value.find(c => c.name === colName)
  tn.setGroupFilter(i, { column: colName, colType: col?.type ?? '' })
  closeGroupFilterColDropdown()
}

// Column dropdown for calc filter column picker
const openCalcFilterColIdx = ref<number | null>(null)
const calcFilterColDropPos = ref<{ top: number; left: number; width: number } | null>(null)

function toggleCalcFilterColDropdown(i: number, e: MouseEvent) {
  if (openCalcFilterColIdx.value === i) { openCalcFilterColIdx.value = null; calcFilterColDropPos.value = null; return }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  calcFilterColDropPos.value = { top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 240) }
  openCalcFilterColIdx.value = i
}

function closeCalcFilterColDropdown() { openCalcFilterColIdx.value = null; calcFilterColDropPos.value = null }

function selectCalcFilterCol(i: number, colName: string) {
  const col = upstreamCols.value.find(c => c.name === colName)
  tn.setCalcFilter(i, { column: colName, colType: col?.type ?? '' })
  closeCalcFilterColDropdown()
}

// Column dropdown for calc items
const openCalcColIdx  = ref<number | null>(null)
const calcColDropPos  = ref<{ top: number; left: number; width: number } | null>(null)

function toggleCalcColDropdown(i: number, e: MouseEvent) {
  if (openCalcColIdx.value === i) { openCalcColIdx.value = null; calcColDropPos.value = null; return }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  calcColDropPos.value = { top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 240) }
  openCalcColIdx.value = i
}

function closeCalcColDropdown() { openCalcColIdx.value = null; calcColDropPos.value = null }

function selectCalcCol(i: number, colName: string) {
  const current = calcItems.value[i]
  // Auto-fill alias with col name if alias is empty
  const alias = current?.alias || colName
  tn.setCalcItem(i, { col: colName, alias })
  closeCalcColDropdown()
}

// Auto-init on modal open
// flush:'sync' ensures the init runs before first render so cols appear pre-checked
watch(() => store.modalNode, (node, oldNode) => {
  if (!node) { colSearch.value = ''; sortColSearch.value = ''; return }
  const type = node.data.nodeType
  // True only when the modal just opened for a different node (not a data update on the same node)
  const isNewOpen = node.id !== oldNode?.id
  if (type === 'group') {
    if (isNewOpen) colSearch.value = ''
    // Clear junk groupCols from old auto-populate behavior, but only if the user
    // has never explicitly set them (_groupColsUserSet flag is absent)
    if (!node.data._groupColsUserSet && upstreamCols.value.length > 0) {
      const currentGroupCols = (node.data.groupCols ?? []) as string[]
      if (currentGroupCols.length >= upstreamCols.value.length) {
        store.updateNodeData(node.id, { groupCols: [], _groupColsUserSet: false })
      }
    }
  } else if (type === 'sort') {
    if (isNewOpen) sortColSearch.value = ''
  } else if (type === 'calc') {
    // Auto-add one empty item so user can start immediately
    if (!node.data.items?.length) {
      store.updateNodeData(node.id, { items: [{ col: '', op: '', value: '', alias: '' }] })
    }
  } else if (type === 'union') {
    if (isNewOpen) unionStep.value = 1
  }
}, { immediate: true, flush: 'sync' })

// Also watch upstream cols in case they load after the modal opens
watch(upstreamCols, (cols) => {
  const node = store.modalNode
  if (!node) return
  if (node.data.nodeType === 'group') {
    // Clear junk only if user never explicitly set groupCols
    if (!node.data._groupColsUserSet && cols.length > 0) {
      const currentGroupCols = (node.data.groupCols ?? []) as string[]
      if (currentGroupCols.length >= cols.length) {
        store.updateNodeData(node.id, { groupCols: [], _groupColsUserSet: false })
      }
    }
  }
})

function toggleGroupCol(colName: string, checked: boolean) {
  const current = [...((store.modalNode?.data?.groupCols ?? []) as string[])]
  if (checked) {
    if (!current.includes(colName)) current.push(colName)
  } else {
    const idx = current.indexOf(colName)
    if (idx >= 0) current.splice(idx, 1)
  }
  // Mark as user-set so auto-clear logic never touches it again
  store.updateNodeData(store.modalNodeId!, { groupCols: current, _groupColsUserSet: true })
}

function selectAllGroupCols() {
  store.updateNodeData(store.modalNodeId!, {
    groupCols: upstreamCols.value.map((c: VisibleCol) => c.name),
    _groupColsUserSet: true,
  })
}

function clearGroupCols() {
  store.updateNodeData(store.modalNodeId!, { groupCols: [], _groupColsUserSet: true })
}

const groupColCount = computed(() =>
  (store.modalNode?.data?.groupCols ?? []).length
)

// ── Agg column custom dropdown ────────────────────────────────────────────
const openAggColIdx  = ref<number | null>(null)
const aggDropdownPos = ref<{ top: number; left: number; width: number } | null>(null)

function toggleAggColDropdown(i: number, e: MouseEvent) {
  if (openAggColIdx.value === i) {
    openAggColIdx.value = null
    aggDropdownPos.value = null
    return
  }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  aggDropdownPos.value = {
    top:   rect.bottom + 4,
    left:  rect.left,
    width: Math.max(rect.width, 220),
  }
  openAggColIdx.value = i
}

function closeAggDropdown() {
  openAggColIdx.value = null
  aggDropdownPos.value = null
}

function selectAggCol(i: number, colName: string) {
  tn.setAgg(i, { col: colName })
  closeAggDropdown()
}

// ── Finish = apply sort defaults + generate SQL + close tool modal ────────
function finish() {
  // Node is confirmed — clear the "new, unsaved" tracking
  store.newToolNodeId = null
  generateSQL()
  store.modalNodeId = null
}

// ── Finish & Save = close tool modal → open FinishModal ──────────────────
async function finishAndSave() {
  finish()                    // apply sort defaults + generateSQL + close tool modal
  await nextTick()            // let Vue flush the modal-close DOM update first
  store.openFinishModal()     // then trigger FinishModal via store action
}

function close() {
  // If this modal was opened for a freshly-created node, delete it on cancel
  const nodeId = store.modalNodeId
  if (nodeId && store.newToolNodeId === nodeId) {
    store.newToolNodeId = null
    store.removeNode(nodeId)
    return
  }
  store.newToolNodeId = null
  store.modalNodeId = null
}

// AGG func color helper
const AGG_COLORS: Record<string, string> = {
  'SUM':            'bg-blue-500 text-white border-blue-500',
  'AVG':            'bg-cyan-500 text-white border-cyan-500',
  'COUNT':          'bg-emerald-500 text-white border-emerald-500',
  'COUNT DISTINCT': 'bg-teal-500 text-white border-teal-500',
  'MIN':            'bg-violet-500 text-white border-violet-500',
  'MAX':            'bg-rose-500 text-white border-rose-500',
}

// Finish button color per tool type
const finishBtnStyle = computed(() => {
  const map: Record<string, string> = {
    cte:   '#8b5cf6',
    group: '#f97316',
    sort:  '#22c55e',
    where: '#f43f5e',
    calc:  '#14b8a6',
    union: '#eab308',
  }
  return { backgroundColor: map[nodeType.value ?? ''] ?? '#14b8a6' }
})
</script>

<template>
  <!-- Click-outside trap for agg column dropdown -->
  <Teleport to="body">
    <div v-if="openAggColIdx !== null" class="fixed inset-0 z-[190]" @click="closeAggDropdown" />
  </Teleport>

  <!-- Agg column dropdown -->
  <Teleport to="body">
    <div
      v-if="openAggColIdx !== null && aggDropdownPos"
      class="fixed z-[200] bg-background border rounded-xl shadow-2xl overflow-hidden flex flex-col"
      :style="{ top: aggDropdownPos.top + 'px', left: aggDropdownPos.left + 'px', width: aggDropdownPos.width + 'px', maxHeight: '280px' }"
      @click.stop
    >
      <div class="overflow-y-auto flex-1">
        <template v-for="group in groupedUpstreamCols" :key="group.tableId">
          <div class="sticky top-0 z-10 flex items-center gap-1.5 px-2.5 py-1 bg-muted border-b border-border/40">
            <Database class="size-2.5 text-orange-400 shrink-0" />
            <span class="text-[9px] font-semibold text-foreground truncate">{{ group.tableLabel }}</span>
          </div>
          <button
            v-for="c in group.cols" :key="c.name"
            @click="selectAggCol(openAggColIdx!, c.name)"
            :class="['w-full flex items-center gap-2 px-3 pl-5 py-1.5 text-left hover:bg-orange-500/8 transition-colors', store.modalNode?.data?.aggs?.[openAggColIdx!]?.col === c.name ? 'bg-orange-500/10' : '']"
          >
            <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadge(c.type).cls]">{{ getColTypeBadge(c.type).label }}</span>
            <Key v-if="c.isPk" class="size-2.5 text-amber-400 shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-[11px] truncate" :class="c.isPk ? 'text-amber-400 font-semibold' : ''">{{ c.remark || c.name }}</p>
              <p v-if="c.remark" class="font-mono text-[9px] text-muted-foreground/55 truncate">{{ c.name }}</p>
            </div>
          </button>
        </template>
        <div v-if="!groupedUpstreamCols.length" class="px-3 py-2 text-[10px] text-muted-foreground italic">ไม่พบ columns — เชื่อมต่อ table node ก่อน</div>
      </div>
    </div>
  </Teleport>

  <!-- Click-outside trap for Union condition column dropdown -->
  <Teleport to="body">
    <div v-if="openUnionCondColIdx !== null" class="fixed inset-0 z-[190]" @click="closeUnionCondColDropdown" />
  </Teleport>
  <Teleport to="body">
    <div
      v-if="openUnionCondColIdx !== null && unionCondColDropPos"
      class="fixed z-[200] bg-background border rounded-xl shadow-2xl overflow-hidden"
      :style="{ top: unionCondColDropPos.top + 'px', left: unionCondColDropPos.left + 'px', width: unionCondColDropPos.width + 'px', maxHeight: '240px' }"
      @click.stop
    >
      <div class="overflow-y-auto max-h-[240px]">
        <button
          v-for="c in unionOutputCols" :key="c.name"
          @click="selectUnionCondCol(openUnionCondColIdx!, c)"
          :class="['w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-yellow-500/8 transition-colors',
            store.modalNode?.data?.conditions?.[openUnionCondColIdx!]?.column === c.name ? 'bg-yellow-500/10' : '']"
        >
          <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadge(c.type).cls]">{{ getColTypeBadge(c.type).label }}</span>
          <Key v-if="c.isPk" class="size-3 text-amber-400 shrink-0" />
          <div class="flex-1 min-w-0 flex flex-col leading-none gap-0.5">
            <span class="font-mono text-[11px] truncate" :class="c.isPk ? 'text-amber-400 font-semibold' : ''">{{ c.name }}</span>
            <span v-if="c.remark" class="text-[9px] text-muted-foreground/55 truncate">{{ c.remark }}</span>
          </div>
        </button>
        <div v-if="!unionOutputCols.length" class="px-3 py-2 text-[10px] text-muted-foreground italic">กำหนด Output Columns ก่อน</div>
      </div>
    </div>
  </Teleport>

  <!-- Union mapping pick dropdown -->
  <Teleport to="body">
    <div v-if="openPickKey !== null" class="fixed inset-0 z-[190]" @click="closeMappingPickDrop" />
  </Teleport>
  <Teleport to="body">
    <div v-if="openPickKey !== null && pickDropPos !== null"
      class="fixed z-[200] bg-background border border-border/50 rounded-xl shadow-2xl overflow-hidden"
      :style="{ top: pickDropPos.top + 'px', left: pickDropPos.left + 'px', width: pickDropPos.width + 'px', maxHeight: '260px' }"
      @click.stop>
      <div class="overflow-y-auto max-h-[260px]">
        <!-- NULL option -->
        <button @click="selectMappingPick('')"
          :class="['w-full flex items-center px-3 py-2 text-left hover:bg-muted/40 transition-colors',
            !unionColMapping[pickDropRow]?.picks[pickDropSrc] ? 'bg-muted/20' : '']">
          <span class="text-[10px] font-mono text-muted-foreground/50 italic">— NULL —</span>
          <svg v-if="!unionColMapping[pickDropRow]?.picks[pickDropSrc]" class="size-3 text-muted-foreground/50 ml-auto shrink-0" fill="none" viewBox="0 0 10 10">
            <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        </button>
        <!-- Column options -->
        <button v-for="col in (unionGroupedCols.find(g => g.sourceId === pickDropSrc)?.cols ?? [])"
          :key="col.name"
          @click="selectMappingPick(col.name)"
          :disabled="!!getRowReferenceType(unionColMapping[pickDropRow]!) && !isTypeCompatible(getRowReferenceType(unionColMapping[pickDropRow]!), getUnionPickType(pickDropSrc, col.name))"
          :class="['w-full flex items-center gap-2 px-3 py-2 text-left transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
            unionColMapping[pickDropRow]?.picks[pickDropSrc] === col.name ? 'bg-yellow-500/10 hover:bg-yellow-500/15' : 'hover:bg-muted/40']">
          <span :class="['text-[7px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadge(col.type).cls]">
            {{ getColTypeBadge(col.type).label }}
          </span>
          <span class="text-[10px] font-mono truncate flex-1">{{ col.name }}</span>
          <svg v-if="unionColMapping[pickDropRow]?.picks[pickDropSrc] === col.name"
            class="size-3 text-yellow-500 shrink-0" fill="none" viewBox="0 0 10 10">
            <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
          <span v-else-if="!!getRowReferenceType(unionColMapping[pickDropRow]!) && !isTypeCompatible(getRowReferenceType(unionColMapping[pickDropRow]!), getUnionPickType(pickDropSrc, col.name))"
            class="text-[7px] text-rose-400/70 shrink-0 font-bold">✕ type</span>
        </button>
      </div>
    </div>
  </Teleport>

  <!-- Click-outside trap for CTE condition column dropdown -->
  <Teleport to="body">
    <div v-if="openCteCondColIdx !== null" class="fixed inset-0 z-[190]" @click="closeCteCondColDropdown" />
  </Teleport>

  <!-- CTE condition column dropdown -->
  <Teleport to="body">
    <div
      v-if="openCteCondColIdx !== null && cteCondColDropPos"
      class="fixed z-[200] bg-background border rounded-xl shadow-2xl overflow-hidden"
      :style="{ top: cteCondColDropPos.top + 'px', left: cteCondColDropPos.left + 'px', width: cteCondColDropPos.width + 'px', maxHeight: '240px' }"
      @click.stop
    >
      <div class="overflow-y-auto max-h-[240px]">
        <button
          v-for="c in upstreamCols" :key="c.name"
          @click="selectCteCondCol(openCteCondColIdx!, c)"
          :class="['w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-violet-500/8 transition-colors',
            store.modalNode?.data?.conditions?.[openCteCondColIdx!]?.column === c.name ? 'bg-violet-500/10' : '']"
        >
          <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadge(c.type).cls]">{{ getColTypeBadge(c.type).label }}</span>
          <Key v-if="c.isPk" class="size-3 text-amber-400 shrink-0" />
          <div class="flex-1 min-w-0 flex flex-col leading-none gap-0.5">
            <span class="font-mono text-[11px] truncate" :class="c.isPk ? 'text-amber-400 font-semibold' : ''">{{ c.name }}</span>
            <span v-if="c.remark" class="text-[9px] text-muted-foreground/55 truncate">{{ c.remark }}</span>
          </div>
        </button>
        <div v-if="!upstreamCols.length" class="px-3 py-2 text-[10px] text-muted-foreground italic">เชื่อมต่อ table node เข้ากับ CTE node ก่อน</div>
      </div>
    </div>
  </Teleport>

  <!-- Click-outside trap for WHERE column dropdown -->
  <Teleport to="body">
    <div v-if="openWhereColIdx !== null" class="fixed inset-0 z-[190]" @click="closeWhereColDropdown" />
  </Teleport>

  <!-- WHERE column dropdown -->
  <Teleport to="body">
    <div
      v-if="openWhereColIdx !== null && whereColDropPos"
      class="fixed z-[200] bg-background border rounded-xl shadow-2xl overflow-hidden"
      :style="{ top: whereColDropPos.top + 'px', left: whereColDropPos.left + 'px', width: whereColDropPos.width + 'px', maxHeight: '280px' }"
      @click.stop
    >
      <div class="overflow-y-auto max-h-[280px]">
        <template v-for="group in groupedUpstreamCols" :key="group.tableId">
          <div class="sticky top-0 z-10 flex items-center gap-1.5 px-2.5 py-1 bg-muted border-b border-border/40">
            <Database class="size-2.5 text-rose-400 shrink-0" />
            <span class="text-[9px] font-semibold text-foreground truncate">{{ group.tableLabel }}</span>
          </div>
          <button
            v-for="c in group.cols" :key="c.name"
            @click="selectWhereCol(openWhereColIdx!, c)"
            :class="['w-full flex items-center gap-2 px-3 pl-5 py-1.5 text-left hover:bg-rose-500/8 transition-colors', store.modalNode?.data?.conditions?.[openWhereColIdx!]?.column === c.name ? 'bg-rose-500/10' : '']"
          >
            <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadge(c.type).cls]">{{ getColTypeBadge(c.type).label }}</span>
            <Key v-if="c.isPk" class="size-2.5 text-amber-400 shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-[11px] truncate" :class="c.isPk ? 'text-amber-400 font-semibold' : ''">{{ c.remark || c.name }}</p>
              <p v-if="c.remark" class="font-mono text-[9px] text-muted-foreground/55 truncate">{{ c.name }}</p>
            </div>
          </button>
        </template>
        <div v-if="!groupedUpstreamCols.length" class="px-3 py-2 text-[10px] text-muted-foreground italic">ไม่พบ columns — เชื่อมต่อ table node ก่อน</div>
      </div>
    </div>
  </Teleport>

  <!-- Click-outside trap for calc filter column dropdown -->
  <Teleport to="body">
    <div v-if="openCalcFilterColIdx !== null" class="fixed inset-0 z-[190]" @click="closeCalcFilterColDropdown" />
  </Teleport>

  <!-- Calc filter column dropdown -->
  <Teleport to="body">
    <div
      v-if="openCalcFilterColIdx !== null && calcFilterColDropPos"
      class="fixed z-[200] bg-background border rounded-xl shadow-2xl overflow-hidden"
      :style="{ top: calcFilterColDropPos.top + 'px', left: calcFilterColDropPos.left + 'px', width: calcFilterColDropPos.width + 'px', maxHeight: '280px' }"
      @click.stop
    >
      <div class="overflow-y-auto max-h-[280px]">
        <template v-for="group in groupedUpstreamCols" :key="group.tableId">
          <div class="sticky top-0 z-10 flex items-center gap-1.5 px-2.5 py-1 bg-muted border-b border-border/40">
            <Database class="size-2.5 text-rose-400 shrink-0" />
            <span class="text-[9px] font-semibold text-foreground truncate">{{ group.tableLabel }}</span>
          </div>
          <button
            v-for="c in group.cols" :key="c.name"
            @click="selectCalcFilterCol(openCalcFilterColIdx!, c.name)"
            :class="['w-full flex items-center gap-2 px-3 pl-5 py-1.5 text-left hover:bg-rose-500/8 transition-colors', calcFilters[openCalcFilterColIdx!]?.column === c.name ? 'bg-rose-500/10' : '']"
          >
            <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadge(c.type).cls]">{{ getColTypeBadge(c.type).label }}</span>
            <Key v-if="c.isPk" class="size-2.5 text-amber-400 shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-[11px] truncate" :class="c.isPk ? 'text-amber-400 font-semibold' : ''">{{ c.remark || c.name }}</p>
              <p v-if="c.remark" class="font-mono text-[9px] text-muted-foreground/55 truncate">{{ c.name }}</p>
            </div>
          </button>
        </template>
        <div v-if="!groupedUpstreamCols.length" class="px-3 py-2 text-[10px] text-muted-foreground italic">ไม่พบ columns — เชื่อมต่อ table node ก่อน</div>
      </div>
    </div>
  </Teleport>

  <!-- Click-outside trap for calc column dropdown -->
  <Teleport to="body">
    <div v-if="openCalcColIdx !== null" class="fixed inset-0 z-[190]" @click="closeCalcColDropdown" />
  </Teleport>

  <!-- Calc column dropdown -->
  <Teleport to="body">
    <div
      v-if="openCalcColIdx !== null && calcColDropPos"
      class="fixed z-[200] bg-background border rounded-xl shadow-2xl overflow-hidden"
      :style="{ top: calcColDropPos.top + 'px', left: calcColDropPos.left + 'px', width: calcColDropPos.width + 'px', maxHeight: '280px' }"
      @click.stop
    >
      <div class="overflow-y-auto max-h-[280px]">
        <template v-for="group in groupedUpstreamCols" :key="group.tableId">
          <div class="sticky top-0 z-10 flex items-center gap-1.5 px-2.5 py-1 bg-muted border-b border-border/40">
            <Database class="size-2.5 text-teal-400 shrink-0" />
            <span class="text-[9px] font-semibold text-foreground truncate">{{ group.tableLabel }}</span>
          </div>
          <button
            v-for="c in group.cols" :key="c.name"
            @click="selectCalcCol(openCalcColIdx!, c.name)"
            :class="['w-full flex items-center gap-2 px-3 pl-5 py-1.5 text-left hover:bg-teal-500/8 transition-colors', calcItems[openCalcColIdx!]?.col === c.name ? 'bg-teal-500/10' : '']"
          >
            <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadge(c.type).cls]">{{ getColTypeBadge(c.type).label }}</span>
            <Key v-if="c.isPk" class="size-2.5 text-amber-400 shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-[11px] truncate" :class="c.isPk ? 'text-amber-400 font-semibold' : ''">{{ c.remark || c.name }}</p>
              <p v-if="c.remark" class="font-mono text-[9px] text-muted-foreground/55 truncate">{{ c.name }}</p>
            </div>
          </button>
        </template>
        <div v-if="!groupedUpstreamCols.length" class="px-3 py-2 text-[10px] text-muted-foreground italic">ไม่พบ columns — เชื่อมต่อ table node ก่อน</div>
      </div>
    </div>
  </Teleport>

  <!-- Click-outside trap for HAVING column dropdown -->
  <Teleport to="body">
    <div v-if="openGroupFilterColIdx !== null" class="fixed inset-0 z-[190]" @click="closeGroupFilterColDropdown" />
  </Teleport>

  <!-- HAVING column dropdown -->
  <Teleport to="body">
    <div
      v-if="openGroupFilterColIdx !== null && groupFilterColDropPos"
      class="fixed z-[200] bg-background border rounded-xl shadow-2xl overflow-hidden"
      :style="{ top: groupFilterColDropPos.top + 'px', left: groupFilterColDropPos.left + 'px', width: groupFilterColDropPos.width + 'px', maxHeight: '240px' }"
      @click.stop
    >
      <div class="overflow-y-auto max-h-[240px]">
        <div v-if="havingCols.some(c => c.remark)" class="px-3 py-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/40 sticky top-0">Aggregates</div>
        <button
          v-for="c in havingCols" :key="c.name"
          @click="selectGroupFilterCol(openGroupFilterColIdx!, c.name)"
          :class="['w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-orange-500/8 transition-colors', groupFilters[openGroupFilterColIdx!]?.column === c.name ? 'bg-orange-500/10' : '']"
        >
          <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadge(c.type).cls]">{{ getColTypeBadge(c.type).label }}</span>
          <div class="flex-1 min-w-0 flex flex-col leading-none gap-0.5">
            <span class="font-mono text-[11px] truncate">{{ c.name }}</span>
            <span v-if="c.remark && c.remark !== c.name" class="text-[9px] text-muted-foreground/55 truncate">{{ c.remark }}</span>
          </div>
        </button>
        <div v-if="!havingCols.length" class="px-3 py-2 text-[10px] text-muted-foreground italic">เพิ่ม Aggregation ก่อน</div>
      </div>
    </div>
  </Teleport>

  <Transition name="fade">
    <div
      v-if="store.modalNode"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      @click.self="close"
    >
      <!-- Modal width: wider for group -->
      <div
        :class="[
          'bg-background rounded-2xl border shadow-2xl flex flex-col overflow-hidden',
          nodeType === 'union' ? 'w-full max-w-[860px]' :
          nodeType === 'cte'   ? 'w-full max-w-[900px]' :
          (nodeType === 'group' || nodeType === 'sort' || nodeType === 'calc' || nodeType === 'where') ? 'w-full max-w-[960px]' : 'w-[440px]',
        ]"
        style="height: 85vh"
        @click.stop
      >
        <!-- Header -->
        <div :class="['flex items-center gap-3 px-5 py-3.5 border-b shrink-0', meta.bg, meta.border]">
          <div :class="['flex size-8 items-center justify-center rounded-lg border', meta.bg, meta.border]">
            <component :is="meta.icon" :class="['size-4', meta.color]" />
          </div>
          <div class="flex-1 min-w-0">
            <!-- Union: show editable CTE name inline -->
            <template v-if="nodeType === 'union'">
              <div class="flex items-center gap-2">
                <span :class="['font-bold text-sm shrink-0', meta.color]">{{ meta.label }}</span>
                <span class="text-muted-foreground/30 text-sm shrink-0">/</span>
                <input
                  :value="store.modalNode?.data?.name ?? ''"
                  @input="tn.setModalData({ name: ($event.target as HTMLInputElement).value })"
                  :placeholder="store.modalNode?.data?.name ? '' : 'ตั้งชื่อ CTE...'"
                  spellcheck="false"
                  class="flex-1 min-w-0 bg-transparent text-sm font-semibold text-yellow-400/90 placeholder:text-muted-foreground/30 placeholder:font-normal focus:outline-none border-b border-transparent focus:border-yellow-500/40 transition-colors pb-px"
                />
              </div>
              <p class="text-[9px] text-muted-foreground/40 mt-0.5">ชื่อ CTE สำหรับ SQL query · คลิกเพื่อแก้ไข</p>
            </template>
            <template v-else>
              <!-- CTE: show editable name inline -->
              <template v-if="nodeType === 'cte'">
                <div class="flex items-center gap-2">
                  <span :class="['font-bold text-sm shrink-0', meta.color]">{{ meta.label }}</span>
                  <span class="text-muted-foreground/30 text-sm shrink-0">/</span>
                  <input
                    :value="store.modalNode?.data?.name ?? ''"
                    @input="tn.setModalData({ name: ($event.target as HTMLInputElement).value })"
                    placeholder="ตั้งชื่อ CTE..."
                    spellcheck="false"
                    class="flex-1 min-w-0 bg-transparent text-sm font-semibold text-violet-400/90 placeholder:text-muted-foreground/30 placeholder:font-normal focus:outline-none border-b border-transparent focus:border-violet-500/40 transition-colors pb-px"
                  />
                </div>
                <p class="text-[9px] text-muted-foreground/40 mt-0.5">ชื่อ CTE ใน SQL · คลิกเพื่อแก้ไข</p>
              </template>
              <template v-else>
                <span :class="['font-bold text-sm', meta.color]">{{ meta.label }}</span>
              <p v-if="nodeType === 'group'" class="text-[10px] text-muted-foreground mt-0.5">
                เลือก fields สำหรับ GROUP BY และกำหนด Aggregate Functions
              </p>
              <p v-else-if="nodeType === 'sort'" class="text-[10px] text-muted-foreground mt-0.5">
                เลือก columns และกำหนดทิศทางการเรียงลำดับ (ASC / DESC)
              </p>
              <p v-else-if="nodeType === 'calc'" class="text-[10px] text-muted-foreground mt-0.5">
                สร้าง calculated columns ด้วย SQL expressions
              </p>
              <p v-else-if="nodeType === 'where'" class="text-[10px] text-muted-foreground mt-0.5">
                เพิ่ม conditions เพื่อกรองข้อมูลใน WHERE clause
              </p>
              </template><!-- /else nodeType -->
            </template><!-- /else not union -->
          </div>
          <button @click="close"
            class="size-7 flex items-center justify-center rounded-lg hover:bg-accent text-muted-foreground transition-colors">
            <X class="size-4" />
          </button>
        </div>

        <!-- Shared column datalist (populated from upstreamCols) -->
        <datalist id="modal-col-list">
          <option v-for="c in upstreamCols" :key="c.name" :value="c.name">{{ c.remark || c.type }}</option>
        </datalist>

        <!-- Body -->
        <div class="flex-1 flex flex-col gap-5 overflow-y-auto overflow-x-hidden p-5">

          <!-- ── Named CTE ──────────────────────────────────────────── -->
          <template v-if="nodeType === 'cte'">

            <div class="grid grid-cols-[1fr_1fr] gap-5 items-start">

            <!-- ── LEFT: SELECT Columns ────────────────────────────── -->
            <div class="flex flex-col gap-3 min-w-0">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-xs font-bold text-violet-500">SELECT Columns</p>
                  <p class="text-[10px] text-muted-foreground mt-0.5">ไม่เลือก = SELECT * (ทุก columns)</p>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-semibold text-violet-500 bg-violet-500/10 px-2 py-0.5 rounded-full">
                    {{ (store.modalNode?.data?.selectedCols ?? []).length || '*' }}
                  </span>
                </div>
                <div class="flex gap-1">
                  <button @click="cteGroupedCols.forEach(g => selectAllFromCteGroup(g))"
                    class="text-[10px] px-2.5 py-1 rounded-lg border border-violet-500/30 text-violet-400 hover:bg-violet-500/10 transition-colors font-medium">ทั้งหมด</button>
                  <button @click="tn.clearCteCols()"
                    class="text-[10px] text-muted-foreground hover:underline">SELECT *</button>
                </div>
              </div>

              <!-- Search -->
              <div class="relative">
                <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/50" />
                <input v-model="cteColSearch" placeholder="ค้นหา column..."
                  class="w-full text-xs border rounded-lg pl-7 pr-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-violet-400/50 font-mono" />
              </div>

              <!-- 2-panel: table list | column list -->
              <div class="flex gap-0 flex-1 min-h-0 rounded-xl border border-violet-500/20 overflow-hidden">

                <!-- LEFT: table tabs -->
                <div class="w-44 shrink-0 flex flex-col border-r border-violet-500/15 bg-muted/20 overflow-y-auto">
                  <button
                    v-for="group in cteGroupedCols" :key="group.sourceId"
                    @click="selectedCteGroup = group.sourceId"
                    :class="[
                      'flex flex-col items-start px-3 py-2.5 text-left transition-colors border-b border-border/20 last:border-b-0 gap-0.5',
                      selectedCteGroup === group.sourceId
                        ? 'bg-violet-500/15 border-l-2 border-l-violet-500'
                        : 'hover:bg-accent/50 border-l-2 border-l-transparent',
                    ]"
                  >
                    <div class="flex items-center gap-1 w-full min-w-0">
                      <span v-if="group.isHeader"
                        class="text-[8px] px-1 py-0 rounded bg-emerald-500/20 text-emerald-500 font-bold font-mono shrink-0">H</span>
                      <span class="font-mono text-[10px] font-semibold truncate flex-1"
                        :class="selectedCteGroup === group.sourceId ? 'text-violet-300' : 'text-foreground/80'">
                        {{ group.sourceLabel }}
                      </span>
                    </div>
                    <div class="flex items-center gap-1.5 w-full">
                      <span class="text-[8px] text-muted-foreground/60">
                        {{ group.cols.length }} cols
                      </span>
                      <span v-if="group.cols.filter(c => isCteColSelected(group, c.name)).length"
                        class="text-[8px] px-1 py-0 rounded bg-violet-500/20 text-violet-400 font-bold font-mono">
                        ✓{{ group.cols.filter(c => isCteColSelected(group, c.name)).length }}
                      </span>
                    </div>
                  </button>
                </div>

                <!-- RIGHT: columns of selected table -->
                <div class="flex-1 flex flex-col min-w-0 min-h-0">
                  <!-- Table header bar -->
                  <div v-if="activeCteGroup" class="flex items-center gap-2 px-3 py-2 bg-violet-500/8 border-b border-violet-500/15 shrink-0">
                    <span v-if="activeCteGroup.isHeader"
                      class="text-[8px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-500 font-mono">H</span>
                    <span v-else class="text-[8px] font-bold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 font-mono">TABLE</span>
                    <span class="font-mono text-[11px] font-semibold text-foreground/90 flex-1 truncate">{{ activeCteGroup.sourceLabel }}</span>
                    <button @click="selectAllFromCteGroup(activeCteGroup)"
                      class="text-[9px] text-violet-400 hover:underline shrink-0 font-medium">ทั้งหมด</button>
                    <button @click="clearAllFromCteGroup(activeCteGroup)"
                      class="text-[9px] text-muted-foreground hover:underline shrink-0">ล้าง</button>
                  </div>

                  <!-- Search -->
                  <div class="relative shrink-0 border-b border-border/30">
                    <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/40 pointer-events-none" />
                    <input
                      v-model="cteColSearch"
                      class="w-full h-8 pl-7 pr-3 bg-transparent text-[11px] focus:outline-none"
                      placeholder="ค้นหา column…"
                    />
                  </div>

                  <!-- No columns -->
                  <div v-if="!activeCteGroup?.cols.length" class="flex-1 flex items-center justify-center text-[10px] text-muted-foreground/50 italic">
                    ไม่มีข้อมูล column
                  </div>

                  <!-- Column list -->
                  <div v-else class="flex-1 overflow-y-auto">
                    <p v-if="!filteredActiveCols.length && cteColSearch" class="text-[10px] text-muted-foreground/60 italic px-3 py-3">
                      ไม่พบ "{{ cteColSearch }}"
                    </p>
                    <button
                      v-for="c in filteredActiveCols" :key="c.name"
                      @click="activeCteGroup && toggleCteQualCol(activeCteGroup, c.name)"
                      :class="[
                        'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors border-b border-border/15 last:border-b-0',
                        activeCteGroup && isCteColSelected(activeCteGroup, c.name)
                          ? 'bg-violet-500/10 hover:bg-violet-500/15'
                          : 'hover:bg-accent/40',
                      ]"
                    >
                      <!-- Checkbox -->
                      <div :class="[
                        'size-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                        activeCteGroup && isCteColSelected(activeCteGroup, c.name)
                          ? 'bg-violet-500 border-violet-500'
                          : 'border-border/60 bg-background',
                      ]">
                        <svg v-if="activeCteGroup && isCteColSelected(activeCteGroup, c.name)"
                          class="size-2 text-white" fill="none" viewBox="0 0 10 10">
                          <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                      </div>
                      <!-- PK icon -->
                      <Key v-if="c.isPk" class="size-3 text-amber-400 shrink-0" />
                      <!-- Type badge -->
                      <span :class="['text-[8px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadge(c.type).cls]">
                        {{ getColTypeBadge(c.type).label }}
                      </span>
                      <!-- Name -->
                      <span :class="['font-mono text-[11px] flex-1 truncate', c.isPk ? 'text-amber-400 font-semibold' : '']">
                        {{ c.name }}
                      </span>
                      <!-- Remark -->
                      <span v-if="c.remark" class="text-[9px] text-muted-foreground/55 truncate max-w-[140px] shrink-0">
                        {{ c.remark }}
                      </span>
                      <!-- Data type -->
                      <span class="text-[9px] text-muted-foreground/35 font-mono shrink-0">{{ c.type }}</span>
                    </button>
                  </div>
                </div>

              </div>

              <!-- Footer hint -->
              <p v-if="!(store.modalNode?.data?.selectedCols ?? []).length" class="text-[10px] text-muted-foreground/50 italic shrink-0">
                ไม่เลือก = SELECT * (ทุก columns)
              </p>
            </div>

            <!-- ── RIGHT: WHERE Filter + SQL Preview ────────────────── -->
            <div class="flex flex-col gap-4 min-w-0">

              <!-- WHERE filter -->
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <label class="text-[11px] font-semibold text-rose-500 uppercase tracking-wide">
                    WHERE Filter
                    <span v-if="(store.modalNode?.data?.conditions ?? []).filter((c: any) => c.column).length"
                      class="ml-1 text-[10px] font-normal text-muted-foreground normal-case">
                      {{ (store.modalNode?.data?.conditions ?? []).filter((c: any) => c.column).length }} conditions
                    </span>
                  </label>
                  <button @click="tn.addCteCondition()"
                    class="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-colors">
                    <Plus class="size-2.5" /> เพิ่ม
                  </button>
                </div>

                <div v-if="(store.modalNode?.data?.conditions ?? []).length" class="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-0.5">
                  <div v-for="(cond, i) in (store.modalNode?.data?.conditions ?? [])" :key="i"
                    class="flex flex-col gap-3 p-3 rounded-xl border bg-rose-500/3 shrink-0">
                    <div class="flex items-center gap-2">
                      <span class="text-[10px] font-bold text-rose-500 uppercase tracking-wide flex-1">
                        Condition {{ Number(i) + 1 }}
                        <span v-if="cond.column" class="normal-case font-mono text-rose-400 ml-1">— {{ condPreview(cond) }}</span>
                      </span>
                      <button @click="tn.removeCteCondition(+i)"
                        class="size-5 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors">
                        <X class="size-3.5" />
                      </button>
                    </div>
                    <button @click="toggleCteCondColDropdown(+i, $event)"
                      :class="['w-full flex items-center gap-2 text-xs border rounded-lg px-2.5 py-2 bg-background text-left transition-colors',
                        cond.column ? 'border-rose-400/40' : 'border-border hover:border-rose-400/30',
                        openCteCondColIdx === +i ? 'ring-2 ring-rose-400/50 border-rose-400/40' : '']">
                      <template v-if="cond.column">
                        <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadge(upstreamCols.find(c => c.name === cond.column)?.type ?? '').cls]">
                          {{ getColTypeBadge(upstreamCols.find(c => c.name === cond.column)?.type ?? '').label }}
                        </span>
                        <div class="flex-1 min-w-0">
                          <p class="text-[11px] truncate">{{ upstreamCols.find(c => c.name === cond.column)?.remark || cond.column }}</p>
                          <p v-if="upstreamCols.find(c => c.name === cond.column)?.remark" class="font-mono text-[9px] text-muted-foreground/60 truncate">{{ cond.column }}</p>
                        </div>
                      </template>
                      <span v-else class="text-muted-foreground text-[11px] flex-1">— เลือก Column —</span>
                      <ChevronDown :class="['size-3 shrink-0 text-muted-foreground transition-transform', openCteCondColIdx === +i ? 'rotate-180' : '']" />
                    </button>
                    <div class="flex flex-col gap-1.5">
                      <div v-for="group in WHERE_OP_GROUPS" :key="group.color" class="flex flex-wrap gap-1">
                        <button v-for="op in group.ops" :key="op"
                          @click="tn.setCteCondition(+i, { operator: op })"
                          :class="['text-[10px] px-2.5 py-1 rounded-lg border font-mono font-bold transition-colors whitespace-nowrap', whereOpClass(cond.operator, op)]">{{ op }}</button>
                      </div>
                    </div>
                    <div v-if="cond.operator && !['IS NULL', 'IS NOT NULL'].includes(cond.operator)" class="flex items-center gap-2">
                      <label class="text-[10px] font-semibold text-muted-foreground w-8 shrink-0">ค่า</label>
                      <div v-if="isDateCol(cond.column)" class="flex-1 relative flex items-center">
                        <input :ref="(el) => setCteDateRef(Number(i), el)" type="date" :value="cond.value"
                          @input="tn.setCteCondition(+i, { value: ($event.target as HTMLInputElement).value })"
                          class="flex-1 text-xs border rounded-lg pl-2.5 pr-9 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-rose-400/50 font-mono"
                          :class="cond.value ? 'border-rose-400/40' : ''" />
                        <button type="button" @click="openCteDatePicker(Number(i))"
                          class="absolute right-2 size-5 flex items-center justify-center rounded text-rose-500 hover:bg-rose-500/15 transition-colors">
                          <Calendar class="size-3.5" />
                        </button>
                      </div>
                      <input v-else :value="cond.value"
                        @input="tn.setCteCondition(+i, { value: ($event.target as HTMLInputElement).value })"
                        :placeholder="cond.operator === 'LIKE' ? 'เช่น %keyword%' : cond.operator === 'IN' ? 'เช่น 1,2,3' : 'ค่าที่ต้องการ'"
                        class="flex-1 text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-rose-400/50 font-mono"
                        :class="cond.value ? 'border-rose-400/40' : ''" />
                    </div>
                    <div v-if="cond.column && cond.operator"
                      class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-500/5 border border-rose-400/20">
                      <span class="text-[9px] font-bold text-rose-500 shrink-0">SQL</span>
                      <code class="text-[9px] font-mono text-rose-300/80 truncate">{{ condPreview(cond) }}</code>
                    </div>
                  </div>
                </div>
                <p v-else class="text-[10px] text-muted-foreground/60 italic px-1">ไม่มี filter = ดึงข้อมูลทั้งหมด</p>
              </div>

              <!-- SQL Preview -->
              <div v-if="upstreamCols.length"
                class="px-3 py-2 rounded-lg bg-violet-500/5 border border-violet-400/20 max-h-[120px] overflow-y-auto overflow-x-auto">
                <div class="flex items-start gap-1.5">
                  <span class="text-[9px] font-bold text-violet-500 shrink-0 mt-0.5">SQL</span>
                  <code class="text-[9px] font-mono text-violet-300/80 leading-relaxed whitespace-pre">{{ cteSqlPreview }}</code>
                </div>
              </div>

            </div><!-- /RIGHT -->
            </div><!-- /grid -->

          </template>

          <!-- ── Calculator ──────────────────────────────────────────── -->
          <template v-else-if="nodeType === 'calc'">
            <div class="grid grid-cols-[1fr_1fr] gap-5 items-start">

            <!-- ── LEFT: Calculated Columns ──────────────────────────── -->
            <div class="flex flex-col gap-3 min-w-0">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-xs font-bold text-teal-500">Calculated Columns</p>
                  <p class="text-[10px] text-muted-foreground mt-0.5">สร้าง calculated columns ด้วย SQL expressions</p>
                </div>
                <span class="text-[10px] font-semibold text-teal-500 bg-teal-500/10 px-2 py-0.5 rounded-full">
                  {{ calcItemCount }}
                </span>
              </div>

              <div class="flex flex-col gap-3 max-h-[460px] overflow-y-auto pr-0.5">
                <div
                  v-for="(item, i) in store.modalNode.data.items" :key="i"
                  class="flex flex-col gap-3 border rounded-xl p-4 bg-teal-500/3 shrink-0"
                >
                  <!-- Header -->
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] font-bold text-teal-600 uppercase tracking-wide flex-1">
                      Column {{ Number(i) + 1 }}
                      <span v-if="item.alias" class="normal-case font-mono text-teal-400 ml-1">— {{ item.alias }}</span>
                    </span>
                    <button @click="tn.removeCalcItem(Number(i))"
                      class="size-5 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors">
                      <X class="size-3.5" />
                    </button>
                  </div>

                  <!-- Row: Column picker + alias -->
                  <div class="flex items-center gap-2">
                    <button
                      @click="toggleCalcColDropdown(Number(i), $event)"
                      :class="[
                        'flex-1 flex items-center gap-2 text-xs border rounded-lg px-2.5 py-2 bg-background text-left transition-colors',
                        item.col ? 'border-teal-400/40' : 'border-border hover:border-teal-400/30',
                        openCalcColIdx === Number(i) ? 'ring-2 ring-teal-400/50 border-teal-400/40' : '',
                      ]"
                    >
                      <template v-if="item.col">
                        <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0',
                          getColTypeBadge(upstreamCols.find(c => c.name === item.col)?.type ?? '').cls]">
                          {{ getColTypeBadge(upstreamCols.find(c => c.name === item.col)?.type ?? '').label }}
                        </span>
                        <div class="flex-1 min-w-0">
                          <p class="text-[11px] truncate">{{ upstreamCols.find(c => c.name === item.col)?.remark || item.col }}</p>
                          <p v-if="upstreamCols.find(c => c.name === item.col)?.remark" class="font-mono text-[9px] text-muted-foreground/60 truncate">{{ item.col }}</p>
                        </div>
                      </template>
                      <span v-else class="text-muted-foreground text-[11px] flex-1">— เลือก Column —</span>
                      <ChevronDown :class="['size-3 shrink-0 text-muted-foreground transition-transform', openCalcColIdx === Number(i) ? 'rotate-180' : '']" />
                    </button>
                    <input
                      :value="item.alias"
                      @input="tn.setCalcItem(Number(i), { alias: ($event.target as HTMLInputElement).value })"
                      placeholder="ชื่อ output"
                      class="w-28 text-xs border rounded-lg px-2.5 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-teal-400/50 font-mono"
                      :class="item.alias ? 'border-teal-400/40' : ''"
                    />
                  </div>

                  <!-- Operation pills grouped by category -->
                  <div class="flex flex-col gap-1.5">
                    <p class="text-[10px] font-semibold text-muted-foreground">การคำนวณ</p>
                    <div class="flex flex-wrap gap-1">
                      <span class="text-[9px] text-muted-foreground/50 self-center w-12 shrink-0">Math</span>
                      <button v-for="op in CALC_OPS.filter(o => o.group === 'math')" :key="op.id"
                        @click="tn.setCalcItem(Number(i), { op: op.id })"
                        :class="['text-[10px] px-2.5 py-1 rounded-lg border font-bold transition-colors', opClass(item.op, op)]">{{ op.label }}</button>
                    </div>
                    <div class="flex flex-wrap gap-1">
                      <span class="text-[9px] text-muted-foreground/50 self-center w-12 shrink-0">NULL</span>
                      <button v-for="op in CALC_OPS.filter(o => o.group === 'null')" :key="op.id"
                        @click="tn.setCalcItem(Number(i), { op: op.id })"
                        :class="['text-[10px] px-2.5 py-1 rounded-lg border font-mono font-bold transition-colors', opClass(item.op, op)]">{{ op.label }}</button>
                    </div>
                    <div class="flex flex-wrap gap-1">
                      <span class="text-[9px] text-muted-foreground/50 self-center w-12 shrink-0">Cast</span>
                      <button v-for="op in CALC_OPS.filter(o => o.group === 'cast')" :key="op.id"
                        @click="tn.setCalcItem(Number(i), { op: op.id })"
                        :class="['text-[10px] px-2.5 py-1 rounded-lg border font-mono font-bold transition-colors', opClass(item.op, op)]">{{ op.label }}</button>
                    </div>
                    <div class="flex flex-wrap gap-1">
                      <span class="text-[9px] text-muted-foreground/50 self-center w-12 shrink-0">String</span>
                      <button v-for="op in CALC_OPS.filter(o => o.group === 'string')" :key="op.id"
                        @click="tn.setCalcItem(Number(i), { op: op.id })"
                        :class="['text-[10px] px-2.5 py-1 rounded-lg border font-mono font-bold transition-colors', opClass(item.op, op)]">{{ op.label }}</button>
                    </div>
                    <div class="flex flex-wrap gap-1">
                      <span class="text-[9px] text-muted-foreground/50 self-center w-12 shrink-0">Date</span>
                      <button v-for="op in CALC_OPS.filter(o => o.group === 'date')" :key="op.id"
                        @click="tn.setCalcItem(Number(i), { op: op.id })"
                        :class="['text-[10px] px-2.5 py-1 rounded-lg border font-mono font-bold transition-colors', opClass(item.op, op)]">{{ op.label }}</button>
                    </div>
                  </div>

                  <!-- Value input -->
                  <div v-if="item.op && calcNeedsValue(item.op)" class="flex items-center gap-2">
                    <label class="text-[10px] font-semibold text-muted-foreground w-12 shrink-0">ค่า</label>
                    <input
                      :value="item.value"
                      @input="tn.setCalcItem(Number(i), { value: ($event.target as HTMLInputElement).value })"
                      :placeholder="calcValuePlaceholder(item.op)"
                      class="flex-1 text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-teal-400/50 font-mono"
                      :class="item.value ? 'border-teal-400/40' : ''"
                    />
                  </div>

                  <!-- SQL Preview per item -->
                  <div v-if="item.col && item.op"
                    class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-500/5 border border-teal-400/20">
                    <span class="text-[9px] font-bold text-teal-500 shrink-0">SQL</span>
                    <code class="text-[9px] font-mono text-teal-300/80 truncate">
                      ({{ calcExprPreview(item.op, item.col, item.value) }}) AS {{ item.alias || '?' }}
                    </code>
                  </div>
                </div>
              </div>

              <button @click="tn.addCalcItem"
                class="text-xs w-full py-2 rounded-xl border border-dashed border-teal-500/40 text-teal-600 hover:bg-teal-500/10 font-semibold transition-colors flex items-center justify-center gap-1.5">
                <Plus class="size-3.5" /> เพิ่ม Calculated Column
              </button>
            </div><!-- /LEFT -->

            <!-- ── RIGHT: WHERE filter + SQL preview ──────────────────── -->
            <div class="flex flex-col gap-4 min-w-0">

              <!-- WHERE filter -->
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <label class="text-[11px] font-semibold text-rose-500 uppercase tracking-wide">
                    WHERE Filter
                    <span v-if="calcFilterCount" class="ml-1 text-[10px] font-normal text-muted-foreground normal-case">
                      {{ calcFilterCount }} filters
                    </span>
                  </label>
                  <button @click="tn.addCalcFilter()"
                    class="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-colors">
                    <Plus class="size-2.5" /> เพิ่ม
                  </button>
                </div>

                <div v-if="(store.modalNode?.data?.filters ?? []).length" class="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-0.5">
                  <div
                    v-for="(f, i) in store.modalNode.data.filters" :key="'cf-' + i"
                    class="flex flex-col gap-3 p-3 rounded-xl border bg-rose-500/3 shrink-0"
                  >
                    <!-- Header -->
                    <div class="flex items-center gap-2">
                      <span class="text-[10px] font-bold text-rose-500 uppercase tracking-wide flex-1">
                        Filter {{ Number(i) + 1 }}
                        <span v-if="f.column" class="normal-case font-mono text-rose-400 ml-1">— {{ condPreview(f) }}</span>
                      </span>
                      <button @click="tn.removeCalcFilter(Number(i))"
                        class="size-5 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors">
                        <X class="size-3.5" />
                      </button>
                    </div>

                    <!-- Column picker -->
                    <button
                      @click="toggleCalcFilterColDropdown(Number(i), $event)"
                      :class="[
                        'w-full flex items-center gap-2 text-xs border rounded-lg px-2.5 py-2 bg-background text-left transition-colors',
                        f.column ? 'border-rose-400/40' : 'border-border hover:border-rose-400/30',
                        openCalcFilterColIdx === Number(i) ? 'ring-2 ring-rose-400/50 border-rose-400/40' : '',
                      ]"
                    >
                      <template v-if="f.column">
                        <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0',
                          getColTypeBadge(upstreamCols.find(c => c.name === f.column)?.type ?? '').cls]">
                          {{ getColTypeBadge(upstreamCols.find(c => c.name === f.column)?.type ?? '').label }}
                        </span>
                        <div class="flex-1 min-w-0">
                          <p class="text-[11px] truncate">{{ upstreamCols.find(c => c.name === f.column)?.remark || f.column }}</p>
                          <p v-if="upstreamCols.find(c => c.name === f.column)?.remark" class="font-mono text-[9px] text-muted-foreground/60 truncate">{{ f.column }}</p>
                        </div>
                      </template>
                      <span v-else class="text-muted-foreground text-[11px] flex-1">— เลือก Column —</span>
                      <ChevronDown :class="['size-3 shrink-0 text-muted-foreground transition-transform', openCalcFilterColIdx === Number(i) ? 'rotate-180' : '']" />
                    </button>

                    <!-- Operator pills -->
                    <div class="flex flex-col gap-1.5">
                      <div v-for="group in WHERE_OP_GROUPS" :key="group.color" class="flex flex-wrap gap-1">
                        <button v-for="op in group.ops" :key="op"
                          @click="tn.setCalcFilter(Number(i), { operator: op })"
                          :class="['text-[10px] px-2.5 py-1 rounded-lg border font-mono font-bold transition-colors whitespace-nowrap', whereOpClass(f.operator, op)]">{{ op }}</button>
                      </div>
                    </div>

                    <!-- Value input -->
                    <div v-if="f.operator && !['IS NULL', 'IS NOT NULL'].includes(f.operator)" class="flex items-center gap-2">
                      <label class="text-[10px] font-semibold text-muted-foreground w-8 shrink-0">ค่า</label>
                      <div v-if="isDateCol(f.column)" class="flex-1 relative flex items-center">
                        <input
                          :ref="(el) => setCalcFilterDateRef(Number(i), el)"
                          type="date" :value="f.value"
                          @input="tn.setCalcFilter(Number(i), { value: ($event.target as HTMLInputElement).value })"
                          class="flex-1 text-xs border rounded-lg pl-2.5 pr-9 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-rose-400/50 font-mono"
                          :class="f.value ? 'border-rose-400/40' : ''"
                        />
                        <button type="button" @click="openCalcFilterDatePicker(Number(i))"
                          class="absolute right-2 size-5 flex items-center justify-center rounded text-rose-500 hover:bg-rose-500/15 transition-colors">
                          <Calendar class="size-3.5" />
                        </button>
                      </div>
                      <input v-else :value="f.value"
                        @input="tn.setCalcFilter(Number(i), { value: ($event.target as HTMLInputElement).value })"
                        :placeholder="f.operator === 'LIKE' ? 'เช่น %keyword%' : f.operator === 'IN' ? 'เช่น 1,2,3' : 'ค่าที่ต้องการ'"
                        class="flex-1 text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-rose-400/50 font-mono"
                        :class="f.value ? 'border-rose-400/40' : ''"
                      />
                    </div>

                    <!-- Preview -->
                    <div v-if="f.column && f.operator"
                      class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-500/5 border border-rose-400/20">
                      <span class="text-[9px] font-bold text-rose-500 shrink-0">SQL</span>
                      <code class="text-[9px] font-mono text-rose-300/80 truncate">{{ condPreview(f) }}</code>
                    </div>
                  </div>
                </div>
                <p v-else class="text-[10px] text-muted-foreground/60 italic px-1">ไม่มี filter = นำข้อมูลทั้งหมดมาคำนวณ</p>
              </div>

              <!-- SQL Preview -->
              <div class="px-3 py-2 rounded-lg bg-teal-500/5 border border-teal-400/20 max-h-[120px] overflow-y-auto overflow-x-auto">
                <div class="flex items-start gap-1.5">
                  <span class="text-[9px] font-bold text-teal-500 shrink-0 mt-0.5">SQL</span>
                  <code class="text-[9px] font-mono text-teal-300/80 leading-relaxed whitespace-pre">{{ calcSqlPreview }}</code>
                </div>
              </div>

            </div><!-- /RIGHT -->
            </div><!-- /grid -->
          </template>

          <!-- ── GROUP BY ────────────────────────────────────────────── -->
          <template v-else-if="nodeType === 'group'">
            <div class="grid grid-cols-[1fr_1fr] gap-5 items-start">

            <!-- ── LEFT: GROUP BY Fields + Aggregations ───────────────── -->
            <div class="flex flex-col gap-4 min-w-0">

              <!-- Section 1: GROUP BY Fields -->
              <div class="flex flex-col gap-3 border rounded-xl p-4 bg-orange-500/3">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-xs font-bold text-orange-500">GROUP BY Fields</p>
                    <p class="text-[10px] text-muted-foreground mt-0.5">เลือก columns ที่จะใช้ใน GROUP BY clause</p>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] font-semibold text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-full">
                      {{ groupColCount }}/{{ upstreamCols.length }}
                    </span>
                    <button @click="selectAllGroupCols"
                      class="text-[10px] text-orange-500 hover:underline font-semibold">ทั้งหมด</button>
                    <span class="text-muted-foreground text-[10px]">/</span>
                    <button @click="clearGroupCols"
                      class="text-[10px] text-muted-foreground hover:underline">ล้าง</button>
                  </div>
                </div>

                <!-- Warning: too many columns selected for GROUP BY -->
                <div v-if="upstreamCols.length > 0 && groupColCount >= upstreamCols.length"
                  class="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-400/30 text-[10px] text-rose-400">
                  <span class="shrink-0 font-bold mt-0.5">⚠</span>
                  <span>เลือกทุก column ไม่มีประโยชน์ — กด <button @click="clearGroupCols" class="font-bold underline">ล้าง</button> แล้วเลือกเฉพาะ column ที่ต้องการ GROUP BY จริงๆ</span>
                </div>

                <div class="relative">
                  <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/50" />
                  <input v-model="colSearch" placeholder="ค้นหา column..."
                    class="w-full text-xs border rounded-lg pl-7 pr-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-orange-400/50 font-mono" />
                </div>

                <div v-if="!upstreamCols.length"
                  class="flex items-center gap-2 px-3 py-3 rounded-lg bg-muted/30 text-[10px] text-muted-foreground italic">
                  ยังไม่มี columns — เชื่อมต่อ table node เข้ากับ GROUP BY node ก่อน
                </div>

                <div v-else class="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                  <template v-for="group in filteredGroupedCols" :key="group.tableId">
                    <div class="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-muted border-b border-border/50">
                      <Database class="size-3 text-orange-400 shrink-0" />
                      <span class="text-[10px] font-semibold text-foreground truncate flex-1">{{ group.tableLabel }}</span>
                      <span class="text-[9px] text-muted-foreground shrink-0">{{ group.cols.length }}</span>
                    </div>
                    <label v-for="col in group.cols" :key="col.name"
                      class="flex items-center gap-2.5 px-3 py-2 pl-5 cursor-pointer select-none transition-colors border-b border-border/30 last:border-0 hover:bg-orange-500/5"
                      :class="(store.modalNode.data.groupCols ?? []).includes(col.name) ? 'bg-orange-500/5' : ''">
                      <div :class="['size-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                        (store.modalNode.data.groupCols ?? []).includes(col.name) ? 'bg-orange-500 border-orange-500' : 'border-border/60 bg-background']">
                        <svg v-if="(store.modalNode.data.groupCols ?? []).includes(col.name)" class="size-2.5 text-white" fill="none" viewBox="0 0 10 10">
                          <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                        </svg>
                        <input type="checkbox" class="sr-only"
                          :checked="(store.modalNode.data.groupCols ?? []).includes(col.name)"
                          @change="toggleGroupCol(col.name, ($event.target as HTMLInputElement).checked)" />
                      </div>
                      <Key v-if="col.isPk" class="size-3 text-amber-400 shrink-0" />
                      <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadge(col.type).cls]">
                        {{ getColTypeBadge(col.type).label }}
                      </span>
                      <div class="flex-1 min-w-0">
                        <p class="text-[11px] truncate" :class="col.isPk ? 'text-amber-500 font-semibold' : 'text-foreground'">{{ col.remark || col.name }}</p>
                        <p v-if="col.remark" class="font-mono text-[9px] text-muted-foreground/60 truncate">{{ col.name }}</p>
                      </div>
                    </label>
                  </template>
                  <div v-if="filteredGroupedCols.length === 0"
                    class="px-3 py-3 text-[10px] text-muted-foreground/60 italic text-center">
                    {{ colSearch ? `ไม่พบ column ที่ตรงกับ "${colSearch}"` : 'กำลังโหลด columns...' }}
                  </div>
                </div>
              </div>

              <!-- Section 2: Aggregations -->
              <div class="flex flex-col gap-3 border rounded-xl p-4 bg-orange-500/3">
                <div>
                  <p class="text-xs font-bold text-orange-500">Aggregate Functions</p>
                  <p class="text-[10px] text-muted-foreground mt-0.5">SUM, AVG, COUNT, MIN, MAX, COUNT DISTINCT</p>
                </div>

                <div class="flex flex-col gap-3 max-h-[260px] overflow-y-auto">
                  <div v-for="(agg, i) in store.modalNode.data.aggs" :key="'agg-' + i"
                    class="flex flex-col gap-2 border rounded-xl p-3 bg-background/60 shrink-0">
                    <div class="flex items-center justify-between">
                      <span class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                        Aggregation {{ Number(i) + 1 }}
                        <span v-if="agg.col" class="normal-case font-mono text-orange-500 ml-1">— {{ agg.func }}({{ agg.col }})</span>
                      </span>
                      <button @click="tn.removeAgg(Number(i))"
                        class="size-5 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors">
                        <X class="size-3.5" />
                      </button>
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                      <button v-for="fn in AGG_FUNCS" :key="fn" @click="tn.setAgg(Number(i), { func: fn })"
                        :class="['text-[10px] px-2.5 py-1.5 rounded-lg border font-mono font-bold transition-colors whitespace-nowrap',
                          agg.func === fn ? (AGG_COLORS[fn] ?? 'bg-orange-500 text-white border-orange-500')
                          : 'border-border hover:border-orange-400/50 text-muted-foreground hover:text-orange-500 hover:bg-orange-500/8']">{{ fn }}</button>
                    </div>
                    <div class="flex items-center gap-2">
                      <button @click="toggleAggColDropdown(Number(i), $event)"
                        :class="['flex-1 flex items-center gap-2 text-xs border rounded-lg px-2.5 py-2 bg-background focus:outline-none text-left transition-colors',
                          agg.col ? 'border-orange-400/40' : 'border-border hover:border-orange-400/30',
                          openAggColIdx === Number(i) ? 'ring-2 ring-orange-400/50 border-orange-400/40' : '']">
                        <template v-if="agg.col">
                          <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0',
                            getColTypeBadge(upstreamCols.find(c => c.name === agg.col)?.type ?? '').cls]">
                            {{ getColTypeBadge(upstreamCols.find(c => c.name === agg.col)?.type ?? '').label }}
                          </span>
                          <div class="flex-1 min-w-0">
                            <p class="text-[11px] truncate">{{ upstreamCols.find(c => c.name === agg.col)?.remark || agg.col }}</p>
                            <p v-if="upstreamCols.find(c => c.name === agg.col)?.remark" class="font-mono text-[9px] text-muted-foreground/60 truncate">{{ agg.col }}</p>
                          </div>
                        </template>
                        <span v-else class="text-muted-foreground text-[11px] flex-1">— เลือก Column —</span>
                        <ChevronDown :class="['size-3 shrink-0 text-muted-foreground transition-transform', openAggColIdx === Number(i) ? 'rotate-180' : '']" />
                      </button>
                      <input :value="agg.alias" @input="tn.setAgg(Number(i), { alias: ($event.target as HTMLInputElement).value })"
                        placeholder="AS alias"
                        class="w-28 text-xs border rounded-lg px-2.5 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-orange-400/50 font-mono"
                        :class="agg.alias ? 'border-orange-400/40' : ''" />
                    </div>
                  </div>
                </div>

                <button @click="tn.addAgg"
                  class="text-xs w-full py-2 rounded-xl border border-dashed border-orange-500/40 text-orange-600 hover:bg-orange-500/8 font-semibold transition-colors flex items-center justify-center gap-1.5">
                  <Plus class="size-3.5" /> เพิ่ม Aggregation
                </button>
              </div>

            </div><!-- /LEFT -->

            <!-- ── RIGHT: HAVING + WHERE pre-filter + SQL preview ─────── -->
            <div class="flex flex-col gap-4 min-w-0">

              <!-- HAVING -->
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <label class="text-[11px] font-semibold text-amber-600 uppercase tracking-wide">
                    HAVING
                    <span v-if="groupFilterCount" class="ml-1 text-[10px] font-normal text-muted-foreground normal-case">{{ groupFilterCount }} conditions</span>
                  </label>
                  <button @click="tn.addGroupFilter()"
                    class="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-amber-500/30 text-amber-500 hover:bg-amber-500/10 transition-colors">
                    <Plus class="size-2.5" /> เพิ่ม
                  </button>
                </div>

                <div v-if="(store.modalNode?.data?.filters ?? []).length" class="flex flex-col gap-2 max-h-[260px] overflow-y-auto pr-0.5">
                  <div v-for="(f, i) in store.modalNode.data.filters" :key="'hf-' + i"
                    class="flex flex-col gap-3 p-3 rounded-xl border bg-amber-500/3 shrink-0">
                    <div class="flex items-center gap-2">
                      <span class="text-[10px] font-bold text-amber-600 uppercase tracking-wide flex-1">
                        HAVING {{ Number(i) + 1 }}
                        <span v-if="f.column" class="normal-case font-mono text-amber-500 ml-1">— {{ condPreview(f) }}</span>
                      </span>
                      <button @click="tn.removeGroupFilter(Number(i))"
                        class="size-5 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors">
                        <X class="size-3.5" />
                      </button>
                    </div>
                    <button @click="toggleGroupFilterColDropdown(Number(i), $event)"
                      :class="['w-full flex items-center gap-2 text-xs border rounded-lg px-2.5 py-2 bg-background text-left transition-colors',
                        f.column ? 'border-amber-400/40' : 'border-border hover:border-amber-400/30',
                        openGroupFilterColIdx === Number(i) ? 'ring-2 ring-amber-400/50 border-amber-400/40' : '']">
                      <template v-if="f.column">
                        <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0',
                          getColTypeBadge(havingCols.find(c => c.name === f.column)?.type ?? '').cls]">
                          {{ getColTypeBadge(havingCols.find(c => c.name === f.column)?.type ?? '').label }}
                        </span>
                        <span class="font-mono text-[11px] flex-1 truncate">{{ f.column }}</span>
                      </template>
                      <span v-else class="text-muted-foreground text-[11px] flex-1">— เลือก Aggregate / Column —</span>
                      <ChevronDown :class="['size-3 shrink-0 text-muted-foreground transition-transform', openGroupFilterColIdx === Number(i) ? 'rotate-180' : '']" />
                    </button>
                    <div class="flex flex-col gap-1.5">
                      <div v-for="group in WHERE_OP_GROUPS" :key="group.color" class="flex flex-wrap gap-1">
                        <button v-for="op in group.ops" :key="op" @click="tn.setGroupFilter(Number(i), { operator: op })"
                          :class="['text-[10px] px-2.5 py-1 rounded-lg border font-mono font-bold transition-colors whitespace-nowrap', whereOpClass(f.operator, op)]">{{ op }}</button>
                      </div>
                    </div>
                    <div v-if="f.operator && !['IS NULL', 'IS NOT NULL'].includes(f.operator)" class="flex items-center gap-2">
                      <label class="text-[10px] font-semibold text-muted-foreground w-8 shrink-0">ค่า</label>
                      <div v-if="isDateCol(f.column)" class="flex-1 relative flex items-center">
                        <input :ref="(el) => setGroupFilterDateRef(Number(i), el)" type="date" :value="f.value"
                          @input="tn.setGroupFilter(Number(i), { value: ($event.target as HTMLInputElement).value })"
                          class="flex-1 text-xs border rounded-lg pl-2.5 pr-9 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-amber-400/50 font-mono"
                          :class="f.value ? 'border-amber-400/40' : ''" />
                        <button type="button" @click="openGroupFilterDatePicker(Number(i))"
                          class="absolute right-2 size-5 flex items-center justify-center rounded text-amber-600 hover:bg-amber-500/15 transition-colors">
                          <Calendar class="size-3.5" />
                        </button>
                      </div>
                      <input v-else :value="f.value" @input="tn.setGroupFilter(Number(i), { value: ($event.target as HTMLInputElement).value })"
                        :placeholder="f.operator === 'LIKE' ? 'เช่น %keyword%' : f.operator === 'IN' ? 'เช่น 1,2,3' : 'ค่าที่ต้องการ'"
                        class="flex-1 text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-amber-400/50 font-mono"
                        :class="f.value ? 'border-amber-400/40' : ''" />
                    </div>
                    <div v-if="f.column && f.operator"
                      class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-400/20">
                      <span class="text-[9px] font-bold text-amber-600 shrink-0">HAVING</span>
                      <code class="text-[9px] font-mono text-amber-400/80 truncate">{{ condPreview(f) }}</code>
                    </div>
                  </div>
                </div>
                <p v-else class="text-[10px] text-muted-foreground/60 italic px-1">ไม่มี HAVING</p>
              </div>

              <!-- WHERE Pre-filter -->
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <label class="text-[11px] font-semibold text-rose-500 uppercase tracking-wide">
                    WHERE Pre-filter
                    <span v-if="whereCondCount" class="ml-1 text-[10px] font-normal text-muted-foreground normal-case">{{ whereCondCount }} conditions</span>
                  </label>
                  <button @click="tn.addWhereCondition()"
                    class="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-colors">
                    <Plus class="size-2.5" /> เพิ่ม
                  </button>
                </div>

                <div v-if="(store.modalNode?.data?.conditions ?? []).length" class="flex flex-col gap-2 max-h-[260px] overflow-y-auto pr-0.5">
                  <div v-for="(cond, i) in (store.modalNode?.data?.conditions ?? [])" :key="i"
                    class="flex flex-col gap-3 p-3 rounded-xl border bg-rose-500/3 shrink-0">
                    <div class="flex items-center gap-2">
                      <span class="text-[10px] font-bold text-rose-500 uppercase tracking-wide flex-1">
                        Condition {{ Number(i) + 1 }}
                        <span v-if="cond.column" class="normal-case font-mono text-rose-400 ml-1">— {{ condPreview(cond) }}</span>
                      </span>
                      <button @click="tn.removeWhereCondition(Number(i))"
                        class="size-5 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors">
                        <X class="size-3.5" />
                      </button>
                    </div>
                    <button @click="toggleWhereColDropdown(Number(i), $event)"
                      :class="['w-full flex items-center gap-2 text-xs border rounded-lg px-2.5 py-2 bg-background text-left transition-colors',
                        cond.column ? 'border-rose-400/40' : 'border-border hover:border-rose-400/30',
                        openWhereColIdx === Number(i) ? 'ring-2 ring-rose-400/50 border-rose-400/40' : '']">
                      <template v-if="cond.column">
                        <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0',
                          getColTypeBadge(upstreamCols.find(c => c.name === cond.column)?.type ?? '').cls]">
                          {{ getColTypeBadge(upstreamCols.find(c => c.name === cond.column)?.type ?? '').label }}
                        </span>
                        <div class="flex-1 min-w-0">
                          <p class="text-[11px] truncate">{{ upstreamCols.find(c => c.name === cond.column)?.remark || cond.column }}</p>
                          <p v-if="upstreamCols.find(c => c.name === cond.column)?.remark" class="font-mono text-[9px] text-muted-foreground/60 truncate">{{ cond.column }}</p>
                        </div>
                      </template>
                      <span v-else class="text-muted-foreground text-[11px] flex-1">— เลือก Column —</span>
                      <ChevronDown :class="['size-3 shrink-0 text-muted-foreground transition-transform', openWhereColIdx === Number(i) ? 'rotate-180' : '']" />
                    </button>
                    <div class="flex flex-col gap-1.5">
                      <div v-for="grp in WHERE_OP_GROUPS" :key="grp.color" class="flex flex-wrap gap-1">
                        <button v-for="op in grp.ops" :key="op" @click="tn.setWhereCondition(Number(i), { operator: op })"
                          :class="['text-[10px] px-2.5 py-1 rounded-lg border font-mono font-bold transition-colors whitespace-nowrap', whereOpClass(cond.operator, op)]">{{ op }}</button>
                      </div>
                    </div>
                    <div v-if="cond.operator && !['IS NULL', 'IS NOT NULL'].includes(cond.operator)" class="flex items-center gap-2">
                      <label class="text-[10px] font-semibold text-muted-foreground w-8 shrink-0">ค่า</label>
                      <div v-if="isDateCol(cond.column)" class="flex-1 relative flex items-center">
                        <input :ref="(el) => setWhereDateRef(Number(i), el)" type="date" :value="cond.value"
                          @input="tn.setWhereCondition(Number(i), { value: ($event.target as HTMLInputElement).value })"
                          class="flex-1 text-xs border rounded-lg pl-2.5 pr-9 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-rose-400/50 font-mono"
                          :class="cond.value ? 'border-rose-400/40' : ''" />
                        <button type="button" @click="openWhereDatePicker(Number(i))"
                          class="absolute right-2 size-5 flex items-center justify-center rounded text-rose-500 hover:bg-rose-500/15 transition-colors">
                          <Calendar class="size-3.5" />
                        </button>
                      </div>
                      <input v-else :value="cond.value" @input="tn.setWhereCondition(Number(i), { value: ($event.target as HTMLInputElement).value })"
                        :placeholder="cond.operator === 'LIKE' ? 'เช่น %keyword%' : cond.operator === 'IN' ? 'เช่น 1,2,3' : 'ค่าที่ต้องการ'"
                        class="flex-1 text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-rose-400/50 font-mono"
                        :class="cond.value ? 'border-rose-400/40' : ''" />
                    </div>
                    <div v-if="cond.column && cond.operator"
                      class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-500/5 border border-rose-400/20">
                      <span class="text-[9px] font-bold text-rose-500 shrink-0">SQL</span>
                      <code class="text-[9px] font-mono text-rose-300/80 truncate">{{ condPreview(cond) }}</code>
                    </div>
                  </div>
                </div>
                <p v-else class="text-[10px] text-muted-foreground/60 italic px-1">ไม่มี pre-filter</p>
              </div>

              <!-- SQL Preview (editable) -->
              <div class="rounded-lg bg-orange-500/5 border border-orange-400/20 overflow-hidden">
                <div class="flex items-center justify-between px-3 py-1.5 border-b border-orange-400/20">
                  <span class="text-[9px] font-bold text-orange-500">SQL PREVIEW</span>
                  <button
                    v-if="store.modalNode.data.customGroupSql"
                    @click="store.updateNodeData(store.modalNode.id, { customGroupSql: '' })"
                    class="text-[9px] text-muted-foreground hover:text-rose-400 transition-colors"
                  >reset</button>
                </div>
                <textarea
                  :value="store.modalNode.data.customGroupSql || groupSqlPreview"
                  @input="store.updateNodeData(store.modalNode.id, { customGroupSql: ($event.target as HTMLTextAreaElement).value })"
                  class="w-full bg-transparent text-[9px] font-mono text-orange-300/80 leading-relaxed resize-y p-2.5 outline-none min-h-[120px]"
                  rows="10"
                  spellcheck="false"
                /></div>

            </div><!-- /RIGHT -->
            </div><!-- /grid -->
          </template>

          <!-- ── Sort ────────────────────────────────────────────────── -->
          <template v-else-if="nodeType === 'sort'">
            <div class="grid grid-cols-[1fr_1fr] gap-5 items-start">

            <!-- ── LEFT: ORDER BY Columns ─────────────────────────────── -->
            <div class="flex flex-col gap-3 border rounded-xl p-4 bg-green-500/3 min-w-0">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-xs font-bold text-green-600">ORDER BY Columns</p>
                  <p class="text-[10px] text-muted-foreground mt-0.5">เลือก columns และกำหนด ASC / DESC ต่อ column</p>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-semibold text-green-600 bg-green-500/10 px-2 py-0.5 rounded-full">
                    {{ sortItemCount }}/{{ upstreamCols.length }}
                  </span>
                  <button @click="selectAllSortCols" class="text-[10px] text-green-600 hover:underline font-semibold">ทั้งหมด</button>
                  <span class="text-muted-foreground text-[10px]">/</span>
                  <button @click="clearSortCols" class="text-[10px] text-muted-foreground hover:underline">ล้าง</button>
                </div>
              </div>

              <div class="relative">
                <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/50" />
                <input v-model="sortColSearch" placeholder="ค้นหา column..."
                  class="w-full text-xs border rounded-lg pl-7 pr-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-green-400/50 font-mono" />
              </div>

              <div v-if="!upstreamCols.length"
                class="flex items-center gap-2 px-3 py-3 rounded-lg bg-muted/30 text-[10px] text-muted-foreground italic">
                ยังไม่มี columns — เชื่อมต่อ table node เข้ากับ ORDER BY node ก่อน
              </div>

              <div v-else class="border rounded-lg overflow-hidden max-h-[420px] overflow-y-auto">
                <template v-for="group in filteredGroupedSortCols" :key="group.tableId">
                  <div class="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-muted border-b border-border/50">
                    <Database class="size-3 text-green-500 shrink-0" />
                    <span class="text-[10px] font-semibold text-foreground truncate flex-1">{{ group.tableLabel }}</span>
                    <span class="text-[9px] text-muted-foreground shrink-0">{{ group.cols.length }}</span>
                  </div>
                  <label v-for="col in group.cols" :key="col.name"
                    class="flex items-center gap-2.5 px-3 py-2 pl-5 cursor-pointer select-none transition-colors border-b border-border/30 last:border-0 hover:bg-green-500/5"
                    :class="isSortSelected(col.name) ? 'bg-green-500/5' : ''">
                    <div :class="['size-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                      isSortSelected(col.name) ? 'bg-green-500 border-green-500' : 'border-border/60 bg-background']">
                      <svg v-if="isSortSelected(col.name)" class="size-2.5 text-white" fill="none" viewBox="0 0 10 10">
                        <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                      </svg>
                      <input type="checkbox" class="sr-only"
                        :checked="isSortSelected(col.name)"
                        @change="toggleSortCol(col.name, ($event.target as HTMLInputElement).checked)" />
                    </div>
                    <Key v-if="col.isPk" class="size-3 text-amber-400 shrink-0" />
                    <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadge(col.type).cls]">
                      {{ getColTypeBadge(col.type).label }}
                    </span>
                    <div class="flex-1 min-w-0">
                      <p class="text-[11px] truncate" :class="col.isPk ? 'text-amber-500 font-semibold' : 'text-foreground'">{{ col.remark || col.name }}</p>
                      <p v-if="col.remark" class="font-mono text-[9px] text-muted-foreground/60 truncate">{{ col.name }}</p>
                    </div>
                    <div v-if="isSortSelected(col.name)" class="flex gap-1 shrink-0" @click.stop>
                      <button @click="setSortDir(col.name, 'ASC')" :class="['text-[9px] px-2 py-0.5 rounded-md font-bold border transition-colors',
                        getSortDir(col.name) === 'ASC' ? 'bg-green-500 border-green-500 text-white' : 'border-border/50 text-muted-foreground hover:border-green-400 hover:text-green-600']">ASC</button>
                      <button @click="setSortDir(col.name, 'DESC')" :class="['text-[9px] px-2 py-0.5 rounded-md font-bold border transition-colors',
                        getSortDir(col.name) === 'DESC' ? 'bg-rose-500 border-rose-500 text-white' : 'border-border/50 text-muted-foreground hover:border-rose-400 hover:text-rose-600']">DESC</button>
                    </div>
                  </label>
                </template>
                <div v-if="filteredGroupedSortCols.length === 0"
                  class="px-3 py-3 text-[10px] text-muted-foreground/60 italic text-center">
                  {{ sortColSearch ? `ไม่พบ column ที่ตรงกับ "${sortColSearch}"` : 'กำลังโหลด columns...' }}
                </div>
              </div>
            </div><!-- /LEFT -->

            <!-- ── RIGHT: WHERE pre-filter + SQL preview ─────────────── -->
            <div class="flex flex-col gap-4 min-w-0">

              <!-- WHERE pre-filter -->
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <label class="text-[11px] font-semibold text-rose-500 uppercase tracking-wide">
                    WHERE Pre-filter
                    <span v-if="whereCondCount" class="ml-1 text-[10px] font-normal text-muted-foreground normal-case">{{ whereCondCount }} conditions</span>
                  </label>
                  <button @click="tn.addWhereCondition()"
                    class="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-colors">
                    <Plus class="size-2.5" /> เพิ่ม
                  </button>
                </div>

                <div v-if="(store.modalNode?.data?.conditions ?? []).length" class="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-0.5">
                  <div v-for="(cond, i) in (store.modalNode?.data?.conditions ?? [])" :key="i"
                    class="flex flex-col gap-3 p-3 rounded-xl border bg-rose-500/3 shrink-0">
                    <div class="flex items-center gap-2">
                      <span class="text-[10px] font-bold text-rose-500 uppercase tracking-wide flex-1">
                        Condition {{ Number(i) + 1 }}
                        <span v-if="cond.column" class="normal-case font-mono text-rose-400 ml-1">— {{ condPreview(cond) }}</span>
                      </span>
                      <button @click="tn.removeWhereCondition(Number(i))"
                        class="size-5 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors">
                        <X class="size-3.5" />
                      </button>
                    </div>
                    <button @click="toggleWhereColDropdown(Number(i), $event)"
                      :class="['w-full flex items-center gap-2 text-xs border rounded-lg px-2.5 py-2 bg-background text-left transition-colors',
                        cond.column ? 'border-rose-400/40' : 'border-border hover:border-rose-400/30',
                        openWhereColIdx === Number(i) ? 'ring-2 ring-rose-400/50 border-rose-400/40' : '']">
                      <template v-if="cond.column">
                        <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0',
                          getColTypeBadge(upstreamCols.find(c => c.name === cond.column)?.type ?? '').cls]">
                          {{ getColTypeBadge(upstreamCols.find(c => c.name === cond.column)?.type ?? '').label }}
                        </span>
                        <div class="flex-1 min-w-0">
                          <p class="text-[11px] truncate">{{ upstreamCols.find(c => c.name === cond.column)?.remark || cond.column }}</p>
                          <p v-if="upstreamCols.find(c => c.name === cond.column)?.remark" class="font-mono text-[9px] text-muted-foreground/60 truncate">{{ cond.column }}</p>
                        </div>
                      </template>
                      <span v-else class="text-muted-foreground text-[11px] flex-1">— เลือก Column —</span>
                      <ChevronDown :class="['size-3 shrink-0 text-muted-foreground transition-transform', openWhereColIdx === Number(i) ? 'rotate-180' : '']" />
                    </button>
                    <div class="flex flex-col gap-1.5">
                      <div v-for="grp in WHERE_OP_GROUPS" :key="grp.color" class="flex flex-wrap gap-1">
                        <button v-for="op in grp.ops" :key="op" @click="tn.setWhereCondition(Number(i), { operator: op })"
                          :class="['text-[10px] px-2.5 py-1 rounded-lg border font-mono font-bold transition-colors whitespace-nowrap', whereOpClass(cond.operator, op)]">{{ op }}</button>
                      </div>
                    </div>
                    <div v-if="cond.operator && !['IS NULL', 'IS NOT NULL'].includes(cond.operator)" class="flex items-center gap-2">
                      <label class="text-[10px] font-semibold text-muted-foreground w-8 shrink-0">ค่า</label>
                      <div v-if="isDateCol(cond.column)" class="flex-1 relative flex items-center">
                        <input :ref="(el) => setWhereDateRef(Number(i), el)" type="date" :value="cond.value"
                          @input="tn.setWhereCondition(Number(i), { value: ($event.target as HTMLInputElement).value })"
                          class="flex-1 text-xs border rounded-lg pl-2.5 pr-9 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-rose-400/50 font-mono"
                          :class="cond.value ? 'border-rose-400/40' : ''" />
                        <button type="button" @click="openWhereDatePicker(Number(i))"
                          class="absolute right-2 size-5 flex items-center justify-center rounded text-rose-500 hover:bg-rose-500/15 transition-colors">
                          <Calendar class="size-3.5" />
                        </button>
                      </div>
                      <input v-else :value="cond.value" @input="tn.setWhereCondition(Number(i), { value: ($event.target as HTMLInputElement).value })"
                        :placeholder="cond.operator === 'LIKE' ? 'เช่น %keyword%' : cond.operator === 'IN' ? 'เช่น 1,2,3' : 'ค่าที่ต้องการ'"
                        class="flex-1 text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-rose-400/50 font-mono"
                        :class="cond.value ? 'border-rose-400/40' : ''" />
                    </div>
                    <div v-if="cond.column && cond.operator"
                      class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-500/5 border border-rose-400/20">
                      <span class="text-[9px] font-bold text-rose-500 shrink-0">SQL</span>
                      <code class="text-[9px] font-mono text-rose-300/80 truncate">{{ condPreview(cond) }}</code>
                    </div>
                  </div>
                </div>
                <p v-else class="text-[10px] text-muted-foreground/60 italic px-1">ไม่มี pre-filter</p>
              </div>

              <!-- SQL Preview -->
              <div class="px-3 py-2 rounded-lg bg-green-500/5 border border-green-400/20 max-h-[120px] overflow-y-auto overflow-x-auto">
                <div class="flex items-start gap-1.5">
                  <span class="text-[9px] font-bold text-green-600 shrink-0 mt-0.5">SQL</span>
                  <code class="text-[9px] font-mono text-green-300/80 leading-relaxed whitespace-pre">{{ sortSqlPreview }}</code>
                </div>
              </div>

            </div><!-- /RIGHT -->
            </div><!-- /grid -->
          </template>

          <!-- ── Union (step wizard) ────────────────────────────────── -->
          <template v-else-if="nodeType === 'union'">
            <div class="flex flex-col flex-1 min-h-0 -mx-5 -mb-5 overflow-hidden">

            <!-- ── Step indicator ─────────────────────────────────────── -->
            <div class="flex items-center px-6 py-3 border-b border-border/40 bg-muted/10 shrink-0 gap-0">
              <template v-for="(s, i) in UNION_STEPS" :key="s.id">
                <div class="flex items-center gap-2 shrink-0">
                  <div :class="[
                    'size-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all',
                    unionStep > s.id  ? 'bg-yellow-500/80 text-white' :
                    unionStep === s.id ? 'bg-yellow-500 text-white ring-2 ring-yellow-500/30' :
                                         'bg-muted/40 text-muted-foreground/50',
                  ]">
                    <svg v-if="unionStep > s.id" class="size-3" fill="none" viewBox="0 0 10 10">
                      <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                    <span v-else>{{ s.id }}</span>
                  </div>
                  <span :class="[
                    'text-[10px] font-semibold transition-colors whitespace-nowrap',
                    unionStep === s.id ? 'text-yellow-500' :
                    unionStep > s.id  ? 'text-foreground/50' : 'text-muted-foreground/40',
                  ]">{{ s.label }}</span>
                </div>
                <div v-if="i < UNION_STEPS.length - 1" class="flex-1 h-px mx-3 transition-colors"
                  :class="unionStep > s.id ? 'bg-yellow-500/40' : 'bg-border/30'" />
              </template>
            </div>

            <!-- ── Step content ────────────────────────────────────────── -->
            <div class="flex-1 overflow-y-auto min-h-0">

            <!-- ════ STEP 1: เลือก Sources ═══════════════════════════ -->
            <div v-if="unionStep === 1" class="flex flex-col overflow-hidden">

              <!-- C3: plain-Thai hint explaining UNION in one line so users who
                   don't know SQL understand what they're about to do. -->
              <div class="mx-5 mt-3 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/25 text-[10px] text-yellow-700 dark:text-yellow-400 flex items-start gap-2 shrink-0">
                <GitMerge class="size-3.5 mt-0.5 shrink-0" />
                <span>
                  <span class="font-bold">UNION</span> คือการเอาข้อมูลจากหลายตาราง/CTE
                  มา "ต่อท้ายกัน" เป็นชุดเดียว —
                  ทุก source ต้องมีจำนวน column เท่ากันและชนิดตรงกัน
                </span>
              </div>

              <!-- Step 1 header -->
              <div class="flex items-center gap-2 px-5 py-3 border-b border-border/40 bg-muted/10 shrink-0">
                <GitMerge class="size-4 text-yellow-500 shrink-0" />
                <div class="flex-1 min-w-0">
                  <p class="text-[11px] font-bold text-yellow-500">เลือก Sources</p>
                  <p class="text-[9px] text-muted-foreground/50">เลือกอย่างน้อย 2 sources เพื่อทำ UNION</p>
                </div>
                <button @click="selectAllUnionSources()"
                  :disabled="!allUnionSourcesRich.length"
                  class="flex items-center gap-1 h-7 px-2.5 rounded-lg border text-[10px] font-bold transition-colors shrink-0 border-yellow-500/40 text-yellow-600 bg-yellow-500/8 hover:bg-yellow-500/15 disabled:opacity-30 disabled:cursor-not-allowed">
                  เลือกทั้งหมด
                </button>
                <button @click="clearAllUnionSources()"
                  :disabled="!unionSources.length"
                  class="flex items-center gap-1 h-7 px-2.5 rounded-lg border text-[10px] font-bold transition-colors shrink-0 border-rose-500/40 text-rose-500 bg-rose-500/8 hover:bg-rose-500/15 disabled:opacity-30 disabled:cursor-not-allowed">
                  เคลียร์
                </button>
                <span :class="[
                  'text-[11px] font-bold px-3 py-1 rounded-full transition-colors shrink-0',
                  unionSources.length >= 2 ? 'bg-yellow-500/20 text-yellow-500' : 'bg-muted/40 text-muted-foreground/50',
                ]">{{ unionSources.length }} เลือกแล้ว</span>
              </div>

              <!-- Source card grid -->
              <div class="flex-1 overflow-y-auto p-4">
                <div v-if="!allUnionSourcesRich.length"
                  class="flex flex-col items-center justify-center gap-3 py-16 text-center text-[11px] text-muted-foreground/40">
                  <GitMerge class="size-8 text-yellow-500/20" />
                  วาง Table / CTE node ลง canvas ก่อน
                </div>

                <div v-else class="grid grid-cols-2 gap-3">
                  <template v-for="src in allUnionSourcesRich" :key="src.id">

                    <!-- ── CTE card (full width) ── -->
                    <div v-if="src.tag === 'CTE' && src.tableGroups.length"
                      class="col-span-2 rounded-xl border overflow-hidden transition-all"
                      :class="isUnionSourceConnected(src.id)
                        ? 'border-violet-500/40 bg-violet-500/5'
                        : 'border-border/40 bg-muted/5'">

                      <!-- CTE card header -->
                      <div class="flex items-center gap-3 px-4 py-3 bg-muted/20 border-b border-border/20 cursor-pointer"
                        @click="toggleUnionSource(src.id)">
                        <!-- Checkbox -->
                        <div :class="[
                          'size-5 rounded border-2 flex items-center justify-center shrink-0 transition-all',
                          isUnionSourceConnected(src.id) ? 'bg-violet-500 border-violet-500' : 'border-violet-500/40 bg-background hover:border-violet-500/80',
                        ]">
                          <svg v-if="isUnionSourceConnected(src.id)" class="size-3 text-white" fill="none" viewBox="0 0 10 10">
                            <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                          </svg>
                        </div>
                        <span class="text-[9px] font-bold px-2 py-1 rounded font-mono uppercase bg-violet-500/20 text-violet-400 shrink-0">CTE</span>
                        <div class="flex-1 min-w-0">
                          <p class="font-mono text-[12px] font-semibold text-violet-300 truncate">{{ src.label }}</p>
                          <p class="text-[9px] text-muted-foreground/50 mt-0.5">{{ src.tableGroups.length }} tables · {{ src.cols.length }} columns</p>
                        </div>
                        <span :class="[
                          'text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 transition-colors',
                          isUnionSourceConnected(src.id) ? 'bg-violet-500/20 text-violet-400' : 'bg-muted/20 text-muted-foreground/40',
                        ]">
                          {{ isUnionSourceConnected(src.id) ? 'เชื่อมแล้ว' : 'ยังไม่เชื่อม' }}
                        </span>
                      </div>

                      <!-- CTE table sub-cards grid (informational only) -->
                      <div class="grid grid-cols-2 gap-2 p-3">
                        <div v-for="tg in src.tableGroups" :key="tg.tableId"
                          class="rounded-lg border overflow-hidden border-border/25 bg-background/30">
                          <!-- Table sub-card header -->
                          <div class="flex items-center gap-2 px-3 py-2.5">
                            <span class="text-[8px] font-bold px-1 py-0.5 rounded font-mono uppercase bg-sky-500/20 text-sky-400 shrink-0">TABLE</span>
                            <div class="flex-1 min-w-0">
                              <p class="font-mono text-[11px] font-semibold truncate text-foreground/80">{{ tg.tableLabel }}</p>
                              <p class="text-[8px] font-mono mt-0.5 text-muted-foreground/40">{{ tg.cols.length }} cols</p>
                            </div>
                            <button @click.stop="toggleUnionSourceExpanded(tg.tableId)"
                              class="size-5 flex items-center justify-center rounded hover:bg-muted/40 transition-colors shrink-0">
                              <ChevronDown :class="['size-3 text-muted-foreground/50 transition-transform', unionExpandedSources.has(tg.tableId) ? 'rotate-180' : '']" />
                            </button>
                          </div>
                          <!-- Dropdown: columns -->
                          <div v-if="unionExpandedSources.has(tg.tableId)"
                            class="border-t border-border/15 max-h-[160px] overflow-y-auto bg-muted/5">
                            <div v-for="col in tg.cols" :key="col.name"
                              class="flex items-center gap-1.5 px-3 py-1 hover:bg-muted/20 transition-colors">
                              <span :class="['text-[7px] px-1 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadge(col.type).cls]">
                                {{ getColTypeBadge(col.type).label }}
                              </span>
                              <Key v-if="col.isPk" class="size-2.5 text-amber-400 shrink-0" />
                              <span class="font-mono text-[10px] truncate"
                                :class="col.isPk ? 'text-amber-400' : 'text-foreground/65'">{{ col.name }}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- ── Non-CTE card ── -->
                    <div v-else
                      class="rounded-xl border overflow-hidden transition-all"
                      :class="[
                        isUnionSourceConnected(src.id)
                          ? 'border-yellow-500/50 bg-yellow-500/8'
                          : unionCompatibilityMap.get(src.id) === 'incompatible'
                            ? 'border-border/20 bg-muted/3 opacity-45'
                            : 'border-border/40 bg-muted/5 hover:border-border/70',
                      ]">

                      <!-- Card header -->
                      <div class="flex items-center gap-2.5 px-3 py-3">
                        <!-- Checkbox -->
                        <div @click="unionCompatibilityMap.get(src.id) !== 'incompatible' && toggleUnionSource(src.id)"
                          :class="[
                            'size-5 rounded border-2 flex items-center justify-center shrink-0 transition-all',
                            isUnionSourceConnected(src.id)
                              ? 'bg-yellow-500 border-yellow-500 cursor-pointer'
                              : unionCompatibilityMap.get(src.id) === 'incompatible'
                                ? 'border-border/30 bg-muted/20 cursor-not-allowed'
                                : 'border-yellow-500/40 bg-background hover:border-yellow-500/80 cursor-pointer',
                          ]">
                          <svg v-if="isUnionSourceConnected(src.id)" class="size-3 text-white" fill="none" viewBox="0 0 10 10">
                            <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                          </svg>
                        </div>
                        <!-- Tag -->
                        <span :class="[
                          'text-[8px] font-bold px-1.5 py-0.5 rounded font-mono uppercase shrink-0',
                          unionCompatibilityMap.get(src.id) === 'incompatible'
                            ? 'bg-muted/30 text-muted-foreground/40'
                            : src.tag === 'TABLE' ? 'bg-sky-500/20 text-sky-400' :
                              src.tag === 'UNION' ? 'bg-yellow-500/20 text-yellow-500' :
                              src.tag === 'GROUP' ? 'bg-orange-500/20 text-orange-400' :
                              src.tag === 'CALC'  ? 'bg-teal-500/20 text-teal-400' :
                                                    'bg-muted text-muted-foreground'
                        ]">{{ src.tag }}</span>
                        <!-- Name -->
                        <div class="flex-1 min-w-0">
                          <p class="font-mono text-[11px] font-semibold truncate"
                            :class="isUnionSourceConnected(src.id) ? 'text-yellow-500' : unionCompatibilityMap.get(src.id) === 'incompatible' ? 'text-muted-foreground/35' : 'text-foreground/85'">
                            {{ src.label }}
                          </p>
                          <p class="text-[8px] font-mono truncate mt-0.5"
                            :class="unionCompatibilityMap.get(src.id) === 'incompatible' ? 'text-rose-500/50' : 'text-muted-foreground/40'">
                            <template v-if="unionSources.length && !isUnionSourceConnected(src.id)">
                              {{ unionCompatibilityMap.get(src.id) === 'incompatible'
                                  ? 'ไม่มี columns ร่วมกัน'
                                  : `${unionOverlapCount(src.id, src.cols)} columns ตรงกัน` }}
                            </template>
                            <template v-else-if="src.tables.length">
                              {{ src.tables.slice(0, 2).join(', ') }}{{ src.tables.length > 2 ? ` +${src.tables.length - 2}` : '' }}
                            </template>
                          </p>
                        </div>
                        <!-- Col count + dropdown -->
                        <div class="flex items-center gap-1 shrink-0">
                          <span class="text-[9px] font-mono"
                            :class="unionCompatibilityMap.get(src.id) === 'incompatible' ? 'text-muted-foreground/30' : 'text-muted-foreground/40'">
                            {{ src.cols.length }}c
                          </span>
                          <button @click="toggleUnionSourceExpanded(src.id)"
                            class="size-5 flex items-center justify-center rounded hover:bg-muted/40 transition-colors">
                            <ChevronDown :class="['size-3 text-muted-foreground/50 transition-transform', unionExpandedSources.has(src.id) ? 'rotate-180' : '']" />
                          </button>
                        </div>
                      </div>

                      <!-- Dropdown: columns -->
                      <div v-if="unionExpandedSources.has(src.id)"
                        class="border-t border-border/15 max-h-[180px] overflow-y-auto bg-muted/5">
                        <div v-if="!src.cols.length" class="px-3 py-2 text-[9px] text-muted-foreground/40 italic">ไม่พบ columns</div>
                        <div v-for="col in src.cols" :key="col.name"
                          class="flex items-center gap-1.5 px-3 py-1.5 hover:bg-muted/20 transition-colors border-b border-border/10 last:border-0">
                          <span :class="['text-[7px] px-1 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadge(col.type).cls]">
                            {{ getColTypeBadge(col.type).label }}
                          </span>
                          <Key v-if="col.isPk" class="size-2.5 text-amber-400 shrink-0" />
                          <span class="font-mono text-[10px] truncate flex-1"
                            :class="col.isPk ? 'text-amber-400' : 'text-foreground/65'">{{ col.name }}</span>
                          <span v-if="col.remark" class="text-[9px] text-muted-foreground/35 truncate max-w-[60px]">{{ col.remark }}</span>
                        </div>
                      </div>
                    </div>

                  </template>
                </div>
              </div>
            </div><!-- /STEP 1 -->

            <!-- ════ STEP 2: เลือก Columns ══════════════════════════════ -->
            <div v-else-if="unionStep === 2" class="flex flex-col overflow-hidden min-w-0">

              <!-- Step 2 top bar -->
              <div class="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-muted/10 shrink-0">
                <span class="text-[10px] font-semibold text-muted-foreground/60 shrink-0 flex-1">เลือก columns ที่ต้องการในผลลัพธ์</span>
                <button @click="autoDetectUnionMapping()"
                  :disabled="!unionGroupedCols.length"
                  :class="[
                    'flex items-center gap-1 h-7 px-2.5 rounded-lg border text-[10px] font-bold transition-colors shrink-0',
                    unionGroupedCols.length
                      ? 'border-emerald-500/50 text-emerald-600 bg-emerald-500/10 hover:bg-emerald-500/20'
                      : 'border-border/20 text-muted-foreground/30 cursor-not-allowed',
                  ]">
                  <Sparkles class="size-3" /> Auto Group
                </button>
                <button @click="clearUnionMapping()"
                  :disabled="!unionColMapping.length"
                  :class="[
                    'flex items-center gap-1 h-7 px-2.5 rounded-lg border text-[10px] font-bold transition-colors shrink-0',
                    unionColMapping.length
                      ? 'border-rose-500/40 text-rose-500 bg-rose-500/8 hover:bg-rose-500/15'
                      : 'border-border/20 text-muted-foreground/30 cursor-not-allowed',
                  ]">
                  ล้าง
                </button>
              </div>

              <!-- Union readiness status strip -->
              <div class="flex items-center gap-2 px-4 py-2 border-b border-border/30 shrink-0 text-[10px]"
                :class="unionReadiness.level === 'ok'    ? 'bg-emerald-500/5  text-emerald-600' :
                        unionReadiness.level === 'warn'  ? 'bg-amber-500/5   text-amber-500'  :
                        unionReadiness.level === 'error' ? 'bg-rose-500/5    text-rose-400'   :
                                                           'bg-muted/5       text-muted-foreground/60'">
                <span class="font-bold text-[11px] shrink-0">
                  {{ unionReadiness.level === 'ok' ? '✓' : unionReadiness.level === 'warn' ? '⚠' : unionReadiness.level === 'error' ? '✕' : 'ℹ' }}
                </span>
                <span class="flex-1 font-medium">{{ unionReadiness.msg }}</span>
                <span v-if="unionGroupedCols.length" class="font-mono text-[9px] opacity-60 shrink-0">
                  {{ unionGroupedCols.length }} src · {{ unionColMapping.length }} cols
                </span>
              </div>

              <!-- ── Full-width column selector ── -->
              <div class="flex flex-col overflow-hidden min-h-0 flex-1">

                <!-- ── Source tabs ── -->
                <div class="flex items-center gap-0 border-b border-border/30 px-3 pt-2 shrink-0 overflow-x-auto">
                  <button @click="unionColTab = '__all__'; unionColSearch = ''"
                    :class="[
                      'flex items-center gap-1 text-[11px] font-semibold px-3 py-1.5 rounded-t-lg border-b-2 transition-colors shrink-0',
                      unionColTab === '__all__'
                        ? 'border-yellow-500 text-yellow-500 bg-yellow-500/5'
                        : 'border-transparent text-muted-foreground/50 hover:text-foreground/70 hover:bg-muted/20',
                    ]">
                    🔀 ทั้งหมด
                    <span class="text-[9px] font-mono opacity-60">({{ unionAllSourceCols.length }})</span>
                  </button>
                  <button v-for="grp in unionGroupedCols" :key="grp.sourceId"
                    @click="unionColTab = grp.sourceId; unionColSearch = ''"
                    :class="[
                      'flex items-center gap-1.5 text-[11px] font-mono font-semibold px-3 py-1.5 rounded-t-lg border-b-2 transition-colors shrink-0',
                      unionColTab === grp.sourceId
                        ? 'border-yellow-500 text-yellow-500 bg-yellow-500/5'
                        : 'border-transparent text-muted-foreground/50 hover:text-foreground/70 hover:bg-muted/20',
                    ]">
                    <span :class="[
                      'text-[7px] font-bold px-1 py-px rounded uppercase shrink-0',
                      grp.tag === 'TABLE' ? 'bg-sky-500/20 text-sky-400' :
                      grp.tag === 'CTE'   ? 'bg-violet-500/20 text-violet-400' :
                      grp.tag === 'UNION' ? 'bg-yellow-500/20 text-yellow-500' :
                      grp.tag === 'GROUP' ? 'bg-orange-500/20 text-orange-400' :
                      grp.tag === 'CALC'  ? 'bg-teal-500/20 text-teal-400' :
                                            'bg-muted text-muted-foreground'
                    ]">{{ grp.tag }}</span>
                    <span class="truncate max-w-[80px]">{{ grp.label }}</span>
                  </button>
                </div>

                <!-- ── Quick actions + search ── -->
                <div class="flex items-center gap-2 px-3 py-2 border-b border-border/20 shrink-0 flex-wrap">
                  <button @click="autoSelectExactMatch()"
                    :disabled="!unionGroupedCols.length"
                    class="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border font-semibold transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed border-emerald-500/30 bg-emerald-500/8 text-emerald-500 hover:bg-emerald-500/15">
                    <Sparkles class="size-3" /> เลือก Column ที่มีครบทุก Source ({{ exactMatchCols.length }})
                  </button>
                  <button v-if="unionColMapping.length" @click="clearUnionMapping()"
                    class="text-[11px] px-2.5 py-1 rounded-lg border border-border/30 text-muted-foreground/60 hover:text-rose-400 hover:border-rose-400/30 transition-colors shrink-0">
                    ล้าง
                  </button>
                  <div class="flex-1 min-w-[120px]">
                    <input v-model="unionColSearch" placeholder="ค้นหา column…"
                      class="w-full text-[11px] px-2.5 py-1 rounded-lg border border-border/30 bg-background/60 text-foreground/80 placeholder:text-muted-foreground/40 outline-none focus:border-yellow-500/50 transition-colors" />
                  </div>
                </div>

                <!-- ── Column row list ── -->
                <div class="flex-1 overflow-y-auto min-h-0 flex flex-col">

                  <div v-if="!unionGroupedCols.length"
                    class="flex flex-col items-center gap-2 py-16 text-center shrink-0">
                    <GitMerge class="size-6 text-yellow-500/20" />
                    <p class="text-[10px] text-muted-foreground/50 italic">เลือก Source ในขั้นตอนที่ 1 ก่อน</p>
                  </div>

                  <template v-else>
                    <div v-for="col in unionColTabFiltered" :key="col.name"
                      @click="toggleColumnInMapping(col.name)"
                      :class="[
                        'flex items-center gap-2.5 px-3 py-2 border-b border-border/10 cursor-pointer transition-all shrink-0 group',
                        isColumnMapped(col.name)
                          ? unionMappingHasAllNullRows.includes(col.name)
                            ? 'bg-rose-500/4 hover:bg-rose-500/6'
                            : hasUnionTypeMismatch(unionColMapping.find(r => r.outputName === col.name)!)
                              ? 'bg-amber-500/4 hover:bg-amber-500/6'
                              : 'bg-yellow-500/4 hover:bg-yellow-500/6'
                          : 'hover:bg-muted/20',
                      ]">

                      <!-- Checkbox -->
                      <div :class="[
                        'size-4 rounded border-2 flex items-center justify-center shrink-0 transition-all',
                        isColumnMapped(col.name)
                          ? 'bg-yellow-500 border-yellow-500 group-hover:bg-rose-500 group-hover:border-rose-500'
                          : 'border-border/40 bg-background group-hover:border-yellow-500/60',
                      ]">
                        <svg v-if="isColumnMapped(col.name)" class="size-2.5 text-white" fill="none" viewBox="0 0 10 8">
                          <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </div>

                      <!-- Type badge -->
                      <span :class="[
                        'text-[8px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0',
                        isColumnMapped(col.name) ? getColTypeBadge(col.type).cls : getColTypeBadge(col.type).cls + ' opacity-50',
                      ]">{{ getColTypeBadge(col.type).label }}</span>

                      <!-- Column name + remark -->
                      <div class="flex-1 min-w-0 flex items-baseline gap-2">
                        <span :class="[
                          'font-mono text-[12px] font-semibold truncate transition-colors',
                          isColumnMapped(col.name) ? 'text-yellow-400' : 'text-foreground/65 group-hover:text-foreground/85',
                        ]">{{ col.name }}</span>
                        <span v-if="getColRemark(col.name)"
                          class="text-[10px] text-muted-foreground/40 truncate shrink-0 max-w-[120px]">{{ getColRemark(col.name) }}</span>
                      </div>

                      <!-- Status badges -->
                      <span v-if="isColumnMapped(col.name) && unionMappingHasAllNullRows.includes(col.name)"
                        class="text-[8px] font-bold text-rose-400 bg-rose-500/10 px-1.5 py-px rounded shrink-0">✕ NULL</span>
                      <span v-else-if="isColumnMapped(col.name) && hasUnionTypeMismatch(unionColMapping.find(r => r.outputName === col.name)!)"
                        class="text-[8px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-px rounded shrink-0">⚠</span>

                      <!-- Coverage squares -->
                      <div class="flex items-center gap-1 shrink-0">
                        <div v-for="grp in unionGroupedCols" :key="grp.sourceId"
                          :class="['size-2 rounded-sm transition-colors', grp.cols.some(c => c.name === col.name) ? 'bg-emerald-500/70' : 'bg-border/30']"
                          :title="`${grp.label}: ${grp.cols.some(c => c.name === col.name) ? 'มี ✓' : 'ไม่มี ✗'}`" />
                      </div>

                      <span v-if="col.coveredCount < unionGroupedCols.length"
                        class="text-[8px] text-amber-400/60 shrink-0" title="ไม่ครบทุก source">⚠</span>
                    </div>

                    <div v-if="!unionColTabFiltered.length"
                      class="flex flex-col items-center gap-1 py-10 text-center shrink-0">
                      <p class="text-[10px] text-muted-foreground/40 italic">ไม่พบ column ที่ตรงกัน</p>
                    </div>
                  </template>

                  <div class="flex-1" />
                </div>

                <!-- Bottom status bar -->
                <div class="flex items-center justify-between px-3 py-2 border-t border-border/20 bg-muted/5 shrink-0">
                  <span class="text-[10px] text-muted-foreground/60">
                    เลือกแล้ว <span class="font-semibold text-yellow-500">{{ unionColMapping.length }}</span> columns
                  </span>
                  <span v-if="unionColMapping.some(r => !unionGroupedCols.every(g => r.picks[g.sourceId]))"
                    class="text-[10px] text-amber-400">
                    ⚠ มี column ที่ไม่ครบทุก source — SQL จะใช้ NULL แทน
                  </span>
                </div>
              </div>
            </div><!-- /STEP 2 -->

            <!-- ════ STEP 3: ตั้งค่า ═══════════════════════════════════ -->
            <div v-else-if="unionStep === 3" class="flex flex-col gap-5 px-6 py-5 overflow-y-auto">

              <!-- Header -->
              <div>
                <p class="text-[15px] font-bold text-foreground mb-1">ตั้งค่าการรวมข้อมูล</p>
                <p class="text-[12px] text-muted-foreground/60">เลือกวิธีการรวมข้อมูล และตั้งชื่อสำหรับใช้ใน SQL</p>
              </div>

              <!-- Union type cards -->
              <div class="flex flex-col gap-3">
                <p class="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wide">วิธีการรวมข้อมูล</p>
                <div class="grid grid-cols-2 gap-3">

                  <!-- UNION ALL -->
                  <div @click="tn.setModalData({ unionType: 'UNION ALL' })"
                    :class="['p-4 rounded-xl border-2 cursor-pointer transition-all select-none',
                      (store.modalNode?.data?.unionType ?? 'UNION ALL') !== 'UNION'
                        ? 'border-yellow-500 bg-yellow-500/8'
                        : 'border-border/40 bg-muted/5 hover:border-border/70']">
                    <div class="flex items-start gap-3 mb-3">
                      <svg width="38" height="34" viewBox="0 0 38 34" fill="none" class="shrink-0 mt-0.5">
                        <rect x="1" y="1" width="15" height="8" rx="2" fill="rgba(234,179,8,.2)" stroke="#eab308" stroke-width="1.2"/>
                        <rect x="1" y="11" width="15" height="8" rx="2" fill="rgba(234,179,8,.2)" stroke="#eab308" stroke-width="1.2"/>
                        <rect x="22" y="1" width="15" height="8" rx="2" fill="rgba(56,189,248,.2)" stroke="#38bdf8" stroke-width="1.2"/>
                        <rect x="22" y="11" width="15" height="8" rx="2" fill="rgba(56,189,248,.2)" stroke="#38bdf8" stroke-width="1.2"/>
                        <path d="M16 5h6M16 15h6" stroke="#52525b" stroke-width="1" stroke-dasharray="2 2"/>
                        <rect x="10" y="24" width="18" height="9" rx="2" fill="rgba(52,211,153,.15)" stroke="#34d399" stroke-width="1.2"/>
                      </svg>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                          <span class="font-mono text-[13px] font-bold"
                            :class="(store.modalNode?.data?.unionType ?? 'UNION ALL') !== 'UNION' ? 'text-yellow-500' : 'text-foreground/60'">
                            UNION ALL
                          </span>
                          <span v-if="(store.modalNode?.data?.unionType ?? 'UNION ALL') !== 'UNION'"
                            class="text-[8px] px-1.5 py-0.5 rounded font-bold bg-yellow-500 text-black">เลือก</span>
                        </div>
                        <p class="text-[11px] text-muted-foreground/70 leading-relaxed">รวมข้อมูลทั้งหมด รวมถึงข้อมูลที่ซ้ำกัน</p>
                        <p class="text-[10px] text-muted-foreground/40 mt-0.5">เร็วกว่า — แนะนำเมื่อไม่มีข้อมูลซ้ำ</p>
                      </div>
                    </div>
                    <div :class="['px-3 py-1.5 rounded-lg text-[10px] font-mono',
                      (store.modalNode?.data?.unionType ?? 'UNION ALL') !== 'UNION' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-muted/40 text-muted-foreground/40']">
                      100 + 80 = 180 แถว
                    </div>
                  </div>

                  <!-- UNION -->
                  <div @click="tn.setModalData({ unionType: 'UNION' })"
                    :class="['p-4 rounded-xl border-2 cursor-pointer transition-all select-none',
                      store.modalNode?.data?.unionType === 'UNION'
                        ? 'border-yellow-500 bg-yellow-500/8'
                        : 'border-border/40 bg-muted/5 hover:border-border/70']">
                    <div class="flex items-start gap-3 mb-3">
                      <svg width="38" height="34" viewBox="0 0 38 34" fill="none" class="shrink-0 mt-0.5">
                        <rect x="1" y="1" width="15" height="8" rx="2" fill="rgba(234,179,8,.2)" stroke="#eab308" stroke-width="1.2"/>
                        <rect x="1" y="11" width="15" height="8" rx="2" fill="rgba(234,179,8,.12)" stroke="#eab308" stroke-width="1.2" stroke-dasharray="3 2"/>
                        <rect x="22" y="1" width="15" height="8" rx="2" fill="rgba(56,189,248,.2)" stroke="#38bdf8" stroke-width="1.2"/>
                        <rect x="22" y="11" width="15" height="8" rx="2" fill="rgba(56,189,248,.12)" stroke="#38bdf8" stroke-width="1.2" stroke-dasharray="3 2"/>
                        <path d="M16 5h6M16 15h6" stroke="#52525b" stroke-width="1" stroke-dasharray="2 2"/>
                        <rect x="10" y="24" width="18" height="9" rx="2" fill="rgba(52,211,153,.15)" stroke="#34d399" stroke-width="1.2"/>
                        <line x1="25" y1="24" x2="30" y2="17" stroke="#f87171" stroke-width="1" stroke-dasharray="2 1"/>
                      </svg>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                          <span class="font-mono text-[13px] font-bold"
                            :class="store.modalNode?.data?.unionType === 'UNION' ? 'text-yellow-500' : 'text-foreground/60'">
                            UNION
                          </span>
                          <span v-if="store.modalNode?.data?.unionType === 'UNION'"
                            class="text-[8px] px-1.5 py-0.5 rounded font-bold bg-yellow-500 text-black">เลือก</span>
                        </div>
                        <p class="text-[11px] text-muted-foreground/70 leading-relaxed">รวมข้อมูลและตัดข้อมูลซ้ำออก</p>
                        <p class="text-[10px] text-muted-foreground/40 mt-0.5">ช้ากว่า — ใช้เมื่อต้องการข้อมูลไม่ซ้ำ</p>
                      </div>
                    </div>
                    <div :class="['px-3 py-1.5 rounded-lg text-[10px] font-mono',
                      store.modalNode?.data?.unionType === 'UNION' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-muted/40 text-muted-foreground/40']">
                      100 + 80 = ~150 แถว (ลดซ้ำ)
                    </div>
                  </div>

                </div>
              </div>

              <!-- CTE Name -->
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <p class="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wide">ตั้งชื่อชุดข้อมูล (ไม่บังคับ)</p>
                  <span class="text-[10px] text-muted-foreground/40">ใช้อ้างอิงใน SQL ภายหลัง</span>
                </div>
                <div class="relative flex items-center">
                  <span class="font-mono text-[12px] text-muted-foreground/40 absolute left-3 pointer-events-none select-none">WITH </span>
                  <input
                    :value="store.modalNode?.data?.name ?? ''"
                    @input="tn.setModalData({ name: ($event.target as HTMLInputElement).value })"
                    class="w-full h-10 pl-14 pr-4 rounded-xl border border-border/50 bg-background text-[12px] font-mono text-yellow-400 focus:outline-none focus:border-yellow-500/60 focus:ring-1 focus:ring-yellow-500/20 transition-all"
                    placeholder="เช่น all_sales"
                    spellcheck="false"
                  />
                </div>
                <p v-if="store.modalNode?.data?.name" class="text-[10px] text-muted-foreground/40 font-mono">
                  จะสร้าง: <span class="text-yellow-500/70">WITH {{ store.modalNode.data.name }} AS ( ... )</span>
                </p>
              </div>

            </div><!-- /STEP 3 -->

            <!-- ════ STEP 4: เงื่อนไข ════════════════════════════════════ -->
            <div v-else-if="unionStep === 4" class="flex flex-col overflow-hidden min-h-0">

              <!-- Header -->
              <div class="flex items-center gap-2 px-5 py-3 border-b border-border/40 bg-muted/10 shrink-0">
                <Filter class="size-4 text-yellow-500 shrink-0" />
                <div class="flex-1 min-w-0">
                  <p class="text-[11px] font-bold text-yellow-500">เพิ่มเงื่อนไข (WHERE)</p>
                  <p class="text-[9px] text-muted-foreground/50">กรองข้อมูลหลังจาก UNION — เช่น ภูมิภาค "North" หรือ ยอดขาย &gt; 1000</p>
                </div>
                <span v-if="(store.modalNode?.data?.conditions ?? []).filter((c: any) => c.column).length"
                  class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-500 shrink-0">
                  {{ (store.modalNode?.data?.conditions ?? []).filter((c: any) => c.column).length }} เงื่อนไข
                </span>
                <button @click="tn.addUnionCondition()"
                  class="flex items-center gap-1 h-7 px-2.5 rounded-lg border border-yellow-500/40 text-yellow-500 bg-yellow-500/8 hover:bg-yellow-500/15 text-[10px] font-bold transition-colors shrink-0">
                  <Plus class="size-2.5" /> เพิ่ม
                </button>
              </div>

              <!-- SQL preview strip -->
              <div v-if="(store.modalNode?.data?.conditions ?? []).filter((c: any) => c.column && c.operator).length"
                class="flex items-start gap-2 px-4 py-2 bg-muted/20 border-b border-border/20 shrink-0">
                <span class="text-[9px] font-bold text-yellow-500/60 shrink-0 mt-0.5">SQL</span>
                <code class="text-[9px] font-mono text-foreground/50 leading-relaxed whitespace-pre-wrap break-all">{{ unionSqlPreview }}</code>
              </div>

              <!-- Conditions list -->
              <div class="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 min-h-0">

                <!-- Empty state -->
                <div v-if="!(store.modalNode?.data?.conditions ?? []).length"
                  class="flex flex-col items-center gap-3 py-16 text-center">
                  <Filter class="size-8 text-yellow-500/20" />
                  <p class="text-[12px] text-foreground/50 font-medium">ไม่มีเงื่อนไข</p>
                  <p class="text-[10px] text-muted-foreground/40">จะดึงข้อมูลทั้งหมดจาก UNION</p>
                  <button @click="tn.addUnionCondition()"
                    class="mt-2 flex items-center gap-1.5 text-[11px] px-4 py-2 rounded-lg border border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10 transition-colors">
                    <Plus class="size-3.5" /> เพิ่มเงื่อนไขแรก
                  </button>
                </div>

                <!-- Condition rows -->
                <div v-for="(cond, i) in (store.modalNode?.data?.conditions ?? [])" :key="i"
                  class="flex flex-col gap-2.5 p-3.5 rounded-xl border border-border/30 bg-yellow-500/3 shrink-0">

                  <!-- Row header -->
                  <div class="flex items-center gap-2">
                    <span v-if="Number(i) > 0"
                      class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-400 shrink-0">AND</span>
                    <span class="text-[9px] font-bold text-yellow-500/70 uppercase tracking-wide flex-1">เงื่อนไข {{ Number(i) + 1 }}</span>
                    <button @click="tn.removeUnionCondition(Number(i))"
                      class="size-5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0">
                      <X class="size-3" />
                    </button>
                  </div>

                  <!-- Column picker -->
                  <button @click="toggleUnionCondColDropdown(Number(i), $event)"
                    :class="['w-full h-8 px-2.5 rounded-lg border text-left text-[11px] font-mono flex items-center gap-2 min-w-0 transition-colors',
                      openUnionCondColIdx === Number(i) ? 'border-yellow-500/60 bg-yellow-500/5' : 'border-border/40 bg-background hover:border-yellow-400/40']">
                    <template v-if="cond.column">
                      <span :class="['text-[8px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0',
                        getColTypeBadge(unionOutputCols.find(c => c.name === cond.column)?.type ?? cond.colType ?? '').cls]">
                        {{ getColTypeBadge(unionOutputCols.find(c => c.name === cond.column)?.type ?? cond.colType ?? '').label }}
                      </span>
                      <span class="truncate flex-1">{{ cond.column }}</span>
                    </template>
                    <span v-else class="text-muted-foreground/40 truncate flex-1">— เลือก Column —</span>
                    <ChevronDown class="size-3 text-muted-foreground/40 shrink-0" />
                  </button>

                  <!-- Operator + value -->
                  <div class="flex items-center gap-2">
                    <select :value="cond.operator"
                      @change="tn.setUnionCondition(Number(i), { operator: ($event.target as HTMLSelectElement).value })"
                      class="h-8 px-2 rounded-lg border border-border/40 bg-background text-[11px] font-mono focus:outline-none focus:border-yellow-500/40 shrink-0"
                      style="color-scheme: dark;">
                      <option v-for="op in ['=','!=','>','<','>=','<=','LIKE','IN','IS NULL','IS NOT NULL']" :key="op" :value="op">{{ op }}</option>
                    </select>
                    <input v-if="!['IS NULL','IS NOT NULL'].includes(cond.operator)"
                      :value="cond.value"
                      @input="tn.setUnionCondition(Number(i), { value: ($event.target as HTMLInputElement).value })"
                      class="flex-1 h-8 px-2.5 rounded-lg border border-border/40 bg-background text-[11px] font-mono focus:outline-none focus:border-yellow-500/40 min-w-0"
                      placeholder="ค่า…" />
                    <span v-else class="flex-1 text-[10px] text-muted-foreground/35 italic">ไม่ต้องระบุค่า</span>
                  </div>

                  <!-- SQL preview for this condition -->
                  <div v-if="cond.column && cond.operator"
                    class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-yellow-500/5 border border-yellow-500/15">
                    <span class="text-[8px] font-bold text-yellow-500/60 shrink-0">SQL</span>
                    <code class="text-[9px] font-mono text-yellow-300/70 truncate">{{ condPreview(cond) }}</code>
                  </div>
                </div>

              </div><!-- /conditions list -->
            </div><!-- /STEP 4 -->

            <!-- ════ STEP 5: ตรวจสอบ SQL ═══════════════════════════════ -->
            <div v-else-if="unionStep === 5" class="flex flex-col gap-4 px-6 py-5">

              <!-- Summary cards -->
              <div class="grid grid-cols-3 gap-3">
                <div class="flex flex-col gap-1 px-4 py-3 rounded-xl border border-border/40 bg-muted/10">
                  <span class="text-[9px] text-muted-foreground/60 uppercase tracking-wide font-semibold">Sources</span>
                  <span class="text-[22px] font-bold text-yellow-500 leading-none">{{ unionSources.length }}</span>
                  <span class="text-[9px] text-muted-foreground/50">tables / CTEs</span>
                </div>
                <div class="flex flex-col gap-1 px-4 py-3 rounded-xl border border-border/40 bg-muted/10">
                  <span class="text-[9px] text-muted-foreground/60 uppercase tracking-wide font-semibold">Output Columns</span>
                  <span class="text-[22px] font-bold text-yellow-500 leading-none">{{ unionColMapping.length || '*' }}</span>
                  <span class="text-[9px] text-muted-foreground/50">{{ unionColMapping.length ? 'columns กำหนดแล้ว' : 'ดึงทุก column' }}</span>
                </div>
                <div class="flex flex-col gap-1 px-4 py-3 rounded-xl border border-border/40 bg-muted/10">
                  <span class="text-[9px] text-muted-foreground/60 uppercase tracking-wide font-semibold">Union Type</span>
                  <span class="text-[18px] font-bold text-yellow-500 leading-none">{{ store.modalNode?.data?.unionType ?? 'UNION ALL' }}</span>
                  <span class="text-[9px] text-muted-foreground/50">{{ (store.modalNode?.data?.unionType ?? 'UNION ALL') === 'UNION ALL' ? 'รวมข้อมูลทั้งหมด' : 'ตัดข้อมูลซ้ำออก' }}</span>
                </div>
              </div>

              <!-- Type mismatch warning -->
              <div v-if="unionColMapping.some(r => hasUnionTypeMismatch(r))"
                class="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/5 text-[10px] text-amber-400">
                <span class="font-bold shrink-0">⚠</span>
                มี type mismatch ในบางแถวของ Column Mapping — ตรวจสอบใน Step 2
              </div>

              <!-- Column coverage matrix -->
              <div v-if="unionColMapping.length && unionGroupedCols.length" class="flex flex-col gap-2">
                <p class="text-[10px] font-semibold text-yellow-500 uppercase tracking-wide">Column Coverage</p>
                <div class="rounded-xl border border-border/40 overflow-auto max-h-[220px]">
                  <table class="w-full text-[9px] font-mono border-collapse min-w-max">
                    <thead>
                      <tr class="bg-muted/30 border-b border-border/30">
                        <th class="text-left px-3 py-2 font-semibold text-muted-foreground/70 min-w-[100px] sticky left-0 bg-muted/30">Output Column</th>
                        <th v-for="grp in unionGroupedCols" :key="grp.sourceId"
                          class="px-2 py-2 font-semibold text-center whitespace-nowrap max-w-[90px]">
                          <span :class="[
                            'text-[7px] px-1 py-0.5 rounded font-bold uppercase',
                            grp.tag === 'TABLE' ? 'bg-sky-500/20 text-sky-400' :
                            grp.tag === 'CTE'   ? 'bg-violet-500/20 text-violet-400' :
                            grp.tag === 'UNION' ? 'bg-yellow-500/20 text-yellow-500' :
                            grp.tag === 'GROUP' ? 'bg-orange-500/20 text-orange-400' :
                                                  'bg-muted text-muted-foreground',
                          ]">{{ grp.tag }}</span>
                          <span class="block text-[8px] text-muted-foreground/60 truncate max-w-[80px] mx-auto mt-0.5">{{ grp.label }}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in unionColMapping" :key="row.outputName"
                        class="border-b border-border/15 last:border-0 hover:bg-muted/10 transition-colors"
                        :class="unionMappingHasAllNullRows.includes(row.outputName) ? 'bg-rose-500/5' : hasUnionTypeMismatch(row) ? 'bg-amber-500/5' : ''">
                        <td class="px-3 py-1.5 font-semibold sticky left-0 bg-background/80"
                          :class="unionMappingHasAllNullRows.includes(row.outputName) ? 'text-rose-400' : hasUnionTypeMismatch(row) ? 'text-amber-400' : 'text-foreground/80'">
                          {{ row.outputName }}
                          <span v-if="hasUnionTypeMismatch(row)" class="ml-1 text-amber-400">⚠</span>
                          <span v-if="unionMappingHasAllNullRows.includes(row.outputName)" class="ml-1 text-rose-400 font-bold">✕</span>
                        </td>
                        <td v-for="grp in unionGroupedCols" :key="grp.sourceId" class="px-2 py-1.5 text-center">
                          <template v-if="row.picks[grp.sourceId]">
                            <span :class="['text-[7px] px-1 py-0.5 rounded font-bold mr-0.5', getColTypeBadge(getUnionPickType(grp.sourceId, row.picks[grp.sourceId]!)).cls]">
                              {{ getColTypeBadge(getUnionPickType(grp.sourceId, row.picks[grp.sourceId]!)).label }}
                            </span>
                            <span class="text-[9px] text-yellow-500/90">{{ row.picks[grp.sourceId] }}</span>
                          </template>
                          <span v-else class="text-[9px] text-muted-foreground/30 italic">NULL</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- SQL Preview (full) -->
              <div class="flex flex-col gap-2">
                <p class="text-[10px] font-semibold text-yellow-500 uppercase tracking-wide">SQL Preview</p>
                <div v-if="unionSources.length"
                  class="px-4 py-3 rounded-xl bg-muted/20 border border-border/30 overflow-y-auto overflow-x-auto max-h-[280px]">
                  <code class="text-[10px] font-mono text-foreground/70 leading-relaxed whitespace-pre">{{ unionSqlPreview }}</code>
                </div>
                <div v-else class="px-4 py-3 rounded-xl bg-muted/10 border border-border/20 text-[10px] text-muted-foreground/40 italic">
                  เพิ่ม Sources ใน Step 1 เพื่อดู SQL
                </div>
              </div>

            </div><!-- /STEP 5 -->

            </div><!-- /step content -->
            </div><!-- /wizard container -->
          </template>

          <!-- ── Where ───────────────────────────────────────────────── -->
          <template v-else-if="nodeType === 'where'">
            <div class="grid grid-cols-[1fr_1fr] gap-5 items-start">

            <!-- ── LEFT: Conditions ───────────────────────────────────── -->
            <div class="flex flex-col gap-3 min-w-0">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-xs font-bold text-rose-500">WHERE Conditions</p>
                  <p class="text-[10px] text-muted-foreground mt-0.5">กรองข้อมูลใน WHERE clause</p>
                </div>
                <button @click="tn.addWhereCondition()"
                  class="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-colors">
                  <Plus class="size-2.5" /> เพิ่ม
                </button>
              </div>

              <div v-if="(store.modalNode?.data?.conditions ?? []).length" class="flex flex-col gap-2 max-h-[520px] overflow-y-auto pr-0.5">
                <div v-for="(cond, i) in store.modalNode.data.conditions" :key="i"
                  class="flex flex-col gap-3 p-3 rounded-xl border bg-rose-500/3 shrink-0">
                  <!-- Header -->
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] font-bold text-rose-500 uppercase tracking-wide flex-1">
                      Condition {{ Number(i) + 1 }}
                      <span v-if="cond.column" class="normal-case font-mono text-rose-400 ml-1">— {{ condPreview(cond) }}</span>
                    </span>
                    <button @click="tn.removeWhereCondition(Number(i))"
                      class="size-5 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors">
                      <X class="size-3.5" />
                    </button>
                  </div>

                  <!-- Column picker -->
                  <button @click="toggleWhereColDropdown(Number(i), $event)"
                    :class="['w-full flex items-center gap-2 text-xs border rounded-lg px-2.5 py-2 bg-background text-left transition-colors',
                      cond.column ? 'border-rose-400/40' : 'border-border hover:border-rose-400/30',
                      openWhereColIdx === Number(i) ? 'ring-2 ring-rose-400/50 border-rose-400/40' : '']">
                    <template v-if="cond.column">
                      <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0',
                        getColTypeBadge(upstreamCols.find(c => c.name === cond.column)?.type ?? '').cls]">
                        {{ getColTypeBadge(upstreamCols.find(c => c.name === cond.column)?.type ?? '').label }}
                      </span>
                      <div class="flex-1 min-w-0">
                        <p class="text-[11px] truncate">{{ upstreamCols.find(c => c.name === cond.column)?.remark || cond.column }}</p>
                        <p v-if="upstreamCols.find(c => c.name === cond.column)?.remark" class="font-mono text-[9px] text-muted-foreground/60 truncate">{{ cond.column }}</p>
                      </div>
                    </template>
                    <span v-else class="text-muted-foreground text-[11px] flex-1">— เลือก Column —</span>
                    <ChevronDown :class="['size-3 shrink-0 text-muted-foreground transition-transform', openWhereColIdx === Number(i) ? 'rotate-180' : '']" />
                  </button>

                  <!-- Operator pills -->
                  <div class="flex flex-col gap-1.5">
                    <div v-for="group in WHERE_OP_GROUPS" :key="group.color" class="flex flex-wrap gap-1">
                      <button v-for="op in group.ops" :key="op"
                        @click="tn.setWhereCondition(Number(i), { operator: op })"
                        :class="['text-[10px] px-2.5 py-1 rounded-lg border font-mono font-bold transition-colors whitespace-nowrap', whereOpClass(cond.operator, op)]">{{ op }}</button>
                    </div>
                  </div>

                  <!-- Value input -->
                  <div v-if="cond.operator && !['IS NULL', 'IS NOT NULL'].includes(cond.operator)" class="flex items-center gap-2">
                    <label class="text-[10px] font-semibold text-muted-foreground w-8 shrink-0">ค่า</label>
                    <div v-if="isDateCol(cond.column)" class="flex-1 relative flex items-center">
                      <input :ref="(el) => setWhereDateRef(Number(i), el)" type="date" :value="cond.value"
                        @input="tn.setWhereCondition(Number(i), { value: ($event.target as HTMLInputElement).value })"
                        class="flex-1 text-xs border rounded-lg pl-2.5 pr-9 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-rose-400/50 font-mono"
                        :class="cond.value ? 'border-rose-400/40' : ''" />
                      <button type="button" @click="openWhereDatePicker(Number(i))"
                        class="absolute right-2 size-5 flex items-center justify-center rounded text-rose-500 hover:bg-rose-500/15 transition-colors">
                        <Calendar class="size-3.5" />
                      </button>
                    </div>
                    <input v-else :value="cond.value" @input="tn.setWhereCondition(Number(i), { value: ($event.target as HTMLInputElement).value })"
                      :placeholder="cond.operator === 'LIKE' ? 'เช่น %keyword%' : cond.operator === 'IN' ? 'เช่น 1,2,3' : 'ค่าที่ต้องการ'"
                      class="flex-1 text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-rose-400/50 font-mono"
                      :class="cond.value ? 'border-rose-400/40' : ''" />
                  </div>

                  <!-- Preview -->
                  <div v-if="cond.column && cond.operator"
                    class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-500/5 border border-rose-400/20">
                    <span class="text-[9px] font-bold text-rose-500 shrink-0">SQL</span>
                    <code class="text-[9px] font-mono text-rose-300/80 truncate">{{ condPreview(cond) }}</code>
                  </div>
                </div>
              </div>
              <p v-else class="text-[10px] text-muted-foreground/60 italic px-1">ไม่มี condition = ดึงข้อมูลทั้งหมด</p>
            </div><!-- /LEFT -->

            <!-- ── RIGHT: SQL Preview ─────────────────────────────────── -->
            <div class="flex flex-col gap-4 min-w-0">
              <div class="px-3 py-2 rounded-lg bg-rose-500/5 border border-rose-400/20 max-h-[120px] overflow-y-auto overflow-x-auto">
                <div class="flex items-start gap-1.5">
                  <span class="text-[9px] font-bold text-rose-500 shrink-0 mt-0.5">SQL</span>
                  <code class="text-[9px] font-mono text-rose-300/80 leading-relaxed whitespace-pre">{{ whereSqlPreview }}</code>
                </div>
              </div>
            </div><!-- /RIGHT -->

            </div><!-- /grid -->
          </template>

        </div>

        <!-- Footer -->
        <div class="border-t shrink-0 flex flex-col">
          <!-- Status + buttons row -->
          <div class="px-5 py-3 flex items-center justify-between">
            <p v-if="nodeType === 'group'" class="text-[10px] text-muted-foreground">
              GROUP BY <span class="font-semibold text-orange-500">{{ groupColCount }}</span> fields
              <span v-if="store.modalNode?.data?.aggs?.length">
                + <span class="font-semibold text-orange-500">{{ store.modalNode.data.aggs.length }}</span> aggs
              </span>
              <span v-if="groupFilterCount">
                + <span class="font-semibold text-amber-600">{{ groupFilterCount }}</span> HAVING
              </span>
              <span v-if="whereCondCount">
                · WHERE <span class="font-semibold text-rose-500">{{ whereCondCount }}</span>
              </span>
            </p>
            <p v-else-if="nodeType === 'sort'" class="text-[10px] text-muted-foreground">
              ORDER BY <span class="font-semibold text-green-600">{{ sortItemCount }}</span> columns
              <span v-if="whereCondCount">
                · WHERE <span class="font-semibold text-rose-500">{{ whereCondCount }}</span>
              </span>
            </p>
            <p v-else-if="nodeType === 'calc'" class="text-[10px] text-muted-foreground">
              <span class="font-semibold text-teal-500">{{ calcItemCount }}</span> calculated columns
              <span v-if="calcFilterCount"> + <span class="font-semibold text-rose-500">{{ calcFilterCount }}</span> filters</span>
              <span v-if="whereCondCount"> · WHERE <span class="font-semibold text-rose-500">{{ whereCondCount }}</span></span>
            </p>
            <p v-else-if="nodeType === 'where'" class="text-[10px] text-muted-foreground">
              WHERE <span class="font-semibold text-rose-500">{{ whereCondCount }}</span> conditions
            </p>
            <div v-else-if="nodeType === 'union'" class="flex items-center gap-3 flex-1 min-w-0">
              <span class="text-[10px] text-muted-foreground/60">{{ unionStep }} / {{ UNION_STEPS.length }}</span>
              <span class="text-[10px] font-semibold text-yellow-500">{{ UNION_STEPS[unionStep - 1]?.label }}</span>
              <span v-if="unionSources.length" class="text-[10px] text-muted-foreground/50">
                · {{ unionSources.length }} src · {{ unionColMapping.length || '*' }} cols
                · {{ store.modalNode?.data?.unionType ?? 'UNION ALL' }}
              </span>
            </div>
            <span v-else />
            <div class="flex flex-col gap-2 items-end shrink-0 ml-4">
              <!-- Union: step navigation buttons -->
              <template v-if="nodeType === 'union'">
                <div class="flex gap-2">
                  <button @click="close"
                    class="text-xs px-4 py-2 border rounded-lg hover:bg-accent transition-colors">
                    ยกเลิก
                  </button>
                  <button v-if="unionStep > 1" @click="unionStep--"
                    class="text-xs px-4 py-2 border border-border/60 rounded-lg hover:bg-muted/30 transition-colors flex items-center gap-1.5">
                    ← ย้อนกลับ
                  </button>
                  <!-- Skip buttons for optional steps -->
                  <button v-if="unionStep === 2 || unionStep === 3"
                    @click="unionStep++"
                    class="text-xs px-4 py-2 border border-border/40 rounded-lg text-muted-foreground/60 hover:text-foreground/70 hover:bg-muted/20 transition-colors">
                    ข้ามขั้นตอนนี้
                  </button>
                  <!-- Step 4 skip: no conditions -->
                  <button v-if="unionStep === 4"
                    @click="unionStep++"
                    class="text-xs px-4 py-2 border border-border/40 rounded-lg text-muted-foreground/60 hover:text-foreground/70 hover:bg-muted/20 transition-colors">
                    ไม่มีเงื่อนไข →
                  </button>
                  <!-- Next / final -->
                  <button v-if="unionStep < UNION_STEPS.length"
                    @click="unionStep++"
                    :disabled="unionStep === 1 && unionSources.length < 1"
                    :class="[
                      'text-xs px-5 py-2 rounded-lg font-semibold flex items-center gap-1.5 transition-all',
                      unionStep === 1 && unionSources.length < 1
                        ? 'bg-yellow-500/30 text-white/50 cursor-not-allowed'
                        : 'bg-yellow-500 text-white hover:bg-yellow-400',
                    ]">
                    {{ unionStep === 4 ? 'ตรวจสอบ SQL →' : 'ถัดไป →' }}
                  </button>
                  <button v-else @click="finishAndSave()"
                    class="text-xs px-5 py-2 text-black rounded-lg font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5 bg-yellow-500">
                    <Sparkles class="size-3.5" />
                    ยืนยันสร้าง UNION
                  </button>
                </div>
              </template>

              <!-- Other node types: original buttons -->
              <template v-else>
                <button v-if="nodeType !== 'group'" @click="generateSQL()"
                  class="text-xs px-4 py-2 border rounded-lg hover:bg-accent transition-colors flex items-center gap-1.5 w-full justify-center">
                  <Play class="size-3.5" />
                  Generate SQL
                </button>
                <div class="flex gap-2">
                  <button @click="close"
                    class="text-xs px-4 py-2 border rounded-lg hover:bg-accent transition-colors">
                    ยกเลิก
                  </button>
                  <button @click="nodeType === 'group' ? finish() : finishAndSave()"
                    class="text-xs px-5 py-2 text-white rounded-lg font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5"
                    :style="finishBtnStyle">
                    <Sparkles class="size-3.5" />
                    Finish
                  </button>
                </div>
              </template>
            </div>
          </div><!-- /status+buttons row -->
        </div>
      </div>
    </div>
  </Transition>
</template>
