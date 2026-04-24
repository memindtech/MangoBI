<script setup lang="ts">
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { Database, X, Filter, ChevronDown, ChevronUp, Key, SlidersHorizontal, Network } from 'lucide-vue-next'
import type { VisibleCol } from '~/types/sql-builder'
import { getColTypeBadgeSolid } from '~/types/sql-builder'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { objectTypeColor } from '~/composables/sql-builder/useErpData'
import { useDragDrop } from '~/composables/sql-builder/useDragDrop'

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected?: boolean
}>()

const store    = useSqlBuilderStore()
const dragDrop = useDragDrop()
const { updateNodeInternals } = useVueFlow()

// Re-measure handle positions after this node is fully rendered
onMounted(() => nextTick(() => updateNodeInternals([props.id])))

const expanding = ref(false)

async function expandRelations() {
  expanding.value = true
  try {
    await dragDrop.expandNodeRelations(props.id)
  } finally {
    expanding.value = false
  }
}

const expanded    = ref(false)
const details     = computed(() => props.data.details ?? [])
const visibleCols = computed((): VisibleCol[] => props.data.visibleCols ?? [])
const filters     = computed(() => props.data.filters ?? [])
const hasFilters  = computed(() => filters.value.length > 0)

// O(1) lookup instead of O(N) .some() called per column per render
const visibleColSet = computed(() => new Set(visibleCols.value.map((v: VisibleCol) => v.name)))
function isVisible(colName: string): boolean {
  return visibleColSet.value.has(colName)
}

// Pre-compute badge counts once instead of .filter() per badge per render
const BADGE_TYPES = ['NUM', 'DATE', 'TXT', 'BIT', 'BIN'] as const
const typeCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const col of details.value) {
    const label = getColTypeBadgeSolid(col.column_type).label
    counts[label] = (counts[label] ?? 0) + 1
  }
  return counts
})

function toggleCol(colName: string) {
  const current = [...visibleCols.value]
  const idx = current.findIndex((v: VisibleCol) => v.name === colName)
  if (idx >= 0) {
    current.splice(idx, 1)
  } else {
    const col = details.value.find((c: any) => c.column_name === colName)
    if (col) {
      current.push({
        name:   col.column_name,
        type:   col.column_type || col.data_type,
        remark: col.remark,
        isPk:   col.data_pk === 'Y',
        alias:  '',
      } as VisibleCol)
    }
  }
  store.updateNodeData(props.id, { visibleCols: current })
}

function setColAlias(colName: string, alias: string) {
  const current = visibleCols.value.map((v: VisibleCol) =>
    v.name === colName ? { ...v, alias } : v
  )
  store.updateNodeData(props.id, { visibleCols: current })
}

function removeNode() {
  store.removeNode(props.id)
}

function selectAll() {
  store.updateNodeData(props.id, {
    visibleCols: details.value.map((c: any) => ({
      name:   c.column_name,
      type:   c.column_type || c.data_type,
      remark: c.remark,
      isPk:   c.data_pk === 'Y',
      alias:  '',
    } as VisibleCol)),
  })
}

function clearAll() {
  store.updateNodeData(props.id, { visibleCols: [] })
}

// Detect if this table is currently inside a cteFrame (bounds-based, mirrors CteFrameNode logic)
const parentCteFrame = computed(() => {
  const me = store.nodes.find((n: any) => n.id === props.id) as any
  if (!me) return null
  const cx = me.position.x + 112
  const cy = me.position.y + 80
  return (store.nodes as any[]).find((n: any) => {
    if (n.type !== 'cteFrame') return false
    const fw = parseFloat(String(n.style?.width  ?? '420'))
    const fh = parseFloat(String(n.style?.height ?? '280'))
    return cx >= n.position.x && cx <= n.position.x + fw &&
           cy >= n.position.y && cy <= n.position.y + fh
  }) ?? null
})

const TOOL_BADGE_META: Record<string, { color: string; label: string }> = {
  cte:   { color: '#8b5cf6', label: 'CTE'      },
  calc:  { color: '#14b8a6', label: 'CALC'     },
  group: { color: '#f97316', label: 'GROUP BY' },
  sort:  { color: '#22c55e', label: 'ORDER BY' },
  union: { color: '#eab308', label: 'UNION'    },
  where: { color: '#f43f5e', label: 'WHERE'    },
}

const connectedTools = computed(() => {
  const seen = new Set<string>()
  const result: Array<{ id: string; label: string; color: string }> = []
  for (const edge of store.edges as any[]) {
    if (edge.source === props.id && edge.data?.isTool) {
      let toolId = edge.data?.tgtToolId as string | undefined
      if (!toolId) {
        const tgtNode = store.nodes.find((n: any) => n.id === edge.target) as any
        toolId = tgtNode?.data?._toolId
      }
      if (toolId && !seen.has(toolId)) {
        seen.add(toolId)
        const meta = TOOL_BADGE_META[toolId] ?? { color: '#94a3b8', label: toolId.toUpperCase() }
        result.push({ id: toolId, ...meta })
      }
    }
  }
  return result
})
</script>

<template>
  <!-- Handles sit OUTSIDE overflow-hidden so they are never clipped -->
  <div class="relative nowheel" style="min-width:220px;max-width:300px">
    <Handle
      type="target" :position="Position.Left"
      class="!bg-sky-400 !w-3 !h-3 !border-2 !border-background !rounded-full"
    />
    <Handle
      type="source" :position="Position.Right"
      class="!bg-sky-400 !w-3 !h-3 !border-2 !border-background !rounded-full"
    />

    <!-- Card -->
    <div :class="[
        'rounded-xl border-2 shadow-lg overflow-hidden bg-card transition-all duration-150',
        props.selected
          ? 'border-sky-400 shadow-sky-500/30 shadow-xl ring-2 ring-sky-400/30'
          : 'border-sky-500/40 hover:border-sky-500/70',
      ]"
    >

      <!-- ── Header ─────────────────────────────────────────── -->
      <div class="flex items-center gap-2 px-3 py-2 bg-sky-500/10 border-b border-sky-500/20">
        <Database class="size-3.5 text-sky-400 shrink-0" />
        <div class="flex-1 min-w-0">
          <p class="text-[11px] font-semibold text-foreground truncate leading-tight">{{ data.label }}</p>
          <p v-if="data.tableName !== data.label" class="text-[9px] text-sky-400/60 font-mono truncate leading-tight">
            {{ data.tableName }}
          </p>
        </div>
        <button @click.stop="removeNode"
          class="size-5 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0">
          <X class="size-3" />
        </button>
      </div>

      <!-- ── Meta row ────────────────────────────────────────── -->
      <div class="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/40 bg-muted/30">
        <span :class="['text-[9px] px-1.5 py-0.5 rounded-md font-bold font-mono shrink-0', objectTypeColor(data.type)]">
          {{ data.ttype ?? data.type }}
        </span>
        <span class="text-[10px] text-muted-foreground truncate flex-1">{{ data.module }}</span>

        <!-- Column count badge -->
        <span v-if="visibleCols.length" class="text-[9px] px-1.5 py-0.5 bg-sky-500/15 text-sky-500 rounded-full font-semibold shrink-0">
          {{ visibleCols.length }}
        </span>
        <!-- Header badge -->
        <span v-if="data.isHeaderNode" class="text-[8px] px-1 py-0.5 bg-emerald-500/20 text-emerald-600 rounded font-bold shrink-0">H</span>
        <!-- CTE frame membership badge -->
        <span v-if="parentCteFrame"
          class="text-[8px] px-1.5 py-0.5 bg-violet-500/20 text-violet-400 rounded font-bold shrink-0 border border-violet-500/30"
          :title="`อยู่ใน CTE: ${parentCteFrame.data?.name ?? 'my_cte'}`">
          CTE
        </span>

        <!-- Expand related tables button -->
        <button
          @click.stop="expandRelations"
          :disabled="expanding"
          class="size-5 flex items-center justify-center rounded transition-colors shrink-0 text-muted-foreground hover:bg-violet-500/15 hover:text-violet-500 disabled:opacity-40"
          title="โหลดตารางที่เกี่ยวข้อง"
        >
          <div v-if="expanding" class="size-3 rounded-full border border-muted-foreground/30 border-t-violet-400 animate-spin" />
          <Network v-else class="size-3" />
        </button>

        <!-- Filter button -->
        <button @click.stop="store.filterNodeId = props.id"
          :class="['size-5 flex items-center justify-center rounded transition-colors shrink-0',
            filters.length
              ? 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground']"
          :title="filters.length ? `${filters.length} filter(s)` : 'Add filter'">
          <SlidersHorizontal class="size-3" />
        </button>
        <span v-if="hasFilters" title="มี filter">
          <Filter class="size-3 text-amber-400 shrink-0" />
        </span>

        <!-- Expand toggle -->
        <button v-if="details.length" @click.stop="expanded = !expanded"
          class="size-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <component :is="expanded ? ChevronUp : ChevronDown" class="size-3" />
        </button>
      </div>

      <!-- ── Column list (expandable) ────────────────────────── -->
      <Transition
        enter-active-class="transition-all duration-150 ease-out"
        enter-from-class="opacity-0 max-h-0"
        enter-to-class="opacity-100 max-h-[220px]"
        leave-active-class="transition-all duration-100 ease-in"
        leave-from-class="opacity-100 max-h-[220px]"
        leave-to-class="opacity-0 max-h-0"
      >
        <div v-if="expanded && details.length" class="overflow-hidden">
          <!-- Select all / clear -->
          <div class="flex items-center gap-2 px-3 py-1 border-b border-border/30 bg-muted/20">
            <button @click.stop="selectAll" class="text-[9px] text-sky-500 hover:underline font-medium">ทั้งหมด</button>
            <span class="text-muted-foreground text-[9px]">/</span>
            <button @click.stop="clearAll" class="text-[9px] text-muted-foreground hover:underline">ล้าง</button>
          </div>

          <div class="max-h-[220px] overflow-y-auto">
            <div
              v-for="col in details" :key="col.column_name"
              @click.stop="toggleCol(col.column_name)"
              :class="[
                'flex items-center gap-2 px-2.5 py-1.5 cursor-pointer select-none transition-colors',
                isVisible(col.column_name)
                  ? 'bg-sky-500/10 hover:bg-sky-500/15'
                  : 'hover:bg-accent/60',
              ]"
            >
              <!-- Checkbox -->
              <div :class="[
                'size-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                isVisible(col.column_name)
                  ? 'bg-sky-500 border-sky-500'
                  : 'border-border/60 bg-background',
              ]">
                <svg v-if="isVisible(col.column_name)"
                  class="size-2 text-white" fill="none" viewBox="0 0 10 10">
                  <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </div>

              <!-- PK icon -->
              <Key v-if="col.data_pk === 'Y'" class="size-2.5 text-amber-400 shrink-0" />

              <!-- Column name + remark -->
              <div class="flex-1 min-w-0 flex flex-col leading-none gap-0.5">
                <span class="font-mono text-[10px] truncate"
                  :class="col.data_pk === 'Y' ? 'text-amber-400 font-semibold' : ''">
                  {{ col.column_name }}
                </span>
                <span v-if="col.remark" class="text-[8px] text-muted-foreground/60 truncate">
                  {{ col.remark }}
                </span>
              </div>

              <!-- Type badge — solid color -->
              <span :class="[
                'text-[9px] px-1.5 py-0.5 rounded font-bold font-mono tracking-wide shrink-0 leading-none',
                getColTypeBadgeSolid(col.column_type).cls,
              ]">
                {{ getColTypeBadgeSolid(col.column_type).label }}
              </span>

              <!-- Alias input (only when selected) -->
              <input
                v-if="isVisible(col.column_name)"
                :value="visibleCols.find((v: VisibleCol) => v.name === col.column_name)?.alias ?? ''"
                @input.stop="setColAlias(col.column_name, ($event.target as HTMLInputElement).value)"
                @click.stop
                placeholder="AS…"
                class="w-14 text-[9px] border rounded px-1.5 py-0.5 bg-background font-mono focus:outline-none focus:ring-1 focus:ring-sky-400/60 text-sky-400 placeholder:text-muted-foreground/30"
                :class="visibleCols.find((v: VisibleCol) => v.name === col.column_name)?.alias ? 'border-sky-400/40' : 'border-border/40'"
              />
            </div>
          </div>
        </div>
      </Transition>

      <!-- ── Collapsed summary ────────────────────────────────── -->
      <div v-if="!expanded && details.length" class="px-3 py-1.5 flex flex-col gap-1">
        <!-- Count + type breakdown row -->
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-[9px] text-muted-foreground shrink-0">
            <span :class="visibleCols.length ? 'text-sky-400 font-semibold' : 'text-muted-foreground/50'">
              {{ visibleCols.length }}</span>/{{ details.length }}
          </span>
          <template v-for="badge in BADGE_TYPES" :key="badge">
            <span v-if="typeCounts[badge]"
              :class="['text-[8px] px-1 py-0 rounded font-bold font-mono leading-4', getColTypeBadgeSolid(details.find((c: any) => getColTypeBadgeSolid(c.column_type).label === badge)?.column_type ?? '').cls]">
              {{ typeCounts[badge] }}{{ badge }}
            </span>
          </template>
        </div>
        <!-- Selected column pills -->
        <div v-if="visibleCols.length" class="flex flex-wrap gap-1">
          <span
            v-for="col in visibleCols.slice(0, 5)" :key="col.name"
            class="text-[9px] px-1.5 py-0 rounded-md bg-sky-500/15 text-sky-300 font-mono leading-5 shrink-0 max-w-[90px] truncate"
            :title="col.alias ? col.name + ' AS ' + col.alias : col.name"
          >{{ col.alias || col.name }}</span>
          <span v-if="visibleCols.length > 5" class="text-[8px] text-sky-400/50 font-mono leading-5 shrink-0">
            +{{ visibleCols.length - 5 }} more
          </span>
        </div>
      </div>

      <!-- ── Loading state ───────────────────────────────────── -->
      <div v-if="data.columnsLoading !== false && !details.length" class="px-3 py-2 text-[9px] text-muted-foreground/60 flex items-center gap-1.5">
        <div class="size-2 rounded-full border border-muted-foreground/30 border-t-sky-400 animate-spin" />
        Loading columns…
      </div>
      <div v-else-if="data.columnsLoading === false && !details.length" class="px-3 py-2 text-[9px] text-muted-foreground/60 italic">
        ไม่พบ columns
      </div>

      <!-- ── Connected tools ───────────────────────────────── -->
      <div v-if="connectedTools.length" class="flex flex-wrap gap-1 px-3 py-1.5 border-t border-border/30">
        <span
          v-for="tool in connectedTools" :key="tool.id"
          class="text-[8px] px-1.5 py-0.5 rounded-full font-bold font-mono leading-none"
          :style="{ backgroundColor: tool.color + '28', color: tool.color, border: `1px solid ${tool.color}55` }"
        >→ {{ tool.label }}</span>
      </div>
    </div>
  </div>
</template>
