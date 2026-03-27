<script setup lang="ts">
/**
 * SQL Builder — SQL Output Panel
 * Displays generated SQL with copy functionality
 */
import { Code2, ChevronDown, ChevronRight, Copy } from 'lucide-vue-next'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { useSqlGenerator } from '~/composables/sql-builder/useSqlGenerator'

const store = useSqlBuilderStore()
const { copySQL } = useSqlGenerator()
</script>

<template>
  <div class="border-t bg-background shrink-0" :style="{ height: store.sqlPanelOpen ? '180px' : '36px' }">
    <!-- Panel header -->
    <div class="flex items-center gap-2 px-3 h-9 border-b">
      <Code2 class="size-3.5 text-sky-500" />
      <span class="text-xs font-semibold">Generated SQL</span>
      <button @click="store.sqlPanelOpen = !store.sqlPanelOpen" class="ml-auto text-muted-foreground hover:text-foreground">
        <component :is="store.sqlPanelOpen ? ChevronDown : ChevronRight" class="size-3.5" />
      </button>
      <button v-if="store.generatedSQL" @click="copySQL"
        class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <Copy class="size-3" /> Copy
      </button>
    </div>

    <!-- SQL content -->
    <div v-if="store.sqlPanelOpen" class="h-[calc(100%-36px)] overflow-auto">
      <pre v-if="store.generatedSQL"
        class="px-4 py-3 text-xs font-mono whitespace-pre-wrap leading-relaxed">{{ store.generatedSQL }}</pre>
      <div v-else class="flex items-center justify-center h-full text-xs text-muted-foreground">
        กด "Generate SQL" เพื่อสร้าง Query
      </div>
    </div>
  </div>
</template>
