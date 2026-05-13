/**
 * GET /api/auth/me
 * ตรวจว่า bi_session ยังใช้งานได้ไหม
 * ใช้โดย auth store ตอน page load แทนการอ่าน localStorage
 */
export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  return {
    userId:    session.userId,
    maincode:  session.maincode,
    empno:     session.empno     ?? null,
    empname_t: session.empname_t ?? null,
    prename_t: session.prename_t ?? null,
    emppos:    session.emppos    ?? null,
    dpt_code:  session.dpt_code  ?? null,
  }
})
