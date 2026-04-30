/**
 * POST /api/ai/clear-config-cache
 * Invalidate per-maincode AI config cache (call after SaveAiConfig succeeds)
 */
export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  invalidateAiConfigCache(session.maincode ?? '_')
  return { ok: true }
})
