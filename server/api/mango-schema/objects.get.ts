/**
 * GET /api/mango-schema/objects?module=X
 * Proxy → AnywhereAPI/Master/Addspec_Object_ReadList?module=X&text=
 *
 * Cache key รวม module เพื่อแยก cache ต่อ module
 * Cache: 24h  |  stale fallback เมื่อ Mango ไม่ตอบ
 */
export default defineEventHandler(async (event): Promise<unknown> => {
  const { module: mod } = getQuery(event) as { module?: string }
  if (!mod) {
    throw createError({ statusCode: 400, statusMessage: 'module query param required' })
  }

  const cacheKey = `objects:${mod}`
  const cached   = await readCache<any>(cacheKey)

  if (cached && !cached.stale) {
    setHeader(event, 'X-Cache', 'hit')
    return cached.data
  }

  try {
    const mango = createMangoFetcher(event)
    const res   = await mango<any>(
      `AnywhereAPI/SQLGenerator/Schema_Object_ReadList?module=${encodeURIComponent(mod)}`
    )
    await writeCache(cacheKey, res, CACHE_TTL.objects)
    setHeader(event, 'X-Cache', 'miss')
    return res
  } catch (err: any) {
    if (cached) {
      setHeader(event, 'X-Cache', 'stale')
      setHeader(event, 'X-Cache-Age', String(Math.round((Date.now() - cached.ts) / 1000)))
      return cached.data
    }
    setHeader(event, 'X-Cache', 'miss-error')
    throw createError({
      statusCode: 502,
      statusMessage: 'Upstream Mango API unreachable',
      data: { module: mod, reason: err?.message ?? 'timeout or network error' },
    })
  }
})
