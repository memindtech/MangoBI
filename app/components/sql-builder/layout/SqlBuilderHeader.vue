<script setup lang="ts">
/**
 * SQL Builder — Header Toolbar
 * Based on ChartDB: ChartDBHeader.vue
 * Added: Template save/load, JSON export, Finish (API save), Load from cloud
 */
import {
  Code2, ArrowRight, Trash2, Undo2, Redo2, Save, FolderOpen,
  BookmarkPlus, BookMarked, Download, X as XIcon, CheckCircle2,
  CloudUpload, CloudDownload, Loader2,
} from 'lucide-vue-next'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { useFlowEvents } from '~/composables/sql-builder/useFlowEvents'
import { useHistory } from '~/composables/sql-builder/useHistory'
import { useJsonGenerator } from '~/composables/sql-builder/useJsonGenerator'
import { useMangoBIApi } from '~/composables/useMangoBIApi'
import type { BIListItem } from '~/composables/useMangoBIApi'

const store = useSqlBuilderStore()
const { sendToDataModel, resetCanvas } = useFlowEvents()
const { undo, redo, canUndo, canRedo } = useHistory()
const { downloadJSON } = useJsonGenerator()
const api = useMangoBIApi()

// ── Template dropdown (localStorage) ─────────────────────────────────────
const showTemplateMenu = ref(false)
const templateName     = ref('')
const templates        = computed(() => store.listTemplates())

function saveTemplate() {
  const name = templateName.value.trim() || `Template ${templates.value.length + 1}`
  store.saveTemplate(name)
  templateName.value  = ''
  showTemplateMenu.value = false
}

function loadTemplate(id: string) {
  addLocalToCanvas(id)
  showTemplateMenu.value = false
}

function deleteTemplate(id: string) {
  store.deleteTemplate(id)
}

function closeTemplateMenu() { showTemplateMenu.value = false }

// ── Finish (Save to API) ──────────────────────────────────────────────────
const showFinishModal = ref(false)
const finishName      = ref('')
const finishSaving    = ref(false)
const finishError     = ref('')
const finishSuccess   = ref(false)
const currentSavedId  = ref<string | null>(null)

function openFinishModal() {
  finishName.value    = ''
  finishError.value   = ''
  finishSuccess.value = false
  showFinishModal.value = true
}

async function doFinish() {
  const name = finishName.value.trim()
  if (!name) { finishError.value = 'กรุณาระบุชื่อ'; return }
  finishSaving.value = true
  finishError.value  = ''
  try {
    const id = await api.saveSQLBuilder({
      id:        currentSavedId.value ?? undefined,
      name,
      nodesJson: JSON.stringify(store.nodes),
      edgesJson: JSON.stringify(store.edges),
      sqlText:   store.generatedSQL,
    })
    if (id) {
      currentSavedId.value = id
      finishSuccess.value  = true
      setTimeout(() => { showFinishModal.value = false; finishSuccess.value = false }, 1200)
    } else {
      finishError.value = 'บันทึกไม่สำเร็จ'
    }
  } catch (e: any) {
    finishError.value = e?.message ?? 'เกิดข้อผิดพลาด'
  } finally {
    finishSaving.value = false
  }
}

// ── Load from cloud / templates ───────────────────────────────────────────
const showLoadModal   = ref(false)
const cloudItems      = ref<BIListItem[]>([])
const loadingCloud    = ref(false)
const deletingId      = ref<string | null>(null)
const loadTab         = ref<'cloud' | 'local'>('cloud')
const appendingId     = ref<string | null>(null)

const localTemplates  = computed(() => store.listTemplates())

async function openLoadModal() {
  showLoadModal.value = true
  loadingCloud.value  = true
  loadTab.value       = 'cloud'
  try {
    cloudItems.value = await api.listSQLBuilders()
  } catch {
    cloudItems.value = []
  } finally {
    loadingCloud.value = false
  }
}

/** Remap node IDs + edge refs, offset positions, then append to canvas */
function appendNodesToCanvas(rawNodes: any[], rawEdges: any[]) {
  const suffix = `-${Date.now()}`
  const idMap  = new Map<string, string>()

  // Compute Y offset to place below existing nodes
  let dy = 0
  if (store.nodes.length) {
    const maxY = Math.max(...store.nodes.map((n: any) => (n.position?.y ?? 0) + 200))
    dy = maxY + 80
  }

  const remappedNodes = rawNodes.map((n: any) => {
    const newId = n.id + suffix
    idMap.set(n.id, newId)
    return {
      ...n,
      id: newId,
      position: { x: n.position?.x ?? 0, y: (n.position?.y ?? 0) + dy },
    }
  })

  const remappedEdges = rawEdges.map((e: any) => ({
    ...e,
    id:     e.id + suffix,
    source: idMap.get(e.source) ?? (e.source + suffix),
    target: idMap.get(e.target) ?? (e.target + suffix),
  }))

  store.nodes = [...store.nodes, ...remappedNodes]
  store.edges = [...store.edges, ...remappedEdges]
}

async function addCloudToCanvas(item: BIListItem) {
  appendingId.value = item.id
  try {
    const data = await api.loadSQLBuilder(item.id)
    if (!data) return
    const nodes = JSON.parse(data.nodesJson ?? '[]')
    const edges = JSON.parse(data.edgesJson ?? '[]')
    appendNodesToCanvas(nodes, edges)
    // Set as current save target if canvas was empty before
    if (!currentSavedId.value) {
      currentSavedId.value = item.id
      finishName.value     = item.name
    }
  } catch {
    // ignore
  } finally {
    appendingId.value = null
  }
}

function addLocalToCanvas(id: string) {
  const tpl = store.listTemplates().find((t: any) => t.id === id)
  if (!tpl) return
  appendNodesToCanvas(tpl.nodes ?? [], tpl.edges ?? [])
}

async function deleteFromCloud(id: string) {
  deletingId.value = id
  try {
    await api.deleteSQLBuilder(id)
    cloudItems.value = cloudItems.value.filter(i => i.id !== id)
  } finally {
    deletingId.value = null
  }
}

function nodeStats(nodes: any[]) {
  const tables = nodes.filter((n: any) => n.type === 'sqlTable').length
  const tools  = nodes.filter((n: any) => n.type === 'toolNode').length
  return { tables, tools, total: nodes.length }
}
</script>

<template>
  <header class="flex items-center gap-3 px-4 h-11 border-b shrink-0 bg-background z-20">
    <!-- Title -->
    <div class="flex items-center gap-2">
      <div class="flex size-7 items-center justify-center rounded-lg bg-sky-500/10 border border-sky-500/20">
        <Code2 class="size-3.5 text-sky-500" />
      </div>
      <span class="font-semibold text-sm">SQL Builder</span>
    </div>

    <div class="h-4 w-px bg-border" />

    <!-- Stats -->
    <span class="text-xs text-muted-foreground">
      {{ store.tableNodes.length }} tables ·
      {{ store.edges.length }} joins ·
      {{ store.toolNodes.length }} operations
    </span>

    <!-- Actions -->
    <div class="ml-auto flex items-center gap-2">

      <!-- Undo / Redo -->
      <button @click="undo" :disabled="!canUndo"
        class="flex items-center gap-1 text-xs px-2 py-1.5 border rounded-lg hover:bg-accent transition-colors disabled:opacity-30"
        title="Undo (Ctrl+Z)">
        <Undo2 class="size-3.5" />
      </button>
      <button @click="redo" :disabled="!canRedo"
        class="flex items-center gap-1 text-xs px-2 py-1.5 border rounded-lg hover:bg-accent transition-colors disabled:opacity-30"
        title="Redo (Ctrl+Y)">
        <Redo2 class="size-3.5" />
      </button>

      <div class="h-4 w-px bg-border" />

      <!-- Save / Load (browser storage) -->
      <button @click="store.saveToStorage()"
        class="flex items-center gap-1 text-xs px-2 py-1.5 border rounded-lg hover:bg-accent transition-colors"
        title="Save to browser">
        <Save class="size-3.5" />
      </button>
      <button @click="store.loadFromStorage()"
        class="flex items-center gap-1 text-xs px-2 py-1.5 border rounded-lg hover:bg-accent transition-colors"
        title="Load from browser">
        <FolderOpen class="size-3.5" />
      </button>

      <div class="h-4 w-px bg-border" />

      <!-- Template save/load dropdown -->
      <div class="relative">
        <button
          @click="showTemplateMenu = !showTemplateMenu"
          class="flex items-center gap-1 text-xs px-2 py-1.5 border rounded-lg hover:bg-accent transition-colors"
          title="Templates"
        >
          <BookMarked class="size-3.5" />
          <span class="hidden sm:inline">Templates</span>
        </button>

        <!-- Invisible backdrop to close on outside click -->
        <div v-if="showTemplateMenu" class="fixed inset-0 z-40" @click="closeTemplateMenu" />

        <Transition name="fade">
          <div
            v-if="showTemplateMenu"
            class="absolute right-0 top-full mt-1 z-50 bg-background border rounded-xl shadow-2xl w-64 overflow-hidden"
          >
            <!-- Save section -->
            <div class="p-3 border-b">
              <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">บันทึก Template</p>
              <div class="flex gap-1.5">
                <input v-model="templateName" placeholder="ชื่อ template…"
                  class="flex-1 text-xs border rounded-lg px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-sky-400" />
                <button @click="saveTemplate"
                  class="flex items-center gap-1 text-xs px-2.5 py-1 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-semibold transition-colors">
                  <BookmarkPlus class="size-3" />
                </button>
              </div>
            </div>

            <!-- Saved templates list -->
            <div class="max-h-48 overflow-y-auto">
              <div v-if="!templates.length" class="px-3 py-4 text-xs text-muted-foreground/60 text-center italic">
                ยังไม่มี template ที่บันทึก
              </div>
              <div
                v-for="tpl in templates" :key="tpl.id"
                class="flex items-center gap-2 px-3 py-2 hover:bg-accent transition-colors"
              >
                <button @click="loadTemplate(tpl.id)"
                  class="flex-1 text-left text-xs font-medium truncate hover:text-sky-500">
                  {{ tpl.name }}
                </button>
                <span class="text-[9px] text-muted-foreground/60 shrink-0">
                  {{ new Date(tpl.createdAt).toLocaleDateString('th-TH') }}
                </span>
                <button @click.stop="deleteTemplate(tpl.id)"
                  class="size-4 flex items-center justify-center text-muted-foreground hover:text-destructive shrink-0">
                  <Trash2 class="size-3" />
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>

      <!-- JSON Export -->
      <button @click="downloadJSON" :disabled="!store.hasNodes"
        class="flex items-center gap-1 text-xs px-2 py-1.5 border rounded-lg hover:bg-accent transition-colors disabled:opacity-30"
        title="Export JSON">
        <Download class="size-3.5" />
        <span class="hidden sm:inline">JSON</span>
      </button>

      <div class="h-4 w-px bg-border" />

      <!-- Load from cloud -->
      <button @click="openLoadModal"
        class="flex items-center gap-1 text-xs px-2 py-1.5 border rounded-lg hover:bg-accent transition-colors"
        title="โหลด template จาก cloud">
        <CloudDownload class="size-3.5" />
        <span class="hidden sm:inline">Load</span>
      </button>

      <!-- Finish (Save to API) -->
      <button @click="openFinishModal" :disabled="!store.hasNodes"
        class="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-40"
        title="บันทึกลง server">
        <CloudUpload class="size-3.5" />
        Finish
      </button>

      <!-- Send to DataModel -->
      <button @click="sendToDataModel" :disabled="!store.generatedSQL"
        class="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-40">
        <ArrowRight class="size-3.5" /> DataModel
      </button>

      <!-- Clear -->
      <button @click="resetCanvas"
        class="text-xs px-2 py-1.5 border rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors"
        title="Clear canvas">
        <Trash2 class="size-3.5" />
      </button>
    </div>
  </header>

  <!-- ── Finish Modal ──────────────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showFinishModal"
        class="fixed inset-0 z-[200] flex items-center justify-center bg-black/50"
        @click.self="showFinishModal = false">
        <div class="bg-background border rounded-2xl shadow-2xl w-full max-w-sm p-6">
          <div class="flex items-center gap-2 mb-4">
            <CloudUpload class="size-5 text-emerald-500" />
            <h2 class="font-bold text-sm">บันทึก SQL Builder</h2>
            <button @click="showFinishModal = false" class="ml-auto text-muted-foreground hover:text-foreground">
              <XIcon class="size-4" />
            </button>
          </div>

          <!-- Success state -->
          <div v-if="finishSuccess" class="flex flex-col items-center gap-3 py-4">
            <CheckCircle2 class="size-10 text-emerald-500" />
            <p class="text-sm font-semibold text-emerald-600">บันทึกสำเร็จ</p>
          </div>

          <!-- Form state -->
          <template v-else>
            <label class="text-xs text-muted-foreground mb-1 block">ชื่อ</label>
            <input
              v-model="finishName"
              placeholder="ตั้งชื่อ SQL Builder…"
              class="w-full text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-emerald-500/50 mb-3"
              @keydown.enter="doFinish"
              autofocus
            />

            <p v-if="finishError" class="text-xs text-destructive mb-2">{{ finishError }}</p>

            <div class="flex gap-2 justify-end">
              <button @click="showFinishModal = false"
                class="text-xs px-3 py-1.5 border rounded-lg hover:bg-accent transition-colors">
                ยกเลิก
              </button>
              <button @click="doFinish" :disabled="finishSaving"
                class="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50">
                <Loader2 v-if="finishSaving" class="size-3.5 animate-spin" />
                <CloudUpload v-else class="size-3.5" />
                บันทึก
              </button>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ── Load Modal (Cloud + Local templates) ──────────────────────────── -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showLoadModal"
        class="fixed inset-0 z-[200] flex items-center justify-center bg-black/50"
        @click.self="showLoadModal = false">
        <div class="bg-background border rounded-2xl shadow-2xl w-full max-w-lg p-6">
          <!-- Header -->
          <div class="flex items-center gap-2 mb-4">
            <CloudDownload class="size-5 text-sky-500" />
            <h2 class="font-bold text-sm">เพิ่ม Template ลง Canvas</h2>
            <button @click="showLoadModal = false" class="ml-auto text-muted-foreground hover:text-foreground">
              <XIcon class="size-4" />
            </button>
          </div>

          <!-- Tabs -->
          <div class="flex gap-1 mb-3 p-1 bg-muted/50 rounded-lg">
            <button
              @click="loadTab = 'cloud'"
              :class="['flex-1 text-xs py-1 rounded-md font-medium transition-colors',
                loadTab === 'cloud' ? 'bg-background shadow text-sky-600' : 'text-muted-foreground hover:text-foreground']"
            >
              Cloud <span class="text-[10px] opacity-60">({{ cloudItems.length }})</span>
            </button>
            <button
              @click="loadTab = 'local'"
              :class="['flex-1 text-xs py-1 rounded-md font-medium transition-colors',
                loadTab === 'local' ? 'bg-background shadow text-sky-600' : 'text-muted-foreground hover:text-foreground']"
            >
              Local <span class="text-[10px] opacity-60">({{ localTemplates.length }})</span>
            </button>
          </div>

          <!-- ── Cloud tab ── -->
          <div v-if="loadTab === 'cloud'">
            <div v-if="loadingCloud" class="flex items-center justify-center gap-2 py-8 text-muted-foreground text-xs">
              <Loader2 class="size-4 animate-spin" /> กำลังโหลด…
            </div>
            <div v-else-if="!cloudItems.length" class="text-center py-8 text-xs text-muted-foreground/60 italic">
              ยังไม่มีข้อมูล Cloud ที่บันทึกไว้
            </div>
            <div v-else class="flex flex-col gap-1 max-h-80 overflow-y-auto -mx-1 px-1">
              <div
                v-for="item in cloudItems" :key="item.id"
                class="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-accent transition-colors group"
              >
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">{{ item.name }}</p>
                  <p class="text-[10px] text-muted-foreground/60">
                    {{ new Date(item.updatedAt ?? item.createdAt).toLocaleString('th-TH') }}
                  </p>
                </div>
                <!-- Add to canvas button -->
                <button
                  @click.stop="addCloudToCanvas(item)"
                  :disabled="appendingId === item.id"
                  class="flex items-center gap-1 text-[10px] px-2.5 py-1 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 shrink-0"
                  title="เพิ่มลง Canvas"
                >
                  <Loader2 v-if="appendingId === item.id" class="size-3 animate-spin" />
                  <span v-else>+ Add</span>
                </button>
                <!-- Delete -->
                <button
                  @click.stop="deleteFromCloud(item.id)"
                  :disabled="deletingId === item.id"
                  class="size-7 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all disabled:opacity-50 shrink-0"
                >
                  <Loader2 v-if="deletingId === item.id" class="size-3.5 animate-spin" />
                  <Trash2 v-else class="size-3.5" />
                </button>
              </div>
            </div>
          </div>

          <!-- ── Local tab ── -->
          <div v-else>
            <div v-if="!localTemplates.length" class="text-center py-8 text-xs text-muted-foreground/60 italic">
              ยังไม่มี Template ที่บันทึกไว้ในเครื่อง
            </div>
            <div v-else class="flex flex-col gap-1 max-h-80 overflow-y-auto -mx-1 px-1">
              <div
                v-for="tpl in localTemplates" :key="tpl.id"
                class="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-accent transition-colors group"
              >
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">{{ tpl.name }}</p>
                  <p class="text-[10px] text-muted-foreground/60">
                    {{ nodeStats(tpl.nodes ?? []).tables }} tables ·
                    {{ nodeStats(tpl.nodes ?? []).tools }} ops ·
                    {{ new Date(tpl.createdAt).toLocaleDateString('th-TH') }}
                  </p>
                </div>
                <!-- Add to canvas -->
                <button
                  @click.stop="addLocalToCanvas(tpl.id)"
                  class="flex items-center gap-1 text-[10px] px-2.5 py-1 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-semibold transition-colors shrink-0"
                  title="เพิ่มลง Canvas"
                >
                  + Add
                </button>
                <!-- Delete -->
                <button
                  @click.stop="deleteTemplate(tpl.id)"
                  class="size-7 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all shrink-0"
                >
                  <Trash2 class="size-3.5" />
                </button>
              </div>
            </div>
          </div>

          <!-- Footer hint -->
          <p class="text-[10px] text-muted-foreground/50 text-center mt-3">
            กด "+ Add" เพื่อเพิ่ม template เข้า canvas (ไม่แทนที่ข้อมูลเดิม)
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
