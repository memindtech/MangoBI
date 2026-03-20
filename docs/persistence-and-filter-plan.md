# MangoBI — Persistence & Report Filter Plan

## Phase 1 · pinia-plugin-persistedstate (Frontend localStorage)

### ติดตั้ง
```bash
npm install pinia-plugin-persistedstate
```

### ตั้งค่า Nuxt plugin
```ts
// plugins/pinia-persist.client.ts
import { createPersistedState } from 'pinia-plugin-persistedstate'

export default defineNuxtPlugin(({ $pinia }) => {
  $pinia.use(createPersistedState({ storage: localStorage }))
})
```

### Store ที่ persist
| Store | persist paths | เหตุผล |
|---|---|---|
| `useReportStore` | `widgets` เท่านั้น | datasets มี row data → ใหญ่เกิน |
| `useDataModelStore` | `relations` เท่านั้น | rows มาจาก API ไม่ต้องเก็บ |
| `useCanvasStore` | `nodeConfigs`, `selectedNodeId` | layout ขนาดเล็ก |

---

## Phase 2 · SQL Server (Backend persist)

### Tables
```sql
-- Report: layout + widget config (ไม่มี row data)
CREATE TABLE MangoBIReport (
  Id            UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  Name          NVARCHAR(200)  NOT NULL,
  WidgetsJson   NVARCHAR(MAX),   -- JSON: ReportWidget[]
  DatasetsJson  NVARCHAR(MAX),   -- JSON: { id, name } เฉพาะ metadata
  CreatedBy     NVARCHAR(100),
  CreatedAt     DATETIME2 DEFAULT GETDATE(),
  UpdatedAt     DATETIME2
)

-- DataModel: node positions + relation config (ไม่มี row data)
CREATE TABLE MangoBIDataModel (
  Id             UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  Name           NVARCHAR(200)  NOT NULL,
  NodesJson      NVARCHAR(MAX),   -- JSON: Node[] (id, position, type)
  RelationsJson  NVARCHAR(MAX),   -- JSON: Record<string, ModelRelation>
  CreatedBy      NVARCHAR(100),
  CreatedAt      DATETIME2 DEFAULT GETDATE(),
  UpdatedAt      DATETIME2
)
```

### API Endpoints (ASP.NET Core)
```
POST   /api/MangoBI/Report/Save
GET    /api/MangoBI/Report/List
GET    /api/MangoBI/Report/{id}
DELETE /api/MangoBI/Report/{id}

POST   /api/MangoBI/DataModel/Save
GET    /api/MangoBI/DataModel/List
GET    /api/MangoBI/DataModel/{id}
```

---

## Phase 3 · Report Filter Feature

### Data Model

```typescript
// stores/report.ts — เพิ่มใน ReportWidget

export type FilterOperator =
  | 'eq' | 'neq'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'notContains'
  | 'blank' | 'notBlank'

export interface FilterCondition {
  id:       string           // nanoid
  column:   string
  operator: FilterOperator
  value:    string           // always string, cast at runtime
}

export interface FilterConfig {
  logic:      'and' | 'or'
  conditions: FilterCondition[]
}

// เพิ่มใน ReportWidget
export interface ReportWidget {
  // ... existing fields
  filters?: FilterConfig
}
```

### Filter Logic (apply at render time)
```typescript
function applyFilters(rows: DataRow[], filters?: FilterConfig): DataRow[] {
  if (!filters?.conditions.length) return rows
  return rows.filter(row =>
    filters.logic === 'and'
      ? filters.conditions.every(c => matchCondition(row, c))
      : filters.conditions.some(c => matchCondition(row, c))
  )
}

function matchCondition(row: DataRow, c: FilterCondition): boolean {
  const v = row[c.column]
  const cv = c.value
  switch (c.operator) {
    case 'eq':         return String(v) === cv
    case 'neq':        return String(v) !== cv
    case 'gt':         return Number(v) >  Number(cv)
    case 'gte':        return Number(v) >= Number(cv)
    case 'lt':         return Number(v) <  Number(cv)
    case 'lte':        return Number(v) <= Number(cv)
    case 'contains':   return String(v ?? '').toLowerCase().includes(cv.toLowerCase())
    case 'notContains':return !String(v ?? '').toLowerCase().includes(cv.toLowerCase())
    case 'blank':      return v === null || v === undefined || v === ''
    case 'notBlank':   return v !== null && v !== undefined && v !== ''
  }
}
```

### UI — Filter Panel (Right Sidebar ของ Report)

```
┌─────────────────────────────────┐
│  🔽 Filters  [AND / OR toggle]  │
│  ─────────────────────────────  │
│  [column ▼] [operator ▼] [val]  │ ← condition row
│  [column ▼] [operator ▼] [val]  │
│  + Add condition                │
└─────────────────────────────────┘
```

- เปิด Filter Panel เมื่อ select widget
- config บันทึกอัตโนมัติใน `widget.filters` (Pinia store)
- แสดง badge จำนวน active filter บน widget header

### Operator ตามประเภท column
| Column type | Operators ที่แสดง |
|---|---|
| `number` | eq, neq, gt, gte, lt, lte, blank, notBlank |
| `string` | eq, neq, contains, notContains, blank, notBlank |

---

## ลำดับการทำงาน

1. [ ] เพิ่ม `FilterConfig` + `FilterCondition` ใน `stores/report.ts`
2. [ ] เพิ่ม `applyFilters()` utility
3. [ ] แก้ `report.vue` — `filteredRows` computed ใช้ filter ก่อนส่งให้ widget
4. [ ] สร้าง `FilterPanel.vue` component (right sidebar)
5. [ ] เพิ่ม filter badge บน widget header
6. [ ] ทำ pinia-plugin-persistedstate
