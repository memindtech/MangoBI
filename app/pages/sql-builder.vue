<script setup lang="ts">
import {
  VueFlow, useVueFlow, MarkerType,
  type Node, type Edge, type Connection,
} from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import {
  Database, Code2, Search, ChevronRight, ChevronDown,
  X, Copy, ArrowRight, RefreshCw, Layers, Calculator,
  SortAsc, GitMerge, Play, Trash2, Settings2, Plus,
} from 'lucide-vue-next'

definePageMeta({ layout: 'workspace', auth: true })
useHead({ title: 'SQL Builder | MangoBI' })

const { $xt } = useNuxtApp() as any

// ── ERP data ───────────────────────────────────────────────────────────────
const modules      = ref<string[]>([])
const objects      = ref<Record<string, any[]>>({})
const expandedMods = ref<Set<string>>(new Set())
const loadingMods  = ref(false)
const loadingObjs  = ref<Record<string, boolean>>({})
const search       = ref('')

// ── Vue Flow ───────────────────────────────────────────────────────────────
const nodes = ref<Node[]>([])
const edges = ref<Edge[]>([])
const { onConnect: vfOnConnect, getViewport } = useVueFlow()

// ── SQL output ─────────────────────────────────────────────────────────────
const generatedSQL = ref('')
const sqlPanelOpen = ref(true)

// ── Modal: tool node config ────────────────────────────────────────────────
const modalNodeId  = ref<string | null>(null)
const modalNode    = computed(() => nodes.value.find(n => n.id === modalNodeId.value) ?? null)

// ── Edge JOIN type picker ──────────────────────────────────────────────────
const activeEdgeId = ref<string | null>(null)
const JOIN_TYPES   = ['LEFT JOIN', 'INNER JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN'] as const
type JoinType = typeof JOIN_TYPES[number]

const JOIN_COLORS: Record<JoinType, string> = {
  'LEFT JOIN':  'bg-sky-500/20 text-sky-600 border-sky-500/40',
  'INNER JOIN': 'bg-emerald-500/20 text-emerald-600 border-emerald-500/40',
  'RIGHT JOIN': 'bg-violet-500/20 text-violet-600 border-violet-500/40',
  'FULL JOIN':  'bg-orange-500/20 text-orange-600 border-orange-500/40',
  'CROSS JOIN': 'bg-rose-500/20 text-rose-600 border-rose-500/40',
}

function setJoinType(type: JoinType) {
  if (!activeEdgeId.value) return
  edges.value = edges.value.map(e =>
    e.id === activeEdgeId.value ? { ...e, label: type, data: { ...e.data, joinType: type } } : e
  )
  activeEdgeId.value = null
}

// ── Tools definition ───────────────────────────────────────────────────────
const tools = [
  { id: 'cte',   icon: Layers,      color: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500/40', label: 'Group CTE',  desc: 'Subquery / CTE' },
  { id: 'calc',  icon: Calculator,  color: 'text-teal-500',   bg: 'bg-teal-500/10',   border: 'border-teal-500/40',   label: 'Calculator', desc: 'คำนวณ column' },
  { id: 'group', icon: Database,    color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/40', label: 'Group/By',   desc: 'GROUP BY + Aggregate' },
  { id: 'sort',  icon: SortAsc,     color: 'text-green-500',  bg: 'bg-green-500/10',  border: 'border-green-500/40',  label: 'Sort Data',  desc: 'ORDER BY' },
  { id: 'union', icon: GitMerge,    color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/40', label: 'Union',      desc: 'UNION / UNION ALL' },
]

const TOOL_NODE_DEFAULTS: Record<string, any> = {
  cte:   { nodeType: 'cte',   name: 'my_cte', cols: '*', where: '' },
  calc:  { nodeType: 'calc',  items: [] },
  group: { nodeType: 'group', groupCols: [], aggs: [] },
  sort:  { nodeType: 'sort',  items: [] },
  union: { nodeType: 'union', unionType: 'UNION ALL', tables: [] },
}

const AGG_FUNCS = ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'COUNT DISTINCT']

// ── Add tool node to canvas center ─────────────────────────────────────────
let nodeCounter = 0

function addToolNode(toolId: string) {
  const id = `tool-${++nodeCounter}`
  const vp = getViewport()
  const x  = (-vp.x + 400) / vp.zoom
  const y  = (-vp.y + 200) / vp.zoom
  nodes.value = [...nodes.value, {
    id,
    type: 'toolNode',
    position: { x, y },
    data: { ...TOOL_NODE_DEFAULTS[toolId], _toolId: toolId },
  }]
  // auto-open modal
  modalNodeId.value = id
}

// ── Load ERP modules ───────────────────────────────────────────────────────
onMounted(async () => {
  loadingMods.value = true
  try {
    const res: any = await $xt.getServer('AnywhereAPI/Master/Addspec_Module_ReadList')
    const seen = new Set<string>()
    modules.value = (res?.data ?? []).map((m: any) => m.module).filter((m: string) => {
      if (seen.has(m)) return false
      seen.add(m)
      return true
    })
  } catch {}
  finally { loadingMods.value = false }
})

async function toggleModule(mod: string) {
  if (expandedMods.value.has(mod)) {
    expandedMods.value.delete(mod)
    expandedMods.value = new Set(expandedMods.value)
    return
  }
  expandedMods.value.add(mod)
  expandedMods.value = new Set(expandedMods.value)
  if (!objects.value[mod] && !loadingObjs.value[mod]) {
    loadingObjs.value = { ...loadingObjs.value, [mod]: true }
    try {
      const res: any = await $xt.getServer(`AnywhereAPI/Master/Addspec_Object_ReadList?module=${mod}&text=`)
      objects.value = { ...objects.value, [mod]: res?.data ?? [] }
    } catch {
      objects.value = { ...objects.value, [mod]: [] }
    }
    loadingObjs.value = { ...loadingObjs.value, [mod]: false }
  }
}

const filteredModules = computed(() => {
  const q = search.value.toLowerCase().trim()
  if (!q) return modules.value
  return modules.value.filter(m => {
    if (m.toLowerCase().includes(q)) return true
    return (objects.value[m] ?? []).some((o: any) => o.object_name?.toLowerCase().includes(q))
  })
})

function filteredObjects(mod: string) {
  const q = search.value.toLowerCase().trim()
  const objs = objects.value[mod] ?? []
  return q ? objs.filter((o: any) => o.object_name?.toLowerCase().includes(q)) : objs
}

// ── Display name helper ────────────────────────────────────────────────────
function objDisplayName(obj: any): string {
  const remark = obj?.remark?.trim()
  if (!remark) return obj?.object_name ?? ''
  return remark.split('\n')[0].replace(/^[-–•]\s*/, '').trim() || obj.object_name
}

// ── Drag table from left panel → Table node ────────────────────────────────
function onDragStart(e: DragEvent, obj: any) {
  e.dataTransfer?.setData('application/json', JSON.stringify(obj))
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  const raw = e.dataTransfer?.getData('application/json')
  if (!raw) return
  const obj: any = JSON.parse(raw)
  const id = `node-${++nodeCounter}`
  const bounds = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = e.clientX - bounds.left - 80
  const y = e.clientY - bounds.top  - 30
  nodes.value = [...nodes.value, {
    id,
    type: 'sqlTable',
    position: { x: Math.max(0, x), y: Math.max(0, y) },
    data: { label: objDisplayName(obj), tableName: obj.object_name, module: obj.module, type: obj.object_type, ttype: obj.t_object_name },
  }]
}

// ── Edge: new connection → default LEFT JOIN ───────────────────────────────
vfOnConnect((conn: Connection) => {
  const id = `e-${conn.source}-${conn.target}`
  edges.value = [...edges.value, {
    id,
    source: conn.source!,
    target: conn.target!,
    sourceHandle: conn.sourceHandle,
    targetHandle: conn.targetHandle,
    type: 'smoothstep',
    label: 'LEFT JOIN',
    labelStyle: { fontSize: '10px', fontWeight: 600 },
    labelBgStyle: { fill: 'hsl(var(--background))', stroke: 'hsl(var(--border))' },
    markerEnd: MarkerType.ArrowClosed,
    data: { joinType: 'LEFT JOIN' as JoinType },
  }]
})

function onEdgeClick(_: any, edge: Edge) {
  activeEdgeId.value = activeEdgeId.value === edge.id ? null : edge.id
}

function onNodeClick(_: any, node: Node) {
  if (node.type === 'toolNode') modalNodeId.value = node.id
}

function removeNode(id: string) {
  nodes.value = nodes.value.filter(n => n.id !== id)
  edges.value = edges.value.filter(e => e.source !== id && e.target !== id)
  if (modalNodeId.value === id) modalNodeId.value = null
}

// ── Modal helpers ──────────────────────────────────────────────────────────
function modalNodeData(key: string) {
  return modalNode.value?.data?.[key]
}

function setModalData(patch: Record<string, any>) {
  if (!modalNode.value) return
  nodes.value = nodes.value.map(n =>
    n.id === modalNodeId.value ? { ...n, data: { ...n.data, ...patch } } : n
  )
}

// Group/By helpers
function addGroupCol()   { setModalData({ groupCols: [...(modalNodeData('groupCols') ?? []), ''] }) }
function removeGroupCol(i: number) {
  const cols = [...(modalNodeData('groupCols') ?? [])]
  cols.splice(i, 1)
  setModalData({ groupCols: cols })
}
function setGroupCol(i: number, val: string) {
  const cols = [...(modalNodeData('groupCols') ?? [])]
  cols[i] = val
  setModalData({ groupCols: cols })
}
function addAgg()        { setModalData({ aggs: [...(modalNodeData('aggs') ?? []), { col: '', func: 'SUM', alias: '' }] }) }
function removeAgg(i: number) {
  const aggs = [...(modalNodeData('aggs') ?? [])]
  aggs.splice(i, 1)
  setModalData({ aggs })
}
function setAgg(i: number, patch: any) {
  const aggs = (modalNodeData('aggs') ?? []).map((a: any, idx: number) => idx === i ? { ...a, ...patch } : a)
  setModalData({ aggs })
}
// Shared item helpers (used by both Calc and Sort)
function removeItem(i: number) {
  const items = [...(modalNodeData('items') ?? [])]
  items.splice(i, 1)
  setModalData({ items })
}
function patchItem(i: number, patch: any) {
  const items = (modalNodeData('items') ?? []).map((a: any, idx: number) => idx === i ? { ...a, ...patch } : a)
  setModalData({ items })
}
// Calc helpers
function addCalcItem() { setModalData({ items: [...(modalNodeData('items') ?? []), { alias: '', expr: '' }] }) }
const removeCalcItem = removeItem
const setCalcItem    = patchItem
// Sort helpers
function addSortItem() { setModalData({ items: [...(modalNodeData('items') ?? []), { col: '', dir: 'ASC' }] }) }
const removeSortItem = removeItem
const setSortItem    = patchItem
// Union helpers
function addUnionTable() { setModalData({ tables: [...(modalNodeData('tables') ?? []), ''] }) }
function removeUnionTable(i: number) {
  const tables = [...(modalNodeData('tables') ?? [])]
  tables.splice(i, 1)
  setModalData({ tables })
}
function setUnionTable(i: number, val: string) {
  const tables = (modalNodeData('tables') ?? []).map((t: string, idx: number) => idx === i ? val : t)
  setModalData({ tables })
}

// ── Canvas table names for dropdowns ──────────────────────────────────────
const canvasTableNames = computed(() =>
  nodes.value
    .filter(n => n.type === 'sqlTable')
    .map(n => ({ label: n.data.label as string, value: (n.data.tableName ?? n.data.label) as string }))
)

// ── Generate SQL ──────────────────────────────────────────────────────────
const router = useRouter()

function generateSQL() {
  if (!nodes.value.length) { generatedSQL.value = '-- ลาก Table ลงบน Canvas ก่อน'; return }
  const parts: string[] = []
  const tableNodes = nodes.value.filter(n => n.type === 'sqlTable')
  const toolNodes  = nodes.value.filter(n => n.type === 'toolNode')

  const tables = tableNodes.map(n => (n.data.tableName ?? n.data.label) as string)
  if (!tables.length) { generatedSQL.value = '-- ยังไม่มี Table node บน Canvas'; return }

  const joinLines = edges.value.filter(e => {
    const src = tableNodes.find(n => n.id === e.source)
    const tgt = tableNodes.find(n => n.id === e.target)
    return src && tgt
  }).map(e => {
    const src = tableNodes.find(n => n.id === e.source)?.data.tableName ?? ''
    const tgt = tableNodes.find(n => n.id === e.target)?.data.tableName ?? ''
    const jt  = e.data?.joinType ?? 'LEFT JOIN'
    return `  ${jt} ${tgt} ON ${tgt}.id = ${src}.${tgt}_id`
  })

  // CTE node
  const cteNode = toolNodes.find(n => n.data.nodeType === 'cte')
  if (cteNode?.data.name && tables[0]) {
    const where = cteNode.data.where ? `\n  WHERE ${cteNode.data.where}` : ''
    parts.push(`WITH ${cteNode.data.name} AS (\n  SELECT ${cteNode.data.cols || '*'} FROM ${tables[0]}${where}\n)`)
  }

  // SELECT
  const groupNode = toolNodes.find(n => n.data.nodeType === 'group')
  const calcNode  = toolNodes.find(n => n.data.nodeType === 'calc')
  const selectCols: string[] = []

  if (groupNode?.data.groupCols?.some((c: string) => c)) {
    groupNode.data.groupCols.filter(Boolean).forEach((c: string) => selectCols.push(`  ${c}`))
    ;(groupNode.data.aggs ?? []).filter((a: any) => a.col && a.func).forEach((a: any) => {
      const fn  = a.func === 'COUNT DISTINCT' ? `COUNT(DISTINCT ${a.col})` : `${a.func}(${a.col})`
      selectCols.push(a.alias ? `  ${fn} AS ${a.alias}` : `  ${fn}`)
    })
  } else {
    tables.forEach(t => selectCols.push(`  ${t}.*`))
    ;(calcNode?.data.items ?? []).filter((c: any) => c.expr).forEach((c: any) =>
      selectCols.push(`  ${c.expr} AS ${c.alias || 'calculated_col'}`)
    )
  }

  const selectBlock = selectCols.length ? selectCols.join(',\n') : `  ${tables[0]}.*`
  parts.push(`SELECT\n${selectBlock}`, `FROM ${tables[0]}`, ...joinLines)

  // GROUP BY
  const gbCols = (groupNode?.data.groupCols ?? []).filter(Boolean)
  if (gbCols.length) parts.push('GROUP BY ' + gbCols.join(', '))

  // ORDER BY
  const sortNode  = toolNodes.find(n => n.data.nodeType === 'sort')
  const validSort = (sortNode?.data.items ?? []).filter((s: any) => s.col)
  if (validSort.length) parts.push('ORDER BY ' + validSort.map((s: any) => s.col + ' ' + s.dir).join(', '))

  // UNION
  const unionNode  = toolNodes.find(n => n.data.nodeType === 'union')
  const validUnion = (unionNode?.data.tables ?? []).filter(Boolean)
  if (validUnion.length) {
    validUnion.forEach((t: string) => parts.push(unionNode!.data.unionType ?? 'UNION ALL', `SELECT * FROM ${t}`))
  }

  generatedSQL.value = parts.join('\n')
  sqlPanelOpen.value = true
}

function copySQL() { navigator.clipboard.writeText(generatedSQL.value) }

function sendToDataModel() {
  if (!generatedSQL.value) return
  router.push({ path: '/datamodel', query: { sql: generatedSQL.value } })
}

// ── Helpers ────────────────────────────────────────────────────────────────
const objectTypeColor = (type: string) => ({
  T:  'bg-blue-500/20 text-blue-600',
  V:  'bg-purple-500/20 text-purple-600',
  FN: 'bg-teal-500/20 text-teal-600',
  R:  'bg-orange-500/20 text-orange-600',
  SP: 'bg-rose-500/20 text-rose-600',
} as any)[type] ?? 'bg-muted text-muted-foreground'

const toolMeta: Record<string, { label: string; color: string; bg: string; border: string }> = {
  cte:   { label: 'CTE',      color: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500/60' },
  calc:  { label: 'Calc',     color: 'text-teal-500',   bg: 'bg-teal-500/10',   border: 'border-teal-500/60'   },
  group: { label: 'GROUP BY', color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/60' },
  sort:  { label: 'ORDER BY', color: 'text-green-500',  bg: 'bg-green-500/10',  border: 'border-green-500/60'  },
  union: { label: 'UNION',    color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/60' },
}

function toolNodeSummary(data: any): string {
  switch (data.nodeType) {
    case 'cte':   return data.name || '—'
    case 'group': return (data.groupCols ?? []).filter(Boolean).join(', ') || 'ยังไม่ได้ตั้งค่า'
    case 'calc':  return (data.items ?? []).filter((c: any) => c.alias).map((c: any) => c.alias).join(', ') || 'ยังไม่ได้ตั้งค่า'
    case 'sort':  return (data.items ?? []).filter((s: any) => s.col).map((s: any) => s.col + ' ' + s.dir).join(', ') || 'ยังไม่ได้ตั้งค่า'
    case 'union': return data.unionType + ' (' + ((data.tables ?? []).filter(Boolean).length) + ' tables)'
    default:      return ''
  }
}
</script>

<template>
  <div class="flex flex-col bg-background" style="flex:1;overflow:hidden;min-height:0">

    <!-- ── Toolbar ────────────────────────────────────────────────────────── -->
    <header class="flex items-center gap-3 px-4 h-11 border-b shrink-0 bg-background z-20">
      <div class="flex items-center gap-2">
        <div class="flex size-7 items-center justify-center rounded-lg bg-sky-500/10 border border-sky-500/20">
          <Code2 class="size-3.5 text-sky-500" />
        </div>
        <span class="font-semibold text-sm">SQL Builder</span>
      </div>
      <div class="h-4 w-px bg-border" />
      <span class="text-xs text-muted-foreground">
        {{ nodes.filter(n=>n.type==='sqlTable').length }} tables ·
        {{ edges.length }} joins ·
        {{ nodes.filter(n=>n.type==='toolNode').length }} operations
      </span>
      <div class="ml-auto flex items-center gap-2">
        <button @click="generateSQL"
          class="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-semibold transition-colors">
          <Play class="size-3.5" /> Generate SQL
        </button>
        <button @click="sendToDataModel" :disabled="!generatedSQL"
          class="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-40">
          <ArrowRight class="size-3.5" /> ส่งไป DataModel
        </button>
        <button @click="nodes=[]; edges=[]; generatedSQL=''"
          class="text-xs px-2 py-1.5 border rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors">
          <Trash2 class="size-3.5" />
        </button>
      </div>
    </header>

    <!-- ── Body ──────────────────────────────────────────────────────────── -->
    <div class="flex flex-1 overflow-hidden" @click="activeEdgeId = null">

      <!-- ── Left: Table Browser ─────────────────────────────────────────── -->
      <aside aria-label="Database Tables" class="w-56 border-r bg-background flex flex-col overflow-hidden shrink-0">
        <div class="px-3 py-2 border-b shrink-0">
          <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Database Tables</p>
          <div class="relative">
            <Search class="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
            <input v-model="search" placeholder="ค้นหา Module / Object…"
              class="w-full text-[11px] border rounded-md pl-6 pr-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-sky-400 placeholder:text-muted-foreground/40" />
          </div>
        </div>
        <div v-if="loadingMods" class="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
          <RefreshCw class="size-3.5 animate-spin" /> Loading modules…
        </div>
        <div class="flex-1 overflow-y-auto">
          <div v-for="mod in filteredModules" :key="mod" class="border-b last:border-0">
            <button @click="toggleModule(mod)"
              class="w-full flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold hover:bg-accent transition-colors text-left">
              <component :is="expandedMods.has(mod) ? ChevronDown : ChevronRight" class="size-3 text-muted-foreground shrink-0" />
              <Database class="size-3 text-sky-400 shrink-0" />
              <span class="flex-1">{{ mod }}</span>
              <RefreshCw v-if="loadingObjs[mod]" class="size-3 animate-spin text-muted-foreground" />
              <span v-else-if="objects[mod]" class="text-[10px] text-muted-foreground font-mono">{{ objects[mod].length }}</span>
            </button>
            <div v-if="expandedMods.has(mod) && objects[mod]">
              <div v-if="!filteredObjects(mod).length" class="px-6 py-1 text-[10px] text-muted-foreground">ไม่พบข้อมูล</div>
              <div
                v-for="obj in filteredObjects(mod)"
                :key="obj.object_name"
                draggable="true"
                @dragstart="onDragStart($event, obj)"
                :title="obj.remark ? `${obj.object_name}\n${obj.remark}` : obj.object_name"
                class="flex items-center gap-1.5 px-4 py-1.5 text-[11px] cursor-grab hover:bg-accent transition-colors active:cursor-grabbing"
              >
                <span :class="['text-[9px] px-1 py-0.5 rounded font-semibold font-mono shrink-0', objectTypeColor(obj.object_type)]">
                  {{ obj.object_type }}
                </span>
                <div class="flex flex-col min-w-0">
                  <span class="truncate font-medium">{{ objDisplayName(obj) }}</span>
                  <span v-if="obj.remark" class="truncate text-[9px] text-muted-foreground font-mono">{{ obj.object_name }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- ── Center: Canvas ──────────────────────────────────────────────── -->
      <div class="flex-1 flex flex-col overflow-hidden" style="min-width:0">
        <div class="flex-1 relative" @dragover.prevent @drop="onDrop">
          <VueFlow
            v-model:nodes="nodes"
            v-model:edges="edges"
            :connect-on-click="false"
            class="bg-background bg-[radial-gradient(circle,_hsl(var(--border))_1px,_transparent_1px)] bg-[size:24px_24px]"
            @edge-click="onEdgeClick"
            @node-click="onNodeClick"
          >
            <Background />
            <Controls />

            <!-- ── Table node ─────────────────────────────────────────── -->
            <template #node-sqlTable="{ data, id }">
              <div class="bg-background border-2 border-sky-500/60 rounded-xl shadow-md min-w-[150px] overflow-hidden nowheel">
                <div class="flex items-center gap-1.5 px-2.5 py-1.5 bg-sky-500/10 border-b border-sky-500/20">
                  <Database class="size-3 text-sky-500 shrink-0" />
                  <div class="flex flex-col flex-1 min-w-0">
                    <span class="text-[11px] font-semibold truncate">{{ data.label }}</span>
                    <span v-if="data.tableName !== data.label" class="text-[9px] text-sky-400/70 font-mono truncate">{{ data.tableName }}</span>
                  </div>
                  <button @click.stop="removeNode(id)" class="size-4 text-muted-foreground hover:text-destructive shrink-0">
                    <X class="size-3" />
                  </button>
                </div>
                <div class="px-2.5 py-1.5 flex items-center gap-1.5">
                  <span :class="['text-[9px] px-1 py-0.5 rounded font-semibold font-mono shrink-0', objectTypeColor(data.type)]">
                    {{ data.ttype ?? data.type }}
                  </span>
                  <span class="text-[10px] text-muted-foreground truncate">{{ data.module }}</span>
                </div>
              </div>
            </template>

            <!-- ── Tool node ──────────────────────────────────────────── -->
            <template #node-toolNode="{ data, id }">
              <div
                :class="['min-w-[160px] rounded-xl border-2 shadow-md overflow-hidden cursor-pointer nowheel', toolMeta[data._toolId]?.border, toolMeta[data._toolId]?.bg]"
                @click.stop="modalNodeId = id"
              >
                <div :class="['flex items-center gap-1.5 px-2.5 py-1.5 border-b', toolMeta[data._toolId]?.border]">
                  <component :is="tools.find(t=>t.id===data._toolId)?.icon" :class="['size-3.5 shrink-0', toolMeta[data._toolId]?.color]" />
                  <span :class="['text-[11px] font-bold flex-1', toolMeta[data._toolId]?.color]">
                    {{ toolMeta[data._toolId]?.label }}
                  </span>
                  <Settings2 :class="['size-3 shrink-0', toolMeta[data._toolId]?.color, 'opacity-60']" />
                  <button @click.stop="removeNode(id)" class="size-4 text-muted-foreground hover:text-destructive shrink-0 ml-1">
                    <X class="size-3" />
                  </button>
                </div>
                <div class="px-2.5 py-1.5">
                  <p class="text-[10px] text-muted-foreground truncate">{{ toolNodeSummary(data) }}</p>
                </div>
              </div>
            </template>

            <!-- Empty state -->
            <template v-if="!nodes.length" #default>
              <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
                <div class="bg-background/90 rounded-2xl border px-8 py-6 text-center shadow-xl max-w-xs">
                  <Code2 class="size-10 text-sky-400 mx-auto mb-3" />
                  <p class="font-semibold text-sm mb-1">เริ่มต้นสร้าง SQL</p>
                  <p class="text-xs text-muted-foreground leading-relaxed">
                    ลาก <strong>Table</strong> จากแถบซ้ายลงบน Canvas
                  </p>
                  <p class="text-xs text-muted-foreground mt-1">
                    เชื่อม Table ด้วยเส้น = <strong>JOIN</strong><br/>
                    เพิ่ม Operation จากแถบ Tools ขวา
                  </p>
                </div>
              </div>
            </template>
          </VueFlow>

          <!-- ── Edge JOIN type picker (floats over canvas) ─────────────── -->
          <Transition name="fade">
            <div v-if="activeEdgeId"
              class="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 bg-background border rounded-2xl shadow-2xl p-3 flex flex-col gap-2 min-w-[200px]"
              @click.stop
            >
              <p class="text-[10px] font-semibold text-muted-foreground text-center uppercase tracking-wide">เปลี่ยนประเภท JOIN</p>
              <div class="flex flex-col gap-1">
                <button
                  v-for="jt in JOIN_TYPES" :key="jt"
                  @click="setJoinType(jt as JoinType)"
                  :class="['text-xs px-3 py-1.5 rounded-lg border font-semibold text-left transition-colors',
                    edges.find(e=>e.id===activeEdgeId)?.data?.joinType === jt
                      ? JOIN_COLORS[jt as JoinType]
                      : 'border-border hover:bg-accent']"
                >
                  {{ jt }}
                </button>
              </div>
            </div>
          </Transition>
        </div>

        <!-- ── SQL Output Panel ────────────────────────────────────────── -->
        <div class="border-t bg-background shrink-0" :style="{ height: sqlPanelOpen ? '180px' : '36px' }">
          <div class="flex items-center gap-2 px-3 h-9 border-b">
            <Code2 class="size-3.5 text-sky-500" />
            <span class="text-xs font-semibold">Generated SQL</span>
            <button @click="sqlPanelOpen = !sqlPanelOpen" class="ml-auto text-muted-foreground hover:text-foreground">
              <component :is="sqlPanelOpen ? ChevronDown : ChevronRight" class="size-3.5" />
            </button>
            <button v-if="generatedSQL" @click="copySQL" class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <Copy class="size-3" /> Copy
            </button>
          </div>
          <div v-if="sqlPanelOpen" class="h-[calc(100%-36px)] overflow-auto">
            <pre v-if="generatedSQL" class="px-4 py-3 text-xs font-mono whitespace-pre-wrap leading-relaxed">{{ generatedSQL }}</pre>
            <div v-else class="flex items-center justify-center h-full text-xs text-muted-foreground">กด "Generate SQL" เพื่อสร้าง Query</div>
          </div>
        </div>
      </div>

      <!-- ── Right: Tools ────────────────────────────────────────────────── -->
      <aside aria-label="SQL Tools" class="w-48 border-l bg-background flex flex-col overflow-hidden shrink-0">
        <div class="px-3 py-2 border-b shrink-0">
          <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">TOOLS</p>
          <p class="text-[10px] text-muted-foreground mt-0.5">คลิกเพื่อเพิ่ม Node</p>
        </div>
        <div class="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
          <button
            v-for="tool in tools"
            :key="tool.id"
            @click="addToolNode(tool.id)"
            :class="['flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all hover:shadow-sm w-full', tool.border, tool.bg]"
          >
            <div :class="['flex size-8 items-center justify-center rounded-lg shrink-0 border', tool.bg, tool.border]">
              <component :is="tool.icon" :class="['size-4', tool.color]" />
            </div>
            <div class="flex-1 min-w-0">
              <p :class="['text-[11px] font-semibold', tool.color]">{{ tool.label }}</p>
              <p class="text-[10px] text-muted-foreground">{{ tool.desc }}</p>
            </div>
            <Plus class="size-3 text-muted-foreground shrink-0" />
          </button>
        </div>
        <div class="p-3 border-t">
          <button @click="generateSQL"
            class="w-full flex flex-col items-center justify-center gap-1 py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white transition-colors">
            <Play class="size-4" />
            <span class="text-xs font-bold">Finish</span>
            <span class="text-[10px] opacity-80">Generate SQL</span>
          </button>
        </div>
      </aside>
    </div>

    <!-- ══ Tool Node Config Modal ══════════════════════════════════════════ -->
    <Transition name="fade">
      <div v-if="modalNode"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        @click.self="modalNodeId = null"
      >
        <div class="bg-background rounded-2xl border shadow-2xl w-[420px] max-h-[80vh] flex flex-col overflow-hidden"
          @click.stop>
          <!-- Modal header -->
          <div :class="['flex items-center gap-2.5 px-4 py-3 border-b', toolMeta[modalNode.data._toolId]?.bg]">
            <component :is="tools.find(t=>t.id===modalNode.data._toolId)?.icon"
              :class="['size-4 shrink-0', toolMeta[modalNode.data._toolId]?.color]" />
            <span :class="['font-bold text-sm flex-1', toolMeta[modalNode.data._toolId]?.color]">
              {{ toolMeta[modalNode.data._toolId]?.label }} — Configuration
            </span>
            <button @click="modalNodeId = null" class="text-muted-foreground hover:text-foreground">
              <X class="size-4" />
            </button>
          </div>
          <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

            <!-- ── CTE ─────────────────────────────────────────────────── -->
            <template v-if="modalNode.data.nodeType === 'cte'">
              <div class="flex flex-col gap-1.5">
                <label for="cte-name" class="text-xs font-semibold">ชื่อ CTE</label>
                <input id="cte-name" :value="modalNode.data.name"
                  @input="setModalData({ name: ($event.target as HTMLInputElement).value })"
                  class="text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400 font-mono" />
              </div>
              <div class="flex flex-col gap-1.5">
                <label for="cte-cols" class="text-xs font-semibold">Columns <span class="font-normal text-muted-foreground">(default: *)</span></label>
                <input id="cte-cols" :value="modalNode.data.cols"
                  @input="setModalData({ cols: ($event.target as HTMLInputElement).value })"
                  placeholder="* หรือ col1, col2, ..."
                  class="text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400 font-mono" />
              </div>
              <div class="flex flex-col gap-1.5">
                <label for="cte-where" class="text-xs font-semibold">WHERE <span class="font-normal text-muted-foreground">(optional)</span></label>
                <input id="cte-where" :value="modalNode.data.where"
                  @input="setModalData({ where: ($event.target as HTMLInputElement).value })"
                  placeholder="เช่น status = 'active'"
                  class="text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-violet-400 font-mono" />
              </div>
            </template>

            <!-- ── Calculator ──────────────────────────────────────────── -->
            <template v-else-if="modalNode.data.nodeType === 'calc'">
              <div v-for="(item, i) in modalNode.data.items" :key="i"
                class="flex flex-col gap-1.5 border rounded-xl p-3 bg-teal-500/5">
                <div class="flex items-center gap-1">
                  <span class="text-[10px] font-semibold text-muted-foreground flex-1">Column {{ i + 1 }}</span>
                  <button @click="removeCalcItem(i)" class="text-muted-foreground hover:text-destructive"><X class="size-3.5" /></button>
                </div>
                <input :value="item.alias"
                  @input="setCalcItem(i, { alias: ($event.target as HTMLInputElement).value })"
                  placeholder="ชื่อ column (alias)"
                  class="text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-teal-400 font-mono" />
                <input :value="item.expr"
                  @input="setCalcItem(i, { expr: ($event.target as HTMLInputElement).value })"
                  placeholder="Expression เช่น price * qty"
                  class="text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-teal-400 font-mono" />
              </div>
              <button @click="addCalcItem"
                class="text-xs w-full py-2 rounded-xl border border-teal-500/40 text-teal-600 hover:bg-teal-500/10 font-semibold transition-colors flex items-center justify-center gap-1">
                <Plus class="size-3.5" /> เพิ่ม Calculated Column
              </button>
            </template>

            <!-- ── Group/By ────────────────────────────────────────────── -->
            <template v-else-if="modalNode.data.nodeType === 'group'">
              <div class="flex flex-col gap-2">
                <p class="text-xs font-semibold">GROUP BY Columns</p>
                <div v-for="(col, i) in modalNode.data.groupCols" :key="'g'+i" class="flex items-center gap-1.5">
                  <input :value="col"
                    @input="setGroupCol(i, ($event.target as HTMLInputElement).value)"
                    placeholder="ชื่อ column"
                    class="flex-1 text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-orange-400 font-mono" />
                  <button @click="removeGroupCol(i)" class="text-muted-foreground hover:text-destructive"><X class="size-3.5" /></button>
                </div>
                <button @click="addGroupCol"
                  class="text-xs w-full py-1.5 rounded-xl border border-orange-500/40 text-orange-600 hover:bg-orange-500/10 font-semibold transition-colors flex items-center justify-center gap-1">
                  <Plus class="size-3.5" /> GROUP BY Column
                </button>
              </div>
              <div class="flex flex-col gap-2">
                <p class="text-xs font-semibold">Aggregations</p>
                <div v-for="(agg, i) in modalNode.data.aggs" :key="'a'+i"
                  class="flex flex-col gap-1.5 border rounded-xl p-3 bg-orange-500/5">
                  <div class="flex items-center gap-1">
                    <select :value="agg.func" @change="setAgg(i, { func: ($event.target as HTMLSelectElement).value })"
                      class="flex-1 text-xs border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-orange-400">
                      <option v-for="fn in AGG_FUNCS" :key="fn" :value="fn">{{ fn }}</option>
                    </select>
                    <button @click="removeAgg(i)" class="text-muted-foreground hover:text-destructive"><X class="size-3.5" /></button>
                  </div>
                  <input :value="agg.col"
                    @input="setAgg(i, { col: ($event.target as HTMLInputElement).value })"
                    placeholder="Column name"
                    class="text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-orange-400 font-mono" />
                  <input :value="agg.alias"
                    @input="setAgg(i, { alias: ($event.target as HTMLInputElement).value })"
                    placeholder="AS alias (optional)"
                    class="text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-orange-400 font-mono" />
                </div>
                <button @click="addAgg"
                  class="text-xs w-full py-1.5 rounded-xl border border-orange-500/40 text-orange-600 hover:bg-orange-500/10 font-semibold transition-colors flex items-center justify-center gap-1">
                  <Plus class="size-3.5" /> Aggregation
                </button>
              </div>
            </template>

            <!-- ── Sort ────────────────────────────────────────────────── -->
            <template v-else-if="modalNode.data.nodeType === 'sort'">
              <div v-for="(s, i) in modalNode.data.items" :key="i" class="flex items-center gap-2">
                <input :value="s.col"
                  @input="setSortItem(i, { col: ($event.target as HTMLInputElement).value })"
                  placeholder="Column name"
                  class="flex-1 text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-green-400 font-mono" />
                <button
                  @click="setSortItem(i, { dir: s.dir === 'ASC' ? 'DESC' : 'ASC' })"
                  :class="['text-[10px] px-2 py-1.5 rounded-lg border font-bold shrink-0 transition-colors',
                    s.dir === 'ASC' ? 'border-green-500 text-green-600 bg-green-500/10' : 'border-rose-500 text-rose-600 bg-rose-500/10']">
                  {{ s.dir }}
                </button>
                <button @click="removeSortItem(i)" class="text-muted-foreground hover:text-destructive"><X class="size-3.5" /></button>
              </div>
              <button @click="addSortItem"
                class="text-xs w-full py-2 rounded-xl border border-green-500/40 text-green-600 hover:bg-green-500/10 font-semibold transition-colors flex items-center justify-center gap-1">
                <Plus class="size-3.5" /> Sort Column
              </button>
            </template>

            <!-- ── Union ───────────────────────────────────────────────── -->
            <template v-else-if="modalNode.data.nodeType === 'union'">
              <div class="flex gap-2">
                <button @click="setModalData({ unionType: 'UNION ALL' })"
                  :class="['flex-1 py-2 rounded-xl border text-xs font-bold transition-colors',
                    modalNode.data.unionType === 'UNION ALL' ? 'border-yellow-500 bg-yellow-500/20 text-yellow-600' : 'border-border hover:bg-accent']">
                  UNION ALL
                </button>
                <button @click="setModalData({ unionType: 'UNION' })"
                  :class="['flex-1 py-2 rounded-xl border text-xs font-bold transition-colors',
                    modalNode.data.unionType === 'UNION' ? 'border-yellow-500 bg-yellow-500/20 text-yellow-600' : 'border-border hover:bg-accent']">
                  UNION
                </button>
              </div>
              <div v-for="(t, i) in modalNode.data.tables" :key="i" class="flex items-center gap-2">
                <select :value="t" @change="setUnionTable(i, ($event.target as HTMLSelectElement).value)"
                  class="flex-1 text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-yellow-400">
                  <option value="">— เลือก Table —</option>
                  <option v-for="tn in canvasTableNames" :key="tn.value" :value="tn.value">{{ tn.label }}</option>
                </select>
                <button @click="removeUnionTable(i)" class="text-muted-foreground hover:text-destructive"><X class="size-3.5" /></button>
              </div>
              <button @click="addUnionTable"
                class="text-xs w-full py-2 rounded-xl border border-yellow-500/40 text-yellow-600 hover:bg-yellow-500/10 font-semibold transition-colors flex items-center justify-center gap-1">
                <Plus class="size-3.5" /> เพิ่ม Table
              </button>
            </template>

          </div>
          <div class="px-4 py-3 border-t flex justify-end">
            <button @click="modalNodeId = null"
              class="text-xs px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-semibold transition-colors">
              Done
            </button>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<style>
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';
@import '@vue-flow/controls/dist/style.css';

.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to       { opacity: 0; }
</style>
