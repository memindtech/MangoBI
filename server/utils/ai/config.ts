/**
 * AI Config — fetch AI configuration from backend DB
 *
 * Config is managed via the Settings page (/settings) — no .env fallback.
 * Result is cached 30 s per maincode to avoid hitting the DB on every chat token.
 */
import type { H3Event } from 'h3'

export interface AiConfigFull {
  enabled:      boolean
  provider:     string
  model:        string | null
  apiKey:       string | null
  backendUrl:   string | null
  backendModel: string | null
  models:       string[]
}

const _cache = new Map<string, { cfg: AiConfigFull; exp: number }>()
const TTL_MS = 30_000

export async function getAiConfigFull(event: H3Event): Promise<AiConfigFull> {
  const rtc = useRuntimeConfig(event)

  try {
    const session  = await requireSession(event)
    const cacheKey = session.maincode ?? '_'
    const hit      = _cache.get(cacheKey)
    if (hit && Date.now() < hit.exp) return hit.cfg

    const base = String(
      (rtc.public as any).planningBase ||
      (rtc.public as any).apiBase ||
      'http://localhost:8310/api/v1'
    ).replace(/\/$/, '')

    const res = await $fetch<any>(`${base}/MangoBI/GetAiConfigFull`, {
      headers: { 'X-Mango-Auth': session.mangoAuth },
      timeout: 3000,
    }).catch(() => null)

    if (res?.data != null) {
      const d = res.data as Record<string, unknown>
      let models: string[] = []
      try { if (d.modelsJson) models = JSON.parse(String(d.modelsJson)) } catch { /* ignore */ }
      const cfg: AiConfigFull = {
        enabled:      Boolean(d.enabled),
        provider:     String(d.provider     ?? 'claude'),
        model:        d.model        ? String(d.model)        : null,
        apiKey:       d.apiKey       ? String(d.apiKey)       : null,
        backendUrl:   d.backendUrl   ? String(d.backendUrl)   : null,
        backendModel: d.backendModel ? String(d.backendModel) : null,
        models,
      }
      _cache.set(cacheKey, { cfg, exp: Date.now() + TTL_MS })
      return cfg
    }
  } catch { /* no session or fetch failed */ }

  return {
    enabled:      false,
    provider:     'claude',
    model:        null,
    apiKey:       null,
    backendUrl:   null,
    backendModel: null,
    models:       [],
  }
}

export function invalidateAiConfigCache(maincode: string) {
  _cache.delete(maincode)
  _cache.delete('_')
}
