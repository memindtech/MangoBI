/**
 * GET /api/ai/models
 * Fetch available Ollama models from the backend server
 * Returns names only — descriptions are resolved client-side from catalog
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)

  const enabled = config.aiEnabled === true || String(config.aiEnabled) === 'true'
  if (!enabled) {
    throw createError({ statusCode: 403, statusMessage: 'AI feature is not enabled' })
  }

  // Only fetch when using the backend provider
  const provider = String(config.aiProvider ?? 'claude')
  if (provider !== 'backend') {
    return { models: [] }
  }

  const backendUrl = String(config.aiBackendUrl ?? 'https://backend-ai.mangoanywhere.com/api/chat')
  // Derive base URL from the chat endpoint  e.g. https://host/api/chat → https://host
  const baseUrl = backendUrl.replace(/\/api\/chat.*$/, '')

  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return { models: [] }
    const data = await res.json() as { models?: Array<{ name: string }> }
    const names = (data.models ?? []).map((m) => m.name)
    return { models: names }
  } catch {
    return { models: [] }
  }
})
