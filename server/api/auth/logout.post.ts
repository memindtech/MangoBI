/**
 * POST /api/auth/logout
 * body: { allDevices?: boolean }
 *
 * 1. อ่าน bi_session → ดึง mangoAuth
 * 2. เรียก MangoWebPoolService logout server-side (invalidate session ที่ต้นทาง)
 * 3. ลบ bi_session + clear cookie
 */
export default defineEventHandler(async (event) => {
  const body       = await readBody(event).catch(() => ({}))
  const allDevices = Boolean(body?.allDevices)

  const sessionId = getSessionId(event)
  const session   = sessionId ? await getSession(sessionId) : null

  if (session?.mangoAuth) {
    const config = useRuntimeConfig(event)
    try {
      await $fetch(
        `${config.public.apiBase}api/public/logout?all=${allDevices}&is_api=N`,
        { headers: { 'X-Mango-Auth': session.mangoAuth } },
      )
    } catch { /* ไม่ block logout ถึงแม้ MangoWebPoolService จะไม่ตอบ */ }
  }

  // ล้าง session + cookie เสมอ
  if (sessionId) await deleteSession(sessionId)
  clearSessionCookie(event)

  return { success: true }
})
