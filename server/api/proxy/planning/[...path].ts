/**
 * /api/proxy/planning/[...path]
 *
 * Proxy ทุก request ที่ browser ส่งมาไปยัง Planning Backend
 * อ่าน mangoAuth จาก server-side session → inject เป็น X-Mango-Auth
 * browser ไม่เห็น token และไม่เห็น URL ของ Planning Backend
 */
export default defineEventHandler(async (event) => {
  const session = await requireSession(event)

  const path   = getRouterParam(event, 'path') ?? ''
  const config = useRuntimeConfig(event)

  // ต่อ query string เดิมจาก request
  const qs     = new URLSearchParams(getQuery(event) as Record<string, string>).toString()
  const target = `${config.public.planningBase}${path}${qs ? `?${qs}` : ''}`

  const method = getMethod(event)
  const body   = !['GET', 'HEAD'].includes(method) ? await readRawBody(event) : undefined

  try {
    const res = await $fetch.raw(target, {
      method:  method as any,
      body,
      headers: {
        'X-Mango-Auth': session.mangoAuth,
        // ส่ง Content-Type ต้นทางต่อ (ถ้ามี)
        ...(getHeader(event, 'content-type')
          ? { 'Content-Type': getHeader(event, 'content-type')! }
          : { 'Content-Type': 'application/json' }),
      },
    })
    return res._data
  } catch (err: any) {
    throw createError({
      statusCode:    err?.response?.status ?? 502,
      statusMessage: err?.data?.error ?? err?.message ?? 'Planning proxy error',
    })
  }
})
