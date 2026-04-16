/**
 * GET /api/auth/companies
 * Proxy สำหรับ Anywhere LoginCompanies — ไม่ต้อง auth
 * ใช้ตอนหน้า login โหลด dropdown บริษัท
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  try {
    return await $fetch(`${config.public.apiBase}api/public/LoginCompanies`)
  } catch (err: any) {
    throw createError({
      statusCode: err?.response?.status ?? 502,
      statusMessage: 'Cannot reach auth server',
    })
  }
})
