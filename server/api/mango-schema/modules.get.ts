/**
 * GET /api/mango-schema/modules
 * Proxy → AnywhereAPI/Master/Addspec_Module_ReadList
 *
 * Cache: 24h  |  stale fallback เมื่อ Mango ไม่ตอบ
 */
export default defineEventHandler(async (event): Promise<unknown> => {
  const cached = await readCache<any>('modules')

  // Fresh cache → return ทันที
  if (cached && !cached.stale) {
    setHeader(event, 'X-Cache', 'hit')
    return cached.data
  }

  // Miss หรือ stale → ลองดึงจาก Mango
  try {
    const mango = createMangoFetcher(event)
    const res   = await mango<any>('AnywhereAPI/SQLGenerator/Schema_Module_ReadList')
    await writeCache('modules', res, CACHE_TTL.modules)
    setHeader(event, 'X-Cache', 'miss')
    return res
  } catch (err) {
    // Mango ไม่ตอบ → ใช้ stale cache ถ้ามี
    if (cached) {
      setHeader(event, 'X-Cache', 'stale')
      setHeader(event, 'X-Cache-Age', String(Math.round((Date.now() - cached.ts) / 1000)))
      return cached.data
    }
    // ไม่มีอะไรเลย → B2: throw 502 so clients' try/catch runs
    setHeader(event, 'X-Cache', 'miss-error')
    throw createError({
      statusCode: 502,
      statusMessage: 'Upstream Mango API unreachable',
      data: { reason: (err as any)?.message ?? 'timeout or network error' },
    })
  }
})
