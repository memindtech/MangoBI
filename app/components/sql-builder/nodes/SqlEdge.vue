<script setup lang="ts">
import { getSmoothStepPath, EdgeLabelRenderer, BaseEdge, Position } from '@vue-flow/core'
import { Trash2 } from 'lucide-vue-next'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { JOIN_EDGE_COLORS } from '~/types/sql-builder'
import type { JoinType } from '~/types/sql-builder'

const props = defineProps<{
  id: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: Position
  targetPosition: Position
  data?: { joinType?: JoinType; mappings?: any[]; isTool?: boolean }
  selected?: boolean
  markerEnd?: string
  style?: object
}>()

const store = useSqlBuilderStore()

// Recompute path whenever coordinates change
const pathData = computed(() =>
  getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  })
)

const edgePath = computed(() => pathData.value[0])
const labelX   = computed(() => pathData.value[1])
const labelY   = computed(() => pathData.value[2])

const joinType  = computed(() => (props.data?.joinType ?? 'LEFT JOIN') as JoinType)
const color     = computed(() => JOIN_EDGE_COLORS[joinType.value] ?? '#888')
// Show JOIN badge only for table-to-table edges (not tool connections)
const showBadge = computed(() => !!props.data?.joinType && !props.data?.isTool)

function deleteEdge() {
  store.edges = store.edges.filter((e: any) => e.id !== props.id)
}

function openEdit() {
  if (!props.data?.isTool) {
    store.relationEdgeId = props.id
  }
}
</script>

<template>
  <BaseEdge :id="id" :path="edgePath" :marker-end="markerEnd" :style="style" />

  <EdgeLabelRenderer v-if="showBadge || selected">
    <div
      :style="{
        position: 'absolute',
        transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
        pointerEvents: 'all',
      }"
      class="nodrag nopan flex items-center gap-1"
    >
      <!-- JOIN type badge — click to open RelationModal -->
      <button
        v-if="showBadge"
        @click.stop="openEdit"
        class="text-[9px] px-2 py-0.5 rounded-full font-bold font-mono leading-none shadow transition-all hover:scale-105 active:scale-95"
        :style="{ backgroundColor: color, color: '#fff' }"
        :title="`${joinType} — คลิกเพื่อแก้ไข`"
      >
        {{ joinType.replace(' JOIN', '') }}
      </button>

      <!-- Delete button — visible only when edge is selected -->
      <button
        v-if="selected"
        @click.stop="deleteEdge"
        class="size-5 flex items-center justify-center rounded-full bg-destructive text-white shadow-lg transition-all hover:scale-110 active:scale-95 animate-in fade-in zoom-in-75 duration-100"
        title="ลบเส้นเชื่อม"
      >
        <Trash2 class="size-2.5" />
      </button>
    </div>
  </EdgeLabelRenderer>
</template>
