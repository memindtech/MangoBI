<script setup lang="ts">
import { useVueFlow } from '@vue-flow/core'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { useErpData } from '~/composables/sql-builder/useErpData'
import { useDragDrop } from '~/composables/sql-builder/useDragDrop'
import { useHistory } from '~/composables/sql-builder/useHistory'
import { useKeyboardShortcuts } from '~/composables/sql-builder/useKeyboardShortcuts'
import { useSqlGenerator } from '~/composables/sql-builder/useSqlGenerator'
import { useAiContext } from '~/composables/sql-builder/useAiContext'
import { useAiChatStore } from '~/stores/ai-chat'
import { useAiFeature } from '~/composables/useAiFeature'
import { useAiActions } from '~/composables/sql-builder/useAiActions'
import type { AiCanvasAction } from '~/composables/sql-builder/useAiActions'

definePageMeta({ layout: 'workspace', auth: true })
useHead({ title: 'SQL Builder | MangoBI', bodyAttrs: { class: 'sql-builder-active' } })

const store    = useSqlBuilderStore()
const erpData  = useErpData()
const dragDrop = useDragDrop()
const history  = useHistory()
const shortcuts = useKeyboardShortcuts()
const { generateSQL } = useSqlGenerator()
const { getViewport, updateNodeData: vfUpdateNodeData, findNode } = useVueFlow('sql-builder')

// True while any sqlTable node is still fetching column details
const columnsLoading = computed(() =>
  store.nodes.some((n: any) => n.type === 'sqlTable' && n.data?.columnsLoading === true)
)
// True when any sqlTable node's last load attempt failed. generateSQL() itself
// emits a warning in this case, but we also skip the auto-trigger so we don't
// thrash the panel with a warning message on every render.
const anyColumnsLoadFailed = computed(() =>
  store.nodes.some((n: any) => n.type === 'sqlTable' && n.data?.columnsLoadFailed === true)
)

// When all columns finish loading, auto-regenerate if SQL panel is open.
// Note: if any load FAILED we still call generateSQL() so the user sees the
// warning banner about which tables need retry — but only once per transition
// (not on every unrelated data mutation).
watch(columnsLoading, (loading) => {
  if (!loading && store.sqlPanelOpen) {
    generateSQL()
  }
})
// Re-run when a load failure is acknowledged (flag cleared) to produce the
// real SQL after retry succeeds.
watch(anyColumnsLoadFailed, () => {
  if (!columnsLoading.value && store.sqlPanelOpen) generateSQL()
})

onMounted(async () => {
  history.initHistory()
  shortcuts.install()
  await erpData.loadModules()
})

onUnmounted(() => {
  shortcuts.uninstall()
})

// Auto-record history on structural/data changes.
// ⚡ Intentionally does NOT watch n.position — drag updates position 60×/sec
//    and would flood the history debouncer. Positions are saved via onNodeDragStop in Canvas.
watch(
  () => store.nodes.map((n: any) => ({ id: n.id, type: n.type, data: n.data })),
  () => history.recordHistory(),
  { deep: true }
)
watch(
  () => store.edges.map((e: any) => ({ id: e.id, source: e.source, target: e.target, data: e.data })),
  () => history.recordHistory(),
  { deep: true }
)

// Force Vue Flow to sync node data from store when any modal closes
function syncNodeToVueFlow(nodeId: string) {
  const storeNode = store.nodes.find((n: any) => n.id === nodeId)
  if (storeNode && findNode(nodeId)) {
    vfUpdateNodeData(nodeId, { ...storeNode.data })
  }
}

watch(() => store.modalNodeId, (val, oldVal) => {
  if (!val && oldVal) {
    syncNodeToVueFlow(oldVal)
    if (store.sqlPanelOpen) generateSQL()
  }
})

watch(() => store.filterNodeId, (val, oldVal) => {
  if (!val && oldVal) {
    syncNodeToVueFlow(oldVal)
    if (store.sqlPanelOpen) generateSQL()
  }
})

function onAddTool(toolId: string) {
  const vp = getViewport()
  dragDrop.addToolNode(toolId, vp.x, vp.y, vp.zoom)
}

async function onFinish() {
  generateSQL()
  await nextTick()
  store.openFinishModal()
}

const { systemPrompt, contextLabel } = useAiContext()
const aiStore = useAiChatStore()
const { enabled: aiEnabled } = useAiFeature()
const { execute: executeAiAction } = useAiActions()

function onAiAction(action: AiCanvasAction) {
  const result = executeAiAction(action)
  if (!result.ok) {
    console.warn('[AI Action]', result.message)
  }
}
</script>

<template>
  <div class="flex flex-col bg-background" style="flex:1;overflow:hidden;min-height:0">
    <SqlBuilderLayoutSqlBuilderHeader />

    <div class="flex flex-1 overflow-hidden">
      <SqlBuilderLayoutSqlBuilderLeftPanel />
      <SqlBuilderLayoutSqlBuilderCanvas @drop="dragDrop.onDrop" />
      <SqlBuilderLayoutSqlBuilderRightPanel @addTool="onAddTool" @generate="generateSQL" @finish="onFinish" :columns-loading="columnsLoading" />
    </div>

    <SqlBuilderModalsToolConfigModal />
    <SqlBuilderModalsRelationModal />
    <SqlBuilderModalsFilterModal />
    <SqlBuilderModalsGroupSelectModal />
    <SqlBuilderModalsFinishModal />

    <!-- AI Panel -->
    <AiPanel
      v-if="aiEnabled && aiStore.openPage === 'sql-builder'"
      page="sql-builder"
      :system-prompt="systemPrompt"
      :context-label="contextLabel"
      @apply-action="onAiAction"
    />
  </div>
</template>
