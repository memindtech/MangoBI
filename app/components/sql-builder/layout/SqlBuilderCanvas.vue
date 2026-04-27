<script setup lang="ts">
/**
 * SQL Builder — Canvas (Vue Flow wrapper)
 * Based on ChartDB: ChartDBCanvas.vue
 */
import '@vue-flow/core/dist/style.css'
import '@vue-flow/controls/dist/style.css'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { Code2, Layers } from 'lucide-vue-next'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { useFlowEvents } from '~/composables/sql-builder/useFlowEvents'
import { useHistory } from '~/composables/sql-builder/useHistory'

const store = useSqlBuilderStore()
const flowEvents = useFlowEvents()
const history = useHistory()
const { updateNodeInternals, onNodeDoubleClick } = useVueFlow('sql-builder')

// Register via VueFlow's internal hook system (not template @event) so VueFlow
// actually wires up the DOM dblclick listener on node elements.
onNodeDoubleClick(flowEvents.onNodeDblClick)

// Delay VueFlow mount until layout (SidebarProvider etc.) has fully settled.
// On first page load the sidebar transition hasn't finished, so VueFlow would
// measure a wrong container size. double-rAF = "after browser layout + paint".
const flowReady   = ref(false)
const showLayers  = ref(false)

const emit = defineEmits<{
  drop: [e: DragEvent]
}>()

function onDrop(e: DragEvent) {
  emit('drop', e)
}

// ── Node drag stop: record position change in history ─────────────────────
function onNodeDragStop(_: any) {
  history.recordHistory()
}

function onPaneReady() {
  // Give node ResizeObservers ~100ms to measure dimensions, then re-position handles
  setTimeout(() => updateNodeInternals(store.nodes.map((n: any) => n.id)), 100)
}

// Re-position handles whenever nodes are added
watch(() => store.nodes.length, () => {
  nextTick(() => updateNodeInternals(store.nodes.map((n: any) => n.id)))
})

onMounted(() => {
  // Wait until the canvas container stops resizing (sidebar animation = 200ms)
  // before mounting VueFlow, so it measures the correct dimensions.
  const el = document.querySelector('.sql-builder-canvas-wrap') as HTMLElement | null
  if (!el) { flowReady.value = true; return }

  let timer: ReturnType<typeof setTimeout>
  const ro = new ResizeObserver(() => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      flowReady.value = true
      ro.disconnect()
    }, 150)
  })
  ro.observe(el)

  // Safety fallback
  setTimeout(() => { flowReady.value = true; ro.disconnect() }, 600)
})
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden" style="min-width:0">
    <!-- Canvas area -->
    <div class="flex-1 relative sql-builder-canvas-wrap" @dragover.prevent @drop="onDrop">

      <!-- Layers toggle button -->
      <button
        @click="showLayers = !showLayers"
        :class="[
          'absolute top-3 right-3 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all shadow-sm',
          showLayers
            ? 'bg-sky-500 text-white border-sky-500 shadow-sky-500/30'
            : 'bg-background text-muted-foreground border-border hover:border-sky-400/50 hover:text-sky-500',
        ]"
      >
        <Layers class="size-3.5" />
        Layers
      </button>

      <!-- Layers panel -->
      <SqlBuilderLayoutSqlBuilderLayersPanel v-model:show="showLayers" />
      <VueFlow
        v-if="flowReady"
        id="sql-builder"
        v-model:nodes="store.nodes"
        v-model:edges="store.edges"
        :connect-on-click="false"
        :default-edge-options="{ type: 'sqlEdge', animated: false }"
class="bg-background bg-[radial-gradient(circle,_hsl(var(--border))_1px,_transparent_1px)] bg-[size:24px_24px]"
        @edge-click="flowEvents.onEdgeClick"
        @node-click="flowEvents.onNodeClick"
        @pane-click="flowEvents.onPaneClick"
        @connect="flowEvents.onConnect"
        @selection-change="flowEvents.onSelectionChange"
        @node-drag-stop="onNodeDragStop"
        @pane-ready="onPaneReady"
      >
        <Background variant="dots" :gap="24" :size="1.5" />
        <Controls />

        <!-- Custom node types -->
        <template #node-sqlTable="nodeProps">
          <SqlBuilderNodesSqlTableNode v-bind="nodeProps" />
        </template>

        <template #node-toolNode="nodeProps">
          <SqlBuilderNodesSqlToolNode v-bind="nodeProps" />
        </template>

        <template #node-cteFrame="nodeProps">
          <SqlBuilderNodesCteFrameNode v-bind="nodeProps" />
        </template>

        <template #edge-sqlEdge="edgeProps">
          <SqlBuilderNodesSqlEdge v-bind="edgeProps" />
        </template>

        <!-- Empty state -->
        <template v-if="!store.hasNodes" #default>
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
            <div class="bg-background/90 rounded-2xl border px-8 py-6 text-center shadow-xl max-w-xs">
              <Code2 class="size-10 text-sky-400 mx-auto mb-3" />
              <p class="font-semibold text-sm mb-1">เริ่มต้นสร้าง SQL</p>
              <p class="text-xs text-muted-foreground leading-relaxed">
                ลาก <strong>Table</strong> จากแถบซ้ายลงบน Canvas
              </p>
              <p class="text-xs text-muted-foreground mt-1">
                เชื่อม Table ด้วยเส้น = <strong>JOIN</strong><br/>
                เพิ่ม Operation จากแถบ Tools ขวา
              </p>
            </div>
          </div>
        </template>
      </VueFlow>

    </div>

    <!-- SQL output panel -->
    <SqlBuilderLayoutSqlBuilderSqlPanel />
  </div>
</template>
