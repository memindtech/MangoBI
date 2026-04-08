<script setup lang="ts">
import { X, Plus, SlidersHorizontal, Filter, ChevronDown, ChevronUp, ChevronRight, Key, Calendar, Search } from 'lucide-vue-next'
import type { FilterCondition, VisibleCol } from '~/types/sql-builder'
import { getFilterType, getColTypeBadgeSolid } from '~/types/sql-builder'
import { useSqlBuilderStore } from '~/stores/sql-builder'

const store = useSqlBuilderStore()

// ── Column groups (current node + all directly connected table nodes) ─────────
interface ColEntry {
  nodeId:       string
  column_name:  string
  column_type:  string
  data_pk?:     string
  remark?:      string
  table_label:  string
}

const columnGroups = computed((): { nodeId: string; table: string; cols: ColEntry[] }[] => {
  const node = store.filterNode
  if (!node) return []

  const connectedIds: string[] = [node.id as string]
  for (const edge of store.edges) {
    if (edge.source === node.id && !connectedIds.includes(edge.target as string))
      connectedIds.push(edge.target as string)
    if (edge.target === node.id && !connectedIds.includes(edge.source as string))
      connectedIds.push(edge.source as string)
  }

  const groups: { nodeId: string; table: string; cols: ColEntry[] }[] = []
  for (const id of connectedIds) {
    const n = store.nodes.find((n: any) => n.id === id)
    if (!n || n.type !== 'sqlTable') continue
    const details = (n.data.details ?? []) as any[]
    if (!details.length) continue
    const label = (n.data.tableName || n.data.label || id) as string
    groups.push({
      nodeId: id,
      table:  label,
      cols: details.map((d: any) => ({
        nodeId:      id,
        column_name: d.column_name ?? '',
        column_type: d.column_type ?? d.data_type ?? '',
        data_pk:     d.data_pk,
        remark:      d.remark ?? '',
        table_label: label,
      })),
    })
  }
  return groups
})

// ── Local visible-cols map (nodeId → VisibleCol[]) ────────────────────────────
const localVisibleColsMap = ref<Map<string, VisibleCol[]>>(new Map())
const expandedGroups     = ref<Set<string>>(new Set())

watch(() => store.filterNode, (node) => {
  if (!node) return
  const map = new Map<string, VisibleCol[]>()
  const expanded = new Set<string>()
  for (const g of columnGroups.value) {
    const n = store.nodes.find((n: any) => n.id === g.nodeId)
    map.set(g.nodeId, JSON.parse(JSON.stringify(n?.data?.visibleCols ?? [])))
    expanded.add(g.nodeId)   // all groups open by default
  }
  localVisibleColsMap.value = map
  expandedGroups.value = expanded
}, { immediate: true })

function toggleGroupExpanded(nodeId: string) {
  const s = new Set(expandedGroups.value)
  s.has(nodeId) ? s.delete(nodeId) : s.add(nodeId)
  expandedGroups.value = s
}

const allExpanded = computed(() => columnGroups.value.every(g => expandedGroups.value.has(g.nodeId)))

function toggleExpandAll() {
  if (allExpanded.value) {
    expandedGroups.value = new Set()
  } else {
    expandedGroups.value = new Set(columnGroups.value.map(g => g.nodeId))
  }
}

function isVisible(nodeId: string, colName: string): boolean {
  return localVisibleColsMap.value.get(nodeId)?.some(v => v.name === colName) ?? false
}

function toggleCol(nodeId: string, col: ColEntry) {
  const map = new Map(localVisibleColsMap.value)
  const current = [...(map.get(nodeId) ?? [])]
  const idx = current.findIndex(v => v.name === col.column_name)
  if (idx >= 0) {
    current.splice(idx, 1)
  } else {
    current.push({
      name:   col.column_name,
      type:   col.column_type,
      remark: col.remark,
      isPk:   col.data_pk === 'Y',
      alias:  '',
    } as VisibleCol)
  }
  map.set(nodeId, current)
  localVisibleColsMap.value = map
}

function setColAlias(nodeId: string, colName: string, alias: string) {
  const map = new Map(localVisibleColsMap.value)
  const current = (map.get(nodeId) ?? []).map(v => v.name === colName ? { ...v, alias } : v)
  map.set(nodeId, current)
  localVisibleColsMap.value = map
}

function selectAllGroup(nodeId: string, cols: ColEntry[]) {
  const map = new Map(localVisibleColsMap.value)
  const current = [...(map.get(nodeId) ?? [])]
  const existing = new Set(current.map(v => v.name))
  for (const col of cols) {
    if (!existing.has(col.column_name)) {
      current.push({ name: col.column_name, type: col.column_type, remark: col.remark, isPk: col.data_pk === 'Y', alias: '' } as VisibleCol)
    }
  }
  map.set(nodeId, current)
  localVisibleColsMap.value = map
}

function clearGroup(nodeId: string) {
  const map = new Map(localVisibleColsMap.value)
  map.set(nodeId, [])
  localVisibleColsMap.value = map
}

function selectAllGroups() {
  const map = new Map(localVisibleColsMap.value)
  for (const g of columnGroups.value) {
    const current = [...(map.get(g.nodeId) ?? [])]
    const existing = new Set(current.map(v => v.name))
    for (const col of g.cols) {
      if (!existing.has(col.column_name)) {
        current.push({ name: col.column_name, type: col.column_type, remark: col.remark, isPk: col.data_pk === 'Y', alias: '' } as VisibleCol)
      }
    }
    map.set(g.nodeId, current)
  }
  localVisibleColsMap.value = map
}

function clearAllGroups() {
  const map = new Map(localVisibleColsMap.value)
  for (const g of columnGroups.value) map.set(g.nodeId, [])
  localVisibleColsMap.value = map
}

const totalSelected = computed(() => {
  let n = 0
  for (const cols of localVisibleColsMap.value.values()) n += cols.length
  return n
})

// ── Column search ─────────────────────────────────────────────────────────────
const colSearch = ref('')

const filteredGroups = computed(() => {
  const q = colSearch.value.toLowerCase().trim()
  if (!q) return columnGroups.value
  return columnGroups.value
    .map(g => ({
      ...g,
      cols: g.cols.filter(c =>
        c.column_name.toLowerCase().includes(q) ||
        (c.remark ?? '').toLowerCase().includes(q)
      ),
    }))
    .filter(g => g.cols.length > 0)
})

// ── WHERE conditions (secondary, collapsible) ─────────────────────────────────
const OP_GROUPS = [
  { label: 'เปรียบเทียบ', ops: [
    { value: '=',  label: '=',  title: 'เท่ากับ' },
    { value: '!=', label: '≠',  title: 'ไม่เท่ากับ' },
    { value: '>',  label: '>',  title: 'มากกว่า' },
    { value: '<',  label: '<',  title: 'น้อยกว่า' },
    { value: '>=', label: '≥',  title: 'มากกว่าหรือเท่ากับ' },
    { value: '<=', label: '≤',  title: 'น้อยกว่าหรือเท่ากับ' },
  ]},
  { label: 'ข้อความ / ช่วง', ops: [
    { value: 'LIKE', label: 'LIKE', title: 'มีข้อความ (% wildcard)' },
    { value: 'IN',   label: 'IN',   title: 'อยู่ในชุด (a,b,c)' },
  ]},
  { label: 'ว่างเปล่า', ops: [
    { value: 'IS NULL',     label: 'NULL',  title: 'ว่างเปล่า' },
    { value: 'IS NOT NULL', label: '!NULL', title: 'ไม่ว่างเปล่า' },
  ]},
]

const localFilters   = ref<FilterCondition[]>([])
const whereExpanded  = ref(false)
const noValueOps     = ['IS NULL', 'IS NOT NULL']

watch(() => store.filterNode, (node) => {
  if (!node) return
  localFilters.value  = JSON.parse(JSON.stringify(node.data.filters ?? []))
  whereExpanded.value = (node.data.filters?.length ?? 0) > 0
}, { immediate: true })

const availableColumns = computed(() => columnGroups.value.flatMap(g => g.cols))

function colInfo(colName: string) {
  return availableColumns.value.find(c => c.column_name === colName)
}

function onColumnChange(i: number, colName: string) {
  const col = colInfo(colName)
  const cur = localFilters.value[i]!
  localFilters.value[i] = { column: colName, operator: cur.operator ?? '=', value: '', type: col ? getFilterType(col.column_type) : 'varchar' }
}

function setOperator(i: number, op: string) {
  const cur = localFilters.value[i]!
  localFilters.value[i] = { ...cur, operator: op as FilterCondition['operator'], value: noValueOps.includes(op) ? '' : cur.value }
}

function addFilter() {
  localFilters.value.push({ column: '', operator: '=', value: '', type: 'varchar' })
  whereExpanded.value = true
}

function removeFilter(i: number) { localFilters.value.splice(i, 1) }

// WHERE column dropdown
const openColIdx    = ref<number | null>(null)
const dropdownPos   = ref<{ top: number; left: number; width: number } | null>(null)
const whereColSearch = ref('')

function toggleColDropdown(i: number, e: MouseEvent) {
  if (openColIdx.value === i) { openColIdx.value = null; dropdownPos.value = null; whereColSearch.value = ''; return }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const dropdownH = 280
  const spaceBelow = window.innerHeight - rect.bottom
  const top = spaceBelow >= dropdownH + 8
    ? rect.bottom + 4
    : rect.top - dropdownH - 4
  dropdownPos.value = { top, left: rect.left, width: Math.max(rect.width, 280) }
  openColIdx.value  = i
  whereColSearch.value = ''
}
function closeDropdown() { openColIdx.value = null; dropdownPos.value = null; whereColSearch.value = '' }
function selectColumn(i: number, colName: string) { onColumnChange(i, colName); closeDropdown() }

const filteredWhereGroups = computed(() => {
  const q = whereColSearch.value.toLowerCase().trim()
  if (!q) return columnGroups.value
  return columnGroups.value
    .map(g => ({ ...g, cols: g.cols.filter(c => c.column_name.toLowerCase().includes(q) || (c.remark ?? '').toLowerCase().includes(q)) }))
    .filter(g => g.cols.length > 0)
})

// Date pickers
const dateInputRefs = ref<Map<number, HTMLInputElement>>(new Map())
function setDateInputRef(i: number, el: any) {
  if (el) dateInputRefs.value.set(i, el as HTMLInputElement)
  else dateInputRefs.value.delete(i)
}
function openDatePicker(i: number) {
  const input = dateInputRefs.value.get(i)
  if (!input) return
  try { input.showPicker() } catch { input.click() }
}

// ── Save & Close ──────────────────────────────────────────────────────────────
function save() {
  if (!store.filterNodeId) return
  for (const [nodeId, visibleCols] of localVisibleColsMap.value)
    store.updateNodeData(nodeId, { visibleCols })
  store.updateNodeData(store.filterNodeId, { filters: localFilters.value.filter(f => f.column && f.operator) })
  store.filterNodeId = null
}

function close() { store.filterNodeId = null }
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="store.filterNode"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="close"
      >
        <div
          class="bg-background rounded-2xl border shadow-2xl w-full max-w-3xl mx-4 flex flex-col overflow-hidden"
          style="max-height: 90vh"
          @click.stop
        >

          <!-- ── Header ──────────────────────────────────────────────────── -->
          <div class="flex items-center gap-3 px-5 py-4 border-b bg-sky-500/5 shrink-0">
            <div class="flex size-9 items-center justify-center rounded-lg bg-sky-500/15 border border-sky-500/25">
              <SlidersHorizontal class="size-5 text-sky-500" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-bold text-base">Select Fields</span>
                <span v-for="g in columnGroups" :key="g.table"
                  class="font-mono text-xs text-sky-600 bg-sky-500/10 px-2 py-0.5 rounded truncate max-w-[140px]"
                  :title="g.table">{{ g.table }}</span>
                <span v-if="totalSelected"
                  class="text-xs px-2 py-0.5 rounded-full bg-sky-500 text-white font-bold shrink-0">
                  {{ totalSelected }}
                </span>
              </div>
              <p class="text-xs text-muted-foreground mt-0.5">
                {{ availableColumns.length }} fields จาก {{ columnGroups.length }} table{{ columnGroups.length !== 1 ? 's' : '' }}
              </p>
            </div>
            <button @click="close"
              class="size-8 flex items-center justify-center rounded-lg hover:bg-accent text-muted-foreground transition-colors">
              <X class="size-5" />
            </button>
          </div>

          <!-- ── Search + global select ────────────────────────────────── -->
          <div class="px-4 py-3 border-b bg-muted/10 shrink-0 flex items-center gap-2">
            <div class="relative flex-1">
              <Search class="absolute left-3 size-4 text-muted-foreground/50 pointer-events-none top-1/2 -translate-y-1/2" />
              <input
                v-model="colSearch"
                placeholder="ค้นหา column…"
                class="w-full text-sm border rounded-xl pl-9 pr-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-sky-400/60 placeholder:text-muted-foreground/40"
              />
            </div>
            <div class="flex items-center gap-1.5 shrink-0 border-r border-border/40 pr-2.5">
              <button @click="toggleExpandAll"
                class="text-xs text-muted-foreground hover:text-foreground font-medium whitespace-nowrap transition-colors">
                {{ allExpanded ? 'Collapse' : 'Expand' }}
              </button>
            </div>
            <button @click="selectAllGroups"
              class="text-xs font-semibold text-sky-500 hover:underline shrink-0 whitespace-nowrap">
              ทั้งหมด
            </button>
            <span class="text-muted-foreground/40 text-xs">/</span>
            <button @click="clearAllGroups"
              class="text-xs text-muted-foreground hover:underline shrink-0 whitespace-nowrap">
              ล้างทั้งหมด
            </button>
          </div>

          <!-- ── Column picker body ─────────────────────────────────────── -->
          <div class="flex-1 overflow-y-auto min-h-0">

            <!-- Empty: no tables connected -->
            <div v-if="!columnGroups.length" class="flex flex-col items-center gap-3 py-10 text-center px-6">
              <div class="size-12 rounded-full bg-sky-500/10 flex items-center justify-center">
                <SlidersHorizontal class="size-5 text-sky-400" />
              </div>
              <p class="text-sm font-medium text-muted-foreground">ยังไม่มีตารางที่เชื่อมต่อ</p>
              <p class="text-xs text-muted-foreground/60">เชื่อม Table node เพื่อเลือก columns</p>
            </div>

            <!-- No match for search -->
            <div v-else-if="!filteredGroups.length" class="px-5 py-8 text-center text-[11px] text-muted-foreground italic">
              ไม่พบ "{{ colSearch }}"
            </div>

            <!-- Tree groups -->
            <div v-for="g in filteredGroups" :key="g.nodeId" class="mb-1">

              <!-- ── Group header (tree root) ─────────────────────────── -->
              <button
                @click.stop="toggleGroupExpanded(g.nodeId)"
                class="w-full flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted/80 transition-colors sticky top-0 z-10"
              >
                <ChevronRight :class="['size-3.5 text-muted-foreground transition-transform shrink-0', expandedGroups.has(g.nodeId) ? 'rotate-90' : '']" />
                <span class="font-mono text-xs font-bold text-foreground flex-1 truncate tracking-wide">{{ g.table }}</span>
                <span class="text-xs font-mono shrink-0">
                  <span :class="(localVisibleColsMap.get(g.nodeId)?.length ?? 0) ? 'text-sky-500 font-semibold' : 'text-muted-foreground/50'">
                    {{ localVisibleColsMap.get(g.nodeId)?.length ?? 0 }}</span><span class="text-muted-foreground/40">/{{ g.cols.length }}</span>
                </span>
                <button @click.stop="selectAllGroup(g.nodeId, g.cols)"
                  class="text-xs text-sky-500 hover:underline font-medium ml-2 shrink-0">ทั้งหมด</button>
                <span class="text-muted-foreground/40 text-xs">/</span>
                <button @click.stop="clearGroup(g.nodeId)"
                  class="text-xs text-muted-foreground hover:underline shrink-0">ล้าง</button>
              </button>

              <!-- ── Children (tree branches) ────────────────────────── -->
              <div v-if="expandedGroups.has(g.nodeId)" class="relative ml-4 border-l-2 border-border/30">
                <div
                  v-for="(col, idx) in g.cols" :key="`${g.nodeId}.${col.column_name}`"
                  @click.stop="toggleCol(g.nodeId, col)"
                  :class="[
                    'relative flex items-center gap-2.5 pr-4 py-2 cursor-pointer select-none transition-colors',
                    isVisible(g.nodeId, col.column_name)
                      ? 'bg-sky-500/10 hover:bg-sky-500/15'
                      : 'hover:bg-accent/50',
                  ]"
                >
                  <!-- Tree connector -->
                  <span class="flex items-center shrink-0 text-border/60 font-mono text-xs leading-none pl-2 select-none">
                    {{ idx === g.cols.length - 1 ? '└─' : '├─' }}
                  </span>

                  <!-- Checkbox -->
                  <div :class="[
                    'rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                    isVisible(g.nodeId, col.column_name)
                      ? 'bg-sky-500 border-sky-500'
                      : 'border-border/60 bg-background',
                  ]" style="width:16px;height:16px;min-width:16px">
                    <svg v-if="isVisible(g.nodeId, col.column_name)"
                      class="size-2 text-white" fill="none" viewBox="0 0 10 10">
                      <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                    </svg>
                  </div>

                  <!-- Type badge -->
                  <span :class="[
                    'text-xs px-1.5 py-0.5 rounded font-bold font-mono tracking-wide shrink-0',
                    getColTypeBadgeSolid(col.column_type).cls,
                  ]">{{ getColTypeBadgeSolid(col.column_type).label }}</span>

                  <!-- PK icon -->
                  <Key v-if="col.data_pk === 'Y'" class="size-3 text-amber-400 shrink-0" />

                  <!-- Remark (primary) + column_name (secondary) -->
                  <div class="flex-1 min-w-0 flex flex-col leading-tight gap-0.5">
                    <span class="text-sm font-medium truncate"
                      :class="col.data_pk === 'Y' ? 'text-amber-400 font-semibold' : ''">
                      {{ col.remark || col.column_name }}
                    </span>
                    <span class="font-mono text-xs text-muted-foreground/45 truncate">{{ col.column_name }}</span>
                  </div>

                  <!-- Alias input (when selected) -->
                  <input
                    v-if="isVisible(g.nodeId, col.column_name)"
                    :value="localVisibleColsMap.get(g.nodeId)?.find(v => v.name === col.column_name)?.alias ?? ''"
                    @input.stop="setColAlias(g.nodeId, col.column_name, ($event.target as HTMLInputElement).value)"
                    @click.stop
                    placeholder="AS…"
                    class="w-20 text-xs border rounded-lg px-2 py-1 bg-background font-mono focus:outline-none focus:ring-1 focus:ring-sky-400/60 text-sky-400 placeholder:text-muted-foreground/30"
                    :class="localVisibleColsMap.get(g.nodeId)?.find(v => v.name === col.column_name)?.alias ? 'border-sky-400/40' : 'border-border/40'"
                  />
                </div>
              </div>

            </div>
          </div>

          <!-- ── WHERE section (fixed, always visible, above footer) ──────── -->
          <div class="border-t border-amber-500/25 bg-amber-500/3 shrink-0">
            <!-- Toggle header -->
            <button
              @click="whereExpanded = !whereExpanded"
              class="w-full flex items-center gap-2.5 px-5 py-3 text-left hover:bg-amber-500/8 transition-colors"
            >
              <div class="flex size-6 items-center justify-center rounded-md bg-amber-500/20">
                <Filter class="size-3.5 text-amber-500" />
              </div>
              <span class="text-sm font-semibold text-amber-600 flex-1">WHERE Conditions</span>
              <span v-if="localFilters.filter(f => f.column).length"
                class="text-xs px-2 py-0.5 rounded-full bg-amber-500 text-white font-bold shrink-0">
                {{ localFilters.filter(f => f.column).length }}
              </span>
              <component :is="whereExpanded ? ChevronUp : ChevronDown" class="size-4 text-muted-foreground shrink-0" />
            </button>

            <!-- Expanded body (own scroll, capped height) -->
            <div v-if="whereExpanded" class="border-t border-amber-500/15 overflow-y-auto" style="max-height: 280px">
              <!-- Empty state -->
              <div v-if="!localFilters.length" class="px-5 py-5 text-center">
                <p class="text-sm text-muted-foreground/60 italic">ยังไม่มีเงื่อนไข WHERE</p>
              </div>

              <!-- Condition rows -->
              <div class="divide-y divide-amber-500/10">
                <div
                  v-for="(f, i) in localFilters"
                  :key="i"
                  class="px-5 py-3 flex flex-col gap-2"
                  :class="f.column ? 'bg-amber-500/5' : ''"
                >
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 flex-wrap">
                      Condition {{ i + 1 }}
                      <template v-if="f.column && colInfo(f.column)">
                        <span class="normal-case font-medium text-amber-600">— {{ colInfo(f.column)!.remark || f.column }}</span>
                        <span class="text-[10px] font-mono text-muted-foreground/50 bg-muted/60 px-1.5 py-0.5 rounded normal-case font-normal">{{ colInfo(f.column)!.table_label }}</span>
                      </template>
                    </span>
                    <button @click="removeFilter(i)"
                      class="size-6 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors">
                      <X class="size-3.5" />
                    </button>
                  </div>

                  <!-- Col dropdown + operator pills -->
                  <div class="flex items-start gap-2 flex-wrap">
                    <button
                      @click="toggleColDropdown(i, $event)"
                      :class="[
                        'flex items-center gap-2 text-xs border rounded-lg px-2.5 py-2 bg-background focus:outline-none text-left transition-colors',
                        f.column ? 'border-amber-400/40' : 'border-border hover:border-amber-400/30',
                        openColIdx === i ? 'ring-2 ring-amber-400/50 border-amber-400/40' : '',
                      ]"
                      style="min-width: 220px; max-width: 320px"
                    >
                      <template v-if="f.column && colInfo(f.column)">
                        <Key v-if="colInfo(f.column)!.data_pk === 'Y'" class="size-3 text-amber-400 shrink-0" />
                        <span :class="['text-[10px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadgeSolid(colInfo(f.column)!.column_type).cls]">
                          {{ getColTypeBadgeSolid(colInfo(f.column)!.column_type).label }}
                        </span>
                        <div class="flex-1 min-w-0 flex flex-col leading-tight gap-0.5">
                          <span class="text-xs font-medium truncate text-foreground">{{ colInfo(f.column)!.remark || f.column }}</span>
                          <div class="flex items-center gap-1.5">
                            <span v-if="colInfo(f.column)!.remark" class="font-mono text-[10px] text-muted-foreground/55 truncate">{{ f.column }}</span>
                            <span class="text-[9px] font-mono text-amber-600/80 bg-amber-500/10 px-1 py-px rounded shrink-0">{{ colInfo(f.column)!.table_label }}</span>
                          </div>
                        </div>
                      </template>
                      <span v-else class="text-muted-foreground flex-1 text-xs">— เลือก Column —</span>
                      <ChevronDown :class="['size-3 shrink-0 transition-transform text-muted-foreground ml-1', openColIdx === i ? 'rotate-180' : '']" />
                    </button>

                    <!-- Operator pills -->
                    <div class="flex items-center gap-1 flex-wrap">
                      <template v-for="group in OP_GROUPS" :key="group.label">
                        <div class="flex items-center rounded-lg border overflow-hidden">
                          <button
                            v-for="op in group.ops" :key="op.value"
                            @click="setOperator(i, op.value)"
                            :title="op.title"
                            :class="[
                              'text-xs px-2 py-1.5 font-mono font-semibold transition-colors border-r last:border-r-0 whitespace-nowrap',
                              f.operator === op.value
                                ? 'bg-amber-500 text-white'
                                : 'hover:bg-amber-500/10 text-muted-foreground hover:text-amber-600',
                            ]"
                          >{{ op.label }}</button>
                        </div>
                      </template>
                    </div>
                  </div>

                  <!-- Value input -->
                  <div v-if="!noValueOps.includes(f.operator)" class="flex items-center gap-2">
                    <div v-if="f.type === 'date'" class="flex-1 relative flex items-center">
                      <input
                        :ref="(el) => setDateInputRef(i, el)"
                        type="date"
                        :value="f.value"
                        @input="localFilters[i] = { ...f, value: ($event.target as HTMLInputElement).value }"
                        class="flex-1 text-xs border rounded-lg pl-3 pr-10 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-amber-400/50 font-mono"
                        :class="f.value ? 'border-amber-400/40' : ''"
                      />
                      <button @click="openDatePicker(i)" type="button"
                        class="absolute right-2 size-6 flex items-center justify-center rounded-md text-amber-500 hover:bg-amber-500/15 transition-colors">
                        <Calendar class="size-3.5" />
                      </button>
                    </div>
                    <input
                      v-else
                      :value="f.value"
                      @input="localFilters[i] = { ...f, value: ($event.target as HTMLInputElement).value }"
                      :placeholder="f.operator === 'IN' ? 'a, b, c' : f.operator === 'LIKE' ? '%keyword%' : 'ค่า...'"
                      :type="f.type === 'int' ? 'number' : 'text'"
                      class="flex-1 text-xs border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-amber-400/50 font-mono"
                      :class="f.value ? 'border-amber-400/40' : ''"
                    />
                    <span class="text-[10px] text-muted-foreground/50 shrink-0 font-mono">{{ f.type }}</span>
                  </div>
                  <div v-else class="flex items-center gap-1.5 px-3 py-1.5 bg-muted/30 rounded-lg">
                    <span class="text-xs text-muted-foreground italic">
                      {{ f.operator === 'IS NULL' ? 'ตรวจสอบว่าข้อมูลเป็น NULL' : 'ตรวจสอบว่าข้อมูลไม่เป็น NULL' }}
                      — ไม่ต้องระบุค่า
                    </span>
                  </div>
                </div>
              </div>

              <!-- Add condition button -->
              <div class="px-5 py-2.5 border-t border-amber-500/15 bg-background/50">
                <button
                  @click="addFilter"
                  class="w-full text-sm py-2 rounded-xl border border-dashed border-amber-500/40 text-amber-600 hover:bg-amber-500/8 font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <Plus class="size-4" /> เพิ่ม Condition
                </button>
              </div>
            </div>
          </div>

          <!-- ── Footer ─────────────────────────────────────────────────── -->
          <div class="px-5 py-3.5 flex items-center justify-between border-t shrink-0">
            <span class="text-sm text-muted-foreground">
              <span class="text-sky-500 font-semibold">{{ totalSelected }}</span> selected
              <span v-if="localFilters.filter(f => f.column).length" class="ml-2 text-amber-500 font-semibold">
                · {{ localFilters.filter(f => f.column).length }} WHERE
              </span>
            </span>
            <div class="flex gap-2">
              <button @click="close"
                class="text-sm px-5 py-2 border rounded-lg hover:bg-accent transition-colors">
                ยกเลิก
              </button>
              <button @click="save"
                class="text-sm px-6 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-semibold transition-colors flex items-center gap-2">
                <SlidersHorizontal class="size-4" />
                บันทึก
              </button>
            </div>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Click-outside trap for WHERE column dropdown -->
  <Teleport to="body">
    <div v-if="openColIdx !== null" class="fixed inset-0 z-[190]" @click="closeDropdown" />
  </Teleport>

  <!-- WHERE column dropdown (teleported to escape overflow) -->
  <Teleport to="body">
    <div
      v-if="openColIdx !== null && dropdownPos"
      class="fixed z-[200] bg-background border rounded-xl shadow-2xl flex flex-col"
      :style="{ top: dropdownPos.top + 'px', left: dropdownPos.left + 'px', width: dropdownPos.width + 'px', maxHeight: '280px' }"
      @click.stop
    >
      <div class="px-2.5 py-2 border-b shrink-0">
        <input
          v-model="whereColSearch"
          placeholder="ค้นหา column…"
          class="w-full text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-amber-400/60 placeholder:text-muted-foreground/40"
          @click.stop
        />
      </div>
      <div class="overflow-y-auto flex-1">
        <template v-if="filteredWhereGroups.length">
          <template v-for="group in filteredWhereGroups" :key="group.table">
            <div class="flex items-center gap-2 px-3 py-1.5 bg-muted border-b border-border/30 sticky top-0 z-10">
              <span class="text-[10px] font-bold uppercase tracking-wide text-muted-foreground font-mono flex-1 truncate">{{ group.table }}</span>
              <span class="text-[10px] font-mono text-muted-foreground/50 shrink-0">{{ group.cols.length }}</span>
            </div>
            <button
              v-for="c in group.cols" :key="`${group.table}.${c.column_name}`"
              @click="selectColumn(openColIdx!, c.column_name)"
              :class="[
                'w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-amber-500/8 transition-colors',
                localFilters[openColIdx!]?.column === c.column_name ? 'bg-amber-500/10' : '',
              ]"
            >
              <Key v-if="c.data_pk === 'Y'" class="size-2.5 text-amber-400 shrink-0" />
              <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadgeSolid(c.column_type).cls]">
                {{ getColTypeBadgeSolid(c.column_type).label }}
              </span>
              <div class="flex-1 min-w-0 flex flex-col leading-tight gap-0.5">
                <span :class="['text-xs font-medium truncate', c.data_pk === 'Y' ? 'text-amber-400 font-semibold' : '']">
                  {{ c.remark || c.column_name }}
                </span>
                <span v-if="c.remark" class="font-mono text-[10px] text-muted-foreground/55 truncate">{{ c.column_name }}</span>
              </div>
            </button>
          </template>
        </template>
        <div v-else class="px-3 py-4 text-[10px] text-muted-foreground italic text-center">
          {{ availableColumns.length ? `ไม่พบ "${whereColSearch}"` : 'ไม่พบ columns' }}
        </div>
      </div>
    </div>
  </Teleport>
</template>
