/**
 * GET /api/mango-schema/object-detail?module=X&object_name=Y
 * Proxy → AnywhereAPI/Master/Addspec_Object_Read?module=X&object_name=Y
 *
 * Cache: 1h  |  stale fallback เมื่อ Mango ไม่ตอบ
 */
export default defineEventHandler(async (event): Promise<unknown> => {
  const { module: mod, object_name } = getQuery(event) as { module?: string; object_name?: string }
  if (!mod || !object_name) {
    throw createError({ statusCode: 400, statusMessage: 'module and object_name query params required' })
  }

  const cacheKey = `object-detail:${mod}:${object_name}`
  const cached   = await readCache<any>(cacheKey)

  if (cached && !cached.stale) {
    setHeader(event, 'X-Cache', 'hit')
    return cached.data
  }

  try {
    const mango = createMangoFetcher(event)
    const res   = await mango<any>(
      `AnywhereAPI/SQLGenerator/Schema_Object_Read?module=${encodeURIComponent(mod)}&object_name=${encodeURIComponent(object_name)}`
    )
    await writeCache(cacheKey, res, CACHE_TTL.detail)
    setHeader(event, 'X-Cache', 'miss')
    return res
  } catch {
    if (cached) {
      setHeader(event, 'X-Cache', 'stale')
      setHeader(event, 'X-Cache-Age', String(Math.round((Date.now() - cached.ts) / 1000)))
      return cached.data
    }
    setHeader(event, 'X-Cache', 'miss-error')
    return { data: null, error: 'Mango API unreachable' }
  }
})
