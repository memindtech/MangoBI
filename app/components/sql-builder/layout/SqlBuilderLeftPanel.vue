<script setup lang="ts">
/**
 * SQL Builder — Left Panel (Table Browser)
 */
import { Database, Search, RefreshCw, X, ChevronRight } from 'lucide-vue-next'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { useErpData } from '~/composables/sql-builder/useErpData'

const store   = useSqlBuilderStore()
const erpData = useErpData()

function onDragStart(e: DragEvent, obj: any) {
  e.dataTransfer?.setData('application/json', JSON.stringify(obj))
}

const isSearching = computed(() => store.search.trim().length > 0)

function toggleModule(mod: string) {
  const next = new Set(store.expandedMods)
  if (next.has(mod)) next.delete(mod)
  else next.add(mod)
  store.expandedMods = next
}

function isExpanded(mod: string) {
  // When searching — always show objects
  return isSearching.value || store.expandedMods.has(mod)
}
</script>

<template>
  <aside aria-label="Database Tables" class="w-72 border-r bg-background flex flex-col overflow-hidden shrink-0">

    <!-- Search -->
    <div class="px-3 py-2 border-b shrink-0">
      <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Database Tables</p>
      <div class="relative">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <input
          v-model="store.search"
          placeholder="ค้นหา menu_id / ชื่อเมนู / object…"
          class="w-full text-xs border rounded-lg pl-8 pr-7 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-sky-400 placeholder:text-muted-foreground/40"
        />
        <button v-if="store.search" @click="store.search = ''"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          <X class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- Loading modules -->
    <div v-if="store.loadingMods" class="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
      <RefreshCw class="size-3.5 animate-spin" /> Loading modules…
    </div>

    <!-- No search results -->
    <div v-else-if="isSearching && !erpData.filteredModules.value.length"
      class="flex flex-col items-center gap-1.5 px-3 py-6 text-center">
      <Search class="size-5 text-muted-foreground/40" />
      <p class="text-xs text-muted-foreground">ไม่พบ "{{ store.search }}"</p>
    </div>

    <!-- Module + Object list -->
    <div v-else class="flex-1 overflow-y-auto">
      <div v-for="mod in erpData.filteredModules.value" :key="mod" class="border-b last:border-0">

        <!-- Module header -->
        <button
          class="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 sticky top-0 z-10 hover:bg-muted/60 transition-colors text-left"
          @click="toggleModule(mod)"
        >
          <ChevronRight
            :class="['size-3.5 text-muted-foreground shrink-0 transition-transform duration-150', isExpanded(mod) ? 'rotate-90' : '']"
          />
          <Database class="size-3.5 text-sky-400 shrink-0" />
          <span class="text-xs font-bold text-muted-foreground uppercase tracking-wide flex-1 truncate">{{ mod }}</span>
          <RefreshCw v-if="store.loadingObjs[mod]" class="size-3.5 animate-spin text-muted-foreground shrink-0" />
          <span v-else-if="store.objects[mod]"
            class="text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded-full bg-muted"
            :class="isSearching ? 'text-sky-500 font-semibold bg-sky-500/10' : 'text-muted-foreground'">
            {{ isSearching ? erpData.filteredObjects(mod).length : store.objects[mod].length }}
          </span>
        </button>

        <!-- Objects -->
        <template v-if="isExpanded(mod)">
          <div v-if="store.loadingObjs[mod]" class="px-4 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
            <RefreshCw class="size-3 animate-spin" /> Loading…
          </div>

          <template v-else-if="store.objects[mod]">
            <div v-if="!erpData.filteredObjects(mod).length" class="px-4 py-2 text-xs text-muted-foreground/60 italic">
              ไม่พบข้อมูล
            </div>
            <div
              v-for="obj in erpData.filteredObjects(mod)"
              :key="obj.object_name"
              draggable="true"
              @dragstart="onDragStart($event, obj)"
              :title="`[${obj.menu_id ?? '-'}] ${obj.menu_name || obj.object_name}\n${obj.object_name}`"
              class="flex flex-col px-3 py-1.5 cursor-grab hover:bg-accent transition-colors active:cursor-grabbing border-b border-border/20 last:border-0"
            >
              <!-- Row 1: menu_id + menu_name -->
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="text-[10px] px-1.5 py-0 rounded font-mono font-bold shrink-0 bg-sky-500/15 text-sky-600 leading-5">
                  {{ obj.menu_id ?? '-' }}
                </span>
                <span class="truncate text-xs font-medium leading-tight">
                  {{ obj.menu_name || erpData.objDisplayName(obj) }}
                </span>
              </div>
              <!-- Row 2: object_name -->
              <span class="truncate text-[10px] text-muted-foreground/50 font-mono leading-tight pl-0.5">
                {{ obj.object_name }}
              </span>
            </div>
          </template>
        </template>

      </div>
    </div>

  </aside>
</template>
