/**
 * GET /api/ai/config
 *
 * Returns AI feature state for client — no API keys exposed.
 * Reads from DB config (per-maincode) with .env fallback.
 */
import type { AiConfigFull } from '../../utils/ai/config'

export default defineEventHandler(async (event) => {
  // For public viewers (no session): show the button locked — actual AI calls still require auth
  const sessionId = getSessionId(event)
  const session   = sessionId ? await getSession(sessionId) : null
  if (!session) return { enabled: true, provider: null, model: null }

  const cfg = await getAiConfigFull(event)

  return {
    enabled:  cfg.enabled,
    provider: cfg.enabled ? cfg.provider : null,
    model:    cfg.enabled ? getModelLabel(cfg.provider, cfg) : null,
  }
})

function getModelLabel(provider: string, cfg: AiConfigFull): string {
  switch (provider) {
    case 'claude':  return cfg.model ?? 'claude-sonnet-4-6'
    case 'gemini':  return cfg.model ?? 'gemini-2.0-flash'
    case 'openai':  return cfg.model ?? ''
    case 'backend': return cfg.backendModel ?? ''
    default:        return ''
  }
}
