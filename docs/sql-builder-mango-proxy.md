# SQL Builder — Mango Schema Proxy Plan

## ปัญหาเดิม

Browser ที่ติดตั้งอยู่ที่ลูกค้าเรียก Mango API โดยตรง:

```
Browser (customer) ──$xt.getServer()──► Mango API (AnywhereAPI/Master/Addspec_*)
```

ปัญหาที่ตามมา:
- ถ้า customer ปิด outbound firewall → SQL Builder พัง
- CORS ถ้า Mango อยู่ต่าง domain
- ต้อง config firewall ที่ browser level (ทำยาก)

## Solution: Nuxt Server Proxy + Local Cache

```
Browser ──► MangoBI Nitro Server ──► Mango API
               │  (server-to-server)
               └──► useStorage('cache')
                     └── stale fallback ถ้า Mango ไม่ตอบ
```

ข้อดี:
1. Browser คุยกับ MangoBI เท่านั้น (same-origin, ไม่มี CORS)
2. Firewall config แค่ที่ server (1 rule)
3. Cache fallback ถ้า Mango down → ใช้ข้อมูลครั้งล่าสุด
4. DB structure ไม่เปลี่ยนบ่อย → cache TTL 1-24h ก็พอ

---

## ขั้นตอนการ implement (เรียงลำดับ)

### Step 1 — nuxt.config.ts
ไฟล์: `nuxt.config.ts`

เพิ่ม `mangoBase` ใน private runtimeConfig (server-only, ไม่ expose ไป browser):
```ts
runtimeConfig: {
  mangoBase: 'http://localhost/service/',  // ← URL ของ Mango API
  public: { ... }
}
```

และเพิ่ม nitro storage driver สำหรับ cache:
```ts
nitro: {
  storage: {
    cache: { driver: 'fs', base: './.cache/mango-schema' }
  }
}
```

---

### Step 2 — server/utils/mangoCache.ts
ไฟล์: `server/utils/mangoCache.ts`

Cache helper ที่ใช้ Nitro `useStorage('cache')`:
- `readCache<T>(key)` → `{ data, stale }` หรือ null
- `writeCache<T>(key, data, ttlMs)` → บันทึก + timestamp
- `bustCache()` → ลบ key ทั้งหมดใน namespace `mango-schema:`
- `getCacheInfo()` → รายชื่อ key + เวลา sync ล่าสุด

TTL defaults:
- modules: 24h
- objects: 24h
- table columns: 1h
- object detail: 1h

---

### Step 3 — server/utils/mangoFetch.ts
ไฟล์: `server/utils/mangoFetch.ts`

Helper สร้าง `$fetch` instance ที่ชี้ไป `config.mangoBase` พร้อม forward `X-Mango-Auth` จาก cookie ของ request:
```ts
export function createMangoFetcher(event: H3Event) { ... }
```

---

### Step 4 — server/api/mango-schema/*.get.ts (5 routes)

| Route | Mango endpoint |
|---|---|
| `GET /api/mango-schema/modules` | `AnywhereAPI/Master/Addspec_Module_ReadList` |
| `GET /api/mango-schema/objects?module=X` | `AnywhereAPI/Master/Addspec_Object_ReadList?module=X&text=` |
| `GET /api/mango-schema/table-columns?table=X` | `AnywhereAPI/Master/Addspec_Table_Read?table_name=X` |
| `GET /api/mango-schema/object-detail?module=X&object_name=Y` | `AnywhereAPI/Master/Addspec_Object_Read?module=X&object_name=Y` |
| `GET /api/mango-schema/object-table-detail?table=X` | `AnywhereAPI/Master/Addspec_Object_table_detail_Read?table_name=X` |

แต่ละ route:
1. เช็ค cache ก่อน (readCache)
2. ถ้า fresh → return ทันที
3. ถ้า miss/stale → fetch จาก Mango → writeCache → return
4. ถ้า Mango error + มี stale cache → return stale + header `X-Cache: stale`
5. ถ้า Mango error + ไม่มี cache → return `[]` + header `X-Cache: miss-error`

---

### Step 5 — server/api/mango-schema/sync.post.ts

`POST /api/mango-schema/sync`

1. `bustCache()` → ล้าง cache ทั้งหมด
2. Pre-fetch modules (cache warm-up)
3. Return `{ ok, clearedAt }`

---

### Step 6 — useErpData.ts (composable)
ไฟล์: `app/composables/sql-builder/useErpData.ts`

เปลี่ยน API calls ทั้งหมด:
- ลบ `$xt` dependency
- ใช้ `$fetch('/api/mango-schema/...')` แทน
- เพิ่ม `syncNow()` function → POST `/api/mango-schema/sync`
- อัปเดต `store.syncStatus` + `store.syncLastAt`

---

### Step 7 — sql-builder store
ไฟล์: `app/stores/sql-builder.ts`

เพิ่ม state:
```ts
const syncStatus = ref<'idle' | 'syncing' | 'ok' | 'stale' | 'error'>('idle')
const syncLastAt = ref<Date | null>(null)
```

---

### Step 8 — SqlBuilderLeftPanel.vue
ไฟล์: `app/components/sql-builder/layout/SqlBuilderLeftPanel.vue`

เพิ่ม sync status bar ใต้หัว "Database Tables":
```
[●] synced 2h ago                    [↻]
```
สี indicator:
- `ok` → green
- `stale` → amber (พร้อม tooltip "ข้อมูลจาก cache เก่า")
- `error` → red
- `syncing` → spinner

---

## Environment Variables (nuxt.config / .env)

```env
NUXT_MANGO_BASE=http://mango-server/service/
```

ถ้าไม่ set → fallback เป็น `http://localhost/service/` (เหมือนเดิม)

---

## ไฟล์ที่สร้าง/แก้ไข

```
server/
  utils/
    mangoCache.ts     ← NEW
    mangoFetch.ts     ← NEW
  api/
    mango-schema/
      modules.get.ts            ← NEW
      objects.get.ts            ← NEW
      table-columns.get.ts      ← NEW
      object-detail.get.ts      ← NEW
      object-table-detail.get.ts ← NEW
      sync.post.ts              ← NEW

app/
  composables/sql-builder/
    useErpData.ts     ← EDIT (switch endpoints)
  stores/
    sql-builder.ts    ← EDIT (add syncStatus)
  components/sql-builder/layout/
    SqlBuilderLeftPanel.vue  ← EDIT (sync status UI)

nuxt.config.ts        ← EDIT (mangoBase + nitro storage)
docs/
  sql-builder-mango-proxy.md  ← NEW (this file)
```
