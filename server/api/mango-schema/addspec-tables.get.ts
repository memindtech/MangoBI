/**
 * GET /api/mango-schema/addspec-tables?module=&text=
 * Proxy → AnywhereAPI/Master/Addspec_Table_ReadList?module=X&text=Y
 *
 * Returns the full flat list of DB tables (richer than Schema_Object_ReadList —
 * includes ALL tables, not just registered objects). Used by the SQL Editor
 * autocomplete so users can reference any table in their hand-written queries.
 *
 * Cache key includes module + text so different filters don't collide.
 * Cache: 24h  |  stale fallback when Mango is unreachable
 */
export default defineEventHandler(async (event): Promise<unknown> => {
  const { module: mod = '', text = '' } = getQuery(event) as { module?: string; text?: string }

  const cacheKey = `addspec-tables:${mod}:${text}`
  const cached   = await readCache<any>(cacheKey)

  if (cached && !cached.stale) {
    setHeader(event, 'X-Cache', 'hit')
    return cached.data
  }

  try {
    const mango = createMangoFetcher(event)
    const res   = await mango<any>(
      `AnywhereAPI/Master/Addspec_Table_ReadList?module=${encodeURIComponent(mod)}&text=${encodeURIComponent(text)}`
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
      data: { module: mod, text, reason: err?.message ?? 'timeout or network error' },
    })
  }
})
