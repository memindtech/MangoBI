/**
 * POST /api/mango-schema/sync
 * Manual sync — ล้าง cache ทั้งหมดแล้ว warm-up modules ใหม่ทันที
 *
 * เรียกจาก UI ปุ่ม [↻ Sync] ใน SqlBuilderLeftPanel
 * Response: { ok, clearedKeys, syncedAt, mangoReachable }
 */
export default defineEventHandler(async (event): Promise<unknown> => {
  // 1. ล้าง cache ทั้งหมด
  const clearedKeys = await bustCache()

  // 2. ลอง warm-up modules เพื่อตรวจว่า Mango ยังตอบได้ไหม
  let mangoReachable = false
  try {
    const mango = createMangoFetcher(event)
    const res   = await mango<any>('AnywhereAPI/SQLGenerator/Schema_Module_ReadList')
    await writeCache('modules', res, CACHE_TTL.modules)
    mangoReachable = true
  } catch {
    mangoReachable = false
  }

  return {
    ok:             true,
    clearedKeys,
    syncedAt:       new Date().toISOString(),
    mangoReachable,
  }
})
