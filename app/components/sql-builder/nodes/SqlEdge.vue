<script setup lang="ts">
import { getSmoothStepPath, EdgeLabelRenderer, BaseEdge, Position } from '@vue-flow/core'
import { Trash2 } from 'lucide-vue-next'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { JOIN_EDGE_COLORS } from '~/types/sql-builder'
import type { JoinType } from '~/types/sql-builder'

const props = defineProps<{
  id: string
  source: string
  target: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: Position
  targetPosition: Position
  data?: { joinType?: JoinType; mappings?: any[]; isTool?: boolean; tgtToolId?: string; srcCat?: string }
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

const joinType = computed(() => (props.data?.joinType ?? 'LEFT JOIN') as JoinType)
const color    = computed(() => JOIN_EDGE_COLORS[joinType.value] ?? '#888')

// Show JOIN badge only for table-to-table edges
const showJoinBadge = computed(() => !!props.data?.joinType && !props.data?.isTool)

// Show tool badge for all tool-connection edges
const TOOL_BADGE_META: Record<string, { color: string; label: string }> = {
  cte:   { color: '#8b5cf6', label: 'CTE'      },
  calc:  { color: '#14b8a6', label: 'CALC'     },
  group: { color: '#f97316', label: 'GROUP BY' },
  sort:  { color: '#22c55e', label: 'ORDER BY' },
  union: { color: '#eab308', label: 'UNION'    },
  where: { color: '#f43f5e', label: 'WHERE'    },
}
const showToolBadge = computed(() => !!props.data?.isTool)
const toolBadgeMeta = computed(() => {
  let tid = props.data?.tgtToolId ?? ''
  if (!tid && props.data?.isTool) {
    const tgtNode = store.nodes.find((n: any) => n.id === props.target) as any
    tid = tgtNode?.data?._toolId ?? ''
  }
  return TOOL_BADGE_META[tid] ?? { color: '#94a3b8', label: 'TOOL' }
})

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

  <EdgeLabelRenderer v-if="showJoinBadge || showToolBadge || selected">
    <div
      :style="{
        position: 'absolute',
        transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
        pointerEvents: 'all',
      }"
      class="nodrag nopan flex flex-col items-center gap-0.5"
    >
      <!-- JOIN type badge (table → table edges) -->
      <button
        v-if="showJoinBadge"
        @click.stop="openEdit"
        class="text-[9px] px-2 py-0.5 rounded-full font-bold font-mono leading-none shadow transition-all hover:scale-105 active:scale-95"
        :style="{ backgroundColor: color, color: '#fff' }"
        :title="`${joinType} — คลิกเพื่อแก้ไข`"
      >
        {{ joinType.replace(' JOIN', '') }}
      </button>

      <!-- Tool type badge (table / tool → tool node edges) -->
      <span
        v-if="showToolBadge"
        class="text-[8px] px-1.5 py-0.5 rounded-full font-bold font-mono leading-none shadow-sm pointer-events-none select-none"
        :style="{
          backgroundColor: toolBadgeMeta.color + '28',
          color: toolBadgeMeta.color,
          border: `1px solid ${toolBadgeMeta.color}55`,
        }"
      >
        {{ toolBadgeMeta.label }}
      </span>

      <!-- Delete button — visible only when edge is selected -->
      <button
        v-if="selected"
        @click.stop="deleteEdge"
        class="size-5 flex items-center justify-center rounded-full bg-destructive text-white shadow-lg transition-all hover:scale-110 active:scale-95 animate-in fade-in zoom-in-75 duration-100 mt-0.5"
        title="ลบเส้นเชื่อม"
      >
        <Trash2 class="size-2.5" />
      </button>
    </div>
  </EdgeLabelRenderer>
</template>
