<script setup lang="ts">
import {
  Send, Mail, MessageSquare, Calendar, Users, FileText,
  Plus, X, ChevronDown, Clock, AlertCircle, CheckCircle2,
  Copy, Eye, RefreshCw,
} from 'lucide-vue-next'
import { useMangoBIApi, type BIListItem } from '~/composables/useMangoBIApi'

definePageMeta({ auth: true })
useHead({ title: 'Send Report | MangoBI' })

const biApi = useMangoBIApi()

// ── State ──────────────────────────────────────────────────────────────────
const reports    = ref<BIListItem[]>([])
const loading    = ref(false)
const sending    = ref(false)
const sentOk     = ref(false)

const selectedReportId = ref<string | null>(null)
const channel          = ref<'line' | 'email'>('line')
const dateFrom         = ref('')
const dateTo           = ref('')
const message          = ref('สวัสดีครับ\n\nขอนำเสนอ Report ประจำงวดดังนี้\n\n{Report}\n\nขอบคุณครับ')
const selectedRecipients = ref<string[]>([])
const previewMode      = ref(false)

// ── Mock recipients ────────────────────────────────────────────────────────
const mockRecipients = [
  { id: 'u1', name: 'สมชาย ใจดี',     dept: 'บัญชี',    avatar: 'ส' },
  { id: 'u2', name: 'สมหญิง รักงาน',  dept: 'การเงิน',  avatar: 'ส' },
  { id: 'u3', name: 'วิชาญ เก่งมาก',  dept: 'IT',       avatar: 'ว' },
  { id: 'u4', name: 'นภาพร สุขสันต์', dept: 'HR',       avatar: 'น' },
  { id: 'u5', name: 'ธนา มีสุข',      dept: 'ผู้บริหาร', avatar: 'ธ' },
]

// ── Selected report ────────────────────────────────────────────────────────
const selectedReport = computed(() =>
  reports.value.find(r => r.id === selectedReportId.value)
)

const shareUrl = computed(() => {
  if (!selectedReportId.value) return ''
  const base = window?.location?.origin ?? ''
  return `${base}/view/${selectedReportId.value}`
})

const messagePreview = computed(() =>
  message.value.replace('{Report}', shareUrl.value || '[URL Report]')
)

// ── Load reports ───────────────────────────────────────────────────────────
onMounted(async () => {
  loading.value = true
  try { reports.value = await biApi.listReports() }
  catch {}
  finally { loading.value = false }
})

function toggleRecipient(id: string) {
  if (selectedRecipients.value.includes(id))
    selectedRecipients.value = selectedRecipients.value.filter(x => x !== id)
  else
    selectedRecipients.value = [...selectedRecipients.value, id]
}

function insertToken() {
  message.value += '{Report}'
}

async function doSend() {
  if (!selectedReportId.value || !selectedRecipients.value.length) return
  sending.value = true
  await new Promise(r => setTimeout(r, 1200)) // mock delay
  sending.value = false
  sentOk.value  = true
  setTimeout(() => { sentOk.value = false }, 3000)
}

const canSend = computed(() =>
  !!selectedReportId.value && selectedRecipients.value.length > 0
)
</script>

<template>
  <div class="max-w-5xl mx-auto py-6 px-4 flex flex-col gap-6">

    <!-- Header -->
    <div class="flex items-center gap-3">
      <div class="flex size-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
        <Send class="size-4 text-emerald-500" />
      </div>
      <div>
        <h1 class="font-bold text-lg">Send Report</h1>
        <p class="text-xs text-muted-foreground">ส่ง Report ให้ผู้รับผ่าน LINE หรือ Email</p>
      </div>
      <!-- Mock badge -->
      <span class="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 border border-amber-500/20 flex items-center gap-1">
        <AlertCircle class="size-3" /> Mockup
      </span>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

      <!-- ── Left: Config ───────────────────────────────────────────────── -->
      <div class="lg:col-span-2 flex flex-col gap-4">

        <!-- 1. Select Report -->
        <section class="border rounded-xl p-4 flex flex-col gap-3">
          <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <FileText class="size-3.5" /> 1. เลือก Report
          </p>
          <div v-if="loading" class="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw class="size-3.5 animate-spin" /> กำลังโหลด...
          </div>
          <div v-else-if="!reports.length" class="text-xs text-muted-foreground">
            ยังไม่มี Report ที่บันทึก — ไปที่ Report Builder เพื่อสร้างและบันทึก Report ก่อน
          </div>
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              v-for="r in reports"
              :key="r.id"
              @click="selectedReportId = r.id"
              :class="['flex items-center gap-2 p-2.5 rounded-lg border text-left text-xs transition-colors',
                selectedReportId === r.id
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-border hover:bg-accent']"
            >
              <FileText class="size-3.5 shrink-0" />
              <span class="truncate font-medium flex-1">{{ r.name }}</span>
              <CheckCircle2 v-if="selectedReportId === r.id" class="size-3.5 shrink-0 text-emerald-500" />
            </button>
          </div>
        </section>

        <!-- 2. Date Range -->
        <section class="border rounded-xl p-4 flex flex-col gap-3">
          <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Calendar class="size-3.5" /> 2. ช่วงเวลา (Optional)
          </p>
          <div class="flex gap-2 items-center">
            <div class="flex-1">
              <label class="text-[10px] text-muted-foreground mb-1 block">จากวันที่</label>
              <input type="date" v-model="dateFrom"
                class="w-full text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-emerald-400" />
            </div>
            <span class="text-muted-foreground text-xs mt-4">—</span>
            <div class="flex-1">
              <label class="text-[10px] text-muted-foreground mb-1 block">ถึงวันที่</label>
              <input type="date" v-model="dateTo"
                class="w-full text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-emerald-400" />
            </div>
          </div>
        </section>

        <!-- 3. Message -->
        <section class="border rounded-xl p-4 flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <MessageSquare class="size-3.5" /> 3. ข้อความ
            </p>
            <div class="flex gap-2">
              <button @click="insertToken"
                class="text-[10px] px-2 py-1 rounded-md border border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 transition-colors font-semibold">
                + {Report}
              </button>
              <button @click="previewMode = !previewMode"
                :class="['text-[10px] px-2 py-1 rounded-md border transition-colors flex items-center gap-1',
                  previewMode ? 'bg-muted border-border' : 'border-border hover:bg-accent']">
                <Eye class="size-3" /> Preview
              </button>
            </div>
          </div>
          <!-- Edit mode -->
          <textarea
            v-if="!previewMode"
            v-model="message"
            rows="6"
            placeholder="พิมพ์ข้อความที่จะส่ง ใส่ {Report} เพื่อแทรก URL ของ Report"
            class="w-full text-xs border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-emerald-400 resize-none font-mono"
          />
          <!-- Preview mode -->
          <div v-else class="text-xs bg-muted/40 border rounded-lg px-3 py-2 whitespace-pre-wrap leading-relaxed font-mono">
            {{ messagePreview }}
          </div>
          <p class="text-[10px] text-muted-foreground">
            ใช้ <code class="bg-muted px-1 py-0.5 rounded font-mono">{Report}</code>
            เพื่อแทรก URL Report ของคุณโดยอัตโนมัติ
          </p>
        </section>

        <!-- 4. Channel -->
        <section class="border rounded-xl p-4 flex flex-col gap-3">
          <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Send class="size-3.5" /> 4. ช่องทางการส่ง
          </p>
          <div class="flex gap-3">
            <button
              @click="channel = 'line'"
              :class="['flex-1 flex items-center gap-2.5 p-3 rounded-xl border text-sm font-semibold transition-colors',
                channel === 'line' ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-300' : 'border-border hover:bg-accent']"
            >
              <span class="text-xl">💬</span>
              LINE Notify
            </button>
            <button
              @click="channel = 'email'"
              :class="['flex-1 flex items-center gap-2.5 p-3 rounded-xl border text-sm font-semibold transition-colors',
                channel === 'email' ? 'border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300' : 'border-border hover:bg-accent']"
            >
              <Mail class="size-4" />
              Email
            </button>
          </div>
        </section>

      </div>

      <!-- ── Right: Recipients + Send ───────────────────────────────────── -->
      <div class="flex flex-col gap-4">

        <!-- Recipients -->
        <section class="border rounded-xl p-4 flex flex-col gap-3 flex-1">
          <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Users class="size-3.5" /> ผู้รับ
            <span v-if="selectedRecipients.length"
              class="ml-auto text-[10px] font-bold bg-emerald-500 text-white rounded-full px-1.5 py-0.5">
              {{ selectedRecipients.length }}
            </span>
          </p>
          <div class="flex flex-col gap-1.5">
            <button
              v-for="r in mockRecipients"
              :key="r.id"
              @click="toggleRecipient(r.id)"
              :class="['flex items-center gap-2.5 p-2 rounded-lg border text-xs transition-colors',
                selectedRecipients.includes(r.id)
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : 'border-border hover:bg-accent']"
            >
              <div :class="['flex size-7 items-center justify-center rounded-full text-white text-[10px] font-bold shrink-0',
                selectedRecipients.includes(r.id) ? 'bg-emerald-500' : 'bg-muted-foreground/40']">
                {{ r.avatar }}
              </div>
              <div class="flex flex-col flex-1 min-w-0">
                <span class="font-medium truncate">{{ r.name }}</span>
                <span class="text-[10px] text-muted-foreground">{{ r.dept }}</span>
              </div>
              <CheckCircle2 v-if="selectedRecipients.includes(r.id)" class="size-3.5 text-emerald-500 shrink-0" />
            </button>
          </div>
        </section>

        <!-- Summary & Send -->
        <section class="border rounded-xl p-4 flex flex-col gap-3">
          <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">สรุปการส่ง</p>
          <div class="flex flex-col gap-1.5 text-xs">
            <div class="flex justify-between">
              <span class="text-muted-foreground">Report</span>
              <span class="font-medium truncate max-w-[120px]">{{ selectedReport?.name ?? '—' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">ช่องทาง</span>
              <span class="font-medium">{{ channel === 'line' ? '💬 LINE' : '📧 Email' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">ผู้รับ</span>
              <span class="font-medium">{{ selectedRecipients.length }} คน</span>
            </div>
          </div>

          <!-- URL preview -->
          <div v-if="selectedReportId" class="bg-muted/40 rounded-lg p-2 text-[10px] font-mono break-all border">
            {{ shareUrl }}
            <button @click="navigator.clipboard.writeText(shareUrl)" class="ml-1 text-muted-foreground hover:text-foreground">
              <Copy class="size-3 inline" />
            </button>
          </div>

          <!-- Send button -->
          <button
            @click="doSend"
            :disabled="!canSend || sending"
            :class="['w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors',
              sentOk ? 'bg-emerald-500 text-white' :
              canSend && !sending ? 'bg-emerald-500 hover:bg-emerald-600 text-white' :
              'bg-muted text-muted-foreground cursor-not-allowed']"
          >
            <CheckCircle2 v-if="sentOk" class="size-4" />
            <RefreshCw v-else-if="sending" class="size-4 animate-spin" />
            <Send v-else class="size-4" />
            {{ sentOk ? 'ส่งเรียบร้อย!' : sending ? 'กำลังส่ง...' : 'ส่ง Report' }}
          </button>
          <p v-if="!canSend" class="text-[10px] text-muted-foreground text-center">
            เลือก Report และผู้รับก่อนส่ง
          </p>
        </section>

      </div>
    </div>
  </div>
</template>
