<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import {
  Layers, Calculator, Database, SortAsc, GitMerge, Filter as FilterIcon,
  Settings2, X, ArrowUpDown,
} from 'lucide-vue-next'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { useToolNodes } from '~/composables/sql-builder/useToolNodes'

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected?: boolean
}>()

const store    = useSqlBuilderStore()
const toolNodes = useToolNodes()

const TOOL_ICONS: Record<string, any> = {
  cte:   Layers,
  calc:  Calculator,
  group: Database,
  sort:  SortAsc,
  union: GitMerge,
  where: FilterIcon,
}

const TOOL_META: Record<string, { label: string; color: string; bg: string; border: string; handleColor: string }> = {
  cte:   { label: 'CTE',      color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/50', handleColor: '!bg-violet-400' },
  calc:  { label: 'Calc',     color: 'text-teal-400',   bg: 'bg-teal-500/10',   border: 'border-teal-500/50',   handleColor: '!bg-teal-400'   },
  group: { label: 'GROUP BY', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/50', handleColor: '!bg-orange-400' },
  sort:  { label: 'ORDER BY', color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/50',  handleColor: '!bg-green-400'  },
  union: { label: 'UNION',    color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/50', handleColor: '!bg-yellow-400' },
  where: { label: 'WHERE',    color: 'text-rose-400',   bg: 'bg-rose-500/10',   border: 'border-rose-500/50',   handleColor: '!bg-rose-400'   },
}

const AGG_COLORS: Record<string, string> = {
  'SUM':            'bg-blue-500',
  'AVG':            'bg-cyan-500',
  'COUNT':          'bg-emerald-500',
  'COUNT DISTINCT': 'bg-teal-500',
  'MIN':            'bg-violet-500',
  'MAX':            'bg-rose-500',
}

const meta    = computed(() => (TOOL_META[props.data._toolId] ?? TOOL_META.cte) as NonNullable<typeof TOOL_META[string]>)
const icon    = computed(() => TOOL_ICONS[props.data._toolId] ?? Layers)
const summary = computed(() => toolNodes.toolNodeSummary(props.data))

// GROUP BY specific data
const groupCols    = computed(() => (props.data.groupCols ?? []).filter(Boolean) as string[])
const aggs         = computed(() => (props.data.aggs ?? []).filter((a: any) => a.col && a.func))
const groupFilters = computed(() => (props.data.filters ?? []).filter((f: any) => f.column && f.operator) as Array<{ column: string; operator: string; value: string }>)
const isGroup      = computed(() => props.data._toolId === 'group')

// ORDER BY specific data
const sortItems  = computed(() => (props.data.items ?? []).filter((s: any) => s.col) as Array<{ col: string; dir: 'ASC' | 'DESC' }>)
const isSort     = computed(() => props.data._toolId === 'sort')

// Calc specific data
const calcItems    = computed(() => (props.data.items ?? []).filter((c: any) => c.col && c.op) as Array<{ col: string; op: string; value: string; alias: string }>)
const calcFilters  = computed(() => (props.data.filters ?? []).filter((f: any) => f.column && f.operator) as Array<{ column: string; operator: string; value: string }>)
const isCalc       = computed(() => props.data._toolId === 'calc')

// WHERE specific data
const whereConds = computed(() => (props.data.conditions ?? []).filter((c: any) => c.column && c.operator) as Array<{ column: string; operator: string; value: string }>)
const isWhere    = computed(() => props.data._toolId === 'where')

// CTE specific data
const cteName     = computed(() => (props.data.name as string) || 'my_cte')
const cteSelCols  = computed(() => (props.data.selectedCols ?? []) as string[])
const cteConds    = computed(() => (props.data.conditions ?? []).filter((c: any) => c.column && c.operator) as Array<{ column: string; operator: string; value: string }>)
const isCte       = computed(() => props.data._toolId === 'cte')

const WHERE_OP_BADGE: Record<string, string> = {
  '=': 'bg-rose-500', '!=': 'bg-rose-600',
  '>': 'bg-sky-500', '<': 'bg-sky-500', '>=': 'bg-sky-600', '<=': 'bg-sky-600',
  'LIKE': 'bg-violet-500', 'IN': 'bg-violet-600',
  'IS NULL': 'bg-amber-500', 'IS NOT NULL': 'bg-amber-600',
}

const hasContent = computed(() => {
  if (isCte.value)   return true
  if (props.data._toolId === 'union') return true
  if (isGroup.value) return groupCols.value.length > 0 || aggs.value.length > 0 || groupFilters.value.length > 0
  if (isSort.value)  return sortItems.value.length > 0
  if (isCalc.value)  return calcItems.value.length > 0 || calcFilters.value.length > 0
  if (isWhere.value) return whereConds.value.length > 0
  return summary.value && summary.value !== 'ยังไม่ได้ตั้งค่า'
})

function openConfig() { store.modalNodeId = props.id }
function removeNode()  { store.removeNode(props.id) }
</script>

<template>
  <div class="relative nowheel" style="min-width:200px; max-width:280px">
    <Handle
      type="target" :position="Position.Left"
      :class="['!w-3 !h-3 !border-2 !border-background !rounded-full', meta.handleColor]"
    />
    <Handle
      type="source" :position="Position.Right"
      :class="['!w-3 !h-3 !border-2 !border-background !rounded-full', meta.handleColor]"
    />

    <!-- Card -->
    <div
      :class="[
        'rounded-xl border-2 shadow-lg overflow-hidden cursor-pointer transition-all',
        meta.border, meta.bg,
        props.selected ? 'shadow-xl ring-2 ring-offset-1 ring-offset-background ' + meta.border.replace('border-', 'ring-') : 'hover:shadow-xl',
      ]"
      @click.stop="openConfig"
    >
      <!-- Header -->
      <div :class="['flex items-center gap-2 px-3 py-2 border-b', meta.border]">
        <div :class="['size-5 flex items-center justify-center rounded-md shrink-0', meta.bg]">
          <component :is="icon" :class="['size-3', meta.color]" />
        </div>
        <span :class="['text-[11px] font-bold flex-1', meta.color]">{{ meta.label }}</span>
        <Settings2 :class="['size-3 opacity-50 shrink-0', meta.color]" />
        <button @click.stop="removeNode"
          class="size-5 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0 ml-0.5">
          <X class="size-3" />
        </button>
      </div>

      <!-- ── CTE rich summary ─────────────────────────────────────── -->
      <template v-if="isCte">
        <div class="px-3 py-2 flex flex-col gap-1.5">
          <!-- CTE name -->
          <div class="flex items-center gap-1.5">
            <span class="text-[8px] font-bold uppercase tracking-wider text-violet-400/70">WITH</span>
            <span class="text-[10px] font-mono font-semibold text-violet-300">{{ cteName }}</span>
            <span class="text-[8px] text-muted-foreground/50">AS (...)</span>
          </div>
          <!-- Selected cols pills -->
          <div v-if="cteSelCols.length">
            <p class="text-[8px] font-bold uppercase tracking-wider text-violet-400/60 mb-1">SELECT</p>
            <div class="flex flex-wrap gap-1">
              <span
                v-for="col in cteSelCols.slice(0, 4)" :key="col"
                class="text-[9px] px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-300 font-mono leading-none"
              >{{ col }}</span>
              <span v-if="cteSelCols.length > 4"
                class="text-[9px] px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-400/60 font-mono leading-none">
                +{{ cteSelCols.length - 4 }}
              </span>
            </div>
          </div>
          <p v-else class="text-[9px] text-muted-foreground/50 italic">SELECT *</p>
          <!-- WHERE conditions -->
          <div v-if="cteConds.length">
            <p class="text-[8px] font-bold uppercase tracking-wider text-rose-400/60 mb-1">WHERE</p>
            <div class="flex flex-col gap-1">
              <div v-for="(c, i) in cteConds.slice(0, 2)" :key="i" class="flex items-center gap-1.5">
                <span class="text-[9px] font-mono text-foreground/70 truncate flex-1">{{ c.column }}</span>
                <span :class="['text-[8px] px-1.5 py-0.5 rounded font-bold text-white leading-none shrink-0', WHERE_OP_BADGE[c.operator] ?? 'bg-rose-500']">{{ c.operator }}</span>
                <span v-if="!['IS NULL','IS NOT NULL'].includes(c.operator)" class="text-[8px] font-mono text-rose-300/70 truncate max-w-[50px]">{{ c.value || '?' }}</span>
              </div>
              <span v-if="cteConds.length > 2" class="text-[8px] text-muted-foreground/50">+{{ cteConds.length - 2 }} more</span>
            </div>
          </div>
        </div>
      </template>

      <!-- ── GROUP BY rich summary ─────────────────────────────────── -->
      <template v-else-if="isGroup">
        <div v-if="hasContent" class="px-3 py-2 flex flex-col gap-2">

          <!-- GROUP BY columns -->
          <div v-if="groupCols.length">
            <p class="text-[8px] font-bold uppercase tracking-wider text-orange-400/70 mb-1">GROUP BY</p>
            <div class="flex flex-wrap gap-1">
              <span
                v-for="col in groupCols.slice(0, 4)" :key="col"
                class="text-[9px] px-1.5 py-0.5 rounded-md bg-orange-500/15 text-orange-300 font-mono font-semibold leading-none"
              >{{ col }}</span>
              <span v-if="groupCols.length > 4"
                class="text-[9px] px-1.5 py-0.5 rounded-md bg-orange-500/10 text-orange-400/60 font-mono leading-none">
                +{{ groupCols.length - 4 }}
              </span>
            </div>
          </div>

          <!-- Aggregations -->
          <div v-if="aggs.length">
            <p class="text-[8px] font-bold uppercase tracking-wider text-orange-400/70 mb-1">AGGREGATE</p>
            <div class="flex flex-col gap-1">
              <div v-for="(agg, i) in aggs.slice(0, 3)" :key="i" class="flex items-center gap-1.5">
                <span class="text-[8px] px-1.5 py-0.5 rounded font-bold text-white leading-none shrink-0"
                  :class="AGG_COLORS[agg.func] ?? 'bg-orange-500'">{{ agg.func }}</span>
                <span class="text-[9px] font-mono text-foreground/70 truncate flex-1">{{ agg.col }}</span>
                <span v-if="agg.alias" class="text-[8px] text-orange-300/60 font-mono shrink-0">→{{ agg.alias }}</span>
              </div>
              <span v-if="aggs.length > 3" class="text-[8px] text-muted-foreground/50 pl-0.5">+{{ aggs.length - 3 }} more</span>
            </div>
          </div>

          <!-- HAVING filters -->
          <div v-if="groupFilters.length">
            <p class="text-[8px] font-bold uppercase tracking-wider text-amber-400/70 mb-1">HAVING</p>
            <div class="flex flex-col gap-1">
              <div v-for="(f, i) in groupFilters.slice(0, 3)" :key="'hf-' + i" class="flex items-center gap-1.5">
                <span class="text-[9px] font-mono text-foreground/70 truncate flex-1">{{ f.column }}</span>
                <span :class="['text-[8px] px-1.5 py-0.5 rounded font-bold text-white leading-none shrink-0', WHERE_OP_BADGE[f.operator] ?? 'bg-amber-500']">
                  {{ f.operator }}
                </span>
                <span class="text-[8px] font-mono text-amber-300/70 truncate max-w-[50px]">{{ f.value || '?' }}</span>
              </div>
              <span v-if="groupFilters.length > 3" class="text-[8px] text-muted-foreground/50 pl-0.5">+{{ groupFilters.length - 3 }} more</span>
            </div>
          </div>

        </div>
        <div v-else class="px-3 py-2">
          <p class="text-[10px] text-muted-foreground/60 italic">คลิกเพื่อตั้งค่า…</p>
        </div>
      </template>

      <!-- ── ORDER BY rich summary ────────────────────────────────── -->
      <template v-else-if="isSort">
        <div v-if="hasContent" class="px-3 py-2 flex flex-col gap-1">
          <p class="text-[8px] font-bold uppercase tracking-wider text-green-500/70 mb-0.5">ORDER BY</p>
          <div v-for="(s, i) in sortItems.slice(0, 4)" :key="i" class="flex items-center gap-1.5">
            <span :class="['text-[8px] px-1.5 py-0.5 rounded font-bold text-white leading-none shrink-0', s.dir === 'ASC' ? 'bg-green-500' : 'bg-rose-500']">{{ s.dir }}</span>
            <span class="text-[9px] font-mono text-foreground/70 truncate flex-1">{{ s.col }}</span>
          </div>
          <span v-if="sortItems.length > 4" class="text-[8px] text-muted-foreground/50">+{{ sortItems.length - 4 }} more</span>
        </div>
        <div v-else class="px-3 py-2">
          <p class="text-[10px] text-muted-foreground/60 italic">คลิกเพื่อตั้งค่า…</p>
        </div>
      </template>

      <!-- ── Calc rich summary ─────────────────────────────────────── -->
      <template v-else-if="isCalc">
        <div v-if="hasContent" class="px-3 py-2 flex flex-col gap-2">

          <!-- Calculated columns -->
          <div v-if="calcItems.length">
            <p class="text-[8px] font-bold uppercase tracking-wider text-teal-500/70 mb-1">CALCULATED</p>
            <div class="flex flex-col gap-1">
              <div v-for="(c, i) in calcItems.slice(0, 3)" :key="i" class="flex items-center gap-1.5">
                <span class="text-[8px] px-1.5 py-0.5 rounded font-bold text-white bg-teal-500 leading-none shrink-0">{{ c.op.replace('cast_', '').toUpperCase().substring(0, 6) }}</span>
                <span class="text-[9px] font-mono text-foreground/60 truncate flex-1">{{ c.col }}</span>
                <span v-if="c.alias" class="text-[8px] text-teal-300/70 font-mono shrink-0">→{{ c.alias }}</span>
              </div>
              <span v-if="calcItems.length > 3" class="text-[8px] text-muted-foreground/50">+{{ calcItems.length - 3 }} more</span>
            </div>
          </div>

          <!-- Filters -->
          <div v-if="calcFilters.length">
            <p class="text-[8px] font-bold uppercase tracking-wider text-rose-400/70 mb-1">WHERE</p>
            <div class="flex flex-col gap-1">
              <div v-for="(f, i) in calcFilters.slice(0, 3)" :key="'cf-' + i" class="flex items-center gap-1.5">
                <span class="text-[9px] font-mono text-foreground/70 truncate flex-1">{{ f.column }}</span>
                <span :class="['text-[8px] px-1.5 py-0.5 rounded font-bold text-white leading-none shrink-0', WHERE_OP_BADGE[f.operator] ?? 'bg-rose-500']">{{ f.operator }}</span>
                <span v-if="!['IS NULL','IS NOT NULL'].includes(f.operator)" class="text-[8px] font-mono text-rose-300/70 truncate max-w-[50px]">{{ f.value || '?' }}</span>
              </div>
              <span v-if="calcFilters.length > 3" class="text-[8px] text-muted-foreground/50">+{{ calcFilters.length - 3 }} more</span>
            </div>
          </div>

        </div>
        <div v-else class="px-3 py-2">
          <p class="text-[10px] text-muted-foreground/60 italic">คลิกเพื่อตั้งค่า…</p>
        </div>
      </template>

      <!-- ── WHERE rich summary ────────────────────────────────────── -->
      <template v-else-if="isWhere">
        <div v-if="hasContent" class="px-3 py-2 flex flex-col gap-1.5">
          <p class="text-[8px] font-bold uppercase tracking-wider text-rose-500/70 mb-0.5">WHERE</p>
          <div v-for="(c, i) in whereConds.slice(0, 4)" :key="i" class="flex items-center gap-1.5">
            <span class="text-[9px] font-mono text-foreground/70 truncate flex-1">{{ c.column }}</span>
            <span :class="['text-[8px] px-1.5 py-0.5 rounded font-bold text-white leading-none shrink-0', WHERE_OP_BADGE[c.operator] ?? 'bg-rose-500']">{{ c.operator }}</span>
            <span v-if="!['IS NULL','IS NOT NULL'].includes(c.operator)" class="text-[8px] font-mono text-rose-300/70 truncate max-w-[50px]">{{ c.value || '?' }}</span>
          </div>
          <span v-if="whereConds.length > 4" class="text-[8px] text-muted-foreground/50">+{{ whereConds.length - 4 }} more</span>
        </div>
        <div v-else class="px-3 py-2">
          <p class="text-[10px] text-muted-foreground/60 italic">คลิกเพื่อตั้งค่า…</p>
        </div>
      </template>

      <!-- ── UNION rich summary ────────────────────────────────── -->
      <template v-else-if="props.data._toolId === 'union'">
        <div class="px-3 py-2 flex flex-col gap-1.5">

          <!-- CTE name (if set) -->
          <div v-if="props.data.name" class="flex items-center gap-1.5">
            <span class="text-[8px] font-bold uppercase tracking-wider text-yellow-400/70">WITH</span>
            <span class="text-[10px] font-mono font-semibold text-yellow-300 truncate">{{ props.data.name }}</span>
            <span class="text-[8px] text-muted-foreground/50">AS (...)</span>
          </div>

          <!-- Union type + col count -->
          <div class="flex items-center gap-1.5">
            <span class="text-[9px] px-2 py-0.5 rounded-md font-bold bg-yellow-500/20 text-yellow-500 border border-yellow-500/30">
              {{ props.data.unionType ?? 'UNION ALL' }}
            </span>
            <span class="text-[9px] text-muted-foreground/60">
              {{ (props.data.selectedCols ?? []).length ? (props.data.selectedCols ?? []).length + ' cols' : 'SELECT *' }}
            </span>
          </div>

          <!-- Selected column pills -->
          <div v-if="(props.data.selectedCols ?? []).length" class="flex flex-wrap gap-1">
            <span
              v-for="col in (props.data.selectedCols as string[]).slice(0, 4)" :key="col"
              class="text-[9px] px-1.5 py-0 rounded-md bg-yellow-500/15 text-yellow-300 font-mono leading-5 shrink-0 max-w-[80px] truncate"
            >{{ col }}</span>
            <span v-if="(props.data.selectedCols as string[]).length > 4"
              class="text-[8px] text-yellow-400/50 font-mono leading-5">
              +{{ (props.data.selectedCols as string[]).length - 4 }}
            </span>
          </div>
          <p v-else class="text-[9px] text-muted-foreground/50 italic">SELECT *</p>

          <!-- WHERE conditions -->
          <div v-if="(props.data.conditions ?? []).filter((c: any) => c.column && c.operator).length">
            <p class="text-[8px] font-bold uppercase tracking-wider text-rose-400/60 mb-1">WHERE</p>
            <div class="flex flex-col gap-1">
              <div
                v-for="(c, i) in (props.data.conditions as Array<{column:string;operator:string;value:string}>)
                  .filter(c => c.column && c.operator).slice(0, 2)"
                :key="i"
                class="flex items-center gap-1.5"
              >
                <span class="text-[9px] font-mono text-foreground/70 truncate flex-1">{{ c.column }}</span>
                <span :class="['text-[8px] px-1.5 py-0.5 rounded font-bold text-white leading-none shrink-0', WHERE_OP_BADGE[c.operator] ?? 'bg-rose-500']">{{ c.operator }}</span>
                <span v-if="!['IS NULL','IS NOT NULL'].includes(c.operator)" class="text-[8px] font-mono text-rose-300/70 truncate max-w-[50px]">{{ c.value || '?' }}</span>
              </div>
              <span
                v-if="(props.data.conditions ?? []).filter((c: any) => c.column && c.operator).length > 2"
                class="text-[8px] text-muted-foreground/50"
              >+{{ (props.data.conditions ?? []).filter((c: any) => c.column && c.operator).length - 2 }} more</span>
            </div>
          </div>

        </div>
      </template>

      <!-- ── Generic summary (other tools) ───────────────────────── -->
      <template v-else>
        <div class="px-3 py-2">
          <p v-if="summary && summary !== 'ยังไม่ได้ตั้งค่า'"
            class="text-[10px] font-medium text-foreground/80 truncate">
            {{ summary }}
          </p>
          <p v-else class="text-[10px] text-muted-foreground/60 italic">คลิกเพื่อตั้งค่า…</p>
        </div>
      </template>

    </div>
  </div>
</template>
