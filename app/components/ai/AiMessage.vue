<script setup lang="ts">
import { Bot, User, Copy, Check, Zap, CheckCircle2 } from 'lucide-vue-next'
import type { AiMessage } from '~/stores/ai-chat'
import { parseAiAction, describeAction, type AiCanvasAction } from '~/composables/sql-builder/useAiActions'

const props = defineProps<{ message: AiMessage }>()
const emit  = defineEmits<{ 'apply-action': [action: AiCanvasAction] }>()

// ── Content segments: split text vs action blocks ─────────────────────────────
type Segment =
  | { kind: 'text';   html:   string }
  | { kind: 'action'; raw:    string; parsed: AiCanvasAction | null }

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = []
  // Match ```action or ```json blocks — model may use either
  const re = /```(?:action|json)\n?([\s\S]*?)```/g
  let last = 0, m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ kind: 'text', html: renderMarkdown(text.slice(last, m.index)) })
    segments.push({ kind: 'action', raw: m[1]!.trim(), parsed: parseAiAction(m[1]!.trim()) })
    last = m.index + m[0].length
  }
  if (last < text.length) segments.push({ kind: 'text', html: renderMarkdown(text.slice(last)) })
  return segments
}

const segments = computed(() => parseSegments(props.message.content))

// ── Simple markdown renderer ──────────────────────────────────────────────────
function renderMarkdown(text: string): string {
  return text
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre class="ai-code-block" data-lang="${lang}"><code>${escHtml(code.trim())}</code></pre>`)
    .replace(/`([^`]+)`/g, (_, c) => `<code class="ai-inline-code">${escHtml(c)}</code>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>(\n|$))+/g, m => `<ul class="ai-list">${m}</ul>`)
    .replace(/\n/g, '<br>')
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Action card state ─────────────────────────────────────────────────────────
const appliedActions = ref(new Set<string>())

function applyAction(raw: string, action: AiCanvasAction) {
  emit('apply-action', action)
  appliedActions.value.add(raw)
}

// ── Copy button ───────────────────────────────────────────────────────────────
const copied = ref(false)
async function copyText() {
  await navigator.clipboard.writeText(props.message.content)
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}
</script>

<template>
  <div :class="['flex gap-2.5 group', message.role === 'user' ? 'flex-row-reverse' : 'flex-row']">

    <!-- Avatar -->
    <div :class="[
      'size-7 rounded-full flex items-center justify-center shrink-0 mt-0.5',
      message.role === 'user'
        ? 'bg-indigo-500 text-white'
        : 'bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-300',
    ]">
      <User v-if="message.role === 'user'" class="size-3.5" />
      <Bot  v-else                          class="size-3.5" />
    </div>

    <!-- Bubble -->
    <div :class="[
      'relative max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
      message.role === 'user'
        ? 'bg-indigo-500 text-white rounded-tr-sm'
        : 'bg-muted dark:bg-muted/60 text-foreground rounded-tl-sm',
    ]">

      <!-- Loading dots -->
      <div v-if="message.loading && !message.content" class="flex gap-1 py-1">
        <span class="size-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:0ms]" />
        <span class="size-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:150ms]" />
        <span class="size-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:300ms]" />
      </div>

      <!-- Content segments -->
      <template v-else>
        <template v-for="(seg, i) in segments" :key="i">
          <!-- Regular text -->
          <div v-if="seg.kind === 'text'" class="ai-content" v-html="seg.html" />

          <!-- Action card -->
          <pre v-else-if="seg.kind === 'action' && !seg.parsed" class="ai-code-block my-2"><code>{{ seg.raw }}</code></pre>
          <div
            v-else-if="seg.kind === 'action' && seg.parsed"
            class="my-2 rounded-xl border overflow-hidden text-foreground"
            :class="appliedActions.has(seg.raw)
              ? 'border-emerald-400/40 bg-emerald-50/50 dark:bg-emerald-950/20'
              : 'border-violet-300/40 bg-violet-50/50 dark:bg-violet-950/20'"
          >
            <!-- Card header -->
            <div
              class="flex items-center gap-2 px-3 py-1.5 border-b text-[10px] font-semibold"
              :class="appliedActions.has(seg.raw)
                ? 'border-emerald-200/40 bg-emerald-100/50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                : 'border-violet-200/40 bg-violet-100/50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300'"
            >
              <CheckCircle2 v-if="appliedActions.has(seg.raw)" class="size-3.5" />
              <Zap v-else class="size-3.5" />
              {{ appliedActions.has(seg.raw) ? 'Applied แล้ว' : 'Canvas Action' }}
            </div>
            <!-- Card body -->
            <div class="px-3 py-2 flex items-start justify-between gap-2">
              <p class="text-[11px] leading-snug whitespace-pre-line text-foreground/80">
                {{ describeAction(seg.parsed) }}
              </p>
              <button
                v-if="!appliedActions.has(seg.raw)"
                @click="applyAction(seg.raw, seg.parsed)"
                class="shrink-0 text-[11px] px-2.5 py-1 rounded-lg font-semibold transition-colors
                       bg-violet-500 hover:bg-violet-600 text-white"
              >
                Apply
              </button>
            </div>
          </div>
        </template>
      </template>

      <!-- Streaming cursor -->
      <span
        v-if="message.loading && message.content"
        class="inline-block w-0.5 h-3.5 bg-current opacity-70 animate-pulse ml-0.5 align-middle"
      />

      <!-- Copy button (assistant only) -->
      <button
        v-if="message.role === 'assistant' && !message.loading && message.content"
        @click="copyText"
        class="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity
               size-6 rounded-full bg-background border shadow-sm
               flex items-center justify-center text-muted-foreground hover:text-foreground"
        title="คัดลอก"
      >
        <Check v-if="copied" class="size-3 text-green-500" />
        <Copy  v-else         class="size-3" />
      </button>
    </div>

  </div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.ai-content :deep(.ai-code-block) {
  @apply my-2 p-3 rounded-lg bg-black/10 dark:bg-white/10 text-xs font-mono overflow-x-auto whitespace-pre;
}
.ai-content :deep(.ai-inline-code) {
  @apply px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 text-xs font-mono;
}
.ai-content :deep(.ai-list) {
  @apply list-disc pl-5 space-y-0.5 my-1;
}
.ai-content :deep(strong) { @apply font-semibold; }
.ai-content :deep(em)     { @apply italic; }
</style>
