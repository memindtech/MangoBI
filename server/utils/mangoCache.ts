/**
 * Mango Schema Cache Helpers
 * ใช้ Nitro useStorage('mango-schema') → driver: memory
 *
 * TTL (milliseconds):
 *   modules / objects → 24h
 *   columns / detail  → 1h
 */

export const CACHE_TTL = {
  modules: 24 * 60 * 60 * 1000,
  objects: 24 * 60 * 60 * 1000,
  columns:  1 * 60 * 60 * 1000,
  detail:   1 * 60 * 60 * 1000,
} as const

interface CacheEntry<T> {
  data: T
  ts:   number
  exp:  number
}

export async function readCache<T>(key: string): Promise<{ data: T; stale: boolean; ts: number } | null> {
  const storage = useStorage('mango-schema')
  const entry = await storage.getItem<CacheEntry<T>>(key)
  if (!entry) return null
  return { data: entry.data, stale: Date.now() > entry.exp, ts: entry.ts }
}

export async function writeCache<T>(key: string, data: T, ttlMs: number): Promise<void> {
  const storage = useStorage('mango-schema')
  await storage.setItem(key, { data, ts: Date.now(), exp: Date.now() + ttlMs } as CacheEntry<T>)
}

export async function bustCache(): Promise<number> {
  const storage = useStorage('mango-schema')
  const keys = await storage.getKeys()
  await Promise.all(keys.map((k: string) => storage.removeItem(k)))
  return keys.length
}

export async function getCacheInfo() {
  const storage = useStorage('mango-schema')
  const keys = await storage.getKeys()
  return await Promise.all(
    keys.map(async (k: string) => {
      const entry = await storage.getItem<CacheEntry<unknown>>(k)
      return { key: k, ts: entry?.ts ?? 0, exp: entry?.exp ?? 0, stale: Date.now() > (entry?.exp ?? 0) }
    })
  )
}
