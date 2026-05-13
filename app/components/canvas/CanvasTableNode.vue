<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { Table2, Unplug } from 'lucide-vue-next'
import { AgGridVue } from 'ag-grid-vue3'
import {
  ClientSideRowModelModule,
  CommunityFeaturesModule,
  ModuleRegistry,
} from 'ag-grid-community'
import type { ColDef } from 'ag-grid-community'

ModuleRegistry.registerModules([ClientSideRowModelModule, CommunityFeaturesModule])

const { nodeEl, width, height, onDragStart, onDragStartHeight, onDragStartCorner } = useNodeResize(320, 200)
const isSized = computed(() => height.value !== 'auto')

const colorMode = useColorMode()
const isDark    = computed(() => colorMode.value === 'dark')

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected: boolean
  dragging?: boolean
}>()

const canvasStore = useCanvasStore()

const rows        = computed(() => canvasStore.nodeInputs[props.id] ?? [])
const hasData     = computed(() => rows.value.length > 0)
const columns     = computed(() => rows.value.length ? Object.keys(rows.value[0]!) : [])
const labelMap    = computed(() => canvasStore.nodeInputLabels[props.id] ?? {})

// ── Quick filter ───────────────────────────────────────────────────────────────
const quickFilter = ref('')

// ── Column widths (user-resized) ───────────────────────────────────────────────
const savedWidths = computed(() => canvasStore.nodeConfigs[props.id]?.columnWidths ?? {})

function onColumnResized(event: any) {
  if (!event.finished || !event.columns?.length) return
  const widths: Record<string, number> = { ...savedWidths.value }
  for (const col of event.columns) {
    const field = col.getColDef().field
    if (field) widths[field] = col.getActualWidth()
  }
  canvasStore.setNodeConfig(props.id, { columnWidths: widths })
}

// ── Column definitions ─────────────────────────────────────────────────────────
const colDefs = computed<ColDef[]>(() => {
  const rowNumDef: ColDef = {
    headerName: '#',
    width: 48,
    minWidth: 40,
    maxWidth: 56,
    sortable: false,
    filter: false,
    resizable: false,
    pinned: 'left',
    suppressSizeToFit: true,
    cellStyle: { fontSize: '9px', textAlign: 'center', fontFamily: 'monospace', opacity: '0.45' },
    valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1,
  }

  const dataDefs: ColDef[] = columns.value.map(col => {
    const isNum  = rows.value.length > 0 && typeof rows.value[0]![col] === 'number'
    const savedW = savedWidths.value[col]
    return {
      field:      col,
      headerName: labelMap.value[col] ?? col,
      sortable:   true,
      filter:     true,
      resizable:  true,
      minWidth:   72,
      ...(savedW ? { width: savedW } : { flex: 1 }),
      cellStyle: (isNum
        ? { textAlign: 'right', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }
        : {}) as Record<string, string>,
      valueFormatter: (p: any) => {
        if (p.value === null || p.value === undefined || p.value === '') return ''
        return isNum ? Number(p.value).toLocaleString() : String(p.value)
      },
    }
  })

  return [rowNumDef, ...dataDefs]
})

const defaultColDef: ColDef = {
  sortable: true,
  resizable: true,
  filter: false,
}

const themeClass = computed(() =>
  isDark.value ? 'ag-theme-quartz-dark' : 'ag-theme-quartz'
)
</script>

<template>
  <div ref="nodeEl" class="relative" :style="{ width, height }" style="will-change: transform; contain: layout;">

    <div
      class="rounded-xl border-2 bg-background shadow-md overflow-hidden flex flex-col"
      :style="isSized ? { height: '100%' } : {}"
      :class="[
        dragging ? '' : 'transition-[border-color,box-shadow]',
        selected  ? 'border-violet-400 shadow-violet-200/40 dark:shadow-violet-900/40 shadow-lg' : 'border-border',
      ]"
      @wheel.stop
    >
      <!-- ── Header ──────────────────────────────────────────────────────── -->
      <div class="flex items-center gap-2 px-3 py-2 bg-violet-50 dark:bg-violet-950/30 rounded-t-xl border-b shrink-0">
        <Table2 class="size-4 text-violet-500 shrink-0" />
        <span class="text-xs font-semibold text-violet-700 dark:text-violet-400">Table</span>
        <span v-if="hasData" class="text-[10px] font-mono text-violet-500">
          {{ rows.length.toLocaleString() }}r · {{ columns.length }}c
        </span>
        <input
          v-if="hasData"
          v-model="quickFilter"
          placeholder="ค้นหา..."
          class="ml-auto nodrag text-[10px] border rounded px-1.5 py-0.5 bg-background w-24
                 focus:outline-none focus:ring-1 focus:ring-violet-400
                 placeholder:text-muted-foreground/40"
          @click.stop @mousedown.stop @keydown.stop
        />
      </div>

      <!-- ── Drag placeholder ────────────────────────────────────────────── -->
      <div v-if="dragging" class="px-3 py-4 text-center text-[10px] text-muted-foreground">
        {{ hasData ? `${rows.length.toLocaleString()} rows · ${columns.length} cols` : 'ไม่มีข้อมูล' }}
      </div>

      <template v-else>
        <!-- No data -->
        <div
          v-if="!hasData"
          class="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground min-h-[80px]"
        >
          <Unplug class="size-5 opacity-25" />
          <p class="text-xs">เชื่อมต่อ Data Source</p>
        </div>

        <!-- ── AG Grid ──────────────────────────────────────────────────── -->
        <AgGridVue
          v-else
          :class="[themeClass, 'nodrag w-full ag-table-node', isSized ? 'flex-1 min-h-0' : '']"
          :style="isSized ? {} : { height: '280px' }"
          :rowData="rows"
          :columnDefs="colDefs"
          :defaultColDef="defaultColDef"
          :quickFilterText="quickFilter"
          :rowHeight="26"
          :headerHeight="30"
          :suppressMovableColumns="true"
          :suppressCellFocus="true"
          :enableCellTextSelection="true"
          @column-resized="onColumnResized"
          @wheel.stop
          @click.stop
        />
      </template>
    </div>

    <!-- Handle -->
    <Handle
      id="in" type="target" :position="Position.Left"
      style="left: -6px; width: 12px; height: 12px; background: #a855f7; border: 2px solid white;"
    />

    <!-- Resize handles -->
    <div class="absolute right-0 top-0 h-full w-2 cursor-ew-resize hover:bg-violet-400/40 rounded-r-xl nodrag z-10"
         @mousedown.stop="onDragStart" />
    <div class="absolute bottom-0 left-0 w-full h-2 cursor-ns-resize hover:bg-violet-400/40 rounded-b-xl nodrag z-10"
         @mousedown.stop="onDragStartHeight" />
    <div class="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize nodrag z-20"
         @mousedown.stop="onDragStartCorner" />
  </div>
</template>

<style>
/* Blend AG Grid background with the node card */
.ag-table-node .ag-root-wrapper,
.ag-table-node .ag-root,
.ag-table-node .ag-body-viewport {
  background: transparent !important;
}

.ag-table-node .ag-header {
  background: transparent !important;
  border-bottom: 1px solid var(--ag-border-color);
}

.ag-table-node .ag-header-cell-text {
  font-size: 10px;
  font-weight: 600;
}

.ag-table-node .ag-cell {
  font-size: 11px;
}

/* Remove outer border so the node card border is the only border */
.ag-table-node .ag-root-wrapper {
  border: none !important;
}
</style>
