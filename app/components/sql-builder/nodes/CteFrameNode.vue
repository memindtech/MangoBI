<script setup lang="ts">
/**
 * CTE Frame Node — two visual modes:
 *   isOpen=true  → resizable transparent frame wrapping child table nodes
 *   isOpen=false → compact summary card (children hidden)
 */
import { computed } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { NodeResizer } from '@vue-flow/node-resizer'
import { Layers, Settings2, X, ChevronDown, ChevronRight } from 'lucide-vue-next'
import { useSqlBuilderStore } from '~/stores/sql-builder'

const props = defineProps<{
  id:       string
  data:     Record<string, any>
  selected: boolean
}>()

const store = useSqlBuilderStore()
const { updateNodeInternals } = useVueFlow()

onMounted(() => nextTick(() => updateNodeInternals([props.id])))

const cteName      = computed(() => (props.data.name as string) || 'my_cte')
const isOpen       = computed(() => !!props.data.isOpen)
const selectedCols = computed(() => (props.data.selectedCols ?? []) as string[])
const condCount    = computed(() =>
  ((props.data.conditions ?? []) as any[]).filter((c: any) => c.column).length
)

// Nodes inside this frame by bounds (no parentNode — pure position check)
const nodesInFrame = computed(() => {
  const self = store.nodes.find((n: any) => n.id === props.id)
  if (!self) return []
  const fw    = parseFloat(String(self.style?.width  ?? '420'))
  const fh    = parseFloat(String(self.style?.height ?? '280'))
  const fx    = self.position.x
  const fy    = self.position.y
  const NW    = 112   // half of node card width (~224)
  const NH    = 80    // half of node card height (~160)
  return store.nodes.filter((n: any) =>
    n.type === 'sqlTable' &&
    (n.position.x + NW) >= fx && (n.position.x + NW) <= fx + fw &&
    (n.position.y + NH) >= fy && (n.position.y + NH) <= fy + fh
  )
})

const childCount  = computed(() => nodesInFrame.value.length)
const childTables = computed(() =>
  nodesInFrame.value.map((n: any) => (n.data?.tableName || n.data?.label || n.id) as string)
)

function openModal() {
  store.modalNodeId = props.id
}

function deleteFrame() {
  store.removeNode(props.id)
}

function toggleOpen() {
  const open    = !isOpen.value
  const current = store.nodes.find((n: any) => n.id === props.id)

  if (open) {
    const w = (props.data._expandedW as number) || 420
    const h = (props.data._expandedH as number) || 280
    store.updateNodeData(props.id, { isOpen: true })
    store.nodes = store.nodes.map((n: any) =>
      n.id === props.id ? { ...n, style: { width: `${w}px`, height: `${h}px` } } : n
    )
  } else {
    const cw = parseFloat(String(current?.style?.width  ?? '420'))
    const ch = parseFloat(String(current?.style?.height ?? '280'))
    store.updateNodeData(props.id, { isOpen: false, _expandedW: cw, _expandedH: ch })
    store.nodes = store.nodes.map((n: any) =>
      n.id === props.id ? { ...n, style: { width: '200px', height: '56px' } } : n
    )
  }
}
</script>

<template>
  <!-- Resizer only in expanded mode -->
  <NodeResizer
    v-if="isOpen"
    :min-width="280"
    :min-height="180"
    :is-visible="selected"
    handle-class="!size-2.5 !rounded !border-violet-400 !bg-violet-500/80"
    line-class="!border-violet-400/60"
  />

  <!-- ── EXPANDED frame ────────────────────────────────────────────────── -->
  <div
    v-if="isOpen"
    class="w-full h-full rounded-2xl border-2 transition-colors pointer-events-none"
    :class="selected ? 'border-violet-500 bg-violet-500/8' : 'border-violet-500/40 bg-violet-500/5'"
    style="backdrop-filter: blur(2px)"
  >
    <!-- Title bar -->
    <div class="flex items-center gap-2 px-3 py-2 border-b border-violet-500/20 rounded-t-2xl select-none pointer-events-auto">
      <!-- Collapse toggle -->
      <button @click.stop="toggleOpen"
        class="size-5 flex items-center justify-center rounded hover:bg-violet-500/20 text-violet-400 transition-colors shrink-0"
        title="ย่อ">
        <ChevronDown class="size-3.5" />
      </button>

      <Layers class="size-3.5 text-violet-400 shrink-0" />
      <span class="font-mono text-[11px] font-bold text-violet-300 flex-1 truncate cursor-default">
        WITH {{ cteName }} AS (…)
      </span>

      <span v-if="childCount"
        class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 font-mono shrink-0">
        {{ childCount }} table{{ childCount > 1 ? 's' : '' }}
      </span>
      <span v-if="selectedCols.length"
        class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 font-mono shrink-0">
        {{ selectedCols.length }} cols
      </span>
      <span v-if="condCount"
        class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 font-mono shrink-0">
        {{ condCount }} cond{{ condCount > 1 ? 's' : '' }}
      </span>

      <button @click.stop="openModal"
        class="size-5 flex items-center justify-center rounded-md hover:bg-violet-500/20 text-violet-400 transition-colors shrink-0"
        title="ตั้งค่า CTE">
        <Settings2 class="size-3" />
      </button>
      <button @click.stop="deleteFrame"
        class="size-5 flex items-center justify-center rounded-md hover:bg-rose-500/20 text-muted-foreground hover:text-rose-400 transition-colors shrink-0"
        title="ลบ CTE Frame">
        <X class="size-3" />
      </button>
    </div>

    <!-- Empty drop hint -->
    <div v-if="!childCount"
      class="flex flex-col items-center justify-center gap-1.5 h-[calc(100%-40px)] text-violet-400/40 pointer-events-none select-none">
      <ChevronRight class="size-5 rotate-90" />
      <span class="text-[10px] font-mono">ลาก Table เข้ามาที่นี่</span>
    </div>

    <!-- Table name strip — bottom of frame, pointer-events-none so nodes stay draggable -->
    <div v-else
      class="absolute bottom-0 left-0 right-0 px-3 py-2 flex flex-wrap gap-1.5 pointer-events-none select-none border-t border-violet-500/15 bg-violet-950/40 rounded-b-2xl">
      <span
        v-for="tbl in childTables" :key="tbl"
        class="inline-flex items-center gap-1 text-[9px] font-mono font-semibold px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 border border-sky-500/25"
      >
        <span class="size-1.5 rounded-full bg-sky-400/70 shrink-0" />
        {{ tbl }}
      </span>
    </div>
  </div>

  <!-- ── COLLAPSED card ────────────────────────────────────────────────── -->
  <div
    v-else
    class="flex items-center gap-2 px-3 h-full rounded-xl border-2 cursor-pointer select-none transition-colors"
    :class="selected ? 'border-violet-500 bg-violet-900/60' : 'border-violet-500/50 bg-violet-950/70'"
    @dblclick="openModal"
  >
    <!-- Expand toggle -->
    <button @click.stop="toggleOpen"
      class="size-5 flex items-center justify-center rounded hover:bg-violet-500/20 text-violet-400 transition-colors shrink-0"
      title="ขยาย">
      <ChevronRight class="size-3.5" />
    </button>

    <Layers class="size-3.5 text-violet-400 shrink-0" />
    <span class="font-mono text-[11px] font-bold text-violet-300 flex-1 truncate">{{ cteName }}</span>

    <!-- Table name pills -->
    <div class="flex items-center gap-1 shrink-0">
      <span v-for="tbl in childTables.slice(0, 2)" :key="tbl"
        class="text-[8px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 font-mono border border-sky-500/20 truncate max-w-[64px]">
        {{ tbl }}
      </span>
      <span v-if="childTables.length > 2" class="text-[8px] text-violet-400/60 font-mono">
        +{{ childTables.length - 2 }}
      </span>
      <span v-if="!childTables.length" class="text-[9px] text-violet-400/40 italic font-mono">empty</span>
    </div>

    <button @click.stop="openModal"
      class="size-5 flex items-center justify-center rounded-md hover:bg-violet-500/20 text-violet-400/60 hover:text-violet-400 transition-colors shrink-0"
      title="ตั้งค่า CTE">
      <Settings2 class="size-3" />
    </button>
    <button @click.stop="deleteFrame"
      class="size-5 flex items-center justify-center rounded-md hover:bg-rose-500/20 text-muted-foreground/50 hover:text-rose-400 transition-colors shrink-0"
      title="ลบ CTE">
      <X class="size-3" />
    </button>
  </div>

  <!-- Output handle -->
  <Handle
    type="source"
    :position="Position.Right"
    class="!size-3 !rounded-full !border-violet-500 !bg-violet-500/80"
  />
</template>

<style>
@import '@vue-flow/node-resizer/dist/style.css';
</style>
