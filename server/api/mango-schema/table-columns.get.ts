/**
 * GET /api/mango-schema/table-columns?table=X
 * Proxy → AnywhereAPI/Master/Addspec_Table_Read?table_name=X
 *
 * Cache: 1h  |  stale fallback เมื่อ Mango ไม่ตอบ
 */
export default defineEventHandler(async (event): Promise<unknown> => {
  const { table } = getQuery(event) as { table?: string }
  if (!table) {
    throw createError({ statusCode: 400, statusMessage: 'table query param required' })
  }

  const cacheKey = `table-columns:${table}`
  const cached   = await readCache<any>(cacheKey)

  if (cached && !cached.stale) {
    setHeader(event, 'X-Cache', 'hit')
    return cached.data
  }

  try {
    const mango = createMangoFetcher(event)
    const res   = await mango<any>(
      `AnywhereAPI/SQLGenerator/Schema_Table_Read?table_name=${encodeURIComponent(table)}`
    )
    await writeCache(cacheKey, res, CACHE_TTL.columns)
    setHeader(event, 'X-Cache', 'miss')
    return res
  } catch (err: any) {
    if (cached) {
      setHeader(event, 'X-Cache', 'stale')
      setHeader(event, 'X-Cache-Age', String(Math.round((Date.now() - cached.ts) / 1000)))
      return cached.data
    }
    setHeader(event, 'X-Cache', 'miss-error')
    // B2: throw a real 502 so the client's catch branch runs instead of
    // treating null as "no columns". Previously returned a 200 body with
    // `{ data: null, error: '...' }` which callers silently ignored.
    throw createError({
      statusCode: 502,
      statusMessage: 'Upstream Mango API unreachable',
      data: { table, reason: err?.message ?? 'timeout or network error' },
    })
  }
})
