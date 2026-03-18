<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { Shuffle, ChevronDown, Plus, X } from 'lucide-vue-next'

const { nodeEl, width, height, onDragStart, onDragStartHeight, onDragStartCorner } = useNodeResize(200)
const isSized = computed(() => height.value !== 'auto')

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected: boolean
  dragging?: boolean
}>()

const canvasStore = useCanvasStore()

type AggFn  = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'first' | 'none'
type FilterOp = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'not contains'

interface FilterRow {
  field: string
  op: FilterOp
  value: string
}

const AGG_OPTIONS: { value: AggFn; label: string }[] = [
  { value: 'sum',   label: 'Sum'   },
  { value: 'avg',   label: 'Avg'   },
  { value: 'count', label: 'Count' },
  { value: 'min',   label: 'Min'   },
  { value: 'max',   label: 'Max'   },
  { value: 'first', label: 'First' },
  { value: 'none',  label: 'ไม่รวม' },
]

const OP_OPTIONS: { value: FilterOp; label: string }[] = [
  { value: '=',           label: '='        },
  { value: '!=',          label: '≠'        },
  { value: '>',           label: '>'        },
  { value: '<',           label: '<'        },
  { value: '>=',          label: '≥'        },
  { value: '<=',          label: '≤'        },
  { value: 'contains',     label: 'มี'      },
  { value: 'not contains', label: 'ไม่มี'  },
]

// ── Input ────────────────────────────────────────────────────────
const inputRows       = computed<any[]>(() => canvasStore.nodeInputs[props.id] ?? [])
const columns         = computed(() => inputRows.value.length ? Object.keys(inputRows.value[0]) : [])
const colSearch       = ref('')
const filteredColumns = computed(() =>
  colSearch.value.trim()
    ? columns.value.filter(c => c.toLowerCase().includes(colSearch.value.toLowerCase()))
    : columns.value
)

// ── Filters ──────────────────────────────────────────────────────
const filters = ref<FilterRow[]>([])

function addFilter() {
  filters.value.push({ field: columns.value[0] ?? '', op: '=', value: '' })
}
function removeFilter(i: number) {
  filters.value.splice(i, 1)
}

function applyFilters(rows: any[]): any[] {
  return rows.filter(row => {
    return filters.value.every(f => {
      if (!f.field) return true
      const cell = row[f.field]
      const cellStr  = String(cell ?? '').toLowerCase()
      const valStr   = f.value.toLowerCase()
      const cellNum  = Number(cell)
      const valNum   = Number(f.value)
      switch (f.op) {
        case '=':           return String(cell ?? '') === f.value
        case '!=':          return String(cell ?? '') !== f.value
        case '>':           return cellNum > valNum
        case '<':           return cellNum < valNum
        case '>=':          return cellNum >= valNum
        case '<=':          return cellNum <= valNum
        case 'contains':     return cellStr.includes(valStr)
        case 'not contains': return !cellStr.includes(valStr)
        default:            return true
      }
    })
  })
}

// ── Group By / Aggregate ─────────────────────────────────────────
const groupByField = ref('')
const aggregations = ref<Record<string, AggFn>>({})

watch(columns, (cols) => {
  if (groupByField.value && !cols.includes(groupByField.value)) groupByField.value = ''
  for (const col of cols) {
    if (!(col in aggregations.value)) {
      const sample = inputRows.value[0]?.[col]
      aggregations.value[col] = typeof sample === 'number' ? 'sum' : 'first'
    }
  }
  // reset filter fields ที่ไม่มีอยู่แล้ว
  filters.value.forEach(f => { if (f.field && !cols.includes(f.field)) f.field = cols[0] ?? '' })
}, { immediate: true })

// ── Transform (debounced 80ms so drag frames don't trigger computation) ───────
let _transformTimer: ReturnType<typeof setTimeout> | null = null

function runTransform() {
  if (!inputRows.value.length) {
    canvasStore.setNodeOutput(props.id, [])
    return
  }

  const filtered = applyFilters(inputRows.value)

  if (!groupByField.value) {
    canvasStore.setNodeOutput(props.id, filtered)
    return
  }

  const grouped = new Map<string, any[]>()
  for (const row of filtered) {
    const key = String(row[groupByField.value] ?? '')
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(row)
  }

  const result = Array.from(grouped.entries()).map(([key, rows]) => {
    const out: Record<string, any> = { [groupByField.value]: key }
    for (const col of columns.value) {
      if (col === groupByField.value) continue
      const agg: AggFn = aggregations.value[col] ?? 'first'
      if (agg === 'none') continue
      const vals = rows.map(r => r[col])
      const nums = vals.map(v => Number(v) || 0)
      switch (agg) {
        case 'sum':   out[col] = nums.reduce((a, b) => a + b, 0); break
        case 'avg':   out[col] = nums.reduce((a, b) => a + b, 0) / nums.length; break
        case 'count': out[col] = rows.length; break
        case 'min':   out[col] = Math.min(...nums); break
        case 'max':   out[col] = Math.max(...nums); break
        case 'first': out[col] = vals[0]; break
      }
    }
    return out
  })

  canvasStore.setNodeOutput(props.id, result)
}

watch(
  [inputRows, filters, groupByField, aggregations],
  () => {
    if (_transformTimer) clearTimeout(_transformTimer)
    _transformTimer = setTimeout(runTransform, 80)
  },
  { deep: true, immediate: true },
)

onUnmounted(() => { if (_transformTimer) clearTimeout(_transformTimer) })

const outputRows = computed(() => canvasStore.nodeOutputs[props.id] ?? [])
</script>

<template>
  <div ref="nodeEl" class="relative" :style="{ width, height }">
  <div
    class="rounded-xl border-2 bg-background shadow-md transition-[border-color,box-shadow] overflow-hidden flex flex-col"
    style="will-change: transform;"
    :style="isSized ? { height: '100%' } : {}"
    :class="selected ? 'border-violet-400 shadow-lg' : 'border-border'"
    @wheel.stop
  >
    <!-- Header -->
    <div class="flex items-center gap-2 px-3 py-2 bg-violet-50 dark:bg-violet-950/30 rounded-t-xl border-b sticky top-0 z-10">
      <Shuffle class="size-4 text-violet-500 shrink-0" />
      <span class="text-xs font-semibold text-violet-700 dark:text-violet-400">Transform</span>
      <span v-if="outputRows.length" class="ml-auto text-[10px] text-violet-500 font-mono">
        {{ outputRows.length }} rows
      </span>
    </div>

    <!-- Drag placeholder -->
    <div v-if="dragging" class="px-3 py-4 text-center text-[10px] text-muted-foreground">
      {{ outputRows.length ? `${outputRows.length.toLocaleString()} rows out` : 'Transform' }}
    </div>

    <div v-else :class="['p-3 flex flex-col gap-2.5', isSized ? 'flex-1 min-h-0 overflow-y-auto nodrag' : '']">

      <!-- No input -->
      <div v-if="!columns.length" class="text-[10px] text-center text-muted-foreground py-2 border border-dashed rounded-lg">
        เชื่อมต่อ Data Source ก่อน
      </div>

      <template v-else>

        <!-- ── Column Search ── -->
        <div class="relative">
          <input
            v-model="colSearch"
            placeholder="ค้นหา column..."
            class="w-full text-[10px] border rounded-lg pl-2 pr-2 py-1 bg-background nodrag
                   focus:outline-none focus:ring-1 focus:ring-violet-400 placeholder:text-muted-foreground/60"
            @click.stop @mousedown.stop @keydown.stop
          />
          <span v-if="colSearch" class="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-violet-500 font-mono pointer-events-none">
            {{ filteredColumns.length }}/{{ columns.length }}
          </span>
        </div>

        <!-- ── Filter ── -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <p class="text-[10px] font-semibold text-muted-foreground">Filter</p>
            <button
              @click.stop="addFilter"
              class="flex items-center gap-0.5 text-[10px] text-violet-600 hover:text-violet-800 nodrag"
            >
              <Plus class="size-3" /> เพิ่ม
            </button>
          </div>
          <div class="space-y-1.5">
            <div
              v-for="(f, i) in filters" :key="i"
              class="flex items-center gap-1"
            >
              <!-- Field -->
              <select
                v-model="f.field"
                class="text-[10px] border rounded px-1 py-0.5 bg-background nodrag focus:outline-none focus:ring-1 focus:ring-violet-400 flex-1 min-w-0"
                @click.stop @mousedown.stop
              >
                <option v-for="col in filteredColumns" :key="col" :value="col">{{ col }}</option>
              </select>
              <!-- Operator -->
              <select
                v-model="f.op"
                class="text-[10px] border rounded px-1 py-0.5 bg-background nodrag focus:outline-none focus:ring-1 focus:ring-violet-400 w-10 shrink-0"
                @click.stop @mousedown.stop
              >
                <option v-for="opt in OP_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
              <!-- Value -->
              <input
                v-model="f.value"
                class="text-[10px] border rounded px-1 py-0.5 bg-background nodrag focus:outline-none focus:ring-1 focus:ring-violet-400 w-14 shrink-0"
                placeholder="ค่า"
                @click.stop @mousedown.stop @keydown.stop
              />
              <!-- Remove -->
              <button @click.stop="removeFilter(i)" class="text-muted-foreground hover:text-destructive nodrag shrink-0">
                <X class="size-3" />
              </button>
            </div>
          </div>
        </div>

        <!-- ── Group By ── -->
        <div>
          <p class="text-[10px] font-semibold text-muted-foreground mb-1">Group By</p>
          <div class="relative">
            <select
              v-model="groupByField"
              class="w-full text-xs border rounded-lg px-2 py-1.5 pr-6 bg-background nodrag
                     focus:outline-none focus:ring-1 focus:ring-violet-400 appearance-none"
              @click.stop @mousedown.stop
            >
              <option value="">(ไม่ Group)</option>
              <option v-for="col in filteredColumns" :key="col" :value="col">{{ col }}</option>
            </select>
            <ChevronDown class="absolute right-1.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        <!-- ── Aggregate ── -->
        <div v-if="groupByField">
          <p class="text-[10px] font-semibold text-muted-foreground mb-1">Aggregate</p>
          <div class="space-y-1 max-h-36 overflow-y-auto pr-0.5">
            <div
              v-for="col in filteredColumns.filter(c => c !== groupByField)"
              :key="col"
              class="flex items-center gap-1.5"
            >
              <span class="text-[10px] font-mono truncate flex-1 min-w-0 text-muted-foreground" :title="col">{{ col }}</span>
              <select
                v-model="aggregations[col]"
                class="text-[10px] border rounded px-1 py-0.5 bg-background nodrag
                       focus:outline-none focus:ring-1 focus:ring-violet-400 shrink-0 w-16"
                @click.stop @mousedown.stop
              >
                <option v-for="opt in AGG_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Output summary -->
        <div v-if="outputRows.length" class="rounded-lg bg-violet-50 dark:bg-violet-950/30 px-2.5 py-1.5">
          <p class="text-[10px] font-semibold text-violet-700 dark:text-violet-400">
            ✓ {{ outputRows.length }} rows · {{ Object.keys(outputRows[0] ?? {}).length }} cols
          </p>
        </div>

      </template>
    </div><!-- end v-else dragging -->

  </div><!-- end card -->

  <!-- Handles outside overflow-hidden -->
  <Handle id="in"  type="target" :position="Position.Left"
    style="left: -6px; width: 12px; height: 12px; background: #8b5cf6; border: 2px solid white;" />
  <Handle id="out" type="source" :position="Position.Right"
    style="right: -6px; width: 12px; height: 12px; background: #8b5cf6; border: 2px solid white;" />

  <!-- Bottom-edge resize -->
  <div
    class="absolute bottom-0 left-0 w-full h-2 cursor-ns-resize hover:bg-violet-400/40 rounded-b-xl nodrag z-10"
    @mousedown.stop="onDragStartHeight"
  />
  <!-- Corner resize -->
  <div
    class="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize nodrag z-20"
    @mousedown.stop="onDragStartCorner"
  />
  <!-- Right-edge resize strip -->
  <div
    class="absolute right-0 top-0 h-full w-2 cursor-ew-resize hover:bg-violet-400/40 rounded-r-xl nodrag z-10"
    @mousedown.stop="onDragStart"
  />
  </div><!-- end root -->
</template>
