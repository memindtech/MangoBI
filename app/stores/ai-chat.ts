import { defineStore } from 'pinia'
import { useAuthStore } from '~/stores/auth'

export type AiPageKey = 'sql-builder' | 'datamodel' | 'report' | 'view'

export interface AiUsageStats {
  promptTokens:  number
  outputTokens:  number
  totalMs:       number
  genMs:         number
  model?:        string
}

export interface AiMessage {
  id:      string
  role:    'user' | 'assistant'
  content: string
  ts:      number
  loading?: boolean
  stats?:   AiUsageStats
}

const PAGES: AiPageKey[] = ['sql-builder', 'datamodel', 'report', 'view']

function storageKey(userId: string | null | undefined): string {
  return `mangobiAiChat:${userId ?? 'guest'}`
}

function loadFromStorage(userId: string | null | undefined) {
  if (!import.meta.client) return null
  try {
    const raw = localStorage.getItem(storageKey(userId))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveToStorage(userId: string | null | undefined, data: object) {
  if (!import.meta.client) return
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(data))
  } catch { /* quota exceeded — ignore */ }
}

function emptyHistories(): Record<AiPageKey, AiMessage[]> {
  return { 'sql-builder': [], 'datamodel': [], 'report': [], 'view': [] }
}

export const useAiChatStore = defineStore('ai-chat', () => {
  const authStore = useAuthStore()
  const userId    = computed(() => authStore.profile?.userId ?? authStore.profile?.empno?.toString() ?? null)

  // ── Hydrate from localStorage on first access ────────────────────────────
  function hydrate() {
    const saved = loadFromStorage(userId.value)
    if (!saved) return { histories: emptyHistories() }
    // Strip loading:true from any messages saved mid-stream
    const histories = emptyHistories()
    for (const page of PAGES) {
      histories[page] = ((saved.histories?.[page] ?? []) as AiMessage[])
        .filter(m => m.id && m.role && !m.loading)
    }
    return { histories }
  }

  const init      = hydrate()
  const histories = ref<Record<AiPageKey, AiMessage[]>>(init.histories)
  const openPage  = ref<AiPageKey | null>(null)

  // ── Persist whenever histories change ───────────────────────────────────
  watch(
    histories,
    () => saveToStorage(userId.value, { histories: histories.value }),
    { deep: true },
  )

  // ── Re-hydrate when user switches account ────────────────────────────────
  watch(userId, (newId, oldId) => {
    if (newId === oldId) return
    const fresh = hydrate()
    histories.value = fresh.histories
    openPage.value  = null
  })

  // ── Panel control ────────────────────────────────────────────────────────
  function togglePanel(page: AiPageKey) { openPage.value = openPage.value === page ? null : page }
  function openPanel (page: AiPageKey)  { openPage.value = page }
  function closePanel()                 { openPage.value = null }

  // ── Message helpers ──────────────────────────────────────────────────────
  function messages(page: AiPageKey) {
    return histories.value[page] ??= []
  }

  function addMessage(page: AiPageKey, msg: Omit<AiMessage, 'id' | 'ts'> & { id?: string; ts?: number }) {
    const list = messages(page)
    list.push({
      id:      msg.id  ?? crypto.randomUUID(),
      ts:      msg.ts  ?? Date.now(),
      role:    msg.role,
      content: msg.content,
      loading: msg.loading,
      stats:   msg.stats,
    })
    return list[list.length - 1]!
  }

  function updateLastAssistant(page: AiPageKey, patch: Partial<AiMessage>) {
    const last = [...messages(page)].reverse().find(m => m.role === 'assistant')
    if (last) Object.assign(last, patch)
  }

  function clearHistory(page: AiPageKey) {
    histories.value[page] = []
  }

  return {
    histories, openPage,
    togglePanel, openPanel, closePanel,
    messages, addMessage, updateLastAssistant, clearHistory,
  }
})
