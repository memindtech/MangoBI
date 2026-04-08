/**
 * Mango Schema Fetcher (server-side only)
 *
 * ยิงไปหา Schema API ใหม่ที่แยกออกมาใน SQLGeneratorController
 * ทุก request ต้องมี X-MangoBI-Passcode header
 * passcode มาจาก NUXT_MANGO_SCHEMA_PASSCODE (server-only, ไม่ expose browser)
 */
import type { H3Event } from 'h3'

export function createMangoFetcher(event: H3Event) {
  const config   = useRuntimeConfig(event)
  const base     = (config.mangoBase as string)             || 'http://localhost/service/'
  const passcode = (config.mangoSchemaPasscode as string)   || ''

  return $fetch.create({
    baseURL: base,
    headers: {
      ...(passcode ? { 'X-MangoBI-Passcode': passcode } : {}),
    },
  })
}
