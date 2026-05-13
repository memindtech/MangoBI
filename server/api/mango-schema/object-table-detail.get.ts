/**
 * GET /api/mango-schema/object-table-detail?table=X
 * Proxy → AnywhereAPI/Master/Addspec_Object_table_detail_Read?table_name=X
 *
 * Cache: 1h  |  stale fallback เมื่อ Mango ไม่ตอบ
 */
export default defineEventHandler(async (event): Promise<unknown> => {
  const { table } = getQuery(event) as { table?: string }
  if (!table) {
    throw createError({ statusCode: 400, statusMessage: 'table query param required' })
  }

  const cacheKey = `object-table-detail:${table}`
  const cached   = await readCache<any>(cacheKey)

  if (cached && !cached.stale) {
    setHeader(event, 'X-Cache', 'hit')
    return cached.data
  }

  try {
    const mango = createMangoFetcher(event)
    const res   = await mango<any>(
      `AnywhereAPI/SQLGenerator/Schema_Object_Table_Detail_Read?table_name=${encodeURIComponent(table)}`
    )
    await writeCache(cacheKey, res, CACHE_TTL.detail)
    setHeader(event, 'X-Cache', 'miss')
    return res
  } catch (err: any) {
    if (cached) {
      setHeader(event, 'X-Cache', 'stale')
      setHeader(event, 'X-Cache-Age', String(Math.round((Date.now() - cached.ts) / 1000)))
      return cached.data
    }
    setHeader(event, 'X-Cache', 'miss-error')
    // ADDSPEC remarks are optional — returning empty data lets the primary
    // column load still succeed (legitimate case: table with no ADDSPEC rows).
    // Header signals degradation so clients can log if curious.
    setHeader(event, 'X-Mango-Status', 'unreachable')
    return { data: [] }
  }
})
