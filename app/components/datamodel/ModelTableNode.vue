<script setup lang="ts">
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { Table2, Hash, Type, X } from 'lucide-vue-next'

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected: boolean
}>()

const dmStore = useDataModelStore()
const { removeNodes } = useVueFlow()

const { nodeEl, width, height, onDragStart, onDragStartHeight, onDragStartCorner } = useNodeResize(120, 60)
const isSized = computed(() => height.value !== 'auto')

const table    = computed(() => dmStore.getTable(props.id))
const columns  = computed(() => dmStore.columnsOf(props.id))
const rowCount = computed(() => table.value?.rows.length ?? 0)

const MAX_COLS       = 20
const visibleColumns = computed(() => columns.value.slice(0, MAX_COLS))
const hiddenCount    = computed(() => Math.max(0, columns.value.length - MAX_COLS))

function deleteNode() {
  removeNodes([props.id])
}
</script>

<template>
  <div ref="nodeEl" class="relative" :style="{ width, height, maxWidth: width === 'auto' ? '200px' : undefined }">

    <!-- Target handle -->
    <Handle
      id="in"
      type="target"
      :position="Position.Left"
      style="width: 12px; height: 12px; background: #6366f1; border: 2px solid white; z-index: 30;"
    />

    <!-- Card -->
    <div
      class="rounded-xl border-2 bg-background shadow-md overflow-hidden flex flex-col transition-[border-color,box-shadow]"
      :style="isSized ? { height: '100%' } : {}"
      :class="selected
        ? 'border-indigo-400 shadow-lg shadow-indigo-200/30 dark:shadow-indigo-900/30'
        : 'border-border'"
    >
      <!-- Header -->
      <div class="flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-950/30 border-b shrink-0">
        <Table2 class="size-4 text-indigo-500 shrink-0" />
        <span class="text-xs font-semibold text-indigo-700 dark:text-indigo-400 truncate flex-1" :title="table?.name">
          {{ table?.name ?? props.id }}
        </span>
        <span class="text-[10px] text-indigo-400 font-mono shrink-0">
          {{ rowCount.toLocaleString() }}r
        </span>
        <button
          @click.stop="deleteNode"
          class="nodrag ml-1 text-muted-foreground hover:text-destructive transition-colors"
        >
          <X class="size-3" />
        </button>
      </div>

      <!-- Column list — max-h when auto, flex-fill when sized -->
      <div :class="['py-1 nodrag', isSized ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-60 overflow-y-auto']" @wheel.stop>
        <div
          v-for="col in visibleColumns"
          :key="col.name"
          v-memo="[col.name, col.label, col.type]"
          class="flex items-center gap-1.5 px-3 py-[5px] hover:bg-muted/40"
        >
          <Hash v-if="col.type === 'number'" class="size-3 shrink-0 text-blue-400" />
          <Type v-else class="size-3 shrink-0 text-emerald-400" />
          <div class="min-w-0 flex-1" :title="col.label !== col.name ? `${col.label}\n${col.name}` : col.name">
            <span class="text-[11px] block truncate text-foreground/80">{{ col.label }}</span>
            <span v-if="col.label !== col.name" class="text-[9px] block truncate text-muted-foreground/50 font-mono leading-tight">{{ col.name }}</span>
          </div>
        </div>

        <div v-if="hiddenCount > 0" class="px-3 py-1.5 text-[10px] text-muted-foreground/60 text-center border-t">
          +{{ hiddenCount }} columns
        </div>

        <div v-if="!columns.length" class="px-3 py-2 text-[10px] text-muted-foreground text-center">
          ไม่มีข้อมูล
        </div>
      </div>
    </div>

    <!-- Source handle -->
    <Handle
      id="out"
      type="source"
      :position="Position.Right"
      style="width: 12px; height: 12px; background: #6366f1; border: 2px solid white; z-index: 30;"
    />

    <!-- Right-edge resize -->
    <div
      class="absolute right-0 top-0 h-full w-2 cursor-ew-resize hover:bg-indigo-400/40 rounded-r-xl nodrag z-10"
      @mousedown.stop="onDragStart"
    />
    <!-- Bottom-edge resize -->
    <div
      class="absolute bottom-0 left-0 w-full h-2 cursor-ns-resize hover:bg-indigo-400/40 rounded-b-xl nodrag z-10"
      @mousedown.stop="onDragStartHeight"
    />
    <!-- Corner resize -->
    <div
      class="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize nodrag z-20"
      @mousedown.stop="onDragStartCorner"
    />

  </div>
</template>
