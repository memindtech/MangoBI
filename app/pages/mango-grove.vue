<script setup lang="ts">
import { RefreshCw, Activity, AlertTriangle, ChevronDown, ChevronRight, DatabaseZap, Loader2, CheckCircle2, XCircle, Trash2, ScrollText, Cpu } from 'lucide-vue-next'
import { useMangoBIApi } from '~/composables/useMangoBIApi'

definePageMeta({
  auth: true,
  mangoMenu: { checkUserRight: false, menu_name: 'PLANWEB', menu_id: '' },
})
useHead({ title: 'MangoBI — Diagnostics' })

const ALLOWED = new Set(['mango', 'itmango', 'chanchai'])

const { $xt }   = useNuxtApp() as any
const authStore = useAuthStore()
const router    = useRouter()
const api       = useMangoBIApi()

const allowed = computed(() =>
  ALLOWED.has((authStore.auth?.userid ?? '').toLowerCase())
)

// ── Diagnostics (Info — every 10s) ───────────────────────────────────────────
const data      = ref<any>(null)
const loading   = ref(false)
const error     = ref('')
const lastFetch = ref<Date | null>(null)
const expandedLog = ref<string | null>(null)

async function fetchDiag() {
  loading.value = true
  error.value   = ''
  try {
    const res: any = await $xt.getServer('Planning/Diagnostics/Info')
    data.value    = res?.data ?? null
    lastFetch.value = new Date()
  } catch (e: any) {
    error.value = e?.message ?? 'เกิดข้อผิดพลาด'
  } finally {
    loading.value = false
  }
}

// ── Real-time Metrics (every 2s) ──────────────────────────────────────────────
const metrics = ref<any>(null)

async function fetchMetrics() {
  try {
    const res: any = await $xt.getServer('Planning/Diagnostics/Metrics')
    metrics.value = res?.data ?? null
  } catch { /* silent */ }
}

let _timerInfo: ReturnType<typeof setInterval> | null = null
let _timerMetrics: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (!allowed.value) { router.replace('/'); return }
  fetchDiag()
  fetchMetrics()
  fetchOnline()
  _timerInfo    = setInterval(() => { fetchDiag(); fetchOnline() }, 10_000)
  _timerMetrics = setInterval(fetchMetrics, 2_000)
})
onUnmounted(() => {
  if (_timerInfo)    clearInterval(_timerInfo)
  if (_timerMetrics) clearInterval(_timerMetrics)
})

// ── Update Structure ──────────────────────────────────────────────────────────
const updating    = ref(false)
const updateMsgs  = ref<string[]>([])
const updateErr   = ref('')
const updateDone  = ref(false)

async function runUpdateStructure() {
  updating.value   = true
  updateErr.value  = ''
  updateMsgs.value = []
  updateDone.value = false
  try {
    const res = await api.updateStructure()
    updateMsgs.value = res?.messages ?? []
    updateDone.value = true
  } catch (e: any) {
    updateErr.value = e?.message ?? 'เกิดข้อผิดพลาด'
  } finally {
    updating.value = false
  }
}

// ── Online Users (every 10s) ──────────────────────────────────────────────────
const onlineUsers = ref<any[]>([])
const onlineCount = ref(0)

async function fetchOnline() {
  try {
    const res: any = await $xt.getServer('Planning/Diagnostics/OnlineUsers')
    onlineUsers.value = res?.data?.users ?? []
    onlineCount.value = res?.data?.count ?? 0
  } catch { /* silent */ }
}

function fmtIdle(sec: number) {
  if (sec < 60)  return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  return `${Math.floor(sec / 3600)}h ago`
}

// ── Top Processes ─────────────────────────────────────────────────────────────
const topProcs        = ref<any>(null)
const topProcsLoading = ref(false)
const topProcsTab     = ref<'cpu' | 'mem'>('cpu')

async function fetchTopProcs() {
  topProcsLoading.value = true
  try {
    const res: any = await $xt.getServer('Planning/Diagnostics/TopProcesses')
    topProcs.value = res?.data ?? null
  } catch { /* silent */ }
  finally { topProcsLoading.value = false }
}

let _timerTopProcs: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  fetchTopProcs()
  _timerTopProcs = setInterval(fetchTopProcs, 15_000)
})
onUnmounted(() => { if (_timerTopProcs) clearInterval(_timerTopProcs) })

// ── App Logs ──────────────────────────────────────────────────────────────────
const appLogs        = ref<any[]>([])
const appLogsLoading = ref(false)
const selectedDate   = ref<string>('')
const clearing       = ref<'app' | 'error' | null>(null)

async function fetchAppLogs() {
  appLogsLoading.value = true
  try {
    const res: any = await $xt.getServer('Planning/Diagnostics/AppLogs')
    appLogs.value = res?.data?.logs ?? []
    if (appLogs.value.length && !selectedDate.value)
      selectedDate.value = appLogs.value[0]?.date ?? ''
  } finally {
    appLogsLoading.value = false
  }
}

async function clearAppLogs() {
  if (!confirm('ลบ App Logs ทั้งหมด?')) return
  clearing.value = 'app'
  try {
    await $xt.postServerJson('Planning/Diagnostics/ClearAppLogs', {})
    appLogs.value = []
    selectedDate.value = ''
  } finally { clearing.value = null }
}

async function clearErrorLogs() {
  if (!confirm('ลบ Error Logs ทั้งหมด?')) return
  clearing.value = 'error'
  try {
    await $xt.postServerJson('Planning/Diagnostics/ClearErrorLogs', {})
    if (data.value) data.value.errorLogs = []
  } finally { clearing.value = null }
}

const selectedLog = computed(() =>
  appLogs.value.find(l => l.date === selectedDate.value)
)

function lineColor(line: string) {
  if (line.includes('[ERROR]')) return 'text-rose-400'
  if (line.includes('[WARN]'))  return 'text-amber-400'
  return 'text-slate-300'
}

onMounted(() => { fetchAppLogs() })

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtMb(n: number) { return `${n?.toLocaleString()} MB` }

const ramUsedPct = computed(() => {
  const latestUsed  = metrics.value?.systemRamUsedMb?.at(-1)
  const latestTotal = metrics.value?.systemRamTotalMb
  if (latestUsed != null && latestTotal) return Math.min(100, Math.round((latestUsed / latestTotal) * 100))
  const m = data.value?.memory
  if (!m) return 0
  const used  = m.systemRamUsedMb  ?? m.workingSetMb
  const total = m.systemRamTotalMb ?? m.totalRamMb
  if (!total) return 0
  return Math.min(100, Math.round((used / total) * 100))
})

const dbOk = computed(() => data.value?.database?.status === 'ok')

function toggleLog(filename: string) {
  expandedLog.value = expandedLog.value === filename ? null : filename
}

function fmtLogTime(ts: string) {
  return new Date(ts).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'medium' })
}
</script>

<template>
  <div v-if="!allowed" class="flex items-center justify-center min-h-[60vh]">
    <p class="text-destructive font-medium">Access Denied</p>
  </div>

  <div v-else class="flex flex-col gap-4 w-full">

    <!-- Header — sticky -->
    <div class="flex items-center justify-between sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/40 -mx-4 px-4 py-3 mb-1">
      <div class="flex items-center gap-3">
        <div class="flex size-10 items-center justify-center rounded-xl bg-rose-500/10 border border-rose-500/20">
          <Activity class="size-5 text-rose-500" />
        </div>
        <div>
          <h1 class="text-xl font-bold">System Diagnostics</h1>
          <p class="text-xs text-muted-foreground">
            Last updated: {{ lastFetch ? lastFetch.toLocaleTimeString() : '—' }}
            <span class="ml-2 text-rose-400">(auto-refresh 10s)</span>
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <!-- Update Structure -->
        <button
          @click="runUpdateStructure"
          :disabled="updating"
          class="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors font-semibold disabled:opacity-50"
        >
          <Loader2 v-if="updating" class="size-3.5 animate-spin" />
          <DatabaseZap v-else class="size-3.5" />
          Update DB Structure
        </button>
        <button
          @click="fetchDiag"
          :disabled="loading"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" />
          Refresh
        </button>
      </div>
    </div>

    <!-- Update result -->
    <div v-if="updateDone || updateErr" class="text-xs rounded-lg border px-3 py-2"
      :class="updateErr ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-emerald-500/30 bg-emerald-500/5'">
      <div v-if="updateErr" class="flex items-center gap-1.5"><XCircle class="size-3.5 shrink-0" /> {{ updateErr }}</div>
      <template v-else>
        <div class="flex items-center gap-1.5 font-semibold text-emerald-600 mb-1"><CheckCircle2 class="size-3.5 shrink-0" /> สำเร็จ</div>
        <div v-for="(msg, i) in updateMsgs" :key="i" class="text-muted-foreground">{{ msg }}</div>
      </template>
    </div>

    <div v-if="error" class="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {{ error }}
    </div>

    <template v-if="data">
      <!-- Row 1: Task Manager style charts -->
      <div class="flex gap-3 w-full">

        <!-- CPU -->
        <MetricChart
          label="CPU (System)"
          unit="%"
          color="#3b82f6"
          :data="metrics?.systemCpu ?? []"
          :max="100"
          class="flex-1"
        >
          <dl class="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs mt-1">
            <dt class="text-muted-foreground">Cores</dt><dd class="font-mono text-right">{{ data.server.processorCount }}</dd>
            <dt class="text-muted-foreground">Threads</dt><dd class="font-mono text-right">{{ metrics?.threads?.at(-1) ?? data.cpu.threadCount }}</dd>
            <dt class="text-muted-foreground">Process CPU</dt><dd class="font-mono text-right">{{ metrics?.cpu?.at(-1) ?? 0 }}%</dd>
          </dl>
        </MetricChart>

        <!-- Memory System -->
        <MetricChart
          label="RAM (System)"
          unit=" MB"
          color="#22c55e"
          :data="metrics?.systemRamUsedMb ?? []"
          :max="metrics?.systemRamTotalMb ?? data.memory.systemRamTotalMb ?? data.memory.totalRamMb"
          :current="metrics?.systemRamUsedMb?.at(-1) ?? data.memory.systemRamUsedMb ?? data.memory.workingSetMb"
          class="flex-1"
        >
          <dl class="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs mt-1">
            <dt class="text-muted-foreground">Total RAM</dt><dd class="font-mono text-right">{{ fmtMb(metrics?.systemRamTotalMb ?? data.memory.systemRamTotalMb ?? data.memory.totalRamMb) }}</dd>
            <dt class="text-muted-foreground">Process WS</dt><dd class="font-mono text-right">{{ fmtMb(metrics?.memMb?.at(-1) ?? data.memory.workingSetMb) }}</dd>
            <dt class="text-muted-foreground">GC Gen 0/1/2</dt><dd class="font-mono text-right">{{ data.memory.gcGen0 }}/{{ data.memory.gcGen1 }}/{{ data.memory.gcGen2 }}</dd>
          </dl>
        </MetricChart>

        <!-- GC Heap -->
        <MetricChart
          label="GC Heap"
          unit=" MB"
          color="#a855f7"
          :data="metrics?.gcHeapMb ?? []"
          class="flex-1"
        >
          <dl class="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs mt-1">
            <dt class="text-muted-foreground">GC Gen 0</dt><dd class="font-mono text-right">{{ data.memory.gcGen0 }}</dd>
            <dt class="text-muted-foreground">GC Gen 1</dt><dd class="font-mono text-right">{{ data.memory.gcGen1 }}</dd>
            <dt class="text-muted-foreground">GC Gen 2</dt><dd class="font-mono text-right">{{ data.memory.gcGen2 }}</dd>
          </dl>
        </MetricChart>

        <!-- Database + Server info -->
        <div class="flex-1 min-w-0 rounded-2xl border border-border/60 bg-card p-4 flex flex-col gap-3">
          <div class="flex items-center justify-between text-xs">
            <span class="text-muted-foreground font-medium tracking-wide uppercase text-[10px]">Database</span>
            <span class="flex items-center gap-1.5">
              <span class="inline-block size-2 rounded-full" :class="dbOk ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'" />
              <span :class="dbOk ? 'text-emerald-400' : 'text-rose-400'" class="font-mono text-sm font-bold">{{ data.database.pingMs >= 0 ? data.database.pingMs + ' ms' : '—' }}</span>
            </span>
          </div>
          <dl class="space-y-1 text-xs">
            <div class="flex justify-between"><dt class="text-muted-foreground">Status</dt><dd :class="dbOk ? 'text-emerald-400' : 'text-rose-400'" class="font-mono">{{ data.database.status }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted-foreground">ThreadPool Worker</dt><dd class="font-mono">{{ data.cpu.threadPoolWorker }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted-foreground">ThreadPool I/O</dt><dd class="font-mono">{{ data.cpu.threadPoolIo }}</dd></div>
          </dl>
          <dl class="border-t border-border/30 pt-2 space-y-1 text-xs">
            <div class="flex justify-between"><dt class="text-muted-foreground">Machine</dt><dd class="font-mono truncate ml-2">{{ data.server.machineName }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted-foreground">Runtime</dt><dd class="font-mono truncate ml-2">{{ data.server.runtime }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted-foreground">Uptime</dt><dd class="font-mono">{{ data.server.uptimeDisplay }}</dd></div>
          </dl>
        </div>

      </div>

      <!-- Online Users -->
      <div class="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-sm font-semibold">
            <span class="relative flex size-2">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span class="relative inline-flex rounded-full size-2 bg-emerald-500" />
            </span>
            Online Users
            <span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400 font-mono">
              {{ onlineCount }} คน
            </span>
            <span class="text-xs text-muted-foreground font-normal">(active ใน 5 นาทีที่ผ่านมา)</span>
          </div>
        </div>

        <div v-if="!onlineUsers.length" class="text-sm text-muted-foreground py-2 text-center">
          ไม่มี user online
        </div>

        <div v-else class="overflow-auto max-h-60">
          <table class="w-full text-xs">
            <thead class="sticky top-0 bg-card z-10">
              <tr class="border-b border-border/40 text-muted-foreground">
                <th class="text-left py-1.5 pr-4 font-medium">User</th>
                <th class="text-left py-1.5 pr-4 font-medium">ชื่อ</th>
                <th class="text-left py-1.5 pr-4 font-medium">บริษัท</th>
                <th class="text-left py-1.5 pr-4 font-medium">Last Path</th>
                <th class="text-right py-1.5 pr-4 font-medium">Requests</th>
                <th class="text-right py-1.5 font-medium">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in onlineUsers" :key="u.userId"
                class="border-b border-border/20 hover:bg-muted/10 transition-colors">
                <td class="py-2 pr-4 font-mono font-semibold text-emerald-400">{{ u.userId }}</td>
                <td class="py-2 pr-4 text-foreground/80">{{ u.empName ?? u.empCode ?? '—' }}</td>
                <td class="py-2 pr-4 text-muted-foreground font-mono">{{ u.mainCode ?? '—' }}</td>
                <td class="py-2 pr-4 text-muted-foreground font-mono truncate max-w-[240px]" :title="u.lastPath">{{ u.lastPath }}</td>
                <td class="py-2 pr-4 text-right font-mono">{{ u.reqCount.toLocaleString() }}</td>
                <td class="py-2 text-right font-mono"
                  :class="u.idleSec < 60 ? 'text-emerald-400' : u.idleSec < 180 ? 'text-amber-400' : 'text-muted-foreground'">
                  {{ fmtIdle(u.idleSec) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Top Processes -->
      <div class="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-sm font-semibold">
            <Cpu class="size-4 text-violet-400" />
            Top Processes
            <span class="text-xs text-muted-foreground font-normal">(auto-refresh 15s)</span>
          </div>
          <div class="flex items-center gap-2">
            <!-- tab switcher -->
            <div class="flex rounded-lg border border-border/60 overflow-hidden text-xs">
              <button
                @click="topProcsTab = 'cpu'"
                :class="['px-3 py-1 transition-colors', topProcsTab === 'cpu' ? 'bg-violet-500/20 text-violet-400' : 'text-muted-foreground hover:bg-muted']"
              >CPU</button>
              <button
                @click="topProcsTab = 'mem'"
                :class="['px-3 py-1 transition-colors border-l border-border/60', topProcsTab === 'mem' ? 'bg-emerald-500/20 text-emerald-400' : 'text-muted-foreground hover:bg-muted']"
              >RAM</button>
            </div>
            <button @click="fetchTopProcs" :disabled="topProcsLoading"
              class="flex items-center gap-1 px-2 py-1 rounded-lg border text-xs hover:bg-muted transition-colors disabled:opacity-50">
              <RefreshCw class="size-3" :class="{ 'animate-spin': topProcsLoading }" />
            </button>
          </div>
        </div>

        <div v-if="topProcsLoading && !topProcs" class="flex items-center justify-center py-6 text-xs text-muted-foreground gap-2">
          <Loader2 class="size-4 animate-spin" /> กำลังวัด CPU (400ms)…
        </div>

        <div v-else-if="topProcs" class="overflow-auto max-h-64">
          <table class="w-full text-xs">
            <thead class="sticky top-0 bg-card z-10">
              <tr class="border-b border-border/40 text-muted-foreground">
                <th class="text-left py-1.5 pr-3 font-medium w-8">#</th>
                <th class="text-left py-1.5 pr-4 font-medium">Process</th>
                <th class="text-left py-1.5 pr-4 font-medium">PID</th>
                <th class="text-right py-1.5 pr-4 font-medium">CPU %</th>
                <th class="text-right py-1.5 font-medium">RAM (MB)</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(p, i) in (topProcsTab === 'cpu' ? topProcs.topByCpu : topProcs.topByMem)"
                :key="p.pid"
                class="border-b border-border/20 hover:bg-muted/10 transition-colors"
              >
                <td class="py-1.5 pr-3 text-muted-foreground">{{ (i as number) + 1 }}</td>
                <td class="py-1.5 pr-4 font-mono font-semibold truncate max-w-[200px]" :title="p.name">{{ p.name }}</td>
                <td class="py-1.5 pr-4 font-mono text-muted-foreground">{{ p.pid }}</td>
                <td class="py-1.5 pr-4 text-right font-mono"
                  :class="p.cpuPct > 20 ? 'text-rose-400' : p.cpuPct > 5 ? 'text-amber-400' : 'text-muted-foreground'">
                  {{ p.cpuPct }}%
                </td>
                <td class="py-1.5 text-right font-mono"
                  :class="p.memMb > 1000 ? 'text-rose-400' : p.memMb > 300 ? 'text-amber-400' : 'text-muted-foreground'">
                  {{ p.memMb.toLocaleString() }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Row 2: 2 columns — App Logs | Error Logs -->
      <div class="flex gap-4">

        <!-- App Logs -->
        <div class="flex-1 min-w-0 rounded-2xl border bg-card flex flex-col h-[520px]">
          <!-- sticky header -->
          <div class="px-5 pt-5 pb-3 border-b border-border/40 space-y-3 shrink-0">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-sm font-semibold">
                <ScrollText class="size-4 text-sky-500" />
                App Logs
                <span class="ml-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-xs text-sky-400">
                  {{ appLogs.length }} วัน
                </span>
              </div>
              <div class="flex items-center gap-2">
                <button @click="fetchAppLogs" :disabled="appLogsLoading"
                  class="flex items-center gap-1 px-2 py-1 rounded-lg border text-xs hover:bg-muted transition-colors disabled:opacity-50">
                  <RefreshCw class="size-3" :class="{ 'animate-spin': appLogsLoading }" />
                </button>
                <button @click="clearAppLogs" :disabled="clearing === 'app'"
                  class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs hover:bg-rose-500/20 transition-colors disabled:opacity-50">
                  <Loader2 v-if="clearing === 'app'" class="size-3 animate-spin" />
                  <Trash2 v-else class="size-3" />
                  Clear
                </button>
              </div>
            </div>
            <!-- date tabs -->
            <div v-if="appLogs.length" class="flex gap-1.5 flex-wrap">
              <button
                v-for="log in appLogs" :key="log.date"
                @click="selectedDate = log.date"
                :class="['px-2.5 py-0.5 rounded-full text-xs border transition-colors',
                  selectedDate === log.date
                    ? 'bg-sky-500/20 border-sky-500/50 text-sky-400'
                    : 'border-border/60 text-muted-foreground hover:bg-muted']"
              >
                {{ log.date.slice(0,4) }}-{{ log.date.slice(4,6) }}-{{ log.date.slice(6,8) }}
                <span class="ml-1 opacity-60">{{ log.lines.length }}</span>
              </button>
            </div>
          </div>
          <!-- scrollable content -->
          <div class="flex-1 overflow-y-auto">
            <div v-if="!appLogs.length && !appLogsLoading" class="text-sm text-muted-foreground py-8 text-center">
              ไม่พบ log
            </div>
            <div v-if="selectedLog" class="p-3 space-y-0.5">
              <div
                v-for="(line, i) in [...selectedLog.lines].reverse()"
                :key="i"
                :class="['font-mono text-xs leading-5 whitespace-pre-wrap break-all px-1 rounded', lineColor(line)]"
              >{{ line.replace(/\s{2,}/g, ' ') }}</div>
            </div>
          </div>
        </div>

        <!-- Error Logs -->
        <div class="flex-1 min-w-0 rounded-2xl border bg-card flex flex-col h-[520px]">
          <!-- sticky header -->
          <div class="px-5 pt-5 pb-3 border-b border-border/40 shrink-0">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle class="size-4 text-rose-500" />
                Error Logs
                <span class="ml-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-xs text-rose-400">
                  {{ data.errorLogs?.length ?? 0 }} files
                </span>
              </div>
              <button @click="clearErrorLogs" :disabled="clearing === 'error'"
                class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs hover:bg-rose-500/20 transition-colors disabled:opacity-50">
                <Loader2 v-if="clearing === 'error'" class="size-3 animate-spin" />
                <Trash2 v-else class="size-3" />
                Clear
              </button>
            </div>
          </div>
          <!-- scrollable content -->
          <div class="flex-1 overflow-y-auto px-5 py-3">
            <div v-if="!data.errorLogs?.length" class="text-sm text-muted-foreground py-8 text-center">
              ไม่พบ error log
            </div>
            <div v-else class="space-y-1.5">
              <div v-for="log in data.errorLogs" :key="log.filename" class="rounded-xl border border-border/60 overflow-hidden">
                <button
                  class="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/40 transition-colors"
                  @click="toggleLog(log.filename)"
                >
                  <div class="flex items-center gap-3 min-w-0">
                    <span class="inline-block size-2 rounded-full bg-rose-500 shrink-0" />
                    <span class="font-mono text-xs text-muted-foreground shrink-0">{{ fmtLogTime(log.timestamp) }}</span>
                    <span class="truncate text-xs text-foreground/70">{{ log.content.split('\n')[0] }}</span>
                  </div>
                  <div class="flex items-center gap-2 shrink-0 ml-3">
                    <span class="text-xs text-muted-foreground">{{ (log.sizeBytes / 1024).toFixed(1) }} KB</span>
                    <ChevronDown v-if="expandedLog === log.filename" class="size-4 text-muted-foreground" />
                    <ChevronRight v-else class="size-4 text-muted-foreground" />
                  </div>
                </button>
                <div v-if="expandedLog === log.filename" class="border-t border-border/60 bg-muted/20 px-4 py-3">
                  <pre class="text-xs font-mono text-rose-300 whitespace-pre-wrap break-all leading-relaxed max-h-64 overflow-y-auto">{{ log.content }}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </template>

    <!-- skeleton -->
    <div v-else-if="loading" class="flex flex-col gap-4">
      <div class="flex gap-4">
        <div v-for="i in 4" :key="i" class="flex-1 rounded-2xl border bg-card p-5 h-52 animate-pulse" />
      </div>
      <div class="rounded-2xl border bg-card p-5 h-40 animate-pulse" />
    </div>

  </div>
</template>
