<script setup lang="ts">
import { markRaw } from 'vue'
import { VueFlow, useVueFlow, type Node, type Edge, type Connection } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls }   from '@vue-flow/controls'
import '@vue-flow/controls/dist/style.css'
import {
  Database, BarChart2, Table2, ArrowLeft, Trash2,
  TrendingUp, PieChart, Workflow, Bug, Shuffle,
} from 'lucide-vue-next'
import CanvasDataSourceNode from '~/components/canvas/CanvasDataSourceNode.vue'
import CanvasChartNode      from '~/components/canvas/CanvasChartNode.vue'
import CanvasTableNode      from '~/components/canvas/CanvasTableNode.vue'
import CanvasTransformNode  from '~/components/canvas/CanvasTransformNode.vue'
import { type ChartType }   from '~/stores/canvas'

// ─── Page meta ────────────────────────────────────────────────────────────────
definePageMeta({ layout: false, auth: true })

// ─── Stores / Router ──────────────────────────────────────────────────────────
const canvasStore = useCanvasStore()
const router      = useRouter()

// ─── Vue Flow ─────────────────────────────────────────────────────────────────
const FLOW_ID = 'bi-canvas'

const {
  addNodes, addEdges,
  onConnect, onNodeClick, onPaneClick,
  screenToFlowCoordinate,
} = useVueFlow({ id: FLOW_ID })

// Node type registry — must use markRaw to prevent Vue from making components reactive
const nodeTypes = {
  dataSource: markRaw(CanvasDataSourceNode),
  transform:  markRaw(CanvasTransformNode),
  chart:      markRaw(CanvasChartNode),
  table:      markRaw(CanvasTableNode),
}

// ─── State ────────────────────────────────────────────────────────────────────
const nodes = ref<Node[]>([
  { id: 'ds-1',    type: 'dataSource', position: { x: 60,  y: 160 }, data: {} },
  { id: 'chart-1', type: 'chart',      position: { x: 380, y: 60  }, data: {} },
  { id: 'table-1', type: 'table',      position: { x: 380, y: 330 }, data: {} },
])

const edges = ref<Edge[]>([])

// ─── Edge propagation ─────────────────────────────────────────────────────────
// watchEffect auto-tracks every reactive read inside — fires when nodeOutputs
// reference changes (new data loaded OR transform re-computed) or when edges
// are added. No { deep:true } so Vue Flow's per-frame edge position mutations
// don't trigger this.
watchEffect(() => {
  const outputs   = canvasStore.nodeOutputs  // track shallowRef reference
  const edgeList  = edges.value              // track edges array reference
  for (const edge of edgeList) {
    const data = outputs[edge.source]
    if (data) canvasStore.setNodeInput(edge.target, data)
  }
})

// ─── Connections ──────────────────────────────────────────────────────────────
onConnect((conn: Connection) => {
  addEdges([{
    id:       `e-${conn.source}-${conn.target}`,
    ...conn,
    animated: true,
    style:    { stroke: '#f97316', strokeWidth: 2 },
  }])
})

// ─── Node selection ───────────────────────────────────────────────────────────
onNodeClick(({ node }) => canvasStore.setSelectedNode(node.id))
onPaneClick(()          => canvasStore.setSelectedNode(null))

// ─── Drag & Drop from palette ─────────────────────────────────────────────────
function onPaletteDragStart(event: DragEvent, type: string) {
  event.dataTransfer?.setData('application/vueflow', type)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDrop(event: DragEvent) {
  const type = event.dataTransfer?.getData('application/vueflow')
  if (!type) return
  const position = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  addNodes([{ id: `${type}-${Date.now()}`, type, position, data: {} }])
}

// ─── Delete selected node ─────────────────────────────────────────────────────
function deleteSelected() {
  const id = canvasStore.selectedNodeId
  if (!id) return
  nodes.value = nodes.value.filter(n => n.id !== id)
  edges.value = edges.value.filter(e => e.source !== id && e.target !== id)
  canvasStore.removeNodeData(id)
}

// ─── Properties panel ─────────────────────────────────────────────────────────
const selectedNode = computed(() =>
  canvasStore.selectedNodeId ? nodes.value.find(n => n.id === canvasStore.selectedNodeId) : null
)

const selectedConfig = computed(() =>
  canvasStore.selectedNodeId ? (canvasStore.nodeConfigs[canvasStore.selectedNodeId] ?? {}) : null
)

const selectedInputRows = computed(() => {
  const id = canvasStore.selectedNodeId
  if (!id) return []
  // DataSourceNode: use nodeOutputs; others: use nodeInputs
  return canvasStore.nodeInputs[id] ?? canvasStore.nodeOutputs[id] ?? []
})

const selectedCols = computed(() =>
  selectedInputRows.value.length ? Object.keys(selectedInputRows.value[0]) : []
)

const selectedNumericCols = computed(() =>
  selectedCols.value.filter(k => typeof selectedInputRows.value[0]?.[k] === 'number')
)

function updateConfig(key: string, value: any) {
  const id = canvasStore.selectedNodeId
  if (!id) return
  canvasStore.setNodeConfig(id, { [key]: value })
}

// ─── Palette items ────────────────────────────────────────────────────────────
const palette = [
  { type: 'dataSource', label: 'Data Source', icon: Database,  desc: 'โหลดข้อมูล (Mock / API / SQL)' },
  { type: 'transform',  label: 'Transform',   icon: Shuffle,   desc: 'Group By · Sum · Avg · Count' },
  { type: 'chart',      label: 'Chart',       icon: BarChart2, desc: 'Bar · Line · Pie' },
  { type: 'table',      label: 'Table',       icon: Table2,    desc: 'ตาราง Raw Data' },
]

const chartTypeOptions: { value: ChartType; label: string; icon: any }[] = [
  { value: 'bar',  label: 'Bar',  icon: BarChart2  },
  { value: 'line', label: 'Line', icon: TrendingUp },
  { value: 'pie',  label: 'Pie',  icon: PieChart   },
]

// ─── Debug ────────────────────────────────────────────────────────────────────
const { $xt } = useNuxtApp() as any
const debugResult  = ref<any>(null)
const debugLoading = ref(false)

async function runDebug() {
  debugLoading.value = true
  debugResult.value  = null
  debugResult.value  = await $xt.getServer('Planning/Master/GetSqlFlowTemplateDebug')
  debugLoading.value = false
}
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-muted/10" style="font-family: inherit">

    <!-- ── LEFT PANEL: Palette ──────────────────────────────────────── -->
    <aside aria-label="Node palette" class="w-56 shrink-0 border-r bg-background flex flex-col shadow-sm z-10">
      <!-- Top bar -->
      <div class="flex items-center gap-2 px-3 h-12 border-b shrink-0">
        <button
          @click="router.back()"
          class="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft class="size-4" />
        </button>
        <Workflow class="size-4 text-orange-500" />
        <span class="font-bold text-sm">MangoBI</span>
      </div>

      <!-- Palette nodes -->
      <div class="p-3 space-y-1.5 flex-1">
        <p class="text-[10px] font-semibold text-muted-foreground tracking-wider mb-2">
          DRAG TO CANVAS
        </p>
        <div
          v-for="item in palette" :key="item.type"
          draggable="true"
          @dragstart="onPaletteDragStart($event, item.type)"
          class="flex items-center gap-3 p-2.5 rounded-lg border bg-background
                 cursor-grab active:cursor-grabbing select-none
                 hover:bg-accent hover:border-primary transition-colors"
        >
          <div class="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <component :is="item.icon" class="size-4 text-primary" />
          </div>
          <div class="min-w-0">
            <p class="text-xs font-semibold">{{ item.label }}</p>
            <p class="text-[10px] text-muted-foreground truncate">{{ item.desc }}</p>
          </div>
        </div>
      </div>

      <!-- Tips -->
      <div class="p-3 border-t space-y-1 text-[10px] text-muted-foreground">
        <p>• ลาก node มาวางบน canvas</p>
        <p>• ลากจาก <span class="text-orange-500">●</span> เพื่อเชื่อมต่อ</p>
        <p>• คลิก node เพื่อตั้งค่า</p>
        <p>• Ctrl+B เปิด/ปิด sidebar</p>
      </div>

      <!-- Debug panel -->
      <div class="p-3 border-t space-y-2">
        <button
          @click="runDebug"
          :disabled="debugLoading"
          class="w-full flex items-center justify-center gap-1.5 text-[10px] py-1.5
                 border rounded-lg hover:bg-accent transition-colors disabled:opacity-60"
        >
          <Bug class="size-3" />
          {{ debugLoading ? 'Testing...' : 'Debug Auth' }}
        </button>
        <pre
          v-if="debugResult"
          class="text-[9px] bg-muted rounded p-2 overflow-x-auto max-h-48 overflow-y-auto leading-relaxed"
        >{{ JSON.stringify(debugResult, null, 2) }}</pre>
      </div>
    </aside>

    <!-- ── CENTER: Vue Flow Canvas ────────────────────────────────── -->
    <div
      class="flex-1 relative"
      @dragover.prevent
      @drop="onDrop"
    >
      <VueFlow
        :id="FLOW_ID"
        v-model:nodes="nodes"
        v-model:edges="edges"
        :node-types="nodeTypes"
        fit-view-on-init
        :min-zoom="0.3"
        :max-zoom="2"
        class="w-full h-full"
      >
        <Background variant="dots" :gap="20" :size="1.2" pattern-color="#94a3b8" />
        <Controls position="bottom-left" />
      </VueFlow>

      <!-- Canvas hint (shown when empty) -->
      <Transition name="fade">
        <div
          v-if="nodes.length === 0"
          class="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <div class="text-center text-muted-foreground space-y-2">
            <Workflow class="size-12 mx-auto opacity-20" />
            <p class="text-sm">ลาก node จากแผงด้านซ้ายมาวางที่นี่</p>
          </div>
        </div>
      </Transition>
    </div>

    <!-- ── RIGHT PANEL: Properties ───────────────────────────────── -->
    <Transition name="slide-right">
      <aside
        v-if="canvasStore.selectedNodeId"
        aria-label="Node properties"
        class="w-72 shrink-0 border-l bg-background flex flex-col shadow-sm z-10"
      >
        <!-- Panel header -->
        <div class="flex items-center justify-between px-3 h-12 border-b shrink-0">
          <span class="text-sm font-semibold">Properties</span>
          <div class="flex gap-1">
            <button
              @click="deleteSelected"
              class="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
              title="Delete node"
            >
              <Trash2 class="size-3.5" />
            </button>
            <button
              @click="canvasStore.setSelectedNode(null)"
              class="p-1.5 rounded hover:bg-accent text-muted-foreground transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Panel body -->
        <div class="flex-1 overflow-auto p-3 space-y-4">

          <!-- Node badge -->
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground">ID:</span>
            <code class="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">
              {{ canvasStore.selectedNodeId }}
            </code>
          </div>

          <!-- ── CHART CONFIG ── -->
          <template v-if="selectedNode?.type === 'chart'">
            <div class="space-y-3">
              <!-- Chart type selector -->
              <div>
                <p class="text-xs font-medium mb-1.5">Chart Type</p>
                <div class="grid grid-cols-3 gap-1.5">
                  <button
                    v-for="ct in chartTypeOptions" :key="ct.value"
                    @click="updateConfig('chartType', ct.value)"
                    :class="[
                      'flex flex-col items-center gap-1 py-2 text-[10px] rounded-lg border transition-colors',
                      (selectedConfig?.chartType ?? 'bar') === ct.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'hover:bg-accent border-border'
                    ]"
                  >
                    <component :is="ct.icon" class="size-3.5" />
                    {{ ct.label }}
                  </button>
                </div>
              </div>

              <!-- Field selectors (only when connected) -->
              <template v-if="selectedCols.length">
                <div>
                  <label for="cfg-xfield" class="text-xs font-medium text-muted-foreground">X Axis (Category)</label>
                  <select
                    id="cfg-xfield"
                    class="mt-1 w-full text-xs border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    :value="selectedConfig?.xField ?? selectedCols[0]"
                    @change="updateConfig('xField', ($event.target as HTMLSelectElement).value)"
                  >
                    <option v-for="col in selectedCols" :key="col" :value="col">{{ col }}</option>
                  </select>
                </div>

                <div>
                  <label for="cfg-yfield" class="text-xs font-medium text-muted-foreground">Y Axis (Value)</label>
                  <select
                    id="cfg-yfield"
                    class="mt-1 w-full text-xs border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    :value="selectedConfig?.yField ?? selectedNumericCols[0]"
                    @change="updateConfig('yField', ($event.target as HTMLSelectElement).value)"
                  >
                    <option v-for="col in selectedNumericCols" :key="col" :value="col">{{ col }}</option>
                  </select>
                </div>
              </template>

              <div
                v-if="!selectedInputRows.length"
                class="text-xs text-muted-foreground text-center py-4 border border-dashed rounded-lg"
              >
                เชื่อมต่อ Data Source<br>เพื่อเลือก field ได้
              </div>
            </div>
          </template>

          <!-- ── TABLE CONFIG ── -->
          <template v-else-if="selectedNode?.type === 'table'">
            <div>
              <label for="cfg-maxrows" class="text-xs font-medium text-muted-foreground">Max Rows Displayed</label>
              <input
                id="cfg-maxrows"
                type="number"
                class="mt-1 w-full text-xs border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                :value="selectedConfig?.maxRows ?? 8"
                min="1" max="100"
                @change="updateConfig('maxRows', Number(($event.target as HTMLInputElement).value))"
              />
            </div>
          </template>

          <!-- ── DATASOURCE CONFIG ── -->
          <template v-else-if="selectedNode?.type === 'dataSource'">
            <div class="text-xs text-muted-foreground text-center py-4 border border-dashed rounded-lg">
              ตั้งค่าใน Node โดยตรง
            </div>
          </template>

          <!-- ── DATA PREVIEW ── -->
          <template v-if="selectedInputRows.length">
            <div>
              <p class="text-xs font-medium text-muted-foreground mb-1.5">
                Preview ({{ selectedInputRows.length }} rows)
              </p>
              <div class="overflow-auto max-h-48 border rounded-lg text-xs">
                <table class="w-full">
                  <thead class="bg-muted/50 sticky top-0">
                    <tr>
                      <th
                        v-for="col in selectedCols.slice(0, 4)" :key="col"
                        class="px-2 py-1 text-left font-medium text-muted-foreground border-b whitespace-nowrap"
                      >{{ col }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(row, i) in selectedInputRows.slice(0, 6)" :key="i"
                      class="border-b last:border-0 hover:bg-muted/30"
                    >
                      <td
                        v-for="col in selectedCols.slice(0, 4)" :key="col"
                        class="px-2 py-1 whitespace-nowrap"
                      >{{ row[col] }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </template>
        </div>
      </aside>
    </Transition>
  </div>
</template>

<style>
/* Vue Flow core styles */
@import '@vue-flow/core/dist/style.css';

/* Handle styles */
.vue-flow__handle {
  width:  12px !important;
  height: 12px !important;
  border-radius: 50% !important;
  border: 2px solid white !important;
  transition: transform 0.15s ease;
}
.vue-flow__handle:hover {
  transform: scale(1.4) !important;
}

/* Edge */
.vue-flow__edge-path {
  stroke-width: 2 !important;
}
.vue-flow__edge.animated .vue-flow__edge-path {
  stroke: #f97316 !important;
}

/* Controls */
.vue-flow__controls {
  box-shadow: 0 1px 4px rgba(0,0,0,.15) !important;
  border-radius: 8px !important;
}
.vue-flow__controls-button {
  border-radius: 6px !important;
}

/* Node selection glow */
.vue-flow__node.selected > div {
  box-shadow: 0 0 0 2px #f97316 !important;
}

/* Animations */
.slide-right-enter-active,
.slide-right-leave-active  { transition: transform .2s ease, opacity .2s ease; }
.slide-right-enter-from,
.slide-right-leave-to       { transform: translateX(.75rem); opacity: 0; }

.fade-enter-active,
.fade-leave-active  { transition: opacity .3s ease; }
.fade-enter-from,
.fade-leave-to       { opacity: 0; }
</style>
