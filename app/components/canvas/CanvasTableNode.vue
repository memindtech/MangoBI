<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { Table2, Unplug } from 'lucide-vue-next'

const { nodeEl, width, onDragStart } = useNodeResize(200)

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected: boolean
  dragging?: boolean
}>()

const canvasStore = useCanvasStore()

const rows        = computed(() => canvasStore.nodeInputs[props.id] ?? [])
const config      = computed(() => canvasStore.nodeConfigs[props.id] ?? {})
const hasData     = computed(() => rows.value.length > 0)
const columns     = computed(() => rows.value.length ? Object.keys(rows.value[0]) : [])
const maxRows     = computed(() => config.value.maxRows ?? 8)
const visibleRows = computed(() => rows.value.slice(0, maxRows.value))

function fmt(v: any) {
  return typeof v === 'number' ? v.toLocaleString() : (v ?? '')
}
</script>

<template>
  <!--
    Outer wrapper: just relative + sized — NO overflow-hidden.
    Handles positioned at ±6px must NOT be clipped here.
  -->
  <div ref="nodeEl" class="relative" :style="{ width }">

    <!-- Visual card (overflow-hidden stays here, handles are outside) -->
    <div
      class="rounded-xl border-2 bg-background shadow-md transition-[border-color,box-shadow] overflow-hidden"
      style="will-change: transform;"
      :class="selected ? 'border-violet-400 shadow-violet-200/40 dark:shadow-violet-900/40 shadow-lg' : 'border-border'"
    >
      <!-- Header -->
      <div class="flex items-center gap-2 px-3 py-2 bg-violet-50 dark:bg-violet-950/30 rounded-t-xl border-b">
        <Table2 class="size-4 text-violet-500 shrink-0" />
        <span class="text-xs font-semibold text-violet-700 dark:text-violet-400">Table</span>
        <span v-if="hasData" class="ml-2 text-[10px] font-mono text-violet-500">
          {{ rows.length.toLocaleString() }} rows · {{ columns.length }} cols
        </span>
      </div>

      <!-- Drag placeholder: skip heavy DOM while dragging -->
      <div v-if="dragging" class="px-3 py-4 text-center text-[10px] text-muted-foreground">
        {{ hasData ? `${rows.length.toLocaleString()} rows · ${columns.length} cols` : 'ไม่มีข้อมูล' }}
      </div>

      <template v-else>
        <!-- Table body -->
        <div class="overflow-auto max-h-64 nodrag" @wheel.stop @mousedown.stop>
          <div
            v-if="!hasData"
            class="h-full min-h-[80px] flex flex-col items-center justify-center gap-2 text-muted-foreground"
          >
            <Unplug class="size-5 opacity-25" />
            <p class="text-xs">เชื่อมต่อ Data Source</p>
          </div>

          <table v-else class="text-xs border-collapse w-full">
            <thead class="bg-muted/60 sticky top-0 z-10">
              <tr>
                <th
                  v-for="col in columns" :key="col"
                  class="px-2 py-1.5 text-left font-medium text-muted-foreground border-b"
                  style="max-width: 120px; min-width: 60px;"
                >
                  <span class="block truncate" :title="col">{{ col }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, i) in visibleRows" :key="i"
                class="border-b last:border-0 hover:bg-muted/30"
              >
                <td
                  v-for="col in columns" :key="col"
                  class="px-2 py-1.5"
                  style="max-width: 120px;"
                >
                  <span class="block truncate" :title="String(row[col] ?? '')">{{ fmt(row[col]) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Footer -->
        <div
          v-if="hasData && rows.length > maxRows"
          class="px-3 py-1 border-t text-[10px] text-muted-foreground text-center bg-muted/20"
        >
          แสดง {{ maxRows }} / {{ rows.length.toLocaleString() }} rows
        </div>
      </template>
    </div>

    <!-- Handle: outside overflow-hidden so the dot is never clipped -->
    <Handle
      id="in"
      type="target"
      :position="Position.Left"
      style="left: -6px; width: 12px; height: 12px; background: #a855f7; border: 2px solid white;"
    />

    <!-- Right-edge resize strip -->
    <div
      class="absolute right-0 top-0 h-full w-2 cursor-ew-resize hover:bg-violet-400/40 rounded-r-xl nodrag z-10"
      @mousedown.stop="onDragStart"
    />
  </div>
</template>
