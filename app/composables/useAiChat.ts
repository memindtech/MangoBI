/**
 * useAiChat — client-side composable
 *
 * ส่ง message ไปหา /api/ai/chat (Nuxt server route)
 * รองรับ SSE streaming: chunks ถูก append เข้า message ทีละชิ้น
 *
 * Usage:
 *   const { send, loading, abort } = useAiChat('sql-builder', () => systemPrompt.value)
 */

import { useAiChatStore, type AiPageKey, type AiUsageStats } from '~/stores/ai-chat'

export function useAiChat(page: AiPageKey, getSystemPrompt: () => string) {
  const store   = useAiChatStore()
  const loading = ref(false)
  let   abortController: AbortController | null = null

  function abort() {
    abortController?.abort()
    abortController = null
    loading.value = false
    // Mark last loading message as done
    store.updateLastAssistant(page, { loading: false })
  }

  async function send(userText: string) {
    if (loading.value || !userText.trim()) return

    // Add user message to history
    store.addMessage(page, { role: 'user', content: userText.trim() })

    // Placeholder assistant message while streaming
    const placeholder = store.addMessage(page, {
      role:    'assistant',
      content: '',
      loading: true,
    })

    loading.value = true
    abortController = new AbortController()

    // Build messages array (exclude system role — sent separately)
    const msgs = store.messages(page)
      .filter(m => !m.loading)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    try {
      const model = store.selectedModel ?? undefined

      const res = await fetch('/api/ai/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          messages:     msgs,
          systemPrompt: getSystemPrompt(),
          ...(model ? { model } : {}),
        }),
        signal: abortController.signal,
      })

      if (!res.ok || !res.body) {
        throw new Error(`Server error ${res.status}`)
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buf     = ''
      let   full    = ''
      let   usageStats: AiUsageStats | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') break

          try {
            const json = JSON.parse(raw)
            if (json.error) {
              full = json.error
              store.updateLastAssistant(page, { content: full, loading: false })
              return
            }
            if (json.stats) {
              usageStats = { ...json.stats, model: model ?? undefined }
            }
            if (json.text) {
              full += json.text
              store.updateLastAssistant(page, { content: full, loading: true })
            }
          } catch { /* skip malformed */ }
        }
      }

      store.updateLastAssistant(page, {
        content: full || '(ไม่มีข้อความตอบกลับ)',
        loading: false,
        ...(usageStats ? { stats: usageStats } : {}),
      })

    } catch (err: any) {
      if (err?.name === 'AbortError') {
        store.updateLastAssistant(page, { loading: false })
      } else {
        store.updateLastAssistant(page, {
          content: `เกิดข้อผิดพลาด: ${err?.message ?? 'Unknown error'}`,
          loading: false,
        })
      }
    } finally {
      loading.value    = false
      abortController  = null
    }
  }

  return { send, loading: readonly(loading), abort }
}
