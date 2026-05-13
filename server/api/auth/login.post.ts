/**
 * POST /api/auth/login
 *
 * ส่ง credentials ไปยัง MangoWebPoolService (auth authority ของ Mango)
 * ถ้าสำเร็จ → เก็บ mango_auth token ไว้ server-side (Nitro session)
 *            → ส่ง bi_session HttpOnly cookie กลับให้ browser แทน
 *
 * browser ไม่เห็น mango_auth token เลย — Nuxt BFF เป็น security layer เท่านั้น
 */
export default defineEventHandler(async (event) => {
  const body   = await readBody(event)
  const config = useRuntimeConfig(event)

  const attempt  = String(body.attempt ?? '1')
  const loginUrl = `${config.public.apiBase}api/public/Login?is_api=N&app_name=ERP&attempt=${attempt}`

  try {
    const resp = await $fetch<any>(loginUrl, {
      method: 'POST',
      body: {
        maincode:        body.maincode        ?? '',
        userid:          body.userid          ?? '',
        userpass:        body.userpass        ?? '',
        ms_access_token: body.ms_access_token ?? null,
        oauth2:          body.oauth2          ?? 'N',
        email:           body.email           ?? null,
      },
    })

    // Forward error responses ตรงๆ (error_type, lock_limit ฯลฯ)
    if (resp?.error) {
      return {
        error:            resp.error,
        error_type:       resp.error_type       ?? null,
        lock_limit_login: resp.lock_limit_login ?? null,
      }
    }

    const mangoAuth = resp?.data as string | undefined
    if (!mangoAuth) return { error: 'No token returned from auth server' }

    // ดึง employee profile จาก Planning/MangoBI/Me ด้วย token ที่เพิ่งได้
    let empProfile: { empno?: number | null; empname_t?: string | null; prename_t?: string | null; emppos?: string | null; dpt_code?: string | null } = {}
    try {
      const meResp = await $fetch<any>(`${config.public.planningBase}Planning/MangoBI/Me`, {
        headers: { 'X-Mango-Auth': mangoAuth },
      })
      if (meResp?.empno != null) {
        empProfile = {
          empno:     meResp.empno     ?? null,
          empname_t: meResp.empname_t ?? null,
          prename_t: meResp.prename_t ?? null,
          emppos:    meResp.emppos    ?? null,
          dpt_code:  meResp.dpt_code  ?? null,
        }
      }
    } catch { /* profile is optional — ไม่ block login */ }

    // เก็บ token ไว้ฝั่ง server — browser ไม่รู้เลย
    const sessionId = await createSession({
      mangoAuth,
      userId:   body.userid   ?? '',
      maincode: body.maincode ?? '',
      ...empProfile,
    })

    setSessionCookie(event, sessionId)
    return { success: true }

  } catch (err: any) {
    const data    = err?.data
    const status  = err?.response?.status ?? err?.statusCode ?? 500
    const message = data?.error ?? err?.message ?? 'Login failed'
    throw createError({ statusCode: status, statusMessage: message })
  }
})
