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
  data?: { joinType?: JoinType; mappings?: any[]; isTool?: boolean; unionSrc?: boolean; srcCat?: string }
  selected?: boolean
  markerEnd?: string
  style?: object
}>()

const store = useSqlBuilderStore()

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

// Show JOIN badge only for table-to-table edges
const showJoinBadge   = computed(() => !!props.data?.joinType && !props.data?.isTool)
// Show UNION source badge for union-source edges
const showUnionBadge  = computed(() => !!props.data?.unionSrc)

// Color + label per source category
const UNION_SRC_META: Record<string, { color: string; label: string }> = {
  cte:   { color: '#a78bfa', label: 'CTE'   },
  union: { color: '#eab308', label: 'UNION' },
  table: { color: '#38bdf8', label: 'TABLE' },
  where: { color: '#f87171', label: 'WHERE' },
  group: { color: '#fb923c', label: 'GROUP' },
  calc:  { color: '#2dd4bf', label: 'CALC'  },
  other: { color: '#94a3b8', label: 'SRC'   },
}
const unionSrcMeta = computed(() =>
  UNION_SRC_META[props.data?.srcCat ?? 'other'] ?? UNION_SRC_META.other
)

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

  <EdgeLabelRenderer v-if="showJoinBadge || showUnionBadge || selected">
    <div
      :style="{
        position: 'absolute',
        transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
        pointerEvents: 'all',
      }"
      class="nodrag nopan flex items-center gap-1"
    >
      <!-- JOIN type badge — table-to-table edges -->
      <button
        v-if="showJoinBadge"
        @click.stop="openEdit"
        class="text-[9px] px-2 py-0.5 rounded-full font-bold font-mono leading-none shadow transition-all hover:scale-105 active:scale-95"
        :style="{ backgroundColor: color, color: '#fff' }"
        :title="`${joinType} — คลิกเพื่อแก้ไข`"
      >
        {{ joinType.replace(' JOIN', '') }}
      </button>

      <!-- Union source badge — CTE/Union/Table → Union node edges -->
      <span
        v-if="showUnionBadge"
        class="text-[8px] px-1.5 py-0.5 rounded-full font-bold font-mono leading-none shadow-sm pointer-events-none select-none"
        :style="{ backgroundColor: unionSrcMeta.color + '33', color: unionSrcMeta.color, border: `1px solid ${unionSrcMeta.color}66` }"
      >
        {{ unionSrcMeta.label }} ▶
      </span>

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
