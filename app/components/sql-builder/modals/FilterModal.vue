<script setup lang="ts">
import { X, Plus, SlidersHorizontal, Filter, ChevronDown, Key, Calendar } from 'lucide-vue-next'
import type { FilterCondition } from '~/types/sql-builder'
import { getFilterType, getColTypeBadge } from '~/types/sql-builder'
import { useSqlBuilderStore } from '~/stores/sql-builder'

const store = useSqlBuilderStore()

// Operator groups for display
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
    { value: 'IS NULL',     label: 'NULL',   title: 'ว่างเปล่า' },
    { value: 'IS NOT NULL', label: '!NULL',  title: 'ไม่ว่างเปล่า' },
  ]},
]

const localFilters = ref<FilterCondition[]>([])

watch(() => store.filterNode, (node) => {
  if (node) localFilters.value = JSON.parse(JSON.stringify(node.data.filters ?? []))
}, { immediate: true })

const availableColumns = computed(() =>
  (store.filterNode?.data?.details ?? []) as { column_name: string; column_type: string; data_pk?: string; remark?: string }[]
)

// Column info lookup
function colInfo(colName: string) {
  return availableColumns.value.find(c => c.column_name === colName)
}

function onColumnChange(i: number, colName: string) {
  const col = colInfo(colName)
  const cur = localFilters.value[i]!
  localFilters.value[i] = {
    column:   colName,
    operator: cur.operator ?? '=',
    value:    '',
    type:     col ? getFilterType(col.column_type) : 'varchar',
  }
}

function setOperator(i: number, op: string) {
  const cur = localFilters.value[i]!
  localFilters.value[i] = {
    ...cur,
    operator: op as FilterCondition['operator'],
    value: ['IS NULL', 'IS NOT NULL'].includes(op) ? '' : cur.value,
  }
}

function addFilter() {
  localFilters.value.push({ column: '', operator: '=', value: '', type: 'varchar' })
}

function removeFilter(i: number) {
  localFilters.value.splice(i, 1)
}

function save() {
  if (!store.filterNodeId) return
  store.updateNodeData(store.filterNodeId, {
    filters: localFilters.value.filter(f => f.column && f.operator),
  })
  store.filterNodeId = null
}

function close() { store.filterNodeId = null }

// No-value operators
const noValueOps = ['IS NULL', 'IS NOT NULL']

// Date input refs for showPicker()
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

// ── Custom column dropdown ───────────────────────────────────────────────────
const openColIdx   = ref<number | null>(null)
const dropdownPos  = ref<{ top: number; left: number; width: number } | null>(null)

function toggleColDropdown(i: number, e: MouseEvent) {
  if (openColIdx.value === i) {
    openColIdx.value = null
    dropdownPos.value = null
    return
  }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  dropdownPos.value = {
    top:   rect.bottom + 4,
    left:  rect.left,
    width: Math.max(rect.width, 260),
  }
  openColIdx.value = i
}

function closeDropdown() {
  openColIdx.value = null
  dropdownPos.value = null
}

function selectColumn(i: number, colName: string) {
  onColumnChange(i, colName)
  closeDropdown()
}
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
          class="bg-background rounded-2xl border shadow-2xl w-full max-w-2xl mx-4 flex flex-col overflow-hidden"
          style="max-height: 88vh"
          @click.stop
        >
          <!-- Header -->
          <div class="flex items-center gap-3 px-5 py-3.5 border-b bg-amber-500/8 shrink-0">
            <div class="flex size-8 items-center justify-center rounded-lg bg-amber-500/15 border border-amber-500/25">
              <SlidersHorizontal class="size-4 text-amber-500" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-bold text-sm">WHERE Filters</span>
                <span class="font-mono text-xs text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-md truncate">
                  {{ store.filterNode.data.tableName }}
                </span>
                <span v-if="localFilters.length"
                  class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500 text-white font-bold shrink-0">
                  {{ localFilters.length }}
                </span>
              </div>
              <p class="text-[10px] text-muted-foreground mt-0.5">
                กำหนดเงื่อนไขกรองข้อมูล (WHERE clause)
              </p>
            </div>
            <button @click="close"
              class="size-7 flex items-center justify-center rounded-lg hover:bg-accent text-muted-foreground transition-colors">
              <X class="size-4" />
            </button>
          </div>

          <!-- Column legend (type badges) -->
          <div class="px-5 py-2 border-b bg-muted/10 flex items-center gap-3 text-[10px] text-muted-foreground shrink-0 flex-wrap">
            <span class="font-semibold uppercase tracking-wide">ประเภทข้อมูล:</span>
            <span class="flex items-center gap-1"><span class="px-1.5 py-0.5 rounded font-bold bg-blue-500/20 text-blue-500 font-mono">NUM</span> ตัวเลข</span>
            <span class="flex items-center gap-1"><span class="px-1.5 py-0.5 rounded font-bold bg-amber-500/20 text-amber-600 font-mono">DATE</span> วันที่</span>
            <span class="flex items-center gap-1"><span class="px-1.5 py-0.5 rounded font-bold bg-emerald-500/20 text-emerald-600 font-mono">TXT</span> ข้อความ</span>
            <span class="flex items-center gap-1"><span class="px-1.5 py-0.5 rounded font-bold bg-violet-500/20 text-violet-500 font-mono">BIT</span> Boolean</span>
          </div>

          <!-- Filter list -->
          <div class="flex-1 overflow-y-auto">

            <!-- Empty state -->
            <div v-if="!localFilters.length" class="flex flex-col items-center gap-3 py-10 text-center px-6">
              <div class="size-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Filter class="size-5 text-amber-400" />
              </div>
              <div>
                <p class="text-sm font-medium text-muted-foreground">ยังไม่มีเงื่อนไข</p>
                <p class="text-xs text-muted-foreground/60 mt-0.5">กด "+ เพิ่ม Filter" เพื่อกรองข้อมูล</p>
              </div>
            </div>

            <!-- Filter rows -->
            <div class="divide-y divide-border/40">
              <div
                v-for="(f, i) in localFilters"
                :key="i"
                class="px-5 py-3 flex flex-col gap-2.5"
                :class="f.column ? 'bg-amber-500/3' : ''"
              >
                <!-- Row label + delete -->
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Condition {{ i + 1 }}
                    <span v-if="f.column" class="normal-case font-mono text-amber-600 ml-1">— {{ f.column }}</span>
                  </span>
                  <button @click="removeFilter(i)"
                    class="size-5 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors">
                    <X class="size-3.5" />
                  </button>
                </div>

                <!-- Main row: col dropdown | operator pills -->
                <div class="flex items-start gap-2 flex-wrap">

                  <!-- Custom column dropdown trigger -->
                  <button
                    @click="toggleColDropdown(i, $event)"
                    :class="[
                      'flex items-center gap-2 text-xs border rounded-lg px-2.5 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-amber-400/50 text-left transition-colors',
                      f.column ? 'border-amber-400/40' : 'border-border hover:border-amber-400/30',
                      openColIdx === i ? 'ring-2 ring-amber-400/50 border-amber-400/40' : '',
                    ]"
                    style="min-width: 200px; max-width: 260px"
                  >
                    <template v-if="f.column && colInfo(f.column)">
                      <Key v-if="colInfo(f.column)!.data_pk === 'Y'" class="size-3 text-amber-400 shrink-0" />
                      <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadge(colInfo(f.column)!.column_type).cls]">
                        {{ getColTypeBadge(colInfo(f.column)!.column_type).label }}
                      </span>
                      <span class="font-mono text-foreground flex-1 truncate text-[11px]">{{ f.column }}</span>
                    </template>
                    <span v-else class="text-muted-foreground flex-1 text-[11px]">— เลือก Column —</span>
                    <ChevronDown :class="['size-3 shrink-0 transition-transform text-muted-foreground', openColIdx === i ? 'rotate-180' : '']" />
                  </button>

                  <!-- Operator pill buttons -->
                  <div class="flex items-center gap-1 flex-wrap">
                    <template v-for="group in OP_GROUPS" :key="group.label">
                      <div class="flex items-center rounded-lg border overflow-hidden">
                        <button
                          v-for="op in group.ops"
                          :key="op.value"
                          @click="setOperator(i, op.value)"
                          :title="op.title"
                          :class="[
                            'text-[10px] px-2 py-1.5 font-mono font-semibold transition-colors border-r last:border-r-0 whitespace-nowrap',
                            f.operator === op.value
                              ? 'bg-amber-500 text-white'
                              : 'hover:bg-amber-500/10 text-muted-foreground hover:text-amber-600',
                          ]"
                        >
                          {{ op.label }}
                        </button>
                      </div>
                    </template>
                  </div>
                </div>

                <!-- Value input (hidden for IS NULL / IS NOT NULL) -->
                <div v-if="!noValueOps.includes(f.operator)" class="flex items-center gap-2">
                  <!-- Date input with calendar button -->
                  <div v-if="f.type === 'date'" class="flex-1 relative flex items-center">
                    <input
                      :ref="(el) => setDateInputRef(i, el)"
                      type="date"
                      :value="f.value"
                      @input="localFilters[i] = { ...f, value: ($event.target as HTMLInputElement).value }"
                      class="flex-1 text-xs border rounded-lg pl-3 pr-10 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-amber-400/50 font-mono"
                      :class="f.value ? 'border-amber-400/40' : ''"
                    />
                    <button
                      @click="openDatePicker(i)"
                      type="button"
                      class="absolute right-2 size-6 flex items-center justify-center rounded-md text-amber-500 hover:bg-amber-500/15 transition-colors"
                    >
                      <Calendar class="size-3.5" />
                    </button>
                  </div>
                  <!-- Non-date input -->
                  <input
                    v-else
                    :value="f.value"
                    @input="localFilters[i] = { ...f, value: ($event.target as HTMLInputElement).value }"
                    :placeholder="f.operator === 'IN' ? 'a, b, c' : f.operator === 'LIKE' ? '%keyword%' : 'ค่า...'"
                    :type="f.type === 'int' ? 'number' : 'text'"
                    class="flex-1 text-xs border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-amber-400/50 font-mono"
                    :class="f.value ? 'border-amber-400/40' : ''"
                  />
                  <span class="text-[9px] text-muted-foreground/50 shrink-0 font-mono">{{ f.type }}</span>
                </div>

                <!-- No-value hint -->
                <div v-else class="flex items-center gap-1.5 px-3 py-1.5 bg-muted/30 rounded-lg">
                  <span class="text-[10px] text-muted-foreground italic">
                    {{ f.operator === 'IS NULL' ? 'ตรวจสอบว่าข้อมูลเป็น NULL' : 'ตรวจสอบว่าข้อมูลไม่เป็น NULL' }}
                    — ไม่ต้องระบุค่า
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Add button -->
          <div class="px-5 py-2.5 border-t border-b bg-muted/5 shrink-0">
            <button
              @click="addFilter"
              class="w-full text-xs py-2 rounded-xl border border-dashed border-amber-500/40 text-amber-600 hover:bg-amber-500/8 font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus class="size-3.5" /> เพิ่ม Filter
            </button>
          </div>

          <!-- Footer -->
          <div class="px-5 py-3 flex items-center justify-between shrink-0">
            <span class="text-[10px] text-muted-foreground">
              {{ localFilters.filter(f => f.column && f.operator).length }} เงื่อนไขที่ใช้งาน
            </span>
            <div class="flex gap-2">
              <button @click="close"
                class="text-xs px-4 py-2 border rounded-lg hover:bg-accent transition-colors">
                ยกเลิก
              </button>
              <button @click="save"
                class="text-xs px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-semibold transition-colors flex items-center gap-1.5">
                <SlidersHorizontal class="size-3.5" />
                บันทึก WHERE
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Click-outside trap for column dropdown -->
  <Teleport to="body">
    <div v-if="openColIdx !== null" class="fixed inset-0 z-[190]" @click="closeDropdown" />
  </Teleport>

  <!-- Column dropdown list (teleported to escape overflow clipping) -->
  <Teleport to="body">
    <div
      v-if="openColIdx !== null && dropdownPos"
      class="fixed z-[200] bg-background border rounded-xl shadow-2xl overflow-hidden flex flex-col"
      :style="{
        top:      dropdownPos.top  + 'px',
        left:     dropdownPos.left + 'px',
        width:    dropdownPos.width + 'px',
        maxHeight: '260px',
      }"
      @click.stop
    >
      <div class="overflow-y-auto flex-1">
        <!-- PK group -->
        <template v-if="availableColumns.some(c => c.data_pk === 'Y')">
          <div class="px-3 py-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/40 sticky top-0 flex items-center gap-1.5">
            <Key class="size-2.5 text-amber-400" /> Primary Key
          </div>
          <button
            v-for="c in availableColumns.filter(c => c.data_pk === 'Y')"
            :key="c.column_name"
            @click="selectColumn(openColIdx!, c.column_name)"
            :class="[
              'w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-amber-500/8 transition-colors',
              localFilters[openColIdx!]?.column === c.column_name ? 'bg-amber-500/10' : '',
            ]"
          >
            <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadge(c.column_type).cls]">
              {{ getColTypeBadge(c.column_type).label }}
            </span>
            <div class="flex-1 min-w-0 flex flex-col leading-none gap-0.5">
              <span class="font-mono text-[11px] text-amber-500 font-semibold truncate">{{ c.column_name }}</span>
              <span v-if="c.remark" class="text-[9px] text-muted-foreground/55 truncate">{{ c.remark }}</span>
            </div>
            <span class="text-[9px] text-muted-foreground/40 font-mono shrink-0">{{ c.column_type }}</span>
          </button>
        </template>

        <!-- Regular columns -->
        <div class="px-3 py-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/40 sticky top-0">
          Columns
        </div>
        <button
          v-for="c in availableColumns.filter(c => c.data_pk !== 'Y')"
          :key="c.column_name"
          @click="selectColumn(openColIdx!, c.column_name)"
          :class="[
            'w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-accent/60 transition-colors',
            localFilters[openColIdx!]?.column === c.column_name ? 'bg-accent' : '',
          ]"
        >
          <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadge(c.column_type).cls]">
            {{ getColTypeBadge(c.column_type).label }}
          </span>
          <div class="flex-1 min-w-0 flex flex-col leading-none gap-0.5">
            <span class="font-mono text-[11px] truncate">{{ c.column_name }}</span>
            <span v-if="c.remark" class="text-[9px] text-muted-foreground/55 truncate">{{ c.remark }}</span>
          </div>
          <span class="text-[9px] text-muted-foreground/40 font-mono shrink-0">{{ c.column_type }}</span>
        </button>
      </div>
    </div>
  </Teleport>
</template>
