/**
 * GET /api/ai/models
 * Returns available models for the chat picker:
 *   - Configured custom models (all providers)
 *   - Live Ollama models (backend provider only)
 */
export default defineEventHandler(async (event) => {
  const cfg = await getAiConfigFull(event)

  if (!cfg.enabled) throw createError({ statusCode: 403, statusMessage: 'AI feature is not enabled' })

  const customModels = cfg.models ?? []

  // For backend provider: also fetch live Ollama models
  if (cfg.provider === 'backend') {
    const backendUrl = cfg.backendUrl ?? 'https://backend-ai.mangoanywhere.com/api/chat'
    const baseUrl    = backendUrl.replace(/\/api\/chat.*$/, '')
    try {
      const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const data = await res.json() as { models?: Array<{ name: string }> }
        const ollamaModels = (data.models ?? []).map(m => m.name)
        const merged = [...customModels, ...ollamaModels.filter(m => !customModels.includes(m))]
        return { models: merged }
      }
    } catch { /* fall through to custom only */ }
  }

  // For openai-compatible providers: fetch live models from /models endpoint
  if (cfg.provider === 'openai' && cfg.backendUrl) {
    try {
      const modelsUrl = cfg.backendUrl.replace(/\/$/, '') + '/models'
      const headers: Record<string, string> = {}
      if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`
      const res = await fetch(modelsUrl, { headers, signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const data = await res.json() as { data?: Array<{ id: string }> }
        const liveModels = (data.data ?? []).map(m => m.id).filter(Boolean)
        const merged = [...customModels, ...liveModels.filter(m => !customModels.includes(m))]
        return { models: merged }
      }
    } catch { /* fall through to custom only */ }
  }

  return { models: customModels }
})
