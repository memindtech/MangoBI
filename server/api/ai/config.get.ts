/**
 * GET /api/ai/config
 *
 * คืน AI feature state สำหรับ client
 * ไม่เปิดเผย API keys — แค่บอกว่า enabled ไหม และ provider อะไร
 */
export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)

  // config.aiEnabled may be boolean (default false) or string 'true'/'false' (from .env)
  const enabled = config.aiEnabled === true || String(config.aiEnabled) === 'true'

  return {
    enabled,
    provider: enabled ? (config.aiProvider ?? 'claude') : null,
    // model label สำหรับแสดง UI เท่านั้น
    model: enabled ? getModelLabel(config.aiProvider ?? 'claude', config) : null,
  }
})

function getModelLabel(provider: string, config: any): string {
  switch (provider) {
    case 'claude':  return 'Claude Sonnet'
    case 'gemini':  return `Gemini ${config.geminiModel ?? '2.0 Flash'}`
    case 'backend': return 'MangoBI AI'
    default:        return provider
  }
}
