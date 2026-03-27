<script setup lang="ts">
/**
 * SQL Builder — Group CTE Node
 * Visual container that groups Table nodes into a named WITH clause CTE
 * Based on ChartDB: group_node.vue (§4.8)
 *
 * Behaviour:
 *  - Resizable frame using @vue-flow/node-resizer
 *  - Double-click label to rename (becomes the CTE name)
 *  - Drag Table/Tool nodes into the frame → they become children (parentNode)
 *  - Source handle → connect to downstream tool nodes
 *  - SQL: WITH <label> AS ( JOIN block of children )
 */
import { NodeResizer } from '@vue-flow/node-resizer'
import { Handle, Position } from '@vue-flow/core'
import { Box, ChevronDown, ChevronUp, X, Code2 } from 'lucide-vue-next'
import { useSqlBuilderStore } from '~/stores/sql-builder'

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected?: boolean
}>()

const store = useSqlBuilderStore()

const childNodes = computed(() =>
  store.nodes.filter((n: any) => n.parentNode === props.id)
)

const isOpen = computed(() => props.data.isOpen !== false)

function toggleOpen() {
  store.updateNodeData(props.id, { isOpen: !isOpen.value })
}

// ── Label editing ──────────────────────────────────────────────────────────
const isEditing = ref(false)
const editLabel = ref('')

function startEdit() {
  editLabel.value = props.data.label ?? 'cte_group'
  isEditing.value = true
}

function saveEdit() {
  isEditing.value = false
  const trimmed = editLabel.value.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
  if (trimmed) store.updateNodeData(props.id, { label: trimmed })
}

// ── Remove group (un-parents children first) ──────────────────────────────
function removeGroup() {
  const groupPos = store.nodes.find((n: any) => n.id === props.id)?.position ?? { x: 0, y: 0 }
  // Convert children positions from relative → absolute before detaching
  store.nodes = store.nodes.map((n: any) => {
    if (n.parentNode !== props.id) return n
    return {
      ...n,
      parentNode: undefined,
      extent:     undefined,
      position: {
        x: (n.position?.x ?? 0) + groupPos.x,
        y: (n.position?.y ?? 0) + groupPos.y,
      },
    }
  })
  store.removeNode(props.id)
}
</script>

<template>
  <!-- Outer wrapper fills the resizable area -->
  <div class="w-full h-full relative" style="min-width:320px; min-height:220px">

    <!-- Resize handles (only show when selected) -->
    <NodeResizer
      :min-width="320"
      :min-height="220"
      :is-visible="props.selected"
      :line-style="{ stroke: 'hsl(263 55% 60% / 0.5)', strokeWidth: 2 }"
      :handle-style="{ background: 'hsl(263 55% 60%)', borderColor: 'hsl(263 55% 60%)', width: '8px', height: '8px' }"
    />

    <!-- Source handle (right side — connects to downstream tool nodes) -->
    <Handle
      type="source" :position="Position.Right"
      class="!bg-violet-400 !w-3 !h-3 !border-2 !border-background !rounded-full"
      style="top: 50%"
    />

    <!-- Frame border -->
    <div :class="[
      'absolute inset-0 rounded-2xl border-2 transition-colors pointer-events-none',
      props.selected
        ? 'border-violet-400/70 shadow-lg shadow-violet-500/20'
        : 'border-violet-500/30 hover:border-violet-400/50',
    ]" />

    <!-- Background fill -->
    <div class="absolute inset-0 rounded-2xl bg-violet-500/4" />

    <!-- ── Header ────────────────────────────────────────────────────────── -->
    <div class="absolute top-0 left-0 right-0 flex items-center gap-2 px-3 py-2 rounded-t-2xl bg-violet-600/12 border-b border-violet-500/25 z-10">
      <Box class="size-3.5 text-violet-400 shrink-0" />

      <!-- Editable CTE name -->
      <input
        v-if="isEditing"
        v-model="editLabel"
        @blur="saveEdit"
        @keydown.enter.stop="saveEdit"
        @keydown.esc.stop="isEditing = false"
        @click.stop
        autofocus
        class="flex-1 text-[11px] font-bold font-mono text-violet-200 bg-transparent border-b border-violet-400/60 outline-none min-w-0"
        placeholder="cte_name"
      />
      <span
        v-else
        @dblclick.stop="startEdit"
        class="flex-1 text-[11px] font-bold font-mono text-violet-300 truncate cursor-text select-none"
        title="ดับเบิลคลิกเพื่อแก้ชื่อ CTE"
      >{{ data.label || 'cte_group' }}</span>

      <!-- Child count badge -->
      <span v-if="childNodes.length"
        class="text-[9px] px-1.5 py-0 rounded-full bg-violet-500/20 text-violet-400 font-mono font-semibold leading-5 shrink-0">
        {{ childNodes.length }}
      </span>

      <!-- Collapse / expand -->
      <button @click.stop="toggleOpen"
        class="size-5 flex items-center justify-center rounded hover:bg-violet-500/20 text-violet-400/60 hover:text-violet-300 transition-colors shrink-0">
        <component :is="isOpen ? ChevronUp : ChevronDown" class="size-3" />
      </button>

      <!-- Delete group -->
      <button @click.stop="removeGroup"
        class="size-5 flex items-center justify-center rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0">
        <X class="size-3" />
      </button>
    </div>

    <!-- ── Body (expanded) ──────────────────────────────────────────────── -->
    <template v-if="isOpen">
      <!-- Empty-state hint (pointer-events-none so it doesn't block drops) -->
      <div
        v-if="!childNodes.length"
        class="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none"
        style="padding-top: 40px"
      >
        <Code2 class="size-5 text-violet-400/20" />
        <p class="text-[10px] font-mono text-violet-400/30">WITH {{ data.label || 'cte_name' }} AS (</p>
        <p class="text-[9px] text-violet-400/25 mt-0.5">ลาก Table node มาวางที่นี่</p>
        <p class="text-[10px] font-mono text-violet-400/30">)</p>
      </div>

      <!-- CTE name watermark at bottom-right -->
      <div v-if="childNodes.length"
        class="absolute bottom-2 right-3 pointer-events-none">
        <span class="text-[9px] font-mono text-violet-400/30 italic">{{ data.label }}</span>
      </div>
    </template>

    <!-- ── Collapsed state ───────────────────────────────────────────────── -->
    <div v-if="!isOpen"
      class="absolute inset-0 flex items-center justify-center pointer-events-none"
      style="padding-top: 40px">
      <span class="text-[9px] text-violet-400/40 italic">{{ childNodes.length }} nodes (ยุบ)</span>
    </div>
  </div>
</template>

<style>
/* Import NodeResizer CSS */
@import '@vue-flow/node-resizer/dist/style.css';
</style>
