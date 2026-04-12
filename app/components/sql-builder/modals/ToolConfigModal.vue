<script setup lang="ts">
/**
 * SQL Builder — Tool Config Modal
 * Configuration dialog for CTE, Calc, Group, Sort, Union, Where nodes
 */
import {
  X, Plus, Layers, Calculator, Database, SortAsc, GitMerge, Filter,
  ChevronDown, Key, Search, Sparkles, Calendar,
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

// ── CTE: select / clear all cols from a specific group ───────────────────
// Accepts both CteColGroup and ColGroup (both have cols: VisibleCol[])
function selectAllFromCteGroup(group: { cols: VisibleCol[] }) {
  const current = new Set((store.modalNode?.data?.selectedCols ?? []) as string[])
  group.cols.forEach(c => current.add(c.name))
  tn.setModalData({ selectedCols: [...current] })
}
function clearAllFromCteGroup(group: { cols: VisibleCol[] }) {
  const toRemove = new Set(group.cols.map(c => c.name))
  const current  = ((store.modalNode?.data?.selectedCols ?? []) as string[]).filter(n => !toRemove.has(n))
  tn.setModalData({ selectedCols: current })
}

// ── CTE: grouped column list (uses same groupedUpstreamCols as GROUP BY) ─
const filteredGroupedCteCols = computed((): ColGroup[] => {
  const q = cteColSearch.value.toLowerCase().trim()
  if (!q) return groupedUpstreamCols.value
  return groupedUpstreamCols.value
    .map(g => ({ ...g, cols: g.cols.filter(c => c.name.toLowerCase().includes(q) || (c.remark ?? '').toLowerCase().includes(q)) }))
    .filter(g => g.cols.length > 0)
})

// ── CTE: SQL preview ─────────────────────────────────────────────────────
const cteSqlPreview = computed(() => {
  const selectedCols = (store.modalNode?.data?.selectedCols ?? []) as string[]
  const conditions   = ((store.modalNode?.data?.conditions ?? []) as any[]).filter((c: any) => c.column && c.operator)
  const sel = selectedCols.length
    ? `SELECT\n  ${selectedCols.join(',\n  ')}`
    : 'SELECT *'
  let sql = `${sel}\nFROM _upstream`
  if (conditions.length) {
    sql += `\nWHERE ${conditions.map((c: any) => condPreview(c)).join('\n  AND ')}`
  }
  return sql
})

// ── Calc SQL preview ──────────────────────────────────────────────────────
const calcSqlPreview = computed(() => {
  const items   = ((store.modalNode?.data?.items ?? []) as any[]).filter((i: any) => i.col && i.op)
  const filters = ((store.modalNode?.data?.filters ?? []) as any[]).filter((f: any) => f.column && f.operator)
  if (!items.length) return 'SELECT *,\n  ...\nFROM _upstream'
  const calcExprs = items.map((i: any) => {
    const alias = i.alias || `${i.col}_calc`
    return `  (${calcExprPreview(i.op, i.col, i.value)}) AS ${alias}`
  })
  let sql = `SELECT *,\n${calcExprs.join(',\n')}\nFROM _upstream`
  if (filters.length) sql += `\nWHERE ${filters.map(condPreview).join('\n  AND ')}`
  return sql
})

// ── Group SQL preview ─────────────────────────────────────────────────────
const groupSqlPreview = computed(() => {
  const groupCols = ((store.modalNode?.data?.groupCols ?? []) as string[]).filter(Boolean)
  const aggs      = ((store.modalNode?.data?.aggs ?? []) as any[]).filter((a: any) => a.col && a.func)
  const having    = ((store.modalNode?.data?.filters ?? []) as any[]).filter((f: any) => f.column && f.operator)
  const conds     = ((store.modalNode?.data?.conditions ?? []) as any[]).filter((c: any) => c.column && c.operator)
  const selectParts = [
    ...groupCols.map((c: string) => `  ${c}`),
    ...aggs.map((a: any) => {
      const fn = a.func === 'COUNT DISTINCT' ? `COUNT(DISTINCT ${a.col})` : `${a.func}(${a.col})`
      return `  ${fn}${a.alias ? ` AS ${a.alias}` : ''}`
    }),
  ]
  let sql = selectParts.length
    ? `SELECT\n${selectParts.join(',\n')}\nFROM _upstream`
    : 'SELECT * FROM _upstream'
  if (conds.length)   sql += `\nWHERE ${conds.map(condPreview).join('\n  AND ')}`
  if (groupCols.length) sql += `\nGROUP BY ${groupCols.join(', ')}`
  if (having.length)  sql += `\nHAVING ${having.map(condPreview).join('\n  AND ')}`
  return sql
})

// ── Sort SQL preview ──────────────────────────────────────────────────────
const sortSqlPreview = computed(() => {
  const items = ((store.modalNode?.data?.items ?? []) as Array<{ col: string; dir: string }>).filter(i => i.col)
  const conds = ((store.modalNode?.data?.conditions ?? []) as any[]).filter((c: any) => c.column && c.operator)
  let sql = 'SELECT *\nFROM _upstream'
  if (conds.length) sql += `\nWHERE ${conds.map(condPreview).join('\n  AND ')}`
  if (items.length) sql += `\nORDER BY ${items.map(i => `${i.col} ${i.dir}`).join(', ')}`
  return sql
})

// ── Where SQL preview ─────────────────────────────────────────────────────
const whereSqlPreview = computed(() => {
  const conds = ((store.modalNode?.data?.conditions ?? []) as any[]).filter((c: any) => c.column && c.operator)
  if (!conds.length) return 'SELECT *\nFROM _upstream'
  return `SELECT *\nFROM _upstream\nWHERE ${conds.map(condPreview).join('\n  AND ')}`
})

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

// ── Union: ALL canvas nodes available as sources (except self) ───────────
const allUnionSources = computed(() => {
  if (!store.modalNodeId) return []
  return store.nodes
    .filter((n: any) => n.id !== store.modalNodeId)
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

// ── Union: search + filtered groups ──────────────────────────────────────
const unionColSearch = ref('')

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
  const colsMap = (store.modalNode?.data?.selectedColsMap ?? {}) as Record<string, string[]>
  const global  = (store.modalNode?.data?.selectedCols ?? []) as string[]
  const conds   = ((store.modalNode?.data?.conditions ?? []) as any[]).filter(c => c.column && c.operator)
  const sources = unionSources.value.length
    ? unionSources.value
    : [{ id: '', label: 'source1' }, { id: '', label: 'source2' }]

  const parts = sources.map(s => {
    const srcCols = s.id ? (colsMap[s.id] ?? []).filter(Boolean) : []
    const cols    = srcCols.length ? srcCols : global.filter(Boolean)
    const sel     = cols.length ? `SELECT\n  ${cols.join(',\n  ')}` : 'SELECT *'
    return `${sel}\nFROM ${s.label}`
  })
  const unionPart = parts.join(`\n${uType}\n`)
  if (!conds.length) return unionPart
  const wherePart = conds.map((c: any) => condPreview(c)).join('\n  AND ')
  return `SELECT * FROM (\n  ${unionPart.replace(/\n/g, '\n  ')}\n) _u\nWHERE ${wherePart}`
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

// True after user explicitly presses "clear" — prevents empty-items from being read as "all selected"
const sortExplicitlyCleared = ref(false)

const sortItemCount = computed(() => {
  if (sortItems.value.length) return sortItems.value.length
  if (sortExplicitlyCleared.value) return 0
  return upstreamCols.value.length  // all selected by default when not yet initialized
})

function isSortSelected(colName: string) {
  // Empty items = "all selected" default, UNLESS user explicitly cleared
  if (!sortItems.value.length && !sortExplicitlyCleared.value) return true
  return sortItems.value.some(s => s.col === colName)
}

function getSortDir(colName: string): 'ASC' | 'DESC' {
  return sortItems.value.find(s => s.col === colName)?.dir ?? 'ASC'
}

function toggleSortCol(colName: string, checked: boolean) {
  // If items is empty (all-selected default), materialize all cols first
  const current = sortItems.value.length > 0
    ? sortItems.value.map(s => ({ ...s }))
    : upstreamCols.value.map(c => ({ col: c.name, dir: 'ASC' as 'ASC' | 'DESC' }))
  if (checked) {
    if (!current.some(s => s.col === colName)) current.push({ col: colName, dir: 'ASC' })
  } else {
    const idx = current.findIndex(s => s.col === colName)
    if (idx >= 0) current.splice(idx, 1)
  }
  store.updateNodeData(store.modalNodeId!, { items: current })
}

function setSortDir(colName: string, dir: 'ASC' | 'DESC') {
  // If items is empty (all-selected default), materialize all cols first
  const base = sortItems.value.length > 0
    ? sortItems.value.map(s => ({ ...s }))
    : upstreamCols.value.map(c => ({ col: c.name, dir: 'ASC' as 'ASC' | 'DESC' }))
  const current = base.map(s => s.col === colName ? { ...s, dir } : s)
  store.updateNodeData(store.modalNodeId!, { items: current })
}

function selectAllSortCols() {
  sortExplicitlyCleared.value = false
  store.updateNodeData(store.modalNodeId!, {
    items: upstreamCols.value.map(c => ({
      col: c.name,
      dir: (sortItems.value.find(s => s.col === c.name)?.dir ?? 'ASC') as 'ASC' | 'DESC',
    })),
  })
}

function clearSortCols() {
  sortExplicitlyCleared.value = true
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
watch(() => store.modalNode, (node) => {
  if (!node) { colSearch.value = ''; sortColSearch.value = ''; return }
  const type = node.data.nodeType
  if (type === 'group') {
    colSearch.value = ''
    if (!node.data.groupCols?.length && upstreamCols.value.length) {
      store.updateNodeData(node.id, { groupCols: upstreamCols.value.map((c: VisibleCol) => c.name) })
    }
  } else if (type === 'sort') {
    sortColSearch.value = ''
    sortExplicitlyCleared.value = false
    if (!node.data.items?.length && upstreamCols.value.length) {
      store.updateNodeData(node.id, { items: upstreamCols.value.map((c: VisibleCol) => ({ col: c.name, dir: 'ASC' })) })
    }
  } else if (type === 'calc') {
    // Auto-add one empty item so user can start immediately
    if (!node.data.items?.length) {
      store.updateNodeData(node.id, { items: [{ col: '', op: '', value: '', alias: '' }] })
    }
  }
}, { immediate: true, flush: 'sync' })

// Also watch upstream cols in case they load after the modal opens
watch(upstreamCols, (cols) => {
  const node = store.modalNode
  if (!node) return
  if (node.data.nodeType === 'group' && !node.data.groupCols?.length && cols.length) {
    store.updateNodeData(node.id, { groupCols: cols.map((c: VisibleCol) => c.name) })
  } else if (node.data.nodeType === 'sort' && !node.data.items?.length && cols.length) {
    store.updateNodeData(node.id, { items: cols.map((c: VisibleCol) => ({ col: c.name, dir: 'ASC' })) })
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
  store.updateNodeData(store.modalNodeId!, { groupCols: current })
}

function selectAllGroupCols() {
  store.updateNodeData(store.modalNodeId!, {
    groupCols: upstreamCols.value.map((c: VisibleCol) => c.name),
  })
}

function clearGroupCols() {
  store.updateNodeData(store.modalNodeId!, { groupCols: [] })
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

// ── Finish = save config + generate SQL + close ───────────────────────────
function finish() {
  if (nodeType.value === 'sort' && store.modalNodeId && !sortItems.value.length && !sortExplicitlyCleared.value && upstreamCols.value.length) {
    store.updateNodeData(store.modalNodeId, {
      items: upstreamCols.value.map((c: VisibleCol) => ({ col: c.name, dir: 'ASC' as 'ASC' | 'DESC' })),
    })
  }
  // Node is confirmed — clear the "new, unsaved" tracking
  store.newToolNodeId = null
  generateSQL()
  store.modalNodeId = null
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
          v-for="c in unionAvailableCols" :key="c.name"
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
        <div v-if="!unionAvailableCols.length" class="px-3 py-2 text-[10px] text-muted-foreground italic">ลาก table node ลง canvas ก่อน</div>
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
          nodeType === 'union' ? 'w-full max-w-[1000px]' :
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
            <span :class="['font-bold text-sm', meta.color]">{{ meta.label }}</span>
            <p v-if="nodeType === 'cte'" class="text-[10px] text-muted-foreground mt-0.5">
              ตั้งชื่อ CTE และเลือก columns + WHERE filter
            </p>
            <p v-else-if="nodeType === 'group'" class="text-[10px] text-muted-foreground mt-0.5">
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
                  <button @click="tn.selectAllCteCols(upstreamCols.map((c: any) => c.name))"
                    class="text-[10px] text-violet-500 hover:underline font-semibold">ทั้งหมด</button>
                  <span class="text-muted-foreground text-[10px]">/</span>
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

              <!-- No upstream cols -->
              <div v-if="!upstreamCols.length"
                class="flex items-center gap-2 px-3 py-3 rounded-lg bg-muted/30 text-[10px] text-muted-foreground italic">
                ลาก table / GROUP BY node เข้ามาก่อนเพื่อดู columns
              </div>

              <!-- Grouped column picker -->
              <div v-else class="border rounded-lg overflow-hidden max-h-[460px] overflow-y-auto">
                <template v-for="group in filteredGroupedCteCols" :key="group.tableId">
                  <!-- Group header -->
                  <div class="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-muted border-b border-border/50">
                    <span :class="[
                      'text-[8px] font-bold px-1.5 py-0.5 rounded font-mono uppercase shrink-0',
                      group.tableId === 'GROUP BY' ? 'bg-orange-500/20 text-orange-400' : 'bg-sky-500/20 text-sky-400',
                    ]">{{ group.tableId === 'GROUP BY' ? 'GROUP' : 'TABLE' }}</span>
                    <span class="font-mono text-[11px] font-semibold text-foreground truncate flex-1">{{ group.tableLabel }}</span>
                    <span v-if="(store.modalNode?.data?.selectedCols ?? []).filter((s: string) => group.cols.some(c => c.name === s)).length"
                      class="text-[9px] px-1.5 py-0 rounded bg-violet-500/20 text-violet-400 font-bold font-mono shrink-0">
                      ✓{{ (store.modalNode?.data?.selectedCols ?? []).filter((s: string) => group.cols.some(c => c.name === s)).length }}
                    </span>
                    <div class="flex items-center gap-1.5 shrink-0 ml-1">
                      <button @click="selectAllFromCteGroup(group)"
                        class="text-[9px] font-semibold text-violet-400 hover:underline">ทั้งหมด</button>
                      <span class="text-muted-foreground text-[9px]">/</span>
                      <button @click="clearAllFromCteGroup(group)"
                        class="text-[9px] text-muted-foreground hover:underline">ล้าง</button>
                    </div>
                  </div>
                  <!-- Columns -->
                  <label v-for="col in group.cols" :key="col.name"
                    class="flex items-center gap-2.5 px-3 py-1.5 pl-5 cursor-pointer select-none transition-colors border-b border-border/30 last:border-0 hover:bg-violet-500/5"
                    :class="(store.modalNode?.data?.selectedCols ?? []).includes(col.name) ? 'bg-violet-500/5' : ''">
                    <div :class="['size-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                      (store.modalNode?.data?.selectedCols ?? []).includes(col.name) ? 'bg-violet-500 border-violet-500' : 'border-border/60 bg-background']">
                      <svg v-if="(store.modalNode?.data?.selectedCols ?? []).includes(col.name)"
                        class="size-2.5 text-white" fill="none" viewBox="0 0 10 10">
                        <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                      </svg>
                      <input type="checkbox" class="sr-only"
                        :checked="(store.modalNode?.data?.selectedCols ?? []).includes(col.name)"
                        @change="tn.toggleCteCol(col.name)" />
                    </div>
                    <Key v-if="col.isPk" class="size-3 text-amber-400 shrink-0" />
                    <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadge(col.type).cls]">
                      {{ getColTypeBadge(col.type).label }}
                    </span>
                    <div class="flex-1 min-w-0">
                      <p class="text-[11px] truncate font-mono" :class="col.isPk ? 'text-amber-500 font-semibold' : ''">{{ col.remark || col.name }}</p>
                      <p v-if="col.remark" class="font-mono text-[9px] text-muted-foreground/60 truncate">{{ col.name }}</p>
                    </div>
                  </label>
                  <div v-if="group.cols.length === 0 && cteColSearch"
                    class="px-3 py-2 text-[10px] text-muted-foreground/60 italic">
                    ไม่พบ column ที่ตรงกับ "{{ cteColSearch }}"
                  </div>
                </template>
                <div v-if="filteredGroupedCteCols.length === 0"
                  class="px-3 py-3 text-[10px] text-muted-foreground/60 italic text-center">
                  {{ cteColSearch ? `ไม่พบ column ที่ตรงกับ "${cteColSearch}"` : 'กำลังโหลด columns...' }}
                </div>
              </div>
            </div><!-- /LEFT -->

            <!-- ── RIGHT: CTE Name + WHERE Filter + SQL Preview ───── -->
            <div class="flex flex-col gap-4 min-w-0">

              <!-- CTE name -->
              <div class="flex flex-col gap-1.5">
                <label class="text-[11px] font-semibold text-violet-500 uppercase tracking-wide">CTE Name</label>
                <input
                  :value="store.modalNode?.data?.name ?? 'my_cte'"
                  @input="tn.setModalData({ name: ($event.target as HTMLInputElement).value })"
                  class="w-full h-9 px-3 rounded-lg border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                  placeholder="my_cte"
                  spellcheck="false"
                />
                <p class="text-[10px] text-muted-foreground">
                  ชื่อที่ใช้ใน WITH <span class="font-mono text-violet-400">{{ store.modalNode?.data?.name || 'my_cte' }}</span> AS (...)
                </p>
              </div>

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

              <!-- SQL Preview -->
              <div class="px-3 py-2 rounded-lg bg-orange-500/5 border border-orange-400/20 max-h-[120px] overflow-y-auto overflow-x-auto">
                <div class="flex items-start gap-1.5">
                  <span class="text-[9px] font-bold text-orange-500 shrink-0 mt-0.5">SQL</span>
                  <code class="text-[9px] font-mono text-orange-300/80 leading-relaxed whitespace-pre">{{ groupSqlPreview }}</code>
                </div>
              </div>

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

          <!-- ── Union ───────────────────────────────────────────────── -->
          <template v-else-if="nodeType === 'union'">

            <!-- ── Row 1: UNION type + CTE name ────────────────────── -->
            <div class="flex items-stretch gap-4">
              <div class="flex gap-2 shrink-0">
                <button @click="tn.setModalData({ unionType: 'UNION ALL' })"
                  :class="[
                    'flex flex-col items-center px-5 py-2.5 rounded-xl border text-xs font-bold transition-colors',
                    store.modalNode.data.unionType === 'UNION ALL'
                      ? 'border-yellow-500 bg-yellow-500/15 text-yellow-600'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  ]">
                  UNION ALL
                  <span class="text-[9px] font-normal opacity-60 mt-0.5">รวมทุก rows</span>
                </button>
                <button @click="tn.setModalData({ unionType: 'UNION' })"
                  :class="[
                    'flex flex-col items-center px-5 py-2.5 rounded-xl border text-xs font-bold transition-colors',
                    store.modalNode.data.unionType === 'UNION'
                      ? 'border-yellow-500 bg-yellow-500/15 text-yellow-600'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  ]">
                  UNION
                  <span class="text-[9px] font-normal opacity-60 mt-0.5">ตัด duplicates</span>
                </button>
              </div>
              <div class="flex-1 flex flex-col justify-center gap-1">
                <label class="text-[10px] font-semibold text-yellow-500 uppercase tracking-wide">
                  CTE Name <span class="normal-case font-normal text-muted-foreground ml-1">(ไม่บังคับ — ใช้ซ้อน Union ได้)</span>
                </label>
                <input
                  :value="store.modalNode?.data?.name ?? ''"
                  @input="tn.setModalData({ name: ($event.target as HTMLInputElement).value })"
                  class="h-9 px-3 rounded-lg border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-yellow-500/40"
                  placeholder="เช่น union_ap  (ว่าง = auto)"
                  spellcheck="false"
                />
              </div>
            </div>

            <!-- ── Row 2: Sources | Column picker ───────────────────── -->
            <div class="grid grid-cols-[minmax(0,260px)_minmax(0,1fr)] gap-4">

            <!-- ── LEFT: Sources ──────────────────────────────────── -->
            <div class="flex flex-col gap-2 min-w-0">
              <div class="flex items-center gap-2">
                <p class="text-[11px] font-semibold text-yellow-500 uppercase tracking-wide flex-1">Sources</p>
                <span class="text-[10px] text-muted-foreground">{{ unionSources.length ? unionSources.length + ' selected' : 'none' }}</span>
              </div>
              <div v-if="!allUnionSources.length"
                class="flex items-center gap-2 px-3 py-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-[10px] text-muted-foreground">
                <GitMerge class="size-3.5 text-yellow-500 shrink-0" />
                วาง Table / CTE node ลง canvas ก่อน
              </div>
              <div v-else class="border border-yellow-500/20 rounded-xl divide-y divide-yellow-500/10 overflow-hidden overflow-y-auto max-h-[340px]">
                <label v-for="(src, si) in allUnionSources" :key="src.id"
                  class="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none transition-colors hover:bg-yellow-500/5"
                  :class="isUnionSourceConnected(src.id) ? 'bg-yellow-500/8' : ''">
                  <div :class="[
                    'size-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                    isUnionSourceConnected(src.id) ? 'bg-yellow-500 border-yellow-500' : 'border-border/60 bg-background',
                  ]" @click.prevent="toggleUnionSource(src.id)">
                    <svg v-if="isUnionSourceConnected(src.id)" class="size-2.5 text-white" fill="none" viewBox="0 0 10 10">
                      <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    </svg>
                    <input type="checkbox" class="sr-only" :checked="isUnionSourceConnected(src.id)" @change="toggleUnionSource(src.id)" />
                  </div>
                  <span :class="[
                    'text-[8px] font-bold px-1.5 py-0.5 rounded font-mono uppercase shrink-0',
                    src.tag === 'TABLE'  ? 'bg-sky-500/20 text-sky-400' :
                    src.tag === 'CTE'    ? 'bg-violet-500/20 text-violet-400' :
                    src.tag === 'UNION'  ? 'bg-yellow-500/20 text-yellow-500' :
                    src.tag === 'GROUP'  ? 'bg-orange-500/20 text-orange-400' :
                    src.tag === 'CALC'   ? 'bg-teal-500/20 text-teal-400' :
                                           'bg-muted text-muted-foreground'
                  ]">{{ src.tag }}</span>
                  <div class="flex-1 min-w-0">
                    <p class="font-mono text-[11px] truncate"
                      :class="isUnionSourceConnected(src.id) ? 'text-yellow-500 font-semibold' : 'text-foreground/80'">
                      {{ src.label }}
                    </p>
                    <p v-if="src.tables.length" class="text-[9px] text-muted-foreground/50 font-mono truncate">
                      {{ src.tables.slice(0,2).join(', ') }}{{ src.tables.length > 2 ? ' +' + (src.tables.length-2) : '' }}
                    </p>
                  </div>
                  <span v-if="isUnionSourceConnected(src.id) && si < allUnionSources.length-1 && allUnionSources.slice(si+1).some(s => isUnionSourceConnected(s.id))"
                    class="text-[8px] font-bold text-yellow-500/50 shrink-0">▼</span>
                </label>
              </div>
              <div v-if="unionSources.length >= 2" class="text-center text-[9px] text-yellow-600/60 font-mono">
                ▲ {{ store.modalNode.data.unionType ?? 'UNION ALL' }} ▲
              </div>
            </div><!-- /LEFT -->

            <!-- ── RIGHT: Column picker ────────────────────────────── -->
            <div class="flex flex-col gap-2 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <p class="text-[11px] font-semibold text-yellow-500 uppercase tracking-wide">Columns</p>
                <span class="text-[10px] font-semibold text-yellow-600 bg-yellow-500/10 px-2 py-0.5 rounded-full shrink-0">{{ unionSelectedCount || '*' }}</span>
                <button @click="selectUnionCommonCols()" :disabled="!unionCommonCols.length"
                  :title="unionCommonCols.length ? 'เลือก ' + unionCommonCols.length + ' cols ที่มีในทุก source' : 'ยังไม่มี cols ร่วมกัน'"
                  :class="[
                    'text-[10px] font-bold px-2 py-0.5 rounded-md border transition-colors shrink-0',
                    unionCommonCols.length ? 'border-emerald-500/50 text-emerald-600 bg-emerald-500/10 hover:bg-emerald-500/20' : 'border-border/30 text-muted-foreground/40 cursor-not-allowed',
                  ]">Auto Match</button>
                <div class="flex items-center gap-1.5 ml-auto">
                  <button @click="tn.selectAllUnionSourcesWithCols(unionGroupedCols.map(g => g.sourceId), unionAvailableCols.map((c: any) => c.name))"
                    class="text-[10px] text-yellow-600 hover:underline font-semibold">ทั้งหมด</button>
                  <span class="text-muted-foreground text-[10px]">/</span>
                  <button @click="unionGroupedCols.forEach(g => tn.clearUnionSourceCols(g.sourceId))"
                    class="text-[10px] text-muted-foreground hover:underline">ล้าง</button>
                </div>
              </div>
              <div v-if="unionColWarnings.size"
                class="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-500/8 border border-rose-500/30 text-[10px] text-rose-400">
                <span class="shrink-0 font-bold">⚠</span>
                <span>column <span class="font-mono font-semibold">{{ [...unionColWarnings].join(', ') }}</span> ไม่มีในบาง source</span>
              </div>
              <div class="relative">
                <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/50" />
                <input v-model="unionColSearch" placeholder="ค้นหา column..."
                  class="w-full text-xs border rounded-lg pl-7 pr-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-yellow-400/50 font-mono" />
              </div>
              <div v-if="!unionGroupedCols.length"
                class="flex items-center gap-2 px-3 py-3 rounded-lg bg-muted/30 text-[10px] text-muted-foreground italic">
                เลือก Source ก่อนเพื่อดู columns
              </div>
              <div v-else class="flex flex-col gap-2 max-h-[340px] overflow-y-auto pr-0.5">
                <div v-for="group in unionFilteredGroups" :key="group.sourceId"
                  class="border border-yellow-500/20 rounded-xl overflow-hidden">
                  <div class="flex items-center gap-2 px-3 py-2 bg-yellow-500/8 border-b border-yellow-500/15 sticky top-0 z-10">
                    <span :class="[
                      'text-[8px] font-bold px-1.5 py-0.5 rounded font-mono uppercase shrink-0',
                      group.tag === 'TABLE'  ? 'bg-sky-500/20 text-sky-400' :
                      group.tag === 'CTE'    ? 'bg-violet-500/20 text-violet-400' :
                      group.tag === 'UNION'  ? 'bg-yellow-500/20 text-yellow-500' :
                      group.tag === 'GROUP'  ? 'bg-orange-500/20 text-orange-400' :
                      group.tag === 'CALC'   ? 'bg-teal-500/20 text-teal-400' :
                                               'bg-muted text-muted-foreground'
                    ]">{{ group.tag }}</span>
                    <span class="font-mono text-[11px] font-semibold flex-1 truncate">{{ group.label }}</span>
                    <span class="text-[9px] text-muted-foreground/50 font-mono shrink-0">
                      {{ group.cols.filter(c => tn.isUnionSourceColSelected(group.sourceId, c.name)).length }}/{{ group.cols.length }}
                    </span>
                    <button @click="tn.selectAllUnionSourceCols(group.sourceId, group.cols.map(c => c.name))"
                      class="text-[9px] font-semibold text-yellow-600 hover:underline ml-1">ทั้งหมด</button>
                    <span class="text-muted-foreground text-[9px]">/</span>
                    <button @click="tn.clearUnionSourceCols(group.sourceId)"
                      class="text-[9px] text-muted-foreground hover:underline">ล้าง</button>
                  </div>
                  <div class="divide-y divide-border/20">
                    <label v-for="col in group.cols" :key="col.name"
                      class="flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none transition-colors hover:bg-yellow-500/5"
                      :class="[
                        tn.isUnionSourceColSelected(group.sourceId, col.name) ? 'bg-yellow-500/5' : '',
                        unionColWarnings.has(col.name) ? 'border-l-2 border-rose-500/50' : '',
                      ]">
                      <div :class="[
                        'size-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                        tn.isUnionSourceColSelected(group.sourceId, col.name) ? 'bg-yellow-500 border-yellow-500' : 'border-border/60 bg-background',
                      ]">
                        <svg v-if="tn.isUnionSourceColSelected(group.sourceId, col.name)" class="size-2 text-white" fill="none" viewBox="0 0 10 10">
                          <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                        </svg>
                        <input type="checkbox" class="sr-only"
                          :checked="tn.isUnionSourceColSelected(group.sourceId, col.name)"
                          @change="tn.toggleUnionSourceCol(group.sourceId, col.name)" />
                      </div>
                      <Key v-if="col.isPk" class="size-2.5 text-amber-400 shrink-0" />
                      <span :class="['text-[9px] px-1 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadge(col.type).cls]">
                        {{ getColTypeBadge(col.type).label }}
                      </span>
                      <span class="font-mono text-[11px] flex-1 truncate" :class="col.isPk ? 'text-amber-500 font-semibold' : ''">{{ col.name }}</span>
                      <span v-if="col.remark" class="text-[9px] text-muted-foreground/40 truncate max-w-[100px]">{{ col.remark }}</span>
                      <span v-if="unionColWarnings.has(col.name)" class="text-[9px] text-rose-400 font-bold shrink-0">⚠</span>
                    </label>
                    <div v-if="group.cols.length === 0 && unionColSearch"
                      class="px-3 py-2 text-[10px] text-muted-foreground/60 italic">ไม่พบ "{{ unionColSearch }}"</div>
                  </div>
                </div>
              </div>
            </div><!-- /RIGHT -->
            </div><!-- /grid row2 -->

            <!-- ── Row 3: WHERE + SQL preview ────────────────────────── -->
            <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 border-t pt-4">
              <!-- WHERE filter -->
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <label class="text-[11px] font-semibold text-yellow-500 uppercase tracking-wide">
                    WHERE Filter
                    <span v-if="(store.modalNode?.data?.conditions ?? []).filter((c: any) => c.column).length"
                      class="ml-1 text-[10px] font-normal text-muted-foreground normal-case">
                      {{ (store.modalNode?.data?.conditions ?? []).filter((c: any) => c.column).length }} conditions
                    </span>
                  </label>
                  <button @click="tn.addUnionCondition()"
                    class="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10 transition-colors">
                    <Plus class="size-2.5" /> เพิ่ม
                  </button>
                </div>
                <div v-if="(store.modalNode?.data?.conditions ?? []).length" class="flex flex-col gap-2 max-h-[140px] overflow-y-auto">
                  <div v-for="(cond, i) in (store.modalNode?.data?.conditions ?? [])" :key="i"
                    class="flex items-center gap-2 px-2.5 py-2 rounded-xl border bg-yellow-500/3">
                    <button @click="toggleUnionCondColDropdown(+i, $event)"
                      :class="[
                        'flex-1 h-7 px-2 rounded-lg border text-left text-[11px] font-mono flex items-center gap-1.5 min-w-0 transition-colors',
                        openUnionCondColIdx === +i ? 'border-yellow-500/60 bg-yellow-500/5' : 'border-border bg-background hover:border-yellow-400/40',
                      ]">
                      <template v-if="cond.column">
                        <span :class="['text-[9px] px-1 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadge(unionAvailableCols.find(c => c.name === cond.column)?.type ?? '').cls]">
                          {{ getColTypeBadge(unionAvailableCols.find(c => c.name === cond.column)?.type ?? '').label }}
                        </span>
                        <span class="truncate">{{ cond.column }}</span>
                      </template>
                      <span v-else class="text-muted-foreground/50 truncate">column</span>
                      <ChevronDown class="size-3 text-muted-foreground/50 ml-auto shrink-0" />
                    </button>
                    <select :value="cond.operator"
                      @change="tn.setUnionCondition(+i, { operator: ($event.target as HTMLSelectElement).value })"
                      class="h-7 px-1.5 rounded-lg border bg-background text-[11px] focus:outline-none focus:ring-1 focus:ring-yellow-500/40 shrink-0">
                      <option v-for="op in ['=','!=','>','<','>=','<=','LIKE','IN','IS NULL','IS NOT NULL']" :key="op" :value="op">{{ op }}</option>
                    </select>
                    <input v-if="!['IS NULL','IS NOT NULL'].includes(cond.operator)"
                      :value="cond.value"
                      @input="tn.setUnionCondition(+i, { value: ($event.target as HTMLInputElement).value })"
                      class="w-24 h-7 px-2 rounded-lg border bg-background text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-yellow-500/40 shrink-0"
                      placeholder="value" />
                    <button @click="tn.removeUnionCondition(+i)"
                      class="size-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0">
                      <X class="size-3" />
                    </button>
                  </div>
                </div>
                <p v-else class="text-[10px] text-muted-foreground/60 italic px-1">ไม่มี filter = ดึงข้อมูลทั้งหมดจาก union</p>
              </div>
              <!-- SQL Preview -->
              <div class="flex flex-col gap-2">
                <p class="text-[11px] font-semibold text-yellow-500 uppercase tracking-wide">SQL Preview</p>
                <div v-if="unionSources.length"
                  class="px-3 py-2 rounded-xl bg-yellow-500/5 border border-yellow-400/20 max-h-[140px] overflow-y-auto overflow-x-auto">
                  <div class="flex items-start gap-1.5">
                    <span class="text-[9px] font-bold text-yellow-600 shrink-0 mt-0.5">SQL</span>
                    <code class="text-[9px] font-mono text-yellow-400/80 leading-relaxed whitespace-pre">{{ unionSqlPreview }}</code>
                  </div>
                </div>
                <div v-else class="px-3 py-3 rounded-xl bg-muted/20 border text-[10px] text-muted-foreground/60 italic">
                  เลือก Sources เพื่อดู SQL
                </div>
              </div>
            </div><!-- /row3 -->

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
        <div class="px-5 py-3.5 border-t shrink-0 flex items-center justify-between">
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
          <p v-else-if="nodeType === 'union'" class="text-[10px] text-muted-foreground">
            {{ store.modalNode?.data?.unionType ?? 'UNION ALL' }}
            <span class="font-semibold text-yellow-500">
              {{ (store.modalNode?.data?.selectedCols ?? []).length || 'SELECT *' }}
            </span>
            <span v-if="(store.modalNode?.data?.selectedCols ?? []).length"> cols</span>
          </p>
          <span v-else />
          <div class="flex gap-2">
            <button @click="close"
              class="text-xs px-4 py-2 border rounded-lg hover:bg-accent transition-colors">
              ยกเลิก
            </button>
            <button @click="finish"
              class="text-xs px-5 py-2 text-white rounded-lg font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5"
              :style="finishBtnStyle"
            >
              <Sparkles class="size-3.5" />
              Finish &amp; Generate SQL
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
