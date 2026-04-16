<script setup lang="ts">
import {
  Send, Mail, Plus, X, Pencil, Trash2, Search,
  Users, FileText, Clock, RefreshCw, CheckCircle2,
  MessageSquare, ToggleLeft, ToggleRight, ChevronDown,
  Loader2, CalendarDays, SendHorizontal, Filter, SlidersHorizontal,
} from 'lucide-vue-next'
import { useMangoBIApi, type BIListItem } from '~/composables/useMangoBIApi'
import type { FilterOperator } from '~/stores/report'
import { DATE_TOKEN_TODAY, DATE_TOKEN_YESTERDAY } from '~/utils/transformData'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from '@/components/ui/alert-dialog'

definePageMeta({ auth: true })
useHead({ title: 'Send Report Setup | MangoBI' })

const { $xt } = useNuxtApp() as any
const biApi   = useMangoBIApi()

// ── Types ──────────────────────────────────────────────────────────────────────
interface ScheduleItem {
  id:              string
  reportId:        string
  reportName:      string
  scheduleTime:    string
  intervalDays:    number
  isActive:        boolean
  sendViaLine:     boolean
  sendViaEmail:    boolean
  subject?:        string
  messageBody?:    string
  receiverEmpnos:  string[]
  receiverCount:   number
  linkExpiryDays?: number | null
}

interface Employee {
  empno:           number
  empcode:         string
  empfullname_t:   string | null
  empfullname_t_2: string | null
  userid:          string | null
  email:           string | null
  line_token:      string | null
  dpt_name:        string | null
}

// ── State ──────────────────────────────────────────────────────────────────────
const schedules   = ref<ScheduleItem[]>([])
const employees   = ref<Employee[]>([])
const myReports   = ref<BIListItem[]>([])
const loadingList = ref(true)
const loadingEmp  = ref(false)

// Filter list
const filterText = ref('')
const filteredSchedules = computed(() => {
  const q = filterText.value.toLowerCase().trim()
  if (!q) return schedules.value
  return schedules.value.filter(s =>
    (s.reportName ?? '').toLowerCase().includes(q) ||
    (s.reportId ?? '').toLowerCase().includes(q),
  )
})

// ── API calls ─────────────────────────────────────────────────────────────────
async function loadSchedules() {
  loadingList.value = true
  try {
    const res: any = await $xt.getServer('Planning/MangoBISchedule/List')
    schedules.value = res?.data ?? []
  } catch {
    schedules.value = []
  } finally {
    loadingList.value = false
  }
}

async function loadEmployees() {
  if (employees.value.length) return
  loadingEmp.value = true
  try {
    const res: any = await $xt.getServer('Anywhere/Center/Employee?text=&level=&signCustom=N')
    employees.value = res?.data ?? []
  } catch {
    employees.value = []
  } finally {
    loadingEmp.value = false
  }
}

onMounted(async () => {
  await Promise.all([
    loadSchedules(),
    biApi.listReports().then(r => { myReports.value = r }).catch(() => {}),
  ])
})

// ── Form modal ────────────────────────────────────────────────────────────────
type FormModel = {
  id:              string
  reportId:        string
  subject:         string
  messageBody:     string
  scheduleTime:    string
  intervalDays:    number
  isActive:        boolean
  sendViaLine:     boolean
  sendViaEmail:    boolean
  receiverEmpnos:  string[]
  linkExpiryDays:  number   // 0 = ไม่หมดอายุ
}

const showModal = ref(false)
const isEdit    = ref(false)
const saving    = ref(false)
const deleting  = ref<string | null>(null)

// ── Confirm delete dialog ─────────────────────────────────────────────────────
const confirmDeleteId   = ref<string | null>(null)
const confirmDeleteName = ref('')
const deleteError       = ref('')

// ── Send Now ──────────────────────────────────────────────────────────────────
const sendingNow     = ref<string | null>(null)   // id ที่กำลังส่ง
const sendNowResult  = ref<{ id: string; sent: number; receivers: number } | null>(null)

async function doSendNow(item: ScheduleItem) {
  sendingNow.value    = item.id
  sendNowResult.value = null
  try {
    const res: any = await $xt.postServerJson(`Planning/MangoBISchedule/SendNow?id=${item.id}`, {})
    sendNowResult.value = { id: item.id, sent: res?.data?.sent ?? 0, receivers: res?.data?.receivers ?? 0 }
    // clear feedback after 4 s
    setTimeout(() => {
      if (sendNowResult.value?.id === item.id) sendNowResult.value = null
    }, 4000)
  } finally {
    sendingNow.value = null
  }
}

function askDelete(item: ScheduleItem) {
  confirmDeleteId.value   = item.id
  confirmDeleteName.value = item.reportName ?? ''
  deleteError.value       = ''
}

async function confirmDelete() {
  if (!confirmDeleteId.value) return
  deleteError.value = ''
  const ok = await doDelete(confirmDeleteId.value)
  if (ok) confirmDeleteId.value = null
}

function emptyForm(): FormModel {
  return {
    id: '', reportId: '', subject: '', messageBody: '',
    scheduleTime: '08:00', intervalDays: 1,
    isActive: true, sendViaLine: false, sendViaEmail: true,
    receiverEmpnos: [], linkExpiryDays: 7,
  }
}
const form = ref<FormModel>(emptyForm())

const formReportName = computed(() =>
  myReports.value.find(r => r.id === form.value.reportId)?.name ?? '',
)

const canSave = computed(() =>
  !!form.value.reportId &&
  !!form.value.scheduleTime &&
  (form.value.sendViaLine || form.value.sendViaEmail) &&
  form.value.receiverEmpnos.length > 0,
)

function openAdd() {
  isEdit.value = false
  form.value   = emptyForm()
  showModal.value = true
}

function openEdit(item: ScheduleItem) {
  isEdit.value = true
  form.value = {
    id:              item.id,
    reportId:        item.reportId,
    subject:         item.subject ?? '',
    messageBody:     item.messageBody ?? '',
    scheduleTime:    item.scheduleTime,
    intervalDays:    item.intervalDays ?? 1,
    isActive:        item.isActive,
    sendViaLine:     item.sendViaLine,
    sendViaEmail:    item.sendViaEmail,
    receiverEmpnos:  (item.receiverEmpnos ?? []).map(String).filter(Boolean),
    linkExpiryDays:  item.linkExpiryDays ?? 7,
  }
  showModal.value = true
  // โหลดรายชื่อพนักงานใน background เพื่อให้ชิปแสดงได้ทันที
  loadEmployees()
}

async function doSave() {
  if (!canSave.value) return
  saving.value = true
  try {
    // Persist defaultViewFilters back into the report's widgetsJson
    if (form.value.reportId && reportDatasets.value.length) {
      const row = await biApi.loadReport(form.value.reportId)
      if (row) {
        const payload = JSON.parse(row.widgetsJson ?? '{}')
        payload.defaultViewFilters = defaultViewFilters.value
        await biApi.saveReport({ id: form.value.reportId, name: row.name, widgetsJson: JSON.stringify(payload) })
      }
    }

    await $xt.postServerJson('Planning/MangoBISchedule/Save', {
      id:              form.value.id || undefined,
      reportId:        form.value.reportId,
      reportName:      formReportName.value,
      scheduleTime:    form.value.scheduleTime,
      intervalDays:    form.value.intervalDays,
      isActive:        form.value.isActive,
      sendViaLine:     form.value.sendViaLine,
      sendViaEmail:    form.value.sendViaEmail,
      subject:         form.value.subject,
      messageBody:     form.value.messageBody,
      receiverEmpnos:  form.value.receiverEmpnos,
      linkExpiryDays:  form.value.linkExpiryDays,
    })
    showModal.value = false
    await loadSchedules()
  } finally {
    saving.value = false
  }
}

async function doDelete(id: string): Promise<boolean> {
  deleting.value = id
  try {
    const res: any = await $xt.postServerJson(`Planning/MangoBISchedule/Delete?id=${id}`, {})
    if (res?.error) {
      deleteError.value = res.error
      return false
    }
    schedules.value = schedules.value.filter(s => s.id !== id)
    return true
  } catch (err: any) {
    deleteError.value = err?.message ?? 'เกิดข้อผิดพลาด'
    return false
  } finally {
    deleting.value = null
  }
}

async function toggleActive(item: ScheduleItem) {
  await $xt.postServerJson(`Planning/MangoBISchedule/ToggleActive?id=${item.id}`, {})
  item.isActive = !item.isActive
}

// ── Employee picker modal ─────────────────────────────────────────────────────
const showEmpModal = ref(false)
const empSearch    = ref('')

const filteredEmployees = computed(() => {
  const q = empSearch.value.toLowerCase().trim()
  if (!q) return employees.value
  return employees.value.filter(e =>
    (e.empfullname_t  ?? '').toLowerCase().includes(q) ||
    (e.empfullname_t_2 ?? '').toLowerCase().includes(q) ||
    (e.userid         ?? '').toLowerCase().includes(q) ||
    (e.empcode        ?? '').toLowerCase().includes(q) ||
    (e.dpt_name       ?? '').toLowerCase().includes(q),
  )
})

function toggleEmployee(empno: number | string) {
  const key = String(empno)
  if (form.value.receiverEmpnos.includes(key))
    form.value.receiverEmpnos = form.value.receiverEmpnos.filter(x => x !== key)
  else
    form.value.receiverEmpnos = [...form.value.receiverEmpnos, key]
}

const selectedEmployees = computed(() =>
  employees.value.filter(e => form.value.receiverEmpnos.includes(String(e.empno))),
)

async function openEmpModal() {
  await loadEmployees()
  empSearch.value = ''
  showEmpModal.value = true
}

function empInitial(emp: Employee): string {
  return (emp.empfullname_t ?? emp.userid ?? '?').charAt(0).toUpperCase()
}

// ── Default View Filters ──────────────────────────────────────────────────────
interface DefaultViewFilter { column: string; operator: FilterOperator; value: string; values?: string[] }

const DEFAULT_FILTER_OPS: { value: FilterOperator; label: string }[] = [
  { value: 'contains',    label: 'contains' },
  { value: 'notContains', label: 'not contains' },
  { value: 'eq',          label: '= equals' },
  { value: 'neq',         label: '≠ not equals' },
  { value: 'gt',          label: '> greater' },
  { value: 'gte',         label: '>= greater eq' },
  { value: 'lt',          label: '< less' },
  { value: 'lte',         label: '<= less eq' },
  { value: 'in',          label: 'in list' },
  { value: 'notIn',       label: 'not in list' },
  { value: 'blank',       label: 'is blank' },
  { value: 'notBlank',    label: 'not blank' },
]

// defaultViewFilters: per-dataset filter list, keyed by dsId
const defaultViewFilters = ref<Record<string, DefaultViewFilter[]>>({})

// Raw datasets loaded from selected report (for column/value picker)
const reportDatasets = ref<{ id: string; name: string; rows: any[]; columnLabels?: Record<string, any> }[]>([])
const loadingReport  = ref(false)

watch(() => form.value.reportId, async (id) => {
  defaultViewFilters.value = {}
  reportDatasets.value     = []
  if (!id) return
  loadingReport.value = true
  try {
    const row = await biApi.loadReport(id)
    if (!row) return
    const payload = JSON.parse(row.widgetsJson ?? '{}')
    reportDatasets.value      = payload.datasets ?? []
    defaultViewFilters.value  = payload.defaultViewFilters ?? {}
  } catch { /* ignore */ }
  finally { loadingReport.value = false }
})

function dfColsOf(ds: typeof reportDatasets.value[0]) {
  if (!ds.rows.length) return []
  const first = ds.rows[0]
  return Object.keys(first).map(name => {
    const meta    = ds.columnLabels?.[name]
    const sample  = first[name]
    const isDate  = meta?.isDate || (typeof sample === 'string' && /^\d{4}-\d{2}-\d{2}/.test(sample))
    const isNum   = meta?.type === 'number' || typeof sample === 'number'
    return { name, label: meta?.label || name, type: isDate ? 'date' : isNum ? 'number' : 'string' }
  })
}

function addDefaultFilter(dsId: string) {
  const cur = defaultViewFilters.value[dsId] ?? []
  defaultViewFilters.value = { ...defaultViewFilters.value, [dsId]: [...cur, { column: '', operator: 'contains' as FilterOperator, value: '' }] }
}

function removeDefaultFilter(dsId: string, idx: number) {
  defaultViewFilters.value = { ...defaultViewFilters.value, [dsId]: (defaultViewFilters.value[dsId] ?? []).filter((_, i) => i !== idx) }
}

const dfPickerSearch = reactive<Record<string, string>>({})

function dfUniqueValues(ds: typeof reportDatasets.value[0], colName: string): string[] {
  if (!colName) return []
  const seen = new Set<string>()
  for (const row of ds.rows) seen.add(String(row[colName] ?? ''))
  return [...seen].sort((a, b) => a.localeCompare(b, 'th'))
}

function dfFilteredPickerValues(key: string, ds: typeof reportDatasets.value[0], colName: string): string[] {
  const q = (dfPickerSearch[key] ?? '').trim().toLowerCase()
  const vals = dfUniqueValues(ds, colName)
  return q ? vals.filter(v => v.toLowerCase().includes(q)) : vals
}

function toggleDfPickerValue(f: DefaultViewFilter, val: string) {
  const cur = f.values ?? []
  f.values = cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val]
}

function dfIsToken(v: string) { return v === DATE_TOKEN_TODAY || v === DATE_TOKEN_YESTERDAY }
function dfTokenLabel(v: string) { return v === DATE_TOKEN_TODAY ? 'Today' : 'Yesterday' }

const activeDefaultFilterCount = computed(() =>
  Object.values(defaultViewFilters.value).flat()
    .filter(f => f.column && (
      ['blank', 'notBlank'].includes(f.operator) ||
      (['in', 'notIn'].includes(f.operator) ? (f.values?.length ?? 0) > 0 : f.value !== '')
    )).length,
)

// ── Rich-text editor ──────────────────────────────────────────────────────────
const editorRef = ref<HTMLElement | null>(null)

function exec(cmd: string, value = '') {
  editorRef.value?.focus()
  document.execCommand(cmd, false, value || undefined)
}

function execBlock(tag: string) { exec('formatBlock', tag) }

function insertLink() {
  const url = globalThis.prompt('ใส่ URL:', 'https://')
  if (url) exec('createLink', url)
}

function insertLinkPlaceholder() {
  exec('insertHTML', '<span style="color:#f97316">{Link}</span>')
}

watch(showModal, (v) => {
  if (v) {
    nextTick(() => {
      if (editorRef.value) editorRef.value.innerHTML = form.value.messageBody ?? ''
    })
  }
})

// ── Link expiry options ────────────────────────────────────────────────────────
const EXPIRY_OPTIONS = [
  { label: 'ไม่หมดอายุ',      value: 0  },
  { label: '1 วัน',            value: 1  },
  { label: '3 วัน',            value: 3  },
  { label: '7 วัน (ค่าเริ่มต้น)', value: 7  },
  { label: '14 วัน',           value: 14 },
  { label: '30 วัน',           value: 30 },
  { label: '60 วัน',           value: 60 },
  { label: '90 วัน',           value: 90 },
]

function expiryLabel(days: number | null | undefined): string {
  if (days === null || days === undefined) return '7 วัน'
  if (days === 0) return 'ไม่หมดอายุ'
  return EXPIRY_OPTIONS.find(o => o.value === days)?.label ?? `${days} วัน`
}

// ── Interval label ────────────────────────────────────────────────────────────
const INTERVAL_OPTIONS = [
  { label: 'ทุกวัน',    value: 1 },
  { label: 'ทุก 2 วัน', value: 2 },
  { label: 'ทุก 3 วัน', value: 3 },
  { label: 'ทุก 7 วัน (รายสัปดาห์)', value: 7 },
  { label: 'ทุก 14 วัน (2 สัปดาห์)', value: 14 },
  { label: 'ทุก 30 วัน (รายเดือน)',  value: 30 },
]

function intervalLabel(days: number): string {
  return INTERVAL_OPTIONS.find(o => o.value === days)?.label ?? `ทุก ${days} วัน`
}
</script>

<template>
  <div class="py-6 px-6 flex flex-col gap-5">

    <!-- ── Header ── -->
    <div class="flex items-center gap-3">
      <div class="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
        <Send class="size-5 text-emerald-500" />
      </div>
      <div>
        <h1 class="font-bold text-xl">Send Report Setup</h1>
        <p class="text-sm text-muted-foreground">จัดการตารางส่ง Report อัตโนมัติ</p>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <button
          @click="loadSchedules"
          :disabled="loadingList"
          class="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg border
                 hover:bg-accent transition-colors text-muted-foreground"
        >
          <RefreshCw class="size-4" :class="loadingList && 'animate-spin'" />
          รีเฟรช
        </button>
        <button
          @click="openAdd"
          class="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg
                 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold transition-colors"
        >
          <Plus class="size-4" />
          เพิ่มการส่ง
        </button>
      </div>
    </div>

    <!-- ── Filter bar ── -->
    <div class="relative">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      <input
        v-model="filterText"
        placeholder="ค้นหา Report หรือรหัส..."
        class="w-full pl-9 pr-4 py-2.5 text-sm border rounded-xl bg-background
               focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
      />
    </div>

    <!-- ── List ── -->
    <div class="border rounded-xl overflow-hidden">

      <!-- Loading -->
      <div v-if="loadingList" class="flex items-center justify-center gap-2 py-16 text-muted-foreground text-base">
        <Loader2 class="size-6 animate-spin" />
        <span>กำลังโหลด...</span>
      </div>

      <!-- Empty -->
      <div v-else-if="!filteredSchedules.length" class="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <Send class="size-12 opacity-20" />
        <p class="text-base">{{ filterText ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีรายการกำหนดส่ง' }}</p>
        <button v-if="!filterText" @click="openAdd"
          class="text-sm px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-semibold transition-colors flex items-center gap-1.5">
          <Plus class="size-4" /> เพิ่มการส่ง
        </button>
      </div>

      <!-- Table header -->
      <div v-else>
        <div class="grid grid-cols-[1fr_100px_150px_100px_100px_80px_136px] gap-4 px-5 py-3
                    text-xs font-semibold uppercase tracking-wide text-muted-foreground
                    border-b bg-muted/40">
          <span>รายงาน</span>
          <span class="text-center">เวลา</span>
          <span class="text-center">ความถี่</span>
          <span class="text-center">LINE</span>
          <span class="text-center">Email</span>
          <span class="text-center">ผู้รับ</span>
          <span class="text-center">จัดการ</span>
        </div>

        <!-- Rows -->
        <div
          v-for="(item, idx) in filteredSchedules"
          :key="item.id"
          :class="['grid grid-cols-[1fr_100px_150px_100px_100px_80px_136px] gap-4 px-5 py-4 items-center text-sm',
                   idx % 2 === 1 ? 'bg-muted/20' : '',
                   !item.isActive && 'opacity-50']"
        >
          <!-- Report name -->
          <div class="flex items-center gap-2.5 min-w-0">
            <button
              @click="toggleActive(item)"
              :title="item.isActive ? 'คลิกเพื่อปิดใช้งาน' : 'คลิกเพื่อเปิดใช้งาน'"
              class="shrink-0 transition-colors"
            >
              <ToggleRight v-if="item.isActive" class="size-8 text-emerald-500" />
              <ToggleLeft  v-else               class="size-8 text-muted-foreground" />
            </button>
            <div class="min-w-0">
              <p class="font-medium truncate">{{ item.reportName }}</p>
              <!--p class="text-xs text-muted-foreground truncate">{{ item.reportId }}</p-->
            </div>
          </div>

          <!-- Time -->
          <div class="flex flex-col items-center gap-0.5">
            <span class="font-mono font-semibold text-indigo-600 dark:text-indigo-400 text-base">{{ item.scheduleTime }}</span>
            <span class="text-[10px] text-muted-foreground">{{ expiryLabel(item.linkExpiryDays) }}</span>
          </div>

          <!-- Interval -->
          <div class="text-center text-muted-foreground text-xs">
            {{ intervalLabel(item.intervalDays ?? 1) }}
          </div>

          <!-- LINE -->
          <div class="flex justify-center">
            <span :class="['inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold',
                           item.sendViaLine
                             ? 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300'
                             : 'bg-muted text-muted-foreground']">
              💬 {{ item.sendViaLine ? 'เปิด' : 'ปิด' }}
            </span>
          </div>

          <!-- Email -->
          <div class="flex justify-center">
            <span :class="['inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold',
                           item.sendViaEmail
                             ? 'bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300'
                             : 'bg-muted text-muted-foreground']">
              <Mail class="size-3" /> {{ item.sendViaEmail ? 'เปิด' : 'ปิด' }}
            </span>
          </div>

          <!-- Receivers -->
          <div class="flex justify-center">
            <span class="inline-flex items-center gap-1 text-xs font-semibold
                         bg-muted px-2 py-1 rounded text-foreground">
              <Users class="size-3" /> {{ item.receiverCount }}
            </span>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-center gap-1">
            <!-- Send Now -->
            <button
              @click="doSendNow(item)"
              :disabled="sendingNow === item.id"
              class="size-8 flex items-center justify-center rounded-lg border transition-colors disabled:opacity-50"
              :class="sendNowResult?.id === item.id
                ? 'bg-emerald-500/10 border-emerald-400 text-emerald-600'
                : 'hover:bg-emerald-500/10 hover:border-emerald-400 hover:text-emerald-600 text-muted-foreground'"
              :title="sendNowResult?.id === item.id
                ? `ส่งแล้ว ${sendNowResult.sent} ข้อความ (${sendNowResult.receivers} คน)`
                : 'ส่งทันที'"
            >
              <Loader2      v-if="sendingNow === item.id"  class="size-4 animate-spin" />
              <CheckCircle2 v-else-if="sendNowResult?.id === item.id" class="size-4" />
              <SendHorizontal v-else                       class="size-4" />
            </button>
            <button
              @click="openEdit(item)"
              class="size-8 flex items-center justify-center rounded-lg border
                     hover:bg-indigo-500/10 hover:border-indigo-400 hover:text-indigo-500
                     text-muted-foreground transition-colors"
              title="แก้ไข"
            >
              <Pencil class="size-4" />
            </button>
            <button
              @click="askDelete(item)"
              :disabled="deleting === item.id"
              class="size-8 flex items-center justify-center rounded-lg border
                     hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive
                     text-muted-foreground transition-colors disabled:opacity-50"
              title="ลบ"
            >
              <Loader2 v-if="deleting === item.id" class="size-4 animate-spin" />
              <Trash2  v-else                       class="size-4" />
            </button>
          </div>
        </div>

        <!-- Footer count -->
        <div class="px-5 py-3 border-t bg-muted/20 text-xs text-muted-foreground">
          {{ filteredSchedules.length }} รายการ
          <span v-if="filterText"> (กรองจากทั้งหมด {{ schedules.length }})</span>
        </div>
      </div>
    </div>

  </div>

  <!-- ════════════════════════════════════════
       Modal: Add / Edit Schedule
  ════════════════════════════════════════ -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      >
        <div class="bg-background rounded-2xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden max-h-[90vh]">

          <!-- Header -->
          <div class="flex items-center gap-3 px-5 py-4 border-b shrink-0">
            <Send class="size-4 text-emerald-500" />
            <span class="font-semibold text-sm">{{ isEdit ? 'แก้ไขการส่ง Report' : 'เพิ่มการส่ง Report' }}</span>
            <button @click="showModal = false" class="ml-auto text-muted-foreground hover:text-foreground">
              <X class="size-4" />
            </button>
          </div>

          <!-- Body -->
          <div class="overflow-y-auto flex-1 p-5 flex flex-col gap-5">

            <!-- Report selection -->
            <div class="flex flex-col gap-1.5">
              <label for="f-rptcode" class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <FileText class="size-3" /> Report <span class="text-destructive">*</span>
              </label>
              <div class="relative">
                <select
                  id="f-rptcode"
                  v-model="form.reportId"
                  class="w-full text-sm border rounded-xl px-3 py-2.5 bg-background
                         focus:outline-none focus:ring-2 focus:ring-emerald-400/50 appearance-none pr-8"
                >
                  <option value="">— เลือก Report —</option>
                  <option v-for="r in myReports" :key="r.id" :value="r.id">
                    {{ r.name }}
                  </option>
                </select>
                <ChevronDown class="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              </div>
              <p v-if="!myReports.length" class="text-[10px] text-amber-600">
                ยังไม่มี Report — ไปสร้างที่ Report Builder ก่อน
              </p>
            </div>

            <!-- Time + Interval -->
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1.5">
                <label for="f-time" class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Clock class="size-3" /> เวลาส่ง <span class="text-destructive">*</span>
                </label>
                <input
                  id="f-time"
                  type="time"
                  v-model="form.scheduleTime"
                  class="w-full text-sm border rounded-xl px-3 py-2.5 bg-background
                         focus:outline-none focus:ring-2 focus:ring-emerald-400/50 font-mono"
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label for="f-interval" class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <CalendarDays class="size-3" /> ความถี่การส่ง
                </label>
                <div class="relative">
                  <select
                    id="f-interval"
                    v-model.number="form.intervalDays"
                    class="w-full text-xs border rounded-xl px-3 py-2.5 bg-background
                           focus:outline-none focus:ring-2 focus:ring-emerald-400/50 appearance-none pr-8"
                  >
                    <option v-for="opt in INTERVAL_OPTIONS" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </option>
                  </select>
                  <ChevronDown class="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>

            <!-- Link Expiry -->
            <div class="flex flex-col gap-1.5">
              <label for="f-expiry" class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Clock class="size-3" /> อายุลิ้งค์
              </label>
              <div class="relative">
                <select
                  id="f-expiry"
                  v-model.number="form.linkExpiryDays"
                  class="w-full text-sm border rounded-xl px-3 py-2.5 bg-background
                         focus:outline-none focus:ring-2 focus:ring-emerald-400/50 appearance-none pr-8"
                >
                  <option v-for="opt in EXPIRY_OPTIONS" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
                <ChevronDown class="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              </div>
              <p v-if="form.linkExpiryDays === 0" class="text-[10px] text-amber-600">
                ลิ้งค์จะไม่มีวันหมดอายุ — ผู้รับสามารถเข้าถึงได้ตลอด
              </p>
            </div>

            <!-- Channels (multi-select checkboxes) -->
            <div class="flex flex-col gap-1.5">
              <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Send class="size-3" /> ช่องทางการส่ง <span class="text-destructive">*</span>
              </span>
              <div class="flex gap-3">
                <button
                  type="button"
                  @click="form.sendViaLine = !form.sendViaLine"
                  :class="['flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-colors text-sm font-semibold',
                           form.sendViaLine
                             ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-300'
                             : 'border-border hover:bg-accent text-muted-foreground']"
                >
                  <span class="text-base leading-none">💬</span>
                  LINE
                  <CheckCircle2 v-if="form.sendViaLine" class="size-4 ml-auto text-green-500" />
                </button>
                <button
                  type="button"
                  @click="form.sendViaEmail = !form.sendViaEmail"
                  :class="['flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-colors text-sm font-semibold',
                           form.sendViaEmail
                             ? 'border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                             : 'border-border hover:bg-accent text-muted-foreground']"
                >
                  <Mail class="size-4" />
                  Email
                  <CheckCircle2 v-if="form.sendViaEmail" class="size-4 ml-auto text-sky-500" />
                </button>
              </div>
              <p v-if="!form.sendViaLine && !form.sendViaEmail"
                class="text-[10px] text-destructive">กรุณาเลือกช่องทางอย่างน้อย 1 ช่องทาง</p>
            </div>

            <!-- Receivers -->
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Users class="size-3" /> ผู้รับ <span class="text-destructive">*</span>
                  <span v-if="form.receiverEmpnos.length"
                    class="ml-1 bg-emerald-500 text-white rounded-full px-1.5 py-0.5 text-[9px] font-bold">
                    {{ form.receiverEmpnos.length }}
                  </span>
                </span>
                <button
                  type="button"
                  @click="openEmpModal"
                  class="text-sm px-4 py-2 rounded-xl border border-dashed
                         hover:bg-accent transition-colors text-muted-foreground flex items-center gap-2 font-medium"
                >
                  <Plus class="size-4" /> เลือกพนักงาน
                </button>
              </div>
              <!-- Selected employees chips -->
              <div v-if="selectedEmployees.length" class="flex flex-wrap gap-1.5">
                <span
                  v-for="emp in selectedEmployees"
                  :key="emp.empno"
                  class="inline-flex items-center gap-1 text-[10px] font-medium
                         bg-emerald-500/10 text-emerald-700 dark:text-emerald-300
                         border border-emerald-500/30 rounded-full px-2 py-0.5"
                >
                  {{ emp.empfullname_t ?? emp.userid ?? emp.empcode }}
                  <button type="button" @click="toggleEmployee(emp.empno)"
                    class="hover:text-destructive transition-colors ml-0.5">
                    <X class="size-2.5" />
                  </button>
                </span>
              </div>
              <p v-else class="text-[10px] text-muted-foreground">ยังไม่ได้เลือกผู้รับ</p>
            </div>

            <!-- Subject -->
            <div class="flex flex-col gap-1.5">
              <label for="f-subject" class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <MessageSquare class="size-3" /> หัวเรื่อง (Subject)
              </label>
              <input
                id="f-subject"
                v-model="form.subject"
                placeholder="หัวเรื่องอีเมล / ชื่อข้อความ"
                class="w-full text-xs border rounded-xl px-3 py-2.5 bg-background
                       focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
              />
            </div>

            <!-- Message Template -->
            <div class="flex flex-col gap-1.5">
              <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <FileText class="size-3" /> ข้อความ (Message Template)
              </span>

              <!-- Toolbar -->
              <div class="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border border-b-0 rounded-t-xl bg-muted/30">
                <button type="button" @click="exec('bold')"
                  class="w-6 h-6 flex items-center justify-center rounded text-xs font-bold hover:bg-accent transition-colors"
                  title="Bold">B</button>
                <button type="button" @click="exec('italic')"
                  class="w-6 h-6 flex items-center justify-center rounded text-xs italic hover:bg-accent transition-colors"
                  title="Italic">I</button>
                <button type="button" @click="exec('underline')"
                  class="w-6 h-6 flex items-center justify-center rounded text-xs underline hover:bg-accent transition-colors"
                  title="Underline">U</button>
                <button type="button" @click="exec('strikeThrough')"
                  class="w-6 h-6 flex items-center justify-center rounded text-xs line-through hover:bg-accent transition-colors"
                  title="Strikethrough">S</button>

                <div class="w-px h-4 bg-border mx-0.5"></div>

                <button type="button" @click="execBlock('h1')"
                  class="h-6 px-1.5 flex items-center justify-center rounded text-[10px] font-bold hover:bg-accent transition-colors"
                  title="Heading 1">H1</button>
                <button type="button" @click="execBlock('h2')"
                  class="h-6 px-1.5 flex items-center justify-center rounded text-[10px] font-bold hover:bg-accent transition-colors"
                  title="Heading 2">H2</button>
                <button type="button" @click="execBlock('p')"
                  class="h-6 px-1.5 flex items-center justify-center rounded text-[10px] hover:bg-accent transition-colors"
                  title="Paragraph">P</button>

                <div class="w-px h-4 bg-border mx-0.5"></div>

                <button type="button" @click="exec('justifyLeft')"
                  class="w-6 h-6 flex items-center justify-center rounded text-xs hover:bg-accent transition-colors"
                  title="Align Left">≡L</button>
                <button type="button" @click="exec('justifyCenter')"
                  class="w-6 h-6 flex items-center justify-center rounded text-xs hover:bg-accent transition-colors"
                  title="Align Center">≡C</button>
                <button type="button" @click="exec('justifyRight')"
                  class="w-6 h-6 flex items-center justify-center rounded text-xs hover:bg-accent transition-colors"
                  title="Align Right">≡R</button>

                <div class="w-px h-4 bg-border mx-0.5"></div>

                <button type="button" @click="exec('insertUnorderedList')"
                  class="w-6 h-6 flex items-center justify-center rounded text-xs hover:bg-accent transition-colors"
                  title="Bullet list">•—</button>
                <button type="button" @click="exec('insertOrderedList')"
                  class="w-6 h-6 flex items-center justify-center rounded text-xs hover:bg-accent transition-colors"
                  title="Numbered list">1.</button>

                <div class="w-px h-4 bg-border mx-0.5"></div>

                <button type="button" @click="insertLink"
                  class="w-6 h-6 flex items-center justify-center rounded text-xs hover:bg-accent transition-colors"
                  title="Insert link">🔗</button>
                <button type="button" @click="insertLinkPlaceholder"
                  class="h-6 px-1.5 flex items-center justify-center rounded text-[10px] font-semibold
                         bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30
                         hover:bg-orange-500/20 transition-colors"
                  title="แทรก placeholder ลิงก์รายงาน">{Link}</button>
              </div>

              <!-- Editable area -->
              <div
                ref="editorRef"
                contenteditable="true"
                @input="form.messageBody = ($event.target as HTMLElement).innerHTML"
                class="min-h-[110px] text-xs border rounded-b-xl px-3 py-2.5 bg-background
                       focus:outline-none focus:ring-2 focus:ring-emerald-400/50 overflow-y-auto
                       prose prose-sm dark:prose-invert max-w-none"
              ></div>
              <p class="text-[10px] text-muted-foreground">
                ใช้ปุ่ม <span class="font-semibold text-orange-500">{Link}</span> เพื่อแทรก placeholder สำหรับลิงก์รายงาน
              </p>
            </div>

            <!-- Default View Filters -->
            <div class="flex flex-col gap-2">
              <div class="flex items-center gap-1.5">
                <SlidersHorizontal class="size-3 text-muted-foreground" />
                <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Default Filters
                </span>
                <span v-if="activeDefaultFilterCount > 0"
                  class="text-[10px] bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300
                         px-1.5 py-0.5 rounded-full font-semibold"
                >{{ activeDefaultFilterCount }} active</span>
                <span v-if="loadingReport" class="ml-1">
                  <Loader2 class="size-3 animate-spin text-muted-foreground" />
                </span>
              </div>
              <p class="text-[10px] text-muted-foreground">
                Filter เหล่านี้จะถูกตั้งไว้ล่วงหน้าเมื่อผู้รับเปิดลิ้งก์รายงาน — ผู้รับยังสามารถปรับ filter เองได้
              </p>

              <div v-if="!form.reportId" class="text-[10px] text-muted-foreground/60 text-center py-2 border border-dashed rounded-lg">
                เลือก Report ก่อนเพื่อตั้ง Default Filters
              </div>
              <div v-else-if="loadingReport" class="text-[10px] text-muted-foreground text-center py-2">
                กำลังโหลดข้อมูล...
              </div>
              <div v-else-if="!reportDatasets.length" class="text-[10px] text-muted-foreground/60 text-center py-2 border border-dashed rounded-lg">
                Report นี้ยังไม่มี Dataset
              </div>

              <div v-else class="space-y-4">
                <div v-for="ds in reportDatasets" :key="ds.id" class="rounded-xl border p-3 space-y-2 bg-muted/20">
                  <!-- Dataset header -->
                  <div class="flex items-center gap-1.5">
                    <Filter class="size-3 text-emerald-500" />
                    <span class="text-[10px] font-semibold truncate flex-1">{{ ds.name }}</span>
                    <button
                      @click="addDefaultFilter(ds.id)"
                      class="flex items-center gap-0.5 text-[10px] text-emerald-600 hover:text-emerald-700 font-semibold"
                    >
                      <Plus class="size-3" />Add
                    </button>
                  </div>

                  <!-- Filter rows -->
                  <div
                    v-for="(f, i) in defaultViewFilters[ds.id] ?? []"
                    :key="i"
                    class="rounded-lg border bg-background p-2 space-y-1.5"
                  >
                    <!-- Column select -->
                    <select
                      v-model="f.column"
                      class="w-full text-[11px] border rounded-md px-2 py-1 bg-background
                             focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    >
                      <option value="">— column —</option>
                      <option v-for="col in dfColsOf(ds)" :key="col.name" :value="col.name">
                        {{ col.label }}
                      </option>
                    </select>

                    <!-- Operator + delete -->
                    <div class="flex gap-1">
                      <select
                        v-model="f.operator"
                        class="flex-1 text-[11px] border rounded-md px-2 py-1 bg-background
                               focus:outline-none focus:ring-1 focus:ring-emerald-400"
                      >
                        <option v-for="op in DEFAULT_FILTER_OPS" :key="op.value" :value="op.value">
                          {{ op.label }}
                        </option>
                      </select>
                      <button
                        @click="removeDefaultFilter(ds.id, i)"
                        class="p-1 text-muted-foreground hover:text-destructive rounded"
                      >
                        <Trash2 class="size-3.5" />
                      </button>
                    </div>

                    <!-- Value input -->
                    <template v-if="!['blank','notBlank'].includes(f.operator)">
                      <!-- in / notIn picker -->
                      <template v-if="f.operator === 'in' || f.operator === 'notIn'">
                        <div class="flex items-center justify-between text-[10px] mb-1">
                          <span :class="(f.values ?? []).length ? 'text-emerald-600 font-semibold' : 'text-muted-foreground'">
                            {{ (f.values ?? []).length ? `${f.values!.length} selected` : 'none selected' }}
                          </span>
                          <button v-if="(f.values ?? []).length" @click.stop="f.values = []"
                            class="text-muted-foreground hover:text-destructive transition-colors">clear</button>
                        </div>
                        <input
                          v-model="dfPickerSearch[`${ds.id}_${i}`]"
                          placeholder="search values..."
                          class="w-full text-[10px] border rounded-md px-1.5 py-1 bg-background mb-1
                                 focus:outline-none focus:ring-1 focus:ring-emerald-400
                                 placeholder:text-muted-foreground/40"
                        />
                        <div class="max-h-32 overflow-y-auto border rounded-md divide-y">
                          <label
                            v-for="val in dfFilteredPickerValues(`${ds.id}_${i}`, ds, f.column)"
                            :key="val"
                            class="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-muted/40 transition-colors"
                          >
                            <input type="checkbox" :checked="(f.values ?? []).includes(val)"
                              @change="toggleDfPickerValue(f, val)" class="accent-emerald-500 shrink-0" />
                            <span class="text-[10px] truncate font-mono" :title="val">{{ val }}</span>
                          </label>
                          <div v-if="!dfFilteredPickerValues(`${ds.id}_${i}`, ds, f.column).length"
                            class="text-[10px] text-center text-muted-foreground py-2">No values found</div>
                        </div>
                      </template>

                      <!-- Date picker -->
                      <div v-else-if="dfColsOf(ds).find(c => c.name === f.column)?.type === 'date'"
                        class="space-y-1">
                        <!-- token badge -->
                        <div v-if="dfIsToken(f.value)" class="flex items-center gap-1">
                          <span class="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700
                                       dark:bg-emerald-900/40 dark:text-emerald-300
                                       text-[10px] font-semibold px-2 py-0.5 rounded-full border border-emerald-300">
                            ⚡ {{ dfTokenLabel(f.value) }}
                          </span>
                          <button @click="f.value = ''" class="text-[10px] text-muted-foreground hover:text-foreground">
                            ✕ แก้ไข
                          </button>
                        </div>
                        <input v-else v-model="f.value" type="date"
                          class="w-full text-[11px] border rounded-md px-2 py-1 bg-background
                                 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                        <!-- quick token buttons -->
                        <div class="flex gap-1">
                          <button @click="f.value = DATE_TOKEN_TODAY"
                            :class="['flex-1 text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors',
                              f.value === DATE_TOKEN_TODAY
                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100']"
                          >⚡ Today</button>
                          <button @click="f.value = DATE_TOKEN_YESTERDAY"
                            :class="['flex-1 text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors',
                              f.value === DATE_TOKEN_YESTERDAY
                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100']"
                          >⚡ Yesterday</button>
                        </div>
                      </div>

                      <!-- Text input -->
                      <input v-else v-model="f.value" placeholder="value..."
                        class="w-full text-[11px] border rounded-md px-2 py-1 bg-background
                               focus:outline-none focus:ring-1 focus:ring-emerald-400
                               placeholder:text-muted-foreground/40" />
                    </template>
                  </div>

                  <p v-if="!(defaultViewFilters[ds.id] ?? []).length"
                    class="text-[10px] text-muted-foreground/60 text-center py-1">
                    ไม่มี filter — กด Add เพื่อเพิ่ม
                  </p>
                </div>
              </div>
            </div>

            <!-- Active toggle -->
            <div class="flex items-center justify-between p-3 rounded-xl border bg-muted/20">
              <div>
                <p class="text-xs font-semibold">เปิดใช้งาน</p>
                <p class="text-[10px] text-muted-foreground">ระบบจะส่งตามกำหนดการที่ตั้งไว้</p>
              </div>
              <button type="button" @click="form.isActive = !form.isActive">
                <ToggleRight v-if="form.isActive" class="size-8 text-emerald-500" />
                <ToggleLeft  v-else               class="size-8 text-muted-foreground" />
              </button>
            </div>

          </div>

          <!-- Footer -->
          <div class="flex gap-2.5 px-5 py-4 border-t shrink-0">
            <button @click="showModal = false"
              class="flex-1 text-xs py-2.5 rounded-xl border hover:bg-accent transition-colors font-medium">
              ยกเลิก
            </button>
            <button @click="doSave" :disabled="!canSave || saving"
              :class="['flex-1 flex items-center justify-center gap-2 text-xs py-2.5 rounded-xl font-semibold transition-colors',
                       canSave && !saving
                         ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                         : 'bg-muted text-muted-foreground cursor-not-allowed']"
            >
              <Loader2 v-if="saving" class="size-3.5 animate-spin" />
              <CheckCircle2 v-else  class="size-3.5" />
              {{ saving ? 'กำลังบันทึก...' : isEdit ? 'บันทึกการแก้ไข' : 'บันทึก' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ════════════════════════════════════════
       Modal: Employee Picker
  ════════════════════════════════════════ -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showEmpModal"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      >
        <div class="bg-background rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden max-h-[85vh]">

          <!-- Header -->
          <div class="flex items-center gap-3 px-5 py-4 border-b shrink-0">
            <Users class="size-4 text-indigo-500" />
            <span class="font-semibold text-sm">เลือกผู้รับ</span>
            <span v-if="form.receiverEmpnos.length"
              class="text-[10px] font-bold bg-emerald-500 text-white rounded-full px-1.5 py-0.5">
              {{ form.receiverEmpnos.length }}
            </span>
            <button @click="showEmpModal = false" class="ml-auto text-muted-foreground hover:text-foreground">
              <X class="size-4" />
            </button>
          </div>

          <!-- Search -->
          <div class="px-4 py-3 border-b shrink-0">
            <div class="relative">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                v-model="empSearch"
                placeholder="ค้นหาชื่อ, รหัส, แผนก..."
                autofocus
                class="w-full pl-8 pr-4 py-2 text-xs border rounded-xl bg-background
                       focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
              />
            </div>
            <div class="flex gap-2 mt-2">
              <button
                @click="form.receiverEmpnos = [...new Set([...form.receiverEmpnos, ...filteredEmployees.map(e => String(e.empno)).filter(Boolean)])]"
                class="text-[10px] px-2 py-1 rounded-lg border hover:bg-accent transition-colors text-muted-foreground"
              >เลือกทั้งหมด</button>
              <button
                @click="form.receiverEmpnos = []"
                class="text-[10px] px-2 py-1 rounded-lg border hover:bg-accent transition-colors text-muted-foreground"
              >ล้างทั้งหมด</button>
            </div>
          </div>

          <!-- Loading -->
          <div v-if="loadingEmp" class="flex-1 flex items-center justify-center gap-2 text-muted-foreground text-sm py-8">
            <Loader2 class="size-5 animate-spin" /> กำลังโหลดพนักงาน...
          </div>

          <!-- Employee list -->
          <div v-else class="flex-1 overflow-y-auto divide-y">
            <button
              v-for="emp in filteredEmployees"
              :key="emp.empno"
              type="button"
              @click="toggleEmployee(emp.empno)"
              :class="['w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-accent transition-colors',
                       form.receiverEmpnos.includes(String(emp.empno)) && 'bg-emerald-500/5']"
            >
              <!-- Avatar -->
              <div :class="['flex size-8 items-center justify-center rounded-full shrink-0 text-xs font-bold text-white',
                             form.receiverEmpnos.includes(String(emp.empno)) ? 'bg-emerald-500' : 'bg-muted-foreground/30 !text-foreground']">
                {{ empInitial(emp) }}
              </div>
              <!-- Info -->
              <div class="flex-1 min-w-0">
                <p class="text-xs font-medium truncate">
                  {{ emp.empfullname_t ?? emp.userid ?? emp.empcode }}
                </p>
                <div class="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span v-if="emp.dpt_name">{{ emp.dpt_name }}</span>
                  <span v-if="emp.email"    class="flex items-center gap-0.5"><Mail class="size-2.5" />{{ emp.email }}</span>
                </div>
              </div>
              <!-- Check -->
              <CheckCircle2
                v-if="form.receiverEmpnos.includes(String(emp.empno))"
                class="size-4 text-emerald-500 shrink-0"
              />
            </button>
            <div v-if="!filteredEmployees.length" class="py-10 text-center text-xs text-muted-foreground">
              ไม่พบพนักงานที่ค้นหา
            </div>
          </div>

          <!-- Footer -->
          <div class="px-5 py-3 border-t shrink-0 flex items-center justify-between">
            <span class="text-xs text-muted-foreground">เลือกแล้ว {{ form.receiverEmpnos.length }} คน</span>
            <button
              @click="showEmpModal = false"
              class="text-xs px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600
                     text-white font-semibold transition-colors"
            >ยืนยัน</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ════════════════════════════════════════
       Confirm Delete Dialog
  ════════════════════════════════════════ -->
  <AlertDialog :open="!!confirmDeleteId" @update:open="v => { if (!v) { confirmDeleteId = null; deleteError = '' } }">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle class="flex items-center gap-2">
          <Trash2 class="size-4 text-destructive" />
          ยืนยันการลบ
        </AlertDialogTitle>
        <AlertDialogDescription>
          ต้องการลบการตั้งค่าส่ง
          <span class="font-semibold text-foreground">{{ confirmDeleteName }}</span>
          ออกจากระบบ? การกระทำนี้ไม่สามารถย้อนกลับได้
        </AlertDialogDescription>
      </AlertDialogHeader>

      <!-- Error message -->
      <p v-if="deleteError" class="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
        {{ deleteError }}
      </p>

      <AlertDialogFooter>
        <AlertDialogCancel @click="confirmDeleteId = null; deleteError = ''">ยกเลิก</AlertDialogCancel>
        <!-- ใช้ Button แทน AlertDialogAction เพื่อควบคุมการปิด dialog เอง -->
        <Button
          variant="destructive"
          :disabled="!!deleting"
          @click.prevent="confirmDelete"
        >
          <Loader2 v-if="deleting" class="size-3.5 mr-1.5 animate-spin" />
          ลบรายการ
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .15s }
.fade-enter-from, .fade-leave-to { opacity: 0 }
</style>
