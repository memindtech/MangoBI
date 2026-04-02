<script setup lang="ts">
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { Database, X, Filter, ChevronDown, ChevronUp, Key, SlidersHorizontal, Network, Search, CheckSquare, Square } from 'lucide-vue-next'
import type { VisibleCol } from '~/types/sql-builder'
import { getColTypeBadgeSolid } from '~/types/sql-builder'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { useErpData } from '~/composables/sql-builder/useErpData'
import { useDragDrop } from '~/composables/sql-builder/useDragDrop'

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected?: boolean
}>()

const store    = useSqlBuilderStore()
const erpData  = useErpData()
const dragDrop = useDragDrop()
const { updateNodeInternals } = useVueFlow()

// Re-measure handle positions after this node is fully rendered
onMounted(() => nextTick(() => updateNodeInternals([props.id])))

const expanding    = ref(false)
const showModal    = ref(false)
const modalSearch  = ref('')

const filteredDetails = computed(() => {
  const q = modalSearch.value.toLowerCase().trim()
  if (!q) return details.value
  return details.value.filter((c: any) =>
    c.column_name?.toLowerCase().includes(q) ||
    c.remark?.toLowerCase().includes(q)
  )
})

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

function isVisible(colName: string): boolean {
  return visibleCols.value.some((v: VisibleCol) => v.name === colName)
}

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

    <!-- Card (double-click opens column detail modal) -->
    <div :class="[
      'rounded-xl border-2 shadow-lg overflow-hidden bg-card transition-all duration-150',
      props.selected
        ? 'border-sky-400 shadow-sky-500/30 shadow-xl ring-2 ring-sky-400/30'
        : 'border-sky-500/40 hover:border-sky-500/70',
    ]"
    @dblclick.stop="details.length && (showModal = true)">

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
        <span :class="['text-[9px] px-1.5 py-0.5 rounded-md font-bold font-mono shrink-0', erpData.objectTypeColor(data.type)]">
          {{ data.ttype ?? data.type }}
        </span>
        <span class="text-[10px] text-muted-foreground truncate flex-1">{{ data.module }}</span>

        <!-- Column count badge -->
        <span v-if="visibleCols.length" class="text-[9px] px-1.5 py-0.5 bg-sky-500/15 text-sky-500 rounded-full font-semibold shrink-0">
          {{ visibleCols.length }}
        </span>
        <!-- Header badge -->
        <span v-if="data.isHeaderNode" class="text-[8px] px-1 py-0.5 bg-emerald-500/20 text-emerald-600 rounded font-bold shrink-0">H</span>

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
          <template v-for="badge in ['NUM','DATE','TXT','BIT','BIN']" :key="badge">
            <span v-if="details.some((c: any) => getColTypeBadgeSolid(c.column_type).label === badge)"
              :class="['text-[8px] px-1 py-0 rounded font-bold font-mono leading-4', getColTypeBadgeSolid(details.find((c: any) => getColTypeBadgeSolid(c.column_type).label === badge)?.column_type ?? '').cls]">
              {{ details.filter((c: any) => getColTypeBadgeSolid(c.column_type).label === badge).length }}{{ badge }}
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
    </div>
  </div>

  <!-- ── Column Detail Modal ─────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showModal"
        class="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="showModal = false">
        <div class="bg-background border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style="width:640px; max-height:85vh">

          <!-- Header -->
          <div class="flex items-center gap-3 px-5 py-4 border-b bg-sky-500/5 shrink-0">
            <div class="flex size-9 items-center justify-center rounded-xl bg-sky-500/15 border border-sky-500/25">
              <Database class="size-4 text-sky-500" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-bold truncate">{{ data.label }}</p>
              <p class="text-[11px] text-muted-foreground font-mono truncate">
                {{ data.tableName }}
                <span v-if="data.module" class="ml-2 opacity-60">· {{ data.module }}</span>
              </p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="text-[10px] px-2 py-1 bg-sky-500/15 text-sky-500 rounded-full font-semibold">
                {{ visibleCols.length }} / {{ details.length }} selected
              </span>
              <button @click="showModal = false"
                class="size-7 flex items-center justify-center rounded-lg hover:bg-accent text-muted-foreground transition-colors">
                <X class="size-4" />
              </button>
            </div>
          </div>

          <!-- Toolbar -->
          <div class="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/10 shrink-0">
            <!-- Search -->
            <div class="relative flex-1">
              <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input v-model="modalSearch" placeholder="ค้นหา column…"
                class="w-full text-xs border rounded-lg pl-8 pr-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-sky-500/40 placeholder:text-muted-foreground/40" />
            </div>
            <!-- Select all / clear -->
            <button @click="selectAll"
              class="flex items-center gap-1 text-[11px] px-2.5 py-1.5 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-semibold transition-colors">
              <CheckSquare class="size-3.5" /> ทั้งหมด
            </button>
            <button @click="clearAll"
              class="flex items-center gap-1 text-[11px] px-2.5 py-1.5 border rounded-lg hover:bg-accent transition-colors text-muted-foreground">
              <Square class="size-3.5" /> ล้าง
            </button>
          </div>

          <!-- Column table -->
          <div class="flex-1 overflow-y-auto">
            <!-- Table header -->
            <div class="grid grid-cols-[20px_16px_1fr_80px_90px] gap-x-3 items-center px-4 py-1.5 border-b bg-muted/20 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide sticky top-0 z-10">
              <span></span>
              <span></span>
              <span>Column</span>
              <span class="text-center">Type</span>
              <span>Alias (AS)</span>
            </div>

            <div v-if="!filteredDetails.length" class="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <Search class="size-6 opacity-30" />
              <p class="text-xs">ไม่พบ column ที่ตรงกับ "{{ modalSearch }}"</p>
            </div>

            <div
              v-for="col in filteredDetails" :key="col.column_name"
              @click="toggleCol(col.column_name)"
              :class="[
                'grid grid-cols-[20px_16px_1fr_80px_90px] gap-x-3 items-center px-4 py-2 cursor-pointer select-none transition-colors border-b border-border/20 last:border-0',
                isVisible(col.column_name)
                  ? 'bg-sky-500/8 hover:bg-sky-500/12'
                  : 'hover:bg-accent/50',
              ]"
            >
              <!-- Checkbox -->
              <div :class="[
                'size-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                isVisible(col.column_name) ? 'bg-sky-500 border-sky-500' : 'border-border/60 bg-background',
              ]">
                <svg v-if="isVisible(col.column_name)" class="size-2.5 text-white" fill="none" viewBox="0 0 10 10">
                  <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </div>

              <!-- PK -->
              <Key v-if="col.data_pk === 'Y'" class="size-3 text-amber-400 shrink-0" />
              <span v-else />

              <!-- Name + remark -->
              <div class="flex flex-col leading-none gap-0.5 min-w-0">
                <span :class="['font-mono text-xs truncate', col.data_pk === 'Y' ? 'text-amber-400 font-semibold' : 'text-foreground']">
                  {{ col.column_name }}
                </span>
                <span v-if="col.remark" class="text-[10px] text-muted-foreground/60 truncate">{{ col.remark }}</span>
              </div>

              <!-- Type badge -->
              <div class="flex justify-center">
                <span :class="['text-[10px] px-2 py-0.5 rounded font-bold font-mono', getColTypeBadgeSolid(col.column_type).cls]">
                  {{ getColTypeBadgeSolid(col.column_type).label }}
                </span>
              </div>

              <!-- Alias input -->
              <input
                v-if="isVisible(col.column_name)"
                :value="visibleCols.find((v: VisibleCol) => v.name === col.column_name)?.alias ?? ''"
                @input.stop="setColAlias(col.column_name, ($event.target as HTMLInputElement).value)"
                @click.stop
                placeholder="AS…"
                class="text-xs border rounded-lg px-2 py-1 bg-background font-mono focus:outline-none focus:ring-2 focus:ring-sky-400/40 text-sky-400 placeholder:text-muted-foreground/30 w-full"
                :class="visibleCols.find((v: VisibleCol) => v.name === col.column_name)?.alias ? 'border-sky-400/50' : 'border-border/40'"
              />
              <span v-else />
            </div>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-between gap-3 px-5 py-3 border-t bg-muted/10 shrink-0">
            <p class="text-[11px] text-muted-foreground">
              แสดง {{ filteredDetails.length }} / {{ details.length }} columns
              <span v-if="modalSearch" class="text-sky-500"> · ค้นหา "{{ modalSearch }}"</span>
            </p>
            <button @click="showModal = false"
              class="text-xs px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-semibold transition-colors">
              เสร็จสิ้น
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
