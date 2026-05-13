# SQL Editor — Paid Feature Gate (Plan)

> สถานะ: **PLAN** — รออนุมัติ open questions ก่อนเริ่ม implement
> Draft: 2026-05-11
> Author: SQL Builder team

---

## 1. เป้าหมาย

แปลง **SQL Editor** (Navicat-like free-form SQL editor + reverse-parse + Run Preview) ให้เป็น **paid feature** ที่ต้องสมัครใช้ — ยกเว้น **MANGOCON** (developer/internal) ที่ใช้ได้ฟรีโดยอัตโนมัติ

---

## 2. Architecture (reuse AI Config pattern)

โครงเดิมจาก AI Config ใช้ได้ทั้งหมด — ทำซ้ำได้

```
DB (per-maincode row)
   ↓
Backend resolver (cache 30-60s)
   ↓
Server proxy /api/features (safe subset, no admin data)
   ↓
Client composable useFeatureFlags() (singleton state)
   ↓
UI gate: v-if + lock icon + UpgradeDialog
```

**Pattern อ้างอิงในโค้ดเดิม:**
- DB: `MangoBIAiConfig` table per-maincode
- Backend resolver: `server/utils/ai/config.ts` (cache 30s)
- Server proxy: `server/api/ai/config.get.ts`
- Client composable: `app/composables/useAiFeature.ts`
- UI gate: `v-if="aiEnabled"` ใน `SqlBuilderHeader.vue:1342`

---

## 3. Components to add

| Layer | ไฟล์ | หน้าที่ |
|------|------|---------|
| **DB Schema** | `MangoBIFeatureFlags` ตารางใหม่ | per-maincode subscription state |
| **Backend Model** | `Database/DataModels/Internal/MangoBIFeatureFlags.cs` | EF model |
| **Backend Controller** | `Controllers/MangoBIController.cs` — เพิ่ม `GetFeatureFlags`, `SaveFeatureFlags` | resolver + MANGOCON hardcode |
| **Migration** | `Infrastructure/Sql/MangoBI/MangoBI_CreateTables.sql` | idempotent CREATE + ALTER (เหมือน SourceSql) |
| **Frontend Server util** | `server/utils/features.ts` | cache + DB fetch pattern เหมือน `ai/config.ts` |
| **Frontend Server proxy** | `server/api/features.get.ts` | safe subset (no admin data) |
| **Frontend Composable** | `app/composables/useFeatureFlags.ts` | singleton, `{ sqlEditor }` computed reactive |
| **Upgrade UI** | `app/components/sql-builder/modals/UpgradeDialog.vue` | locked click → contact / pricing |
| **Admin Settings UI** | `app/pages/settings.vue` — section ใหม่ | MANGOCON-only — list maincode + toggle |

---

## 4. Database schema

### Option A — Generic key-value (รองรับ future features)

```sql
CREATE TABLE [dbo].[MangoBIFeatureFlags] (
    [Id]          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [maincode]    NVARCHAR(15)     NOT NULL,
    [FeatureKey]  NVARCHAR(50)     NOT NULL,   -- 'sql_editor', 'future_x', ...
    [Enabled]     BIT              NOT NULL DEFAULT 0,
    [ExpiresAt]   DATETIME         NULL,        -- NULL = ไม่หมดอายุ
    [GrantedAt]   DATETIME         NOT NULL DEFAULT GETDATE(),
    [GrantedBy]   NVARCHAR(100)    NULL,        -- empno ของคน MANGOCON ที่ grant
    [Note]        NVARCHAR(MAX)    NULL,        -- หมายเหตุ subscription
    CONSTRAINT [PK_MangoBIFeatureFlags] PRIMARY KEY ([Id]),
    CONSTRAINT [UQ_MangoBIFeatureFlags] UNIQUE ([maincode], [FeatureKey])
);
```

**ข้อดี:** ขยาย feature ใหม่ไม่ต้อง ALTER ตาราง — แค่ INSERT row
**ข้อเสีย:** Query เพื่อเช็คทุก feature ของ maincode ต้อง aggregate

### Option B — Wide column (ง่ายกว่า)

```sql
CREATE TABLE [dbo].[MangoBIFeatureFlags] (
    [maincode]          NVARCHAR(15) NOT NULL PRIMARY KEY,
    [SqlEditorEnabled]  BIT          NOT NULL DEFAULT 0,
    [SqlEditorExpiresAt] DATETIME    NULL,
    [UpdatedAt]         DATETIME     NULL,
    [UpdatedBy]         NVARCHAR(100) NULL
);
```

**ข้อดี:** Query 1 row = ครบทุก feature
**ข้อเสีย:** เพิ่ม feature ใหม่ต้อง ALTER ตาราง

**แนะนำ:** **Option A (generic)** — รองรับ future paid features (Report Builder export, AI premium tier, ฯลฯ) โดยไม่ต้องแก้ schema

---

## 5. Backend resolver

```csharp
public class FeatureFlags
{
    public bool SqlEditor { get; set; }
    // future: ReportExport, AiPremium, ...
}

public async Task<FeatureFlags> ResolveAsync(string maincode)
{
    // Hardcode: MANGOCON ใช้ทุก feature ฟรี (developer/internal)
    if (string.Equals(maincode, "MANGOCON", StringComparison.OrdinalIgnoreCase))
        return new FeatureFlags { SqlEditor = true };

    using var db = new DataContext();
    var rows = await db.MangoBIFeatureFlags
        .Where(r => r.maincode == maincode)
        .ToListAsync();

    var now = DateTime.Now;
    bool isActive(MangoBIFeatureFlags? r) =>
        r != null && r.Enabled && (r.ExpiresAt == null || r.ExpiresAt > now);

    return new FeatureFlags {
        SqlEditor = isActive(rows.FirstOrDefault(r => r.FeatureKey == "sql_editor")),
    };
}
```

**Endpoint:**
- `GET MangoBI/GetFeatureFlags` — auth required → ResolveAsync(session.maincode)
- `POST MangoBI/SaveFeatureFlags` — auth + MANGOCON-only check → upsert row

---

## 6. Frontend composable

```ts
// app/composables/useFeatureFlags.ts
interface FeatureFlags {
  sqlEditor: boolean
}

const _state    = ref<FeatureFlags | null>(null)
const _fetching = ref(false)

export function useFeatureFlags() {
  if (!_state.value && !_fetching.value && import.meta.client) {
    _fetching.value = true
    $fetch<FeatureFlags>('/api/features')
      .then(r => { _state.value = r })
      .catch(() => { _state.value = { sqlEditor: false } })
      .finally(() => { _fetching.value = false })
  }
  const sqlEditor = computed(() => _state.value?.sqlEditor ?? false)
  function refresh() { _state.value = null; _fetching.value = false }
  return { sqlEditor, refresh }
}
```

---

## 7. UI gating points

### 7.1 `SqlBuilderHeader.vue` — ปุ่ม "SQL Editor"

```vue
<button
  @click="onSqlEditorClick"
  :class="[...,
    sqlEditorEnabled
      ? 'border-border hover:bg-accent'
      : 'opacity-60 cursor-not-allowed'
  ]"
  :title="sqlEditorEnabled
    ? 'เขียน SQL เอง + autocomplete'
    : '🔒 ต้องสมัครใช้งาน — คลิกเพื่อดูรายละเอียด'"
>
  <FileCode2 v-if="sqlEditorEnabled" class="size-3.5" />
  <Lock v-else class="size-3.5" />
  <span class="hidden sm:inline">SQL Editor</span>
</button>

<script setup>
const { sqlEditor: sqlEditorEnabled } = useFeatureFlags()

function onSqlEditorClick() {
  if (sqlEditorEnabled.value) {
    store.showSqlEditor = true
  } else {
    store.showUpgradeDialog = 'sql_editor'   // trigger UpgradeDialog
  }
}
</script>
```

### 7.2 `SqlEditorModal.vue` — defensive guard

กัน bypass ผ่าน store/devtools:

```ts
function apply() {
  if (!sqlEditorEnabled.value) {
    errorMsg.value = 'Feature locked'
    return
  }
  // ... existing logic
}
function runPreview() {
  if (!sqlEditorEnabled.value) return
  // ... existing logic
}
```

### 7.3 `UpgradeDialog.vue` (ใหม่)

- Title: "🔒 SQL Editor — Premium Feature"
- Description: ประโยชน์ของ SQL Editor (Navicat-like, autocomplete, reverse-parse, run preview)
- Contact info / Pricing / "Request access" button
- (Optional) auto-fill email body: `subject=สนใจสมัคร SQL Editor — maincode=XXX`

### 7.4 Server-side defense (optional)

- `/api/mango-schema/addspec-tables` — **ไม่ gate** (ตาราง endpoint ใช้ทั่วไปได้)
- `MangoBI/ExecuteCustomSql` — **ไม่ gate** (DataModel page ก็เรียก)
- **กัน frontend bypass เป็นหลัก** — UI gate + composable guard ก็พอ

---

## 8. Admin Settings UI (MANGOCON-only)

ใน `pages/settings.vue` เพิ่ม section:

```
┌─ Customer Subscriptions ─────────────────────────────┐
│ [+ Grant access]                                     │
├──────────────────────────────────────────────────────┤
│ maincode    Feature      Enabled    Expires    Action│
│ MG1         sql_editor   ✓          2027-01-01 [Edit]│
│ MG2         sql_editor   ○          —          [Edit]│
│ ACME        sql_editor   ✓          ∞          [Edit]│
└──────────────────────────────────────────────────────┘
```

แสดงเฉพาะถ้า `authStore.user?.maincode === 'MANGOCON'`

**Form fields:**
- maincode (text input)
- feature key (select: `sql_editor` for now)
- enabled (toggle)
- expires_at (datetime, nullable)
- note (textarea)

---

## 9. Migration SQL (เพิ่มลง `MangoBI_CreateTables.sql`)

```sql
-- ---------------------------------------------------------------------------
--  MangoBIFeatureFlags — per-maincode paid feature subscriptions
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME = 'MangoBIFeatureFlags'
)
BEGIN
    CREATE TABLE [dbo].[MangoBIFeatureFlags] (
        [Id]         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [maincode]   NVARCHAR(15)     NOT NULL,
        [FeatureKey] NVARCHAR(50)     NOT NULL,
        [Enabled]    BIT              NOT NULL DEFAULT 0,
        [ExpiresAt]  DATETIME         NULL,
        [GrantedAt]  DATETIME         NOT NULL DEFAULT GETDATE(),
        [GrantedBy]  NVARCHAR(100)    NULL,
        [Note]       NVARCHAR(MAX)    NULL,
        CONSTRAINT [PK_MangoBIFeatureFlags] PRIMARY KEY ([Id]),
        CONSTRAINT [UQ_MangoBIFeatureFlags] UNIQUE ([maincode], [FeatureKey])
    );
    PRINT 'Created table MangoBIFeatureFlags';
END
ELSE
    PRINT 'Table MangoBIFeatureFlags already exists — skipped';
```

---

## 10. Implementation order

1. ✅ **Confirm scope** — ตอบ open questions (ดู §11)
2. **Backend DB + Model** — สร้าง table + EF DbSet + add ใน DataContext
3. **Backend Controller** — `GetFeatureFlags` + MANGOCON hardcode + `SaveFeatureFlags` (admin gate)
4. **Migration SQL** — idempotent CREATE
5. **Frontend server util** — `server/utils/features.ts` (cache 60s per maincode)
6. **Frontend server proxy** — `/api/features.get.ts`
7. **Frontend composable** — `useFeatureFlags()`
8. **Gate UI** — `SqlBuilderHeader.vue` button + `SqlEditorModal.vue` guard
9. **UpgradeDialog** — content + contact CTA
10. **Admin section** — `pages/settings.vue` (MANGOCON-only)
11. **Test matrix:**
    - MANGOCON → ปุ่มเปิด, ใช้ได้
    - Customer enabled=1 + ไม่หมดอายุ → ปุ่มเปิด
    - Customer enabled=1 + หมดอายุ → ปุ่ม locked
    - Customer enabled=0 → ปุ่ม locked
    - No row → ปุ่ม locked
    - Bypass attempt (set store.showSqlEditor = true ผ่าน devtools) → guard ใน apply/runPreview ปฏิเสธ

---

## 11. Open questions (รอ confirm ก่อนเริ่ม)

| # | คำถาม | ทำไมสำคัญ |
|---|------|----------|
| 1 | **Subscription model** — มี trial period? ราคา? บัญชี per-seat หรือ per-maincode? | ผลต่อ schema (`ExpiresAt`, `Plan`, `Seats`, `TrialUntil`) |
| 2 | **Generic vs Wide column** — Option A หรือ B ใน §4? | กระทบ migration + query — ตัดสินใจครั้งเดียวยาก revert |
| 3 | **MANGOCON มีใน DB จริงไหม?** ใครเข้าใช้ maincode='MANGOCON'? | ถ้ายังไม่มี → ต้องสร้าง dev company ก่อน หรือใช้ environment-based whitelist (ENV var) แทน |
| 4 | **Upgrade dialog content** — แสดงราคา? contact form? redirect ไป external? | กระทบ component scope + asset (icon, screenshot) |
| 5 | **Server-side gate** — เปิด `ExecuteCustomSql` ให้ทุกคนต่อไป หรือ gate ฝั่ง server ด้วย? | DataModel page ก็เรียก endpoint นี้ — gate = break DataModel; ไม่ gate = bypass ได้ผ่าน devtools |
| 6 | **Refund / downgrade flow** — ถ้า expire แล้ว canvas ที่สร้างไว้จาก SQL Editor ยังใช้ได้ไหม? | UX: ไม่ควรพังของเดิม — แค่ disable ปุ่มใหม่ก็พอ |

---

## 12. Out of scope (ตั้งใจไม่ทำใน phase นี้)

- Payment gateway integration (Stripe, Omise) — manual grant by MANGOCON ก่อน
- Usage metering / quota (e.g. max N queries/month)
- Multi-tier plans (Basic / Pro / Enterprise) — single toggle ก่อน
- Audit log (ใครใช้ SQL Editor เมื่อไหร่) — separate concern

---

## 13. Files reference

| Existing pattern | New equivalent |
|------------------|----------------|
| [server/utils/ai/config.ts](../server/utils/ai/config.ts) | `server/utils/features.ts` |
| [server/api/ai/config.get.ts](../server/api/ai/config.get.ts) | `server/api/features.get.ts` |
| [app/composables/useAiFeature.ts](../app/composables/useAiFeature.ts) | `app/composables/useFeatureFlags.ts` |
| `MangoBIAiConfig.cs` | `MangoBIFeatureFlags.cs` |
| AI section in `pages/settings.vue` | Subscriptions section in same page |
