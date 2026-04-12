<script setup lang="ts">
/**
 * SQL Builder — Layers Panel
 * Floating overlay showing every node and its current operation summary.
 */
import {
  Database, Filter, Layers, X, GitBranch, Calculator,
  ArrowUpDown, Merge, Zap, Link2,
} from 'lucide-vue-next'
import { useVueFlow } from '@vue-flow/core'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { JOIN_COLORS } from '~/types/sql-builder'

const store = useSqlBuilderStore()
const { fitView } = useVueFlow('sql-builder')

// ── Visibility ────────────────────────────────────────────────────────────────
const show = defineModel<boolean>('show', { default: false })

// ── Tool icon + color map ────────────────────────────────────────────────────
const TOOL_META: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  cte:   { icon: GitBranch,      color: 'text-violet-500', bg: 'bg-violet-500/15',  label: 'CTE' },
  calc:  { icon: Calculator,     color: 'text-teal-500',   bg: 'bg-teal-500/15',    label: 'Calc' },
  group: { icon: Layers,         color: 'text-emerald-500',bg: 'bg-emerald-500/15', label: 'Group' },
  sort:  { icon: ArrowUpDown,    color: 'text-blue-500',   bg: 'bg-blue-500/15',    label: 'Sort' },
  union: { icon: Merge,          color: 'text-orange-500', bg: 'bg-orange-500/15',  label: 'Union' },
  where: { icon: Filter,         color: 'text-amber-500',  bg: 'bg-amber-500/15',   label: 'Where' },
}

// ── Node summary helpers ──────────────────────────────────────────────────────
interface Badge { text: string; cls: string }
interface NodeRow {
  id:     string
  icon:   any
  iconCls:string
  iconBg: string
  label:  string
  sub:    string
  badges: Badge[]
}

function summariseNode(n: any): NodeRow {
  if (n.type === 'sqlTable') {
    const cols    = (n.data.visibleCols ?? []).length
    const filters = (n.data.filters ?? []).filter((f: any) => f.column).length
    const badges: Badge[] = [
      cols
        ? { text: `${cols} cols`, cls: 'bg-sky-500/20 text-sky-400' }
        : { text: 'no cols',     cls: 'bg-muted/60 text-muted-foreground' },
      ...(filters ? [{ text: `${filters} WHERE`, cls: 'bg-amber-500/20 text-amber-400' }] : []),
    ]
    return {
      id: n.id, icon: Database, iconCls: 'text-sky-400', iconBg: 'bg-sky-500/15',
      label: n.data.label ?? n.id,
      sub: n.data.module ?? '',
      badges,
    }
  }

  if (n.type === 'toolNode') {
    const d    = n.data ?? {}
    const tool = TOOL_META[d.nodeType ?? d._toolId] ?? { icon: Zap, color: 'text-muted-foreground', bg: 'bg-muted/40', label: '?' }
    const badges: Badge[] = []

    if (d.nodeType === 'group') {
      if (d.groupCols?.length) badges.push({ text: `GROUP ${d.groupCols.length}`, cls: 'bg-emerald-500/20 text-emerald-400' })
      if (d.aggs?.length)      badges.push({ text: `AGG ${d.aggs.length}`,        cls: 'bg-teal-500/20 text-teal-400' })
      if (d.filters?.length)   badges.push({ text: `HAVING ${d.filters.length}`,  cls: 'bg-amber-500/20 text-amber-400' })
    } else if (d.nodeType === 'sort') {
      if (d.items?.length)     badges.push({ text: `SORT ${d.items.length}`, cls: 'bg-blue-500/20 text-blue-400' })
    } else if (d.nodeType === 'calc') {
      if (d.items?.length)     badges.push({ text: `${d.items.length} expr`, cls: 'bg-teal-500/20 text-teal-400' })
    } else if (d.nodeType === 'cte') {
      if (d.name)              badges.push({ text: d.name, cls: 'bg-violet-500/20 text-violet-400' })
      if (d.conditions?.length) badges.push({ text: `${d.conditions.length} WHERE`, cls: 'bg-amber-500/20 text-amber-400' })
    } else if (d.nodeType === 'union') {
      badges.push({ text: d.unionType ?? 'UNION ALL', cls: 'bg-orange-500/20 text-orange-400' })
      if (d.conditions?.length) badges.push({ text: `${d.conditions.length} WHERE`, cls: 'bg-amber-500/20 text-amber-400' })
    } else if (d.nodeType === 'where') {
      const active = (d.conditions ?? []).filter((c: any) => c.column).length
      badges.push({ text: `${active} cond`, cls: active ? 'bg-amber-500/20 text-amber-400' : 'bg-muted/60 text-muted-foreground' })
    }

    if (!badges.length) badges.push({ text: 'ยังไม่ได้ตั้งค่า', cls: 'bg-muted/60 text-muted-foreground' })

    return {
      id: n.id, icon: tool.icon, iconCls: tool.color, iconBg: tool.bg,
      label: tool.label,
      sub: d.name ?? '',
      badges,
    }
  }

  if (n.type === 'cteFrame') {
    return {
      id: n.id, icon: GitBranch, iconCls: 'text-violet-400', iconBg: 'bg-violet-500/15',
      label: n.data.label ?? 'CTE Frame',
      sub: '',
      badges: [{ text: 'frame', cls: 'bg-violet-500/20 text-violet-400' }],
    }
  }

  return { id: n.id, icon: Zap, iconCls: 'text-muted-foreground', iconBg: 'bg-muted/30', label: n.id, sub: '', badges: [] }
}

const tableRows = computed(() => store.nodes.filter((n: any) => n.type === 'sqlTable').map(summariseNode))
const toolRows  = computed(() => store.nodes.filter((n: any) => n.type !== 'sqlTable').map(summariseNode))

// ── Edge rows ─────────────────────────────────────────────────────────────────
interface EdgeRow {
  id:        string
  srcLabel:  string
  tgtLabel:  string
  joinType:  string
  isTool:    boolean
  joinCls:   string
}

const edgeRows = computed((): EdgeRow[] =>
  store.edges.map((e: any) => {
    const src = store.nodes.find((n: any) => n.id === e.source)
    const tgt = store.nodes.find((n: any) => n.id === e.target)
    const joinType = e.data?.joinType ?? 'LEFT JOIN'
    const isTool   = !!e.data?.isTool
    return {
      id:       e.id,
      srcLabel: src?.data?.label ?? e.source,
      tgtLabel: tgt?.data?.label ?? tgt?.data?.nodeType ?? e.target,
      joinType,
      isTool,
      joinCls:  isTool
        ? 'bg-muted/40 text-muted-foreground'
        : (JOIN_COLORS[joinType as keyof typeof JOIN_COLORS] ?? 'bg-muted/40 text-muted-foreground'),
    }
  })
)

// ── Focus node on click ───────────────────────────────────────────────────────
function focusNode(id: string) {
  store.selectedNodeId = id
  fitView({ nodes: [id], duration: 300, padding: 0.3 })
}

// ── Open relation modal on edge click ─────────────────────────────────────────
function focusEdge(edge: EdgeRow) {
  if (!edge.isTool) store.relationEdgeId = edge.id
}
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    enter-from-class="opacity-0 translate-x-4"
    enter-to-class="opacity-100 translate-x-0"
    leave-active-class="transition-all duration-150 ease-in"
    leave-from-class="opacity-100 translate-x-0"
    leave-to-class="opacity-0 translate-x-4"
  >
    <div
      v-if="show"
      class="absolute top-3 right-3 z-20 w-64 flex flex-col bg-background border rounded-xl shadow-2xl overflow-hidden"
      style="max-height: calc(100% - 24px)"
    >
      <!-- Header -->
      <div class="flex items-center gap-2 px-3 py-2.5 border-b bg-muted/30 shrink-0">
        <Layers class="size-4 text-muted-foreground" />
        <span class="text-sm font-semibold flex-1">Layers</span>
        <span class="text-xs text-muted-foreground font-mono">{{ store.nodes.length }}</span>
        <button @click="show = false"
          class="size-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground transition-colors">
          <X class="size-3.5" />
        </button>
      </div>

      <!-- Scrollable body -->
      <div class="flex-1 overflow-y-auto min-h-0 py-1">

        <!-- Tables -->
        <div v-if="tableRows.length">
          <div class="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
            Tables ({{ tableRows.length }})
          </div>
          <button
            v-for="row in tableRows" :key="row.id"
            @click="focusNode(row.id)"
            :class="[
              'w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-accent/50 transition-colors',
              store.selectedNodeId === row.id ? 'bg-sky-500/8 border-l-2 border-sky-500' : 'border-l-2 border-transparent',
            ]"
          >
            <div :class="['flex size-6 items-center justify-center rounded-md shrink-0 mt-0.5', row.iconBg]">
              <component :is="row.icon" :class="['size-3.5', row.iconCls]" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-semibold truncate leading-tight">{{ row.label }}</p>
              <p v-if="row.sub" class="text-[10px] text-muted-foreground/60 truncate">{{ row.sub }}</p>
              <div class="flex flex-wrap gap-1 mt-1">
                <span v-for="b in row.badges" :key="b.text"
                  :class="['text-[10px] px-1.5 py-px rounded font-semibold', b.cls]">
                  {{ b.text }}
                </span>
              </div>
            </div>
          </button>
        </div>

        <!-- Divider -->
        <div v-if="tableRows.length && toolRows.length" class="my-1 border-t border-border/30 mx-3" />

        <!-- Tools -->
        <div v-if="toolRows.length">
          <div class="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
            Tools ({{ toolRows.length }})
          </div>
          <button
            v-for="row in toolRows" :key="row.id"
            @click="focusNode(row.id)"
            :class="[
              'w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-accent/50 transition-colors',
              store.selectedNodeId === row.id ? 'bg-sky-500/8 border-l-2 border-sky-500' : 'border-l-2 border-transparent',
            ]"
          >
            <div :class="['flex size-6 items-center justify-center rounded-md shrink-0 mt-0.5', row.iconBg]">
              <component :is="row.icon" :class="['size-3.5', row.iconCls]" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <p class="text-xs font-semibold truncate leading-tight">{{ row.label }}</p>
                <span v-if="row.sub" class="text-[10px] font-mono text-muted-foreground/60 truncate">{{ row.sub }}</span>
              </div>
              <div class="flex flex-wrap gap-1 mt-1">
                <span v-for="b in row.badges" :key="b.text"
                  :class="['text-[10px] px-1.5 py-px rounded font-semibold', b.cls]">
                  {{ b.text }}
                </span>
              </div>
            </div>
          </button>
        </div>

        <!-- Divider -->
        <div v-if="toolRows.length && edgeRows.length" class="my-1 border-t border-border/30 mx-3" />
        <div v-else-if="tableRows.length && edgeRows.length && !toolRows.length" class="my-1 border-t border-border/30 mx-3" />

        <!-- Relations -->
        <div v-if="edgeRows.length">
          <div class="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
            Relations ({{ edgeRows.length }})
          </div>
          <button
            v-for="edge in edgeRows" :key="edge.id"
            @click="focusEdge(edge)"
            :class="[
              'w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors',
              edge.isTool ? 'opacity-50 cursor-default' : 'hover:bg-accent/50 cursor-pointer',
            ]"
          >
            <!-- Icon -->
            <div class="flex size-6 items-center justify-center rounded-md shrink-0 bg-muted/40">
              <Link2 class="size-3.5 text-muted-foreground" />
            </div>
            <!-- Labels -->
            <div class="flex-1 min-w-0 flex flex-col leading-tight gap-0.5">
              <div class="flex items-center gap-1 text-xs font-mono truncate">
                <span class="truncate text-foreground/80 max-w-[70px]">{{ edge.srcLabel }}</span>
                <span class="text-muted-foreground/40 shrink-0">→</span>
                <span class="truncate text-foreground/80 max-w-[70px]">{{ edge.tgtLabel }}</span>
              </div>
            </div>
            <!-- JOIN type badge -->
            <span :class="['text-[10px] px-1.5 py-px rounded font-bold font-mono shrink-0', edge.joinCls]">
              {{ edge.isTool ? 'pipe' : edge.joinType.replace(' JOIN', '') }}
            </span>
          </button>
        </div>

        <!-- Empty state -->
        <div v-if="!store.nodes.length" class="px-4 py-8 text-center">
          <Layers class="size-8 text-muted-foreground/30 mx-auto mb-2" />
          <p class="text-xs text-muted-foreground/50">ยังไม่มี node บน Canvas</p>
        </div>

      </div>
    </div>
  </Transition>
</template>
