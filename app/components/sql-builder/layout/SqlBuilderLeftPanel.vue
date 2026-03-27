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
  <aside aria-label="Database Tables" class="w-56 border-r bg-background flex flex-col overflow-hidden shrink-0">

    <!-- Search -->
    <div class="px-3 py-2 border-b shrink-0">
      <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Database Tables</p>
      <div class="relative">
        <Search class="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
        <input
          v-model="store.search"
          placeholder="ค้นหา Module / Object…"
          class="w-full text-[11px] border rounded-md pl-6 pr-6 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-sky-400 placeholder:text-muted-foreground/40"
        />
        <button v-if="store.search" @click="store.search = ''"
          class="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          <X class="size-3" />
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
      <p class="text-[11px] text-muted-foreground">ไม่พบ "{{ store.search }}"</p>
    </div>

    <!-- Module + Object list -->
    <div v-else class="flex-1 overflow-y-auto">
      <div v-for="mod in erpData.filteredModules.value" :key="mod" class="border-b last:border-0">

        <!-- Module header (clickable to toggle) -->
        <button
          class="w-full flex items-center gap-1.5 px-3 py-1.5 bg-muted/30 sticky top-0 z-10 hover:bg-muted/60 transition-colors text-left"
          @click="toggleModule(mod)"
        >
          <ChevronRight
            :class="['size-3 text-muted-foreground shrink-0 transition-transform duration-150', isExpanded(mod) ? 'rotate-90' : '']"
          />
          <Database class="size-3 text-sky-400 shrink-0" />
          <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex-1 truncate">{{ mod }}</span>
          <RefreshCw v-if="store.loadingObjs[mod]" class="size-3 animate-spin text-muted-foreground shrink-0" />
          <span v-else-if="store.objects[mod]"
            class="text-[9px] font-mono shrink-0"
            :class="isSearching ? 'text-sky-500 font-semibold' : 'text-muted-foreground'">
            {{ isSearching ? erpData.filteredObjects(mod).length : store.objects[mod].length }}
          </span>
        </button>

        <!-- Objects (shown when expanded or searching) -->
        <template v-if="isExpanded(mod)">
          <div v-if="store.loadingObjs[mod]" class="px-4 py-2 text-[10px] text-muted-foreground flex items-center gap-1.5">
            <RefreshCw class="size-3 animate-spin" /> Loading…
          </div>

          <template v-else-if="store.objects[mod]">
            <div v-if="!erpData.filteredObjects(mod).length" class="px-4 py-1 text-[10px] text-muted-foreground/60">
              ไม่พบข้อมูล
            </div>
            <div
              v-for="obj in erpData.filteredObjects(mod)"
              :key="obj.object_name"
              draggable="true"
              @dragstart="onDragStart($event, obj)"
              :title="obj.remark ? `${obj.object_name}\n${obj.remark}` : obj.object_name"
              class="flex items-center gap-1.5 px-3 py-1.5 text-[11px] cursor-grab hover:bg-accent transition-colors active:cursor-grabbing"
            >
              <span :class="['text-[9px] px-1 py-0.5 rounded font-semibold font-mono shrink-0', erpData.objectTypeColor(obj.object_type)]">
                {{ obj.object_type }}
              </span>
              <div class="flex flex-col min-w-0">
                <span class="truncate font-medium">{{ erpData.objDisplayName(obj) }}</span>
                <span v-if="obj.remark" class="truncate text-[9px] text-muted-foreground font-mono">
                  {{ obj.object_name }}
                </span>
              </div>
            </div>
          </template>
        </template>

      </div>
    </div>

  </aside>
</template>
