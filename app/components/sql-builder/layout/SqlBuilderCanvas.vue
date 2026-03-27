<script setup lang="ts">
/**
 * SQL Builder — Canvas (Vue Flow wrapper)
 * Based on ChartDB: ChartDBCanvas.vue
 */
import { VueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { Code2 } from 'lucide-vue-next'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { useFlowEvents } from '~/composables/sql-builder/useFlowEvents'

const store = useSqlBuilderStore()
const flowEvents = useFlowEvents()

const emit = defineEmits<{
  drop: [e: DragEvent]
}>()

function onDrop(e: DragEvent) {
  emit('drop', e)
}

// ── Node drag stop: no-op — cteFrame uses bounds check, no parentNode ─────
function onNodeDragStop(_: any) {}
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden" style="min-width:0">
    <!-- Canvas area -->
    <div class="flex-1 relative" @dragover.prevent @drop="onDrop">
      <VueFlow
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
      >
        <Background />
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
