<script setup lang="ts">
import { useVueFlow } from '@vue-flow/core'

definePageMeta({ layout: 'workspace', auth: true })
useHead({ title: 'SQL Builder | MangoBI' })

const store    = useSqlBuilderStore()
const erpData  = useErpData()
const dragDrop = useDragDrop()
const history  = useHistory()
const shortcuts = useKeyboardShortcuts()
const { generateSQL } = useSqlGenerator()
const { getViewport, fitView, updateNodeData: vfUpdateNodeData, findNode } = useVueFlow('sql-builder')

onMounted(async () => {
  history.initHistory()
  shortcuts.install()
  await erpData.loadModules()
})

onUnmounted(() => {
  shortcuts.uninstall()
})

// Auto-record history on changes
watch(() => [store.nodes, store.edges], () => {
  history.recordHistory()
}, { deep: true })

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
    nextTick(() => fitView({ nodes: [oldVal], padding: 0.4, duration: 400 }))
  }
})

watch(() => store.filterNodeId, (val, oldVal) => {
  if (!val && oldVal) syncNodeToVueFlow(oldVal)
})

function onAddTool(toolId: string) {
  const vp = getViewport()
  dragDrop.addToolNode(toolId, vp.x, vp.y, vp.zoom)
}
</script>

<template>
  <div class="flex flex-col bg-background" style="flex:1;overflow:hidden;min-height:0">
    <SqlBuilderLayoutSqlBuilderHeader />

    <div class="flex flex-1 overflow-hidden">
      <SqlBuilderLayoutSqlBuilderLeftPanel />
      <SqlBuilderLayoutSqlBuilderCanvas @drop="dragDrop.onDrop" />
      <SqlBuilderLayoutSqlBuilderRightPanel @addTool="onAddTool" @generate="generateSQL" />
    </div>

    <SqlBuilderModalsToolConfigModal />
    <SqlBuilderModalsRelationModal />
    <SqlBuilderModalsFilterModal />
    <SqlBuilderModalsGroupSelectModal />
  </div>
</template>
