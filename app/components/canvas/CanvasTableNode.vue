<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { Table2, Unplug } from 'lucide-vue-next'

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected: boolean
}>()

const canvasStore = useCanvasStore()

const rows        = computed(() => canvasStore.nodeInputs[props.id] ?? [])
const config      = computed(() => canvasStore.nodeConfigs[props.id] ?? {})
const hasData     = computed(() => rows.value.length > 0)
const columns     = computed(() => rows.value.length ? Object.keys(rows.value[0]) : [])
const maxRows     = computed(() => config.value.maxRows ?? 8)
const visibleRows = computed(() => rows.value.slice(0, maxRows.value))

function fmt(v: string | number) {
  return typeof v === 'number' ? v.toLocaleString() : v
}
</script>

<template>
  <div
    class="w-80 rounded-xl border-2 bg-background shadow-md transition-all"
    :class="selected ? 'border-violet-400 shadow-violet-200/40 dark:shadow-violet-900/40 shadow-lg' : 'border-border'"
  >
    <!-- Input handle -->
    <Handle
      id="in"
      type="target"
      :position="Position.Left"
      style="left: -6px; width: 12px; height: 12px; background: #a855f7; border: 2px solid white;"
    />

    <!-- Header -->
    <div class="flex items-center gap-2 px-3 py-2 bg-violet-50 dark:bg-violet-950/30 rounded-t-xl border-b">
      <Table2 class="size-4 text-violet-500 shrink-0" />
      <span class="text-xs font-semibold text-violet-700 dark:text-violet-400">Table</span>
      <span v-if="hasData" class="ml-auto text-[10px] text-muted-foreground">
        {{ rows.length }} rows · {{ columns.length }} cols
      </span>
    </div>

    <!-- Table body -->
    <div class="overflow-auto max-h-52 nodrag" @wheel.stop @mousedown.stop>
      <!-- No data -->
      <div
        v-if="!hasData"
        class="h-24 flex flex-col items-center justify-center gap-2 text-muted-foreground"
      >
        <Unplug class="size-5 opacity-25" />
        <p class="text-xs">เชื่อมต่อ Data Source</p>
      </div>

      <!-- Table -->
      <table v-else class="w-full text-xs">
        <thead class="bg-muted/50 sticky top-0">
          <tr>
            <th
              v-for="col in columns" :key="col"
              class="px-2 py-1.5 text-left font-medium text-muted-foreground border-b whitespace-nowrap"
            >{{ col }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, i) in visibleRows" :key="i"
            class="border-b last:border-0 hover:bg-muted/30 transition-colors"
          >
            <td
              v-for="col in columns" :key="col"
              class="px-2 py-1.5 whitespace-nowrap"
            >{{ fmt(row[col]) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Footer: row count hint -->
    <div
      v-if="hasData && rows.length > maxRows"
      class="px-3 py-1.5 border-t text-[10px] text-muted-foreground text-center"
    >
      แสดง {{ maxRows }} / {{ rows.length }} rows
    </div>
  </div>
</template>
