/**
 * /api/proxy/bi/[...path]
 *
 * Proxy สำหรับ MangoBI Backend (MicroBackend)
 * อ่าน mangoAuth จาก server-side session → inject เป็น X-Mango-Auth
 * ใช้ NUXT_PUBLIC_BI_BASE แยกออกจาก Planning proxy
 */
export default defineEventHandler(async (event) => {
  const session = await requireSession(event)

  const path   = getRouterParam(event, 'path') ?? ''
  const config = useRuntimeConfig(event)

  const qs     = new URLSearchParams(getQuery(event) as Record<string, string>).toString()
  const target = `${config.public.biBase}${path}${qs ? `?${qs}` : ''}`

  const method = getMethod(event)
  const body   = !['GET', 'HEAD'].includes(method) ? await readRawBody(event) : undefined

  try {
    const res = await $fetch.raw(target, {
      method:  method as any,
      body,
      headers: {
        'X-Mango-Auth': session.mangoAuth,
        ...(getHeader(event, 'content-type')
          ? { 'Content-Type': getHeader(event, 'content-type')! }
          : { 'Content-Type': 'application/json' }),
      },
    })
    return res._data
  } catch (err: any) {
    if (err?.response?.status === 401) {
      const sid = getSessionId(event)
      await deleteSession(sid)
      clearSessionCookie(event)
    }
    throw createError({
      statusCode:    err?.response?.status ?? 502,
      statusMessage: err?.data?.error ?? err?.message ?? 'BI proxy error',
    })
  }
})
