<script setup lang="ts">
/**
 * SQL Builder — SQL Output Panel
 * Displays generated SQL with copy/resize functionality
 */
import { Code2, ChevronDown, ChevronRight, Copy } from 'lucide-vue-next'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { useSqlGenerator } from '~/composables/sql-builder/useSqlGenerator'

const store = useSqlBuilderStore()
const { generateSQL } = useSqlGenerator()

/** Strip SQL comments and collapse blank lines left behind */
function cleanSQL(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')   // remove /* block comments */
    .replace(/--[^\n]*/g, '')            // remove -- line comments
    .replace(/[ \t]+\n/g, '\n')          // trim trailing whitespace per line
    .replace(/\n{3,}/g, '\n\n')          // collapse 3+ blank lines → 2
    .trim()
}

const displaySQL = computed(() => store.generatedSQL ? cleanSQL(store.generatedSQL) : '')

function copySQL() {
  if (displaySQL.value) navigator.clipboard.writeText(displaySQL.value)
}

const HEADER_H = 36
const MIN_H    = 80
const MAX_H    = 600

const panelHeight = ref(180)
const isResizing  = ref(false)

function startResize(e: MouseEvent) {
  isResizing.value = true
  const startY = e.clientY
  const startH = panelHeight.value

  function onMove(ev: MouseEvent) {
    const delta = startY - ev.clientY
    panelHeight.value = Math.min(MAX_H, Math.max(MIN_H, startH + delta))
  }
  function onUp() {
    isResizing.value = false
    globalThis.removeEventListener('mousemove', onMove)
    globalThis.removeEventListener('mouseup', onUp)
  }
  globalThis.addEventListener('mousemove', onMove)
  globalThis.addEventListener('mouseup', onUp)
}
</script>

<template>
  <div
    class="border-t bg-background shrink-0 relative"
    :style="{ height: store.sqlPanelOpen ? `${panelHeight}px` : `${HEADER_H}px` }"
  >
    <!-- Resize handle -->
    <div
      v-if="store.sqlPanelOpen"
      class="absolute top-0 left-0 right-0 h-1 cursor-row-resize hover:bg-sky-500/40 transition-colors"
      :class="{ 'bg-sky-500/40': isResizing }"
      @mousedown.prevent="startResize"
    />

    <!-- Panel header -->
    <div class="flex items-center gap-2 px-3 h-9 border-b">
      <Code2 class="size-3.5 text-sky-500" />
      <span class="text-xs font-semibold">Generated SQL</span>
      <button @click="store.sqlPanelOpen = !store.sqlPanelOpen"
        class="ml-auto text-muted-foreground hover:text-foreground">
        <component :is="store.sqlPanelOpen ? ChevronDown : ChevronRight" class="size-3.5" />
      </button>
      <button v-if="store.generatedSQL" @click="copySQL"
        class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <Copy class="size-3" /> Copy
      </button>
    </div>

    <!-- SQL content -->
    <div
      v-if="store.sqlPanelOpen"
      class="overflow-auto"
      :style="{ height: `${panelHeight - HEADER_H}px` }"
    >
      <pre v-if="displaySQL"
        class="px-4 py-3 text-xs font-mono whitespace-pre-wrap leading-relaxed">{{ displaySQL }}</pre>
      <div v-else class="flex items-center justify-center h-full text-xs text-muted-foreground">
        กด "Generate SQL" เพื่อสร้าง Query
      </div>
    </div>
  </div>
</template>
