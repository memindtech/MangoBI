import { defineStore } from 'pinia'

export type AiPageKey = 'sql-builder' | 'datamodel' | 'report'

export interface AiUsageStats {
  promptTokens:  number   // prompt_eval_count
  outputTokens:  number   // eval_count
  totalMs:       number   // total_duration ns → ms
  genMs:         number   // eval_duration ns → ms (time to generate)
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

const EMPTY_HISTORY = (): AiMessage[] => []

export const useAiChatStore = defineStore('ai-chat', () => {
  // Per-page chat histories
  const histories = ref<Record<AiPageKey, AiMessage[]>>({
    'sql-builder': [],
    'datamodel':   [],
    'report':      [],
  })

  // Which page's panel is open
  const openPage = ref<AiPageKey | null>(null)

  // Selected model (shared across all pages)
  const selectedModel = ref<string | null>(null)

  function togglePanel(page: AiPageKey) {
    openPage.value = openPage.value === page ? null : page
  }

  function openPanel(page: AiPageKey)  { openPage.value = page }
  function closePanel()                { openPage.value = null }

  function messages(page: AiPageKey) {
    return histories.value[page] ??= EMPTY_HISTORY()
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
    const list = messages(page)
    const last = [...list].reverse().find(m => m.role === 'assistant')
    if (last) Object.assign(last, patch)
  }

  function clearHistory(page: AiPageKey) {
    histories.value[page] = []
  }

  return {
    histories,
    openPage,
    selectedModel,
    togglePanel,
    openPanel,
    closePanel,
    messages,
    addMessage,
    updateLastAssistant,
    clearHistory,
  }
})
