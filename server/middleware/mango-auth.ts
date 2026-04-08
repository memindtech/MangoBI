/**
 * Middleware — ป้องกัน /api/mango-schema/* routes
 * ต้องมี mango_auth cookie หรือ X-Mango-Auth header
 * (token ที่ได้จาก login MangoBI)
 */
export default defineEventHandler((event) => {
  if (!event.path.startsWith('/api/mango-schema/')) return

  const cookie    = getHeader(event, 'cookie') ?? ''
  const mangoAuth = cookie.match(/mango_auth=([^;]+)/)?.[1]
    ?? getHeader(event, 'x-mango-auth')
    ?? ''

  if (!mangoAuth) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
})
