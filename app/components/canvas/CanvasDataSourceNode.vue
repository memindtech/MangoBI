<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { Database, Download, CheckCircle2, Loader2, AlertCircle } from 'lucide-vue-next'
import { MOCK_DATA, DATASET_META, type DatasetKey } from '~/stores/canvas'

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected: boolean
}>()

const canvasStore = useCanvasStore()
const { $xt } = useNuxtApp() as any

// ── Mode ──────────────────────────────────────────────────────────
const mode     = ref<'mock' | 'api'>('mock')
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

function loadData() {
  mode.value === 'api' ? loadAPI() : loadMock()
}
</script>

<template>
  <div
    class="w-60 rounded-xl border-2 bg-background shadow-md transition-all"
    :class="selected ? 'border-orange-400 shadow-lg' : 'border-border'"
  >
    <!-- Header -->
    <div class="flex items-center gap-2 px-3 py-2 bg-orange-50 dark:bg-orange-950/30 rounded-t-xl border-b">
      <Database class="size-4 text-orange-500 shrink-0" />
      <span class="text-xs font-semibold text-orange-700 dark:text-orange-400">Data Source</span>
      <CheckCircle2 v-if="isLoaded" class="ml-auto size-3.5 text-green-500 shrink-0" />
    </div>

    <!-- Mode tabs -->
    <div class="flex border-b text-[10px]">
      <button
        v-for="m in (['mock', 'api'] as const)" :key="m"
        @click.stop="mode = m; errorMsg = ''"
        :class="[
          'flex-1 py-1.5 font-semibold transition-colors',
          mode === m ? 'bg-orange-500 text-white' : 'text-muted-foreground hover:bg-accent',
        ]"
      >
        {{ m === 'mock' ? '📦 Demo' : '🔗 Planning API' }}
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

      <!-- API mode -->
      <template v-else>
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

      <!-- Loaded status -->
      <div v-if="isLoaded" class="rounded-lg bg-green-50 dark:bg-green-950/30 px-2.5 py-2 space-y-1.5">
        <p class="text-[10px] font-semibold text-green-700 dark:text-green-400">
          ✓ {{ output.length }} rows · {{ columns.length }} cols
        </p>
        <div class="flex flex-wrap gap-1">
          <span
            v-for="col in columns" :key="col"
            class="text-[9px] px-1.5 py-0.5 bg-white dark:bg-green-900/40 border rounded text-muted-foreground font-mono"
          >{{ col }}</span>
        </div>
      </div>

      <div v-else-if="!errorMsg" class="text-[10px] text-center text-muted-foreground py-0.5">
        {{ mode === 'mock' ? 'เลือก dataset แล้วกด Load' : 'เลือก endpoint แล้วกด Load' }}
      </div>
    </div>

    <!-- Output handle -->
    <Handle
      id="out"
      type="source"
      :position="Position.Right"
      style="right: -6px; width: 12px; height: 12px; background: #f97316; border: 2px solid white;"
    />
  </div>
</template>
