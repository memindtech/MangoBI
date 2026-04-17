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

export function useAiFeature() {
  // Fetch once per app lifetime (shared singleton)
  if (!_state.value && !_fetching.value && import.meta.client) {
    _fetching.value = true
    $fetch<AiConfig>('/api/ai/config')
      .then(r  => { _state.value = r })
      .catch(() => { _state.value = { enabled: false, provider: null, model: null } })
      .finally(() => { _fetching.value = false })
  }

  const enabled  = computed(() => _state.value?.enabled  ?? false)
  const provider = computed(() => _state.value?.provider ?? null)
  const model    = computed(() => _state.value?.model    ?? null)

  return { enabled, provider, model }
}
