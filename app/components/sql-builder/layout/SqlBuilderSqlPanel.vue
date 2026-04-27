<script setup lang="ts">
/**
 * SQL Builder — SQL Output Panel
 * Displays generated SQL with copy/resize functionality
 */
import { Code2, ChevronDown, ChevronRight, Copy, Eye, AlertTriangle } from 'lucide-vue-next'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { useSqlGenerator } from '~/composables/sql-builder/useSqlGenerator'

const store = useSqlBuilderStore()
const { generateSQL } = useSqlGenerator()

// ── Preview TOP N ─────────────────────────────────────────────────────
const previewTop = ref<number | null>(100)
const previewEnabled = ref(false)

/** Strip SQL comments and collapse blank lines left behind */
function cleanSQL(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')   // remove /* block comments */
    .replace(/--[^\n]*/g, '')            // remove -- line comments
    .replace(/[ \t]+\n/g, '\n')          // trim trailing whitespace per line
    .replace(/\n{3,}/g, '\n\n')          // collapse 3+ blank lines → 2
    .trim()
}

/** Inject TOP N into SELECT line */
function injectTop(sql: string, n: number): string {
  return sql.replace(/^(SELECT)\b/im, `SELECT TOP ${n}`)
}

const displaySQL = computed(() => {
  if (!store.generatedSQL) return ''
  let sql = cleanSQL(store.generatedSQL)
  if (previewEnabled.value && previewTop.value && previewTop.value > 0) {
    sql = injectTop(sql, previewTop.value)
  }
  return sql
})

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

      <!-- Preview TOP toggle -->
      <div class="flex items-center gap-1.5 ml-2 pl-2 border-l border-border/40">
        <button
          @click="previewEnabled = !previewEnabled"
          :class="['flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded transition-colors',
            previewEnabled
              ? 'bg-emerald-500/15 text-emerald-500 font-semibold'
              : 'text-muted-foreground hover:text-foreground']"
          title="Preview TOP N rows">
          <Eye class="size-3" />
          TOP
        </button>
        <input
          v-if="previewEnabled"
          v-model.number="previewTop"
          type="number" min="1" max="10000"
          class="w-16 text-[11px] border rounded px-1.5 py-0.5 bg-background font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500/40 text-emerald-500"
        />
      </div>

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
      <!-- Generation warnings (A1, A5) — shown above the SQL so users notice before copying -->
      <div
        v-if="store.lastGenerationWarnings?.length"
        class="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-[11px] text-amber-600 dark:text-amber-300 flex flex-col gap-1"
      >
        <div class="flex items-center gap-1.5 font-semibold">
          <AlertTriangle class="size-3.5" />
          <span>ข้อควรระวัง ({{ store.lastGenerationWarnings.length }})</span>
        </div>
        <ul class="list-disc list-inside space-y-0.5 pl-1">
          <li v-for="(w, i) in store.lastGenerationWarnings" :key="i">{{ w }}</li>
        </ul>
      </div>
      <pre v-if="displaySQL"
        class="px-4 py-3 text-xs font-mono whitespace-pre-wrap leading-relaxed">{{ displaySQL }}</pre>
      <div v-else class="flex items-center justify-center h-full text-xs text-muted-foreground">
        กด "Generate SQL" เพื่อสร้าง Query
      </div>
    </div>
  </div>
</template>
