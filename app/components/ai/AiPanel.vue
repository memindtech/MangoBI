<script setup lang="ts">
/**
 * AiPanel — shared AI chat panel
 *
 * Props:
 *   page         — 'sql-builder' | 'datamodel' | 'report'
 *   systemPrompt — context string built by the parent page (reactive)
 *   contextLabel — short label shown in header e.g. "3 nodes · SQL Builder"
 *
 * The panel slides in from the right as a fixed overlay.
 */

import { Bot, X, Trash2, Send, Loader2, Sparkles, ChevronDown, Check } from 'lucide-vue-next'
import { useAiChatStore, type AiPageKey, type AiUsageStats } from '~/stores/ai-chat'
import { useAiChat } from '~/composables/useAiChat'
import { useAiFeature } from '~/composables/useAiFeature'
import { useAiModels, getContextLimit } from '~/composables/useAiModels'

import type { AiCanvasAction } from '~/composables/sql-builder/useAiActions'

const props = defineProps<{
  page:         AiPageKey
  systemPrompt: string
  contextLabel?: string
}>()

const emit = defineEmits<{ 'apply-action': [action: AiCanvasAction] }>()

const store   = useAiChatStore()
const { send, loading, abort } = useAiChat(props.page, () => props.systemPrompt)
const { model: aiModel } = useAiFeature()
const { models: availableModels } = useAiModels()

const showModelPicker = ref(false)
const activeModel = computed(() =>
  availableModels.value.find(m => m.name === store.selectedModel) ?? null
)

function selectModel(name: string) {
  store.selectedModel = name
  showModelPicker.value = false
}

const TAG_COLORS: Record<string, string> = {
  'Thai':        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'Fast':        'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  'Lightweight': 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  'Reasoning':   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'High Quality':'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  'Translation': 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  'New':         'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'Multilingual':'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  'Latest':      'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
}

const messages   = computed(() => store.messages(props.page))
const inputText  = ref('')

// ── Token usage (last assistant response) ─────────────────────────────────
const lastStats = computed<AiUsageStats | null>(() => {
  const msgs = store.messages(props.page)
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i]!.role === 'assistant' && msgs[i]!.stats) return msgs[i]!.stats!
  }
  return null
})
const currentModelName = computed(() =>
  store.selectedModel ?? (typeof aiModel.value === 'string' ? aiModel.value : null)
)
const tokenContextLimit = computed(() =>
  getContextLimit(lastStats.value?.model ?? currentModelName.value ?? '')
)
const usedTokens = computed(() =>
  lastStats.value ? lastStats.value.promptTokens + lastStats.value.outputTokens : 0
)
const usagePct = computed(() =>
  tokenContextLimit.value > 0
    ? Math.min(100, (usedTokens.value / tokenContextLimit.value) * 100)
    : 0
)
const pctColor = computed(() => {
  const p = usagePct.value
  if (p >= 90) return 'bg-red-500'
  if (p >= 70) return 'bg-amber-500'
  return 'bg-emerald-500'
})
const inputRef   = ref<HTMLTextAreaElement | null>(null)
const scrollRef  = ref<HTMLDivElement | null>(null)

// ── Resize ────────────────────────────────────────────────────────────────
const panelWidth   = ref(380)
const MIN_WIDTH    = 300
const MAX_WIDTH    = Math.min(800, window.innerWidth * 0.9)
const isResizing   = ref(false)

function onResizeStart(e: MouseEvent) {
  isResizing.value = true
  const startX     = e.clientX
  const startWidth = panelWidth.value

  function onMove(e: MouseEvent) {
    const delta = startX - e.clientX        // drag left = wider
    panelWidth.value = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta))
  }
  function onUp() {
    isResizing.value = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup',  onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup',  onUp)
}

// Auto-scroll to bottom when messages change
watch(messages, () => {
  nextTick(() => {
    if (scrollRef.value) {
      scrollRef.value.scrollTop = scrollRef.value.scrollHeight
    }
  })
}, { deep: true })

// Auto-resize textarea
function autoResize(e: Event) {
  const el = e.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 160) + 'px'
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || loading.value) return
  inputText.value = ''
  // Reset textarea height
  if (inputRef.value) inputRef.value.style.height = 'auto'
  await send(text)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

// Suggested prompts per page
const suggestions = computed(() => {
  switch (props.page) {
    case 'sql-builder':
      return [
        'ช่วยแนะนำ table ที่ควร join สำหรับเอกสาร PO',
        'อธิบาย SQL ที่ generate ออกมาให้หน่อย',
        'ควรใช้ LEFT JOIN หรือ INNER JOIN ดี',
      ]
    case 'datamodel':
      return [
        'ควร join table ไหนกับไหนบ้าง',
        'แนะนำ Transform สำหรับข้อมูลชุดนี้',
        'อธิบาย relation ที่เหมาะสมให้หน่อย',
      ]
    case 'report':
      return [
        'ควรใช้ chart ประเภทไหนกับข้อมูลนี้',
        'แนะนำ KPI ที่น่าสนใจจาก dataset นี้',
        'วิธี group by เพื่อดู trend ตามเวลา',
      ]
    default:
      return []
  }
})

function useSuggestion(text: string) {
  inputText.value = text
  nextTick(() => inputRef.value?.focus())
}

const PAGE_LABELS: Record<AiPageKey, string> = {
  'sql-builder': 'SQL Builder',
  'datamodel':   'Data Model',
  'report':      'Report',
}
</script>

<template>
  <Teleport to="body">
  <!-- Backdrop (mobile) -->
  <Transition name="fade">
    <div
      v-if="true"
      class="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] sm:hidden"
      @click="store.closePanel()"
    />
  </Transition>

  <!-- Panel -->
  <Transition name="slide-right">
  <aside
    :style="{ width: panelWidth + 'px' }"
    class="fixed right-0 top-0 z-50 h-full
           border-l bg-background shadow-2xl flex flex-col"
    :class="{ 'select-none': isResizing }"
  >
    <!-- Resize handle -->
    <div
      class="absolute left-0 top-0 h-full w-1 cursor-col-resize z-10 group"
      @mousedown.prevent="onResizeStart"
    >
      <div class="h-full w-full opacity-0 group-hover:opacity-100 bg-violet-400/40 transition-opacity" />
    </div>
    <!-- ── Header ────────────────────────────────────────────────────── -->
    <div class="px-4 py-3 border-b flex items-center gap-3 shrink-0 bg-gradient-to-r from-violet-500/10 to-indigo-500/5">
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <div class="size-7 rounded-full bg-violet-500/15 flex items-center justify-center shrink-0">
          <Sparkles class="size-3.5 text-violet-500" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold">AI Assistant</p>
          <p class="text-[10px] text-muted-foreground truncate flex items-center gap-1.5">
            <span>{{ PAGE_LABELS[page] }}</span>
            <span v-if="contextLabel" class="text-violet-500">· {{ contextLabel }}</span>
          </p>
        </div>
      </div>

      <div class="flex items-center gap-1">
        <button
          @click="store.clearHistory(page)"
          :disabled="!messages.length"
          class="size-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
          title="ล้างประวัติ"
        >
          <Trash2 class="size-3.5" />
        </button>
        <button
          @click="store.closePanel()"
          class="size-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X class="size-4" />
        </button>
      </div>
    </div>

    <!-- ── Messages ─────────────────────────────────────────────────── -->
    <div ref="scrollRef" class="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 min-h-0">

      <!-- Empty state with suggestions -->
      <template v-if="!messages.length">
        <div class="flex flex-col items-center gap-3 py-8 text-center">
          <div class="size-12 rounded-2xl bg-violet-500/10 flex items-center justify-center">
            <Bot class="size-6 text-violet-500" />
          </div>
          <div>
            <p class="text-sm font-semibold">สวัสดี! ฉันคือ AI Assistant</p>
            <p class="text-xs text-muted-foreground mt-1">ถามอะไรก็ได้เกี่ยวกับ {{ PAGE_LABELS[page] }}</p>
          </div>
        </div>

        <!-- Suggestion chips -->
        <div class="flex flex-col gap-2">
          <p class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">ลองถามได้เลย</p>
          <button
            v-for="s in suggestions"
            :key="s"
            @click="useSuggestion(s)"
            class="text-left text-xs px-3 py-2 rounded-xl border border-border/60 hover:border-violet-400/50
                   hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-all text-foreground/80
                   hover:text-foreground"
          >
            {{ s }}
          </button>
        </div>
      </template>

      <!-- Message list -->
      <AiMessage
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
        @apply-action="emit('apply-action', $event)"
      />
    </div>

    <!-- ── Input ─────────────────────────────────────────────────────── -->
    <div class="border-t px-3 py-3 shrink-0 bg-background/95 backdrop-blur-sm">

      <!-- Stop button when loading -->
      <div v-if="loading" class="flex items-center justify-center mb-2">
        <button
          @click="abort"
          class="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
        >
          <Loader2 class="size-3 animate-spin" />
          กำลังตอบ… คลิกเพื่อหยุด
        </button>
      </div>

      <div class="flex gap-2 items-end">
        <textarea
          ref="inputRef"
          v-model="inputText"
          @keydown="handleKeydown"
          @input="autoResize"
          :disabled="loading"
          placeholder="ถามอะไรก็ได้… (Enter ส่ง, Shift+Enter ขึ้นบรรทัด)"
          rows="1"
          class="flex-1 text-sm border rounded-xl px-3 py-2 bg-background resize-none
                 focus:outline-none focus:ring-2 focus:ring-violet-400/50
                 placeholder:text-muted-foreground/50 disabled:opacity-60
                 min-h-[36px] max-h-[160px] overflow-y-auto leading-relaxed"
        />
        <button
          @click="handleSend"
          :disabled="loading || !inputText.trim()"
          class="size-9 rounded-xl bg-violet-500 hover:bg-violet-600 text-white flex items-center justify-center
                 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          <Send class="size-4" />
        </button>
      </div>

      <!-- Status bar: model + token usage -->
      <div class="flex items-center justify-between mt-2 px-0.5">
        <!-- Current model -->
        <div v-if="availableModels.length" class="relative">
          <button
            @click="showModelPicker = !showModelPicker"
            class="flex items-center gap-1 text-[10px] text-muted-foreground/70 hover:text-violet-500 transition-colors"
            title="เปลี่ยน Model"
          >
            <Bot class="size-3 shrink-0" />
            <span class="font-medium truncate max-w-[120px]">
              {{ activeModel?.label ?? currentModelName ?? 'เลือก Model' }}
            </span>
            <ChevronDown class="size-2.5 shrink-0 opacity-60" />
          </button>

          <!-- Backdrop -->
          <div v-if="showModelPicker" class="fixed inset-0 z-[60]" @click="showModelPicker = false" />

          <!-- Dropdown (opens upward) -->
          <div
            v-if="showModelPicker"
            class="absolute left-0 bottom-full mb-1 z-[70] bg-background border rounded-xl shadow-2xl overflow-hidden"
            :style="{ width: Math.max(panelWidth - 32, 260) + 'px' }"
          >
            <div class="p-2 border-b">
              <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1">เลือก AI Model</p>
            </div>
            <div class="max-h-72 overflow-y-auto">
              <button
                v-for="m in availableModels"
                :key="m.name"
                @click="selectModel(m.name)"
                class="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors flex items-start gap-2.5"
                :class="{ 'bg-violet-50 dark:bg-violet-950/20': store.selectedModel === m.name }"
              >
                <Check
                  class="size-3.5 mt-0.5 shrink-0 text-violet-500"
                  :class="store.selectedModel === m.name ? 'opacity-100' : 'opacity-0'"
                />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-xs font-semibold">{{ m.label }}</span>
                    <span
                      v-for="tag in m.tags" :key="tag"
                      class="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                      :class="TAG_COLORS[tag] ?? 'bg-muted text-muted-foreground'"
                    >{{ tag }}</span>
                  </div>
                  <p class="text-[10px] text-muted-foreground mt-0.5 leading-snug">{{ m.desc }}</p>
                </div>
              </button>
            </div>
          </div>
        </div>
        <span
          v-else
          class="flex items-center gap-1 text-[10px] text-muted-foreground/60"
        >
          <Bot class="size-3 shrink-0" />
          <span class="font-medium">{{ currentModelName ?? 'AI' }}</span>
        </span>

        <!-- Token usage -->
        <div v-if="lastStats" class="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
          <span class="w-14 h-1.5 rounded-full bg-muted overflow-hidden inline-block">
            <span
              class="h-full rounded-full transition-all"
              :class="pctColor"
              :style="{ width: usagePct.toFixed(1) + '%' }"
            />
          </span>
          <span class="font-mono">{{ usagePct.toFixed(1) }}%</span>
          <span class="opacity-60">{{ usedTokens.toLocaleString() }} tok</span>
        </div>
        <span v-else class="text-[10px] text-muted-foreground/30">ready</span>
      </div>
    </div>
  </aside>
  </Transition>
  </Teleport>
</template>
