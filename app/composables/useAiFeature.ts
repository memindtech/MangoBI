/**
 * useAiFeature — client-side feature flag
 *
 * ดึง /api/ai/config ครั้งเดียวต่อ session และ cache ไว้
 * ทุก component ที่ใช้ composable นี้จะ share state เดียวกัน
 *
 * Usage:
 *   const { enabled, provider, model } = useAiFeature()
 *   v-if="enabled"
 */

interface AiConfig {
  enabled:  boolean
  provider: string | null
  model:    string | null
}

const _state = ref<AiConfig | null>(null)
const _fetching = ref(false)

const FETCH_TIMEOUT_MS = 15000

export function useAiFeature() {
  // Fetch once per app lifetime (shared singleton).
  // B3: AbortController + 15s timeout so a hanging /api/ai/config never
  //     leaves _fetching stuck at true (which would block retries for the
  //     whole session and gray out AI UI with no hint).
  if (!_state.value && !_fetching.value && import.meta.client) {
    _fetching.value = true
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
    $fetch<AiConfig>('/api/ai/config', { signal: ctrl.signal })
      .then(r  => { _state.value = r })
      .catch((err) => {
        if (err?.name === 'AbortError' || ctrl.signal.aborted) {
          console.warn('[useAiFeature] /api/ai/config timed out after', FETCH_TIMEOUT_MS, 'ms')
        } else {
          console.warn('[useAiFeature] /api/ai/config failed', err)
        }
        _state.value = { enabled: false, provider: null, model: null }
      })
      .finally(() => {
        clearTimeout(timer)
        _fetching.value = false
      })
  }

  const enabled  = computed(() => _state.value?.enabled  ?? false)
  const provider = computed(() => _state.value?.provider ?? null)
  const model    = computed(() => _state.value?.model    ?? null)

  return { enabled, provider, model }
}
