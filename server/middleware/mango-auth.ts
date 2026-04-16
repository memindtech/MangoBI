/**
 * Server Middleware — ป้องกัน protected routes
 *
 * /api/proxy/*        → ต้องมี bi_session cookie ที่ valid
 * /api/mango-schema/* → ต้องมี bi_session cookie ที่ valid
 *                       (actual backend call ใช้ NUXT_MANGO_SCHEMA_PASSCODE แยกต่างหาก)
 */
export default defineEventHandler(async (event) => {
  const path = event.path

  if (
    path.startsWith('/api/proxy/') ||
    path.startsWith('/api/mango-schema/')
  ) {
    const sessionId = getSessionId(event)
    const session   = sessionId ? await getSession(sessionId) : null
    if (!session) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
  }
})
