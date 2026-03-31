<script setup lang="ts">
/**
 * SQL Builder — Right Panel (Tools)
 * Based on ChartDB: ChartDBRightPanel.vue
 */
import {
  Layers, Calculator, Database, SortAsc, GitMerge, Filter,
  Play, Plus, Loader2,
} from 'lucide-vue-next'

const props = defineProps<{ columnsLoading?: boolean }>()

const emit = defineEmits<{
  addTool: [toolId: string]
  generate: []
}>()

// Processing tool nodes (create toolNode)
const tools = [
  { id: 'cte',   icon: Layers,     color: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500/40', label: 'CTE Frame',  desc: 'ลาก Table เข้ากรอบ' },
  { id: 'calc',  icon: Calculator, color: 'text-teal-500',   bg: 'bg-teal-500/10',   border: 'border-teal-500/40',   label: 'Calculator', desc: 'คำนวณ column' },
  { id: 'group', icon: Database,   color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/40', label: 'Group/By',   desc: 'GROUP BY + Aggregate' },
  { id: 'sort',  icon: SortAsc,    color: 'text-green-500',  bg: 'bg-green-500/10',  border: 'border-green-500/40',  label: 'Sort Data',  desc: 'ORDER BY' },
  { id: 'union', icon: GitMerge,   color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/40', label: 'Union',      desc: 'UNION / UNION ALL' },
  { id: 'where', icon: Filter,     color: 'text-rose-500',   bg: 'bg-rose-500/10',   border: 'border-rose-500/40',   label: 'Where',      desc: 'กรอง WHERE' },
]
</script>

<template>
  <aside aria-label="SQL Tools" class="w-48 border-l bg-background flex flex-col overflow-hidden shrink-0">
    <!-- Header -->
    <div class="px-3 py-2 border-b shrink-0">
      <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">TOOLS</p>
      <p class="text-[10px] text-muted-foreground mt-0.5">คลิกเพื่อเพิ่ม Node</p>
    </div>

    <!-- Tool buttons -->
    <div class="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">

      <!-- Processing tool nodes -->
      <button
        v-for="tool in tools"
        :key="tool.id"
        @click="emit('addTool', tool.id)"
        :class="['flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all hover:shadow-sm w-full', tool.border, tool.bg]"
      >
        <div :class="['flex size-8 items-center justify-center rounded-lg shrink-0 border', tool.bg, tool.border]">
          <component :is="tool.icon" :class="['size-4', tool.color]" />
        </div>
        <div class="flex-1 min-w-0">
          <p :class="['text-[11px] font-semibold', tool.color]">{{ tool.label }}</p>
          <p class="text-[10px] text-muted-foreground">{{ tool.desc }}</p>
        </div>
        <Plus class="size-3 text-muted-foreground shrink-0" />
      </button>
    </div>

    <!-- Finish button -->
    <div class="p-3 border-t">
      <button
        @click="emit('generate')"
        class="w-full flex flex-col items-center justify-center gap-1 py-3 rounded-xl text-white transition-colors"
        :class="props.columnsLoading ? 'bg-green-500/70' : 'bg-green-500 hover:bg-green-600'"
      >
        <Loader2 v-if="props.columnsLoading" class="size-4 animate-spin" />
        <Play v-else class="size-4" />
        <span class="text-xs font-bold">{{ props.columnsLoading ? 'โหลดอยู่…' : 'Finish' }}</span>
        <span class="text-[10px] opacity-80">{{ props.columnsLoading ? 'auto-generate เมื่อเสร็จ' : 'Generate SQL' }}</span>
      </button>
    </div>
  </aside>
</template>
