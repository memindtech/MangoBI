<script setup lang="ts">
/**
 * SQL Builder — Left Panel (Table Browser)
 */
import { Database, Search, RefreshCw, X, ChevronRight, Globe, Lock, Loader2, BookMarked } from 'lucide-vue-next'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { useErpData } from '~/composables/sql-builder/useErpData'
import { useMangoBIApi } from '~/composables/useMangoBIApi'
import type { BIListItem } from '~/composables/useMangoBIApi'

const store   = useSqlBuilderStore()
const erpData = useErpData()
const api     = useMangoBIApi()

// ── SQL Builder Templates ────────────────────────────────────────────
const tplOpen      = ref(true)
const myTpls       = ref<BIListItem[]>([])
const publicTpls   = ref<BIListItem[]>([])
const tplLoading   = ref(false)
const tplAppending = ref<string | null>(null)

async function loadTemplates() {
  tplLoading.value = true
  try {
    const [mine, pub] = await Promise.all([
      api.listSQLBuilders(),
      api.listPublicSQLBuilders(),
    ])
    myTpls.value     = mine
    // exclude own items that are already in "ของฉัน"
    const myIds      = new Set(mine.map(i => i.id))
    publicTpls.value = pub.filter(i => !myIds.has(i.id))
  } catch {
    myTpls.value = []; publicTpls.value = []
  } finally {
    tplLoading.value = false
  }
}

async function appendTemplate(item: BIListItem) {
  if (tplAppending.value) return
  tplAppending.value = item.id
  try {
    const data = await api.loadSQLBuilder(item.id)
    if (!data) return
    const rawNodes = JSON.parse(data.nodesJson ?? '[]')
    const rawEdges = JSON.parse(data.edgesJson ?? '[]')

    // Remap IDs to avoid collision with existing nodes
    const suffix = `-${Date.now()}`
    const idMap  = new Map<string, string>()
    const dy     = store.nodes.length
      ? Math.max(...store.nodes.map((n: any) => (n.position?.y ?? 0) + 200)) + 80
      : 0

    const remapped = rawNodes.map((n: any) => {
      const newId = n.id + suffix
      idMap.set(n.id, newId)
      return { ...n, id: newId, position: { x: n.position?.x ?? 0, y: (n.position?.y ?? 0) + dy } }
    })
    const remappedEdges = rawEdges.map((e: any) => ({
      ...e,
      id:     e.id + suffix,
      source: idMap.get(e.source) ?? (e.source + suffix),
      target: idMap.get(e.target) ?? (e.target + suffix),
    }))

    store.nodes = [...store.nodes, ...remapped]
    store.edges = [...store.edges, ...remappedEdges]
  } catch { /* ignore */ }
  finally { tplAppending.value = null }
}

onMounted(() => loadTemplates())

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

// ── Sync status helpers ──────────────────────────────────────────────
const syncLabel = computed(() => {
  switch (store.syncStatus) {
    case 'syncing': return 'กำลัง sync…'
    case 'ok':      return syncAge.value
    case 'stale':   return `cache เก่า · ${syncAge.value}`
    case 'error':   return 'เชื่อมต่อ Mango ไม่ได้'
    default:        return ''
  }
})

const syncAge = computed(() => {
  if (!store.syncLastAt) return ''
  const diffMs  = Date.now() - store.syncLastAt.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1)  return 'เมื่อกี้'
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`
  const h = Math.floor(diffMin / 60)
  return `${h} ชั่วโมงที่แล้ว`
})

const syncDotClass = computed(() => ({
  'idle':    'bg-muted-foreground/30',
  'syncing': 'bg-sky-400 animate-pulse',
  'ok':      'bg-green-400',
  'stale':   'bg-amber-400',
  'error':   'bg-red-500',
}[store.syncStatus] ?? 'bg-muted-foreground/30'))

const syncTooltip = computed(() => ({
  'idle':    '',
  'syncing': 'กำลังดึงข้อมูลจาก Mango…',
  'ok':      'ข้อมูล structure สด จาก Mango API',
  'stale':   'Mango API ตอบไม่ได้ — ใช้ข้อมูล cache ครั้งล่าสุด',
  'error':   'ไม่สามารถเชื่อมต่อ Mango ได้ และไม่มี cache',
}[store.syncStatus] ?? ''))
</script>

<template>
  <aside aria-label="Database Tables" class="w-64 border-r bg-background flex flex-col overflow-hidden shrink-0">

    <!-- Header + Sync Status -->
    <div class="px-3 py-2.5 border-b shrink-0">
      <div class="flex items-center justify-between mb-2">
        <p class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Database Tables</p>

        <!-- Sync status bar -->
        <div v-if="store.syncStatus !== 'idle'" class="flex items-center gap-1.5 min-w-0">
          <span :class="['size-1.5 rounded-full shrink-0', syncDotClass]" />
          <span
            :title="syncTooltip"
            :class="['text-[10px] truncate max-w-[90px]', {
              'text-muted-foreground':  store.syncStatus === 'ok' || store.syncStatus === 'syncing',
              'text-amber-500':         store.syncStatus === 'stale',
              'text-red-500':           store.syncStatus === 'error',
            }]"
          >{{ syncLabel }}</span>
          <button
            @click="erpData.syncNow()"
            :disabled="store.syncStatus === 'syncing'"
            title="Sync ข้อมูลจาก Mango ใหม่"
            class="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw :class="['size-3', store.syncStatus === 'syncing' && 'animate-spin']" />
          </button>
        </div>
      </div>

      <!-- Search -->
      <div class="relative">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <input
          v-model="store.search"
          placeholder="ค้นหา Module / Object…"
          class="w-full text-xs border rounded-md pl-7 pr-7 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-sky-400 placeholder:text-muted-foreground/40"
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
      class="flex flex-col items-center gap-1.5 px-3 py-8 text-center">
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
            class="text-[10px] font-mono shrink-0 px-1 rounded"
            :class="isSearching ? 'text-sky-500 font-semibold' : 'text-muted-foreground'">
            {{ isSearching ? erpData.filteredObjects(mod).length : store.objects[mod].length }}
          </span>
        </button>

        <!-- Objects -->
        <template v-if="isExpanded(mod)">
          <div v-if="store.loadingObjs[mod]" class="px-4 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
            <RefreshCw class="size-3 animate-spin" /> Loading…
          </div>

          <template v-else-if="store.objects[mod]">
            <div v-if="!erpData.filteredObjects(mod).length" class="px-4 py-2 text-xs text-muted-foreground/60">
              ไม่พบข้อมูล
            </div>
            <div
              v-for="obj in erpData.filteredObjects(mod)"
              :key="obj.object_name"
              draggable="true"
              @dragstart="onDragStart($event, obj)"
              :title="`[${obj.menu_id ?? '-'}] ${obj.menu_name || obj.object_name}\n${obj.remark ?? ''}`"
              class="flex items-start gap-2 px-3 py-2 cursor-grab hover:bg-accent transition-colors active:cursor-grabbing border-b border-border/20 last:border-0"
            >
              <!-- type badge -->
              <span :class="['text-[10px] px-1.5 py-0.5 rounded font-semibold font-mono shrink-0 mt-0.5', erpData.objectTypeColor(obj.object_type)]">
                {{ obj.object_type }}
              </span>
              <!-- name + object_name -->
              <div class="flex flex-col min-w-0 gap-0.5 flex-1">
                <div class="flex items-center gap-1.5 min-w-0">
                  <span v-if="obj.menu_id != null"
                    class="text-[9px] px-1.5 py-0 rounded-md bg-sky-500/15 text-sky-500 font-mono font-bold shrink-0 leading-4">
                    {{ obj.menu_id }}
                  </span>
                  <span class="truncate text-xs font-medium leading-snug">
                    {{ obj.menu_name || erpData.objDisplayName(obj) }}
                  </span>
                </div>
                <span class="truncate text-[10px] text-muted-foreground/60 font-mono leading-tight">
                  {{ obj.object_name }}
                </span>
              </div>
            </div>
          </template>
        </template>

      </div>
    </div>

    <!-- ── SQL Builder Templates ────────────────────────────────────── -->
    <div class="border-t shrink-0">

      <!-- Section header -->
      <button
        class="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/60 transition-colors text-left"
        @click="tplOpen = !tplOpen"
      >
        <ChevronRight :class="['size-3.5 text-muted-foreground shrink-0 transition-transform duration-150', tplOpen ? 'rotate-90' : '']" />
        <BookMarked class="size-3.5 text-violet-400 shrink-0" />
        <span class="text-xs font-bold text-muted-foreground uppercase tracking-wide flex-1">Templates</span>
        <Loader2 v-if="tplLoading" class="size-3.5 animate-spin text-muted-foreground shrink-0" />
        <button v-else @click.stop="loadTemplates()" class="text-muted-foreground hover:text-foreground shrink-0" title="รีเฟรช">
          <RefreshCw class="size-3.5" />
        </button>
      </button>

      <div v-if="tplOpen" class="max-h-64 overflow-y-auto">

        <!-- ของฉัน -->
        <div class="px-3 py-1 flex items-center gap-1.5 sticky top-0 bg-background/90 backdrop-blur-sm z-10">
          <Lock class="size-2.5 text-muted-foreground/60" />
          <span class="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wide">ของฉัน</span>
          <span class="text-[9px] text-muted-foreground/40 font-mono">({{ myTpls.length }})</span>
        </div>
        <div v-if="!myTpls.length && !tplLoading"
          class="px-4 pb-2 text-[10px] text-muted-foreground/50 italic">ยังไม่มี</div>
        <button
          v-for="t in myTpls" :key="t.id"
          @click="appendTemplate(t)"
          :disabled="tplAppending === t.id"
          class="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent transition-colors text-left disabled:opacity-50 border-b border-border/10 last:border-0"
        >
          <Loader2 v-if="tplAppending === t.id" class="size-3 animate-spin text-violet-400 shrink-0" />
          <BookMarked v-else class="size-3 text-violet-400 shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="text-xs truncate">{{ t.name }}</p>
            <p class="text-[9px] text-muted-foreground/50 truncate">
              {{ new Date(t.updatedAt ?? t.createdAt).toLocaleDateString('th-TH') }}
            </p>
          </div>
        </button>

        <!-- สาธารณะ -->
        <div class="px-3 py-1 flex items-center gap-1.5 sticky top-0 bg-background/90 backdrop-blur-sm z-10 mt-1">
          <Globe class="size-2.5 text-sky-400/80" />
          <span class="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wide">สาธารณะ</span>
          <span class="text-[9px] text-muted-foreground/40 font-mono">({{ publicTpls.length }})</span>
        </div>
        <div v-if="!publicTpls.length && !tplLoading"
          class="px-4 pb-2 text-[10px] text-muted-foreground/50 italic">ยังไม่มี</div>
        <button
          v-for="t in publicTpls" :key="t.id"
          @click="appendTemplate(t)"
          :disabled="tplAppending === t.id"
          class="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent transition-colors text-left disabled:opacity-50 border-b border-border/10 last:border-0"
        >
          <Loader2 v-if="tplAppending === t.id" class="size-3 animate-spin text-sky-400 shrink-0" />
          <Globe v-else class="size-3 text-sky-400 shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="text-xs truncate">{{ t.name }}</p>
            <p class="text-[9px] text-muted-foreground/50 truncate">
              {{ t.createdBy }} · {{ new Date(t.updatedAt ?? t.createdAt).toLocaleDateString('th-TH') }}
            </p>
          </div>
        </button>

      </div>
    </div>

  </aside>
</template>
