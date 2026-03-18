<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { Database, Download, CheckCircle2, Loader2, AlertCircle } from 'lucide-vue-next'
import { MOCK_DATA, DATASET_META, type DatasetKey } from '~/stores/canvas'

const { nodeEl, width, onDragStart } = useNodeResize(200)

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected: boolean
  dragging?: boolean
}>()

const canvasStore = useCanvasStore()
const { $xt } = useNuxtApp() as any

// ── Mode ──────────────────────────────────────────────────────────
const mode     = ref<'mock' | 'api' | 'sql'>('mock')
const loading  = ref(false)
const errorMsg = ref('')

// ── Mock mode ─────────────────────────────────────────────────────
const selectedKey    = ref<DatasetKey>('sales_monthly')
const datasetOptions = Object.entries(DATASET_META).map(([key, m]) => ({
  key: key as DatasetKey,
  label: m.label,
}))

// ── API mode ──────────────────────────────────────────────────────
// endpoint presets จาก WORKFLOW_FRONTEND.md
const PRESETS = [
  { label: 'รายการ Planning ทั้งหมด',     method: 'GET',  path: 'Planning/Planning/Planning_ReadList',              body: '' },
  { label: 'Plan Config',                  method: 'GET',  path: 'Planning/Plan/ppn_config',                         body: '' },
  { label: 'Progress รายการ',             method: 'POST', path: 'Planning/Planning/Planning_Progress_ReadList',      body: '{"pre_event":"","plan_code":""}' },
  { label: 'S-Curve',                      method: 'POST', path: 'Planning/Planning/Planning_S_Curve',               body: '{"pre_event":"","plan_code":""}' },
  { label: 'Plan Detail',                  method: 'POST', path: 'Planning/Plan/Planning_plan_viewall',              body: '{"pre_event":"","plan_code":""}' },
  { label: 'Task Summary',                 method: 'POST', path: 'Planning/Plan/Planning_work_tasks_summary',        body: '{"pre_event":"","plan_code":""}' },
  { label: 'สรุปวัสดุ',                   method: 'POST', path: 'Planning/Planning/Planning_Summary_Material',      body: '{"pre_event":"","plan_code":""}' },
  { label: 'สรุปแรงงาน',                  method: 'POST', path: 'Planning/Planning/Planning_Summary_worker',        body: '{"pre_event":"","plan_code":""}' },
  { label: 'Gantt Tasks',                  method: 'POST', path: 'Planning/Plan/onLoadPlanTasks',                   body: '{"pre_event":"","plan_code":""}' },
  { label: 'Custom...',                    method: 'GET',  path: '',                                                  body: '' },
]

const selectedPreset = ref(0)
const apiMethod      = ref<'GET' | 'POST'>('GET')
const apiPath        = ref('Planning/Planning/Planning_ReadList')
const apiBody        = ref('')

// เมื่อเลือก preset → ใส่ค่าให้อัตโนมัติ
watch(selectedPreset, (idx) => {
  const p = PRESETS[idx]
  if (!p) return
  apiMethod.value = p.method as 'GET' | 'POST'
  apiPath.value   = p.path
  apiBody.value   = p.body
})

// ── SQL Template mode ─────────────────────────────────────────────
const sqlPasscode        = ref('')
const sqlTemplates       = ref<{ template_id: number; template_name: string }[]>([])
const selectedTemplateId = ref<number | null>(null)
const sqlTemplatesLoaded = ref(false)

async function fetchSqlTemplates() {
  if (!sqlPasscode.value.trim()) return
  sqlTemplatesLoaded.value = false
  sqlTemplates.value = []
  selectedTemplateId.value = null
  try {
    const res: any = await $xt.getServer(`Planning/Master/GetSqlFlowTemplate?passcode=${encodeURIComponent(sqlPasscode.value.trim())}`)
    sqlTemplates.value = Array.isArray(res?.data) ? res.data : []
    if (sqlTemplates.value.length) selectedTemplateId.value = sqlTemplates.value[0].template_id
  } catch {
    sqlTemplates.value = []
  }
  sqlTemplatesLoaded.value = true
}

watch(mode, (m) => { if (m === 'sql') sqlTemplatesLoaded.value = false })

// ── Output state ──────────────────────────────────────────────────
const output   = computed(() => canvasStore.nodeOutputs[props.id] ?? [])
const isLoaded = computed(() => output.value.length > 0)
const columns  = computed(() => output.value.length ? Object.keys(output.value[0]) : [])

// ── Load: Mock ────────────────────────────────────────────────────
async function loadMock() {
  loading.value = true
  errorMsg.value = ''
  await new Promise(r => setTimeout(r, 600))
  canvasStore.setNodeOutput(props.id, MOCK_DATA[selectedKey.value])
  loading.value = false
}

// ── Load: Planning API ────────────────────────────────────────────
// ใช้ $xt ซึ่ง handle X-Mango-Auth + X-Mango-Session-ID ให้อัตโนมัติ
async function loadAPI() {
  const path = apiPath.value.trim()
  if (!path) { errorMsg.value = 'กรุณากรอก Endpoint'; return }

  loading.value = true
  errorMsg.value = ''
  try {
    let res: any

    if (apiMethod.value === 'GET') {
      res = await $xt.getServer(path)
    } else {
      // parse body JSON → form-data หรือ JSON object
      let body: any = {}
      if (apiBody.value.trim()) {
        try { body = JSON.parse(apiBody.value) } catch { body = {} }
      }
      res = await $xt.postServerJson(path, body)
    }

    // ลอง parse หลาย format ที่ Planning API ส่งกลับมา
    const rows = extractRows(res)
    if (!rows) throw new Error('ไม่พบ Array ในผลลัพธ์')

    canvasStore.setNodeOutput(props.id, rows)
  } catch (e: any) {
    errorMsg.value = e?.message ?? 'เกิดข้อผิดพลาด'
  } finally {
    loading.value = false
  }
}

// พยายาม extract array จาก response format ต่างๆ
function extractRows(res: any): any[] | null {
  if (Array.isArray(res))              return res
  if (Array.isArray(res?.data))        return res.data
  if (Array.isArray(res?.rows))        return res.rows
  if (Array.isArray(res?.json))        return res.json
  if (Array.isArray(res?.list))        return res.list
  if (Array.isArray(res?.result))      return res.result
  if (Array.isArray(res?.items))       return res.items
  // object เดียว → wrap เป็น array
  if (res && typeof res === 'object' && !Array.isArray(res)) return [res]
  return null
}

// ── Load: SQL Template ────────────────────────────────────────────
async function loadSQL() {
  if (!selectedTemplateId.value) { errorMsg.value = 'กรุณาเลือก Template'; return }
  loading.value = true
  errorMsg.value = ''
  try {
    const res: any = await $xt.getServer(`Planning/Master/ExecuteSqlFlowTemplate?template_id=${selectedTemplateId.value}&passcode=${encodeURIComponent(sqlPasscode.value.trim())}`)
    if (res?.error) throw new Error(res.error)
    const rows = extractRows(res)
    if (!rows) throw new Error('ไม่พบข้อมูล')
    canvasStore.setNodeOutput(props.id, rows)
  } catch (e: any) {
    errorMsg.value = e?.message ?? 'เกิดข้อผิดพลาด'
  } finally {
    loading.value = false
  }
}

function loadData() {
  if (mode.value === 'api') loadAPI()
  else if (mode.value === 'sql') loadSQL()
  else loadMock()
}
</script>

<template>
  <div ref="nodeEl" class="relative" :style="{ width }">
  <div
    class="rounded-xl border-2 bg-background shadow-md transition-[border-color,box-shadow] overflow-hidden"
    style="will-change: transform;"
    :class="selected ? 'border-orange-400 shadow-lg' : 'border-border'"
  >
    <!-- Header -->
    <div class="flex items-center gap-2 px-3 py-2 bg-orange-50 dark:bg-orange-950/30 rounded-t-xl border-b">
      <Database class="size-4 text-orange-500 shrink-0" />
      <span class="text-xs font-semibold text-orange-700 dark:text-orange-400">Data Source</span>
      <div v-if="isLoaded" class="ml-auto flex items-center gap-1.5">
        <span class="text-[10px] font-mono text-green-600 dark:text-green-400">{{ output.length.toLocaleString() }} rows</span>
        <CheckCircle2 class="size-3.5 text-green-500 shrink-0" />
      </div>
    </div>

    <!-- Drag placeholder -->
    <div v-if="dragging" class="px-3 py-4 text-center text-[10px] text-muted-foreground">
      {{ isLoaded ? `${output.length.toLocaleString()} rows · ${mode.toUpperCase()}` : mode.toUpperCase() }}
    </div>

    <template v-else>
    <!-- Mode tabs -->
    <div class="flex border-b text-[10px]">
      <button
        v-for="[m, label] in ([['mock','📦 Demo'],['api','🔗 API'],['sql','🗄️ SQL']] as const)"
        :key="m"
        @click.stop="mode = m; errorMsg = ''"
        :class="[
          'flex-1 py-1.5 font-semibold transition-colors',
          mode === m ? 'bg-orange-500 text-white' : 'text-muted-foreground hover:bg-accent',
        ]"
      >
        {{ label }}
      </button>
    </div>

    <!-- Body -->
    <div class="p-3 flex flex-col gap-2">

      <!-- MOCK mode -->
      <template v-if="mode === 'mock'">
        <select
          v-model="selectedKey"
          class="w-full text-xs border rounded-lg px-2 py-1.5 bg-background nodrag focus:outline-none focus:ring-1 focus:ring-orange-400"
          @click.stop @mousedown.stop
        >
          <option v-for="ds in datasetOptions" :key="ds.key" :value="ds.key">
            {{ ds.label }}
          </option>
        </select>
      </template>

      <!-- SQL Template mode -->
      <template v-else-if="mode === 'sql'">
        <!-- Passcode -->
        <div class="space-y-1">
          <p class="text-[10px] font-semibold text-muted-foreground">Passcode</p>
          <div class="flex gap-1.5">
            <input
              v-model="sqlPasscode"
              type="text"
              placeholder="กรอก passcode..."
              class="flex-1 text-xs border rounded-lg px-2 py-1.5 bg-background nodrag
                     focus:outline-none focus:ring-1 focus:ring-orange-400 min-w-0 font-mono tracking-wider"
              @click.stop @mousedown.stop @keydown.stop
              @keydown.enter.stop="fetchSqlTemplates"
            />
            <button
              @click.stop="fetchSqlTemplates"
              class="px-2.5 text-[10px] font-semibold bg-orange-100 dark:bg-orange-900/40
                     text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-700
                     rounded-lg hover:bg-orange-200 dark:hover:bg-orange-800/50 transition-colors nodrag shrink-0"
            >
              ค้นหา
            </button>
          </div>
        </div>

        <!-- Template -->
        <template v-if="sqlTemplatesLoaded">
          <div v-if="sqlTemplates.length" class="space-y-1">
            <div class="flex items-center justify-between">
              <p class="text-[10px] font-semibold text-muted-foreground">Template</p>
              <span class="text-[10px] text-orange-500">{{ sqlTemplates.length }} รายการ</span>
            </div>
            <select
              v-model="selectedTemplateId"
              class="w-full text-xs border rounded-lg px-2 py-1.5 bg-background nodrag
                     focus:outline-none focus:ring-1 focus:ring-orange-400"
              @click.stop @mousedown.stop
            >
              <option v-for="t in sqlTemplates" :key="t.template_id" :value="t.template_id">
                {{ t.template_name }}
              </option>
            </select>
          </div>
          <div v-else class="flex items-center justify-center gap-1.5 py-2 text-[10px] text-muted-foreground border border-dashed rounded-lg">
            ไม่พบ Template สำหรับ passcode นี้
          </div>
        </template>
      </template>

      <!-- API mode -->
      <template v-else-if="mode === 'api'">
        <!-- Preset selector -->
        <select
          v-model="selectedPreset"
          class="w-full text-xs border rounded-lg px-2 py-1.5 bg-background nodrag focus:outline-none focus:ring-1 focus:ring-orange-400"
          @click.stop @mousedown.stop
        >
          <option v-for="(p, i) in PRESETS" :key="i" :value="i">
            {{ p.label }}
          </option>
        </select>

        <!-- Method + Path -->
        <div class="flex gap-1">
          <select
            v-model="apiMethod"
            class="text-xs border rounded-lg px-1.5 py-1 bg-background nodrag focus:outline-none w-16 shrink-0"
            @click.stop @mousedown.stop
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
          <input
            v-model="apiPath"
            class="flex-1 text-[10px] border rounded-lg px-2 py-1 bg-background nodrag font-mono focus:outline-none focus:ring-1 focus:ring-orange-400 min-w-0"
            placeholder="Planning/Planning/..."
            @click.stop @mousedown.stop @keydown.stop
          />
        </div>

        <!-- Body (POST only) -->
        <template v-if="apiMethod === 'POST'">
          <textarea
            v-model="apiBody"
            rows="2"
            placeholder='{"pre_event":"P001","plan_code":"PL001"}'
            class="w-full text-[10px] border rounded-lg px-2 py-1.5 bg-background nodrag
                   font-mono resize-none focus:outline-none focus:ring-1 focus:ring-orange-400"
            @click.stop @mousedown.stop @keydown.stop
            spellcheck="false"
          />
        </template>
      </template>

      <!-- Load button -->
      <button
        @click.stop="loadData"
        :disabled="loading"
        class="w-full flex items-center justify-center gap-1.5 text-xs py-1.5
               bg-orange-500 hover:bg-orange-600 text-white rounded-lg
               transition-colors disabled:opacity-60 nodrag"
      >
        <Loader2 v-if="loading" class="size-3 animate-spin" />
        <Download v-else class="size-3" />
        {{ loading ? 'กำลังโหลด...' : 'Load Data' }}
      </button>

      <!-- Error message -->
      <div
        v-if="errorMsg"
        class="flex items-start gap-1.5 text-[10px] text-destructive bg-destructive/10 rounded-lg px-2 py-1.5"
      >
        <AlertCircle class="size-3 shrink-0 mt-0.5" />
        <span class="break-all">{{ errorMsg }}</span>
      </div>

    </div>
    </template><!-- end v-else dragging -->

  </div><!-- end card -->

  <!-- Handle outside overflow-hidden -->
  <Handle
    id="out"
    type="source"
    :position="Position.Right"
    style="right: -6px; width: 12px; height: 12px; background: #f97316; border: 2px solid white;"
  />

  <!-- Right-edge resize strip -->
  <div
    class="absolute right-0 top-0 h-full w-2 cursor-ew-resize hover:bg-orange-400/40 rounded-r-xl nodrag z-10"
    @mousedown.stop="onDragStart"
  />
  </div><!-- end root -->
</template>
