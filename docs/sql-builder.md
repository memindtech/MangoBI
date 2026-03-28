# MangoBI — SQL Builder

Visual drag-and-drop query builder บน Vue Flow ที่ generate SQL แบบ CTE pipeline อัตโนมัติ

---

## Architecture Overview

```
sql-builder.vue (page)
├── SqlBuilderHeader.vue        ← toolbar, save/load cloud, templates
├── SqlBuilderLeftPanel.vue     ← ERP table browser + search
├── SqlBuilderCanvas.vue        ← VueFlow canvas wrapper
│   ├── SqlTableNode.vue        ← node: ตาราง ERP
│   ├── SqlToolNode.vue         ← node: operation (where/group/calc/sort/cte/union)
│   ├── CteFrameNode.vue        ← node: CTE Frame (กรอบ)
│   ├── SqlEdge.vue             ← edge: JOIN / เส้นเชื่อม
│   └── SqlBuilderSqlPanel.vue  ← Generated SQL output (resizable)
├── SqlBuilderRightPanel.vue    ← Tools palette
└── modals/
    ├── FilterModal.vue         ← filter ระดับ table node
    ├── RelationModal.vue       ← ตั้งค่า JOIN mapping
    ├── ToolConfigModal.vue     ← config tool node (where/group/calc/cte/union)
    └── GroupSelectModal.vue    ← เลือก column สำหรับ GROUP BY
```

---

## Node Types

### `sqlTable` — Table Node
แทนตาราง ERP 1 ตาราง

| data field | type | หมายเหตุ |
|---|---|---|
| `label` | string | ชื่อแสดงผล |
| `tableName` | string | ชื่อ table จริงในฐานข้อมูล |
| `module` | string | module ERP |
| `type` | string | ประเภท object (VIEW/TABLE) |
| `details` | ColumnInfo[] | columns ทั้งหมด (โหลดจาก API) |
| `visibleCols` | VisibleCol[] | columns ที่ SELECT (เลือกโดย user) |
| `filters` | FilterRow[] | WHERE filter ระดับ table |
| `columnsLoading` | boolean | loading state |
| `isHeaderNode` | boolean | ถ้าเป็น header row ของ ERP |

```ts
// VisibleCol
interface VisibleCol {
  name:   string
  type:   string
  remark: string
  isPk:   boolean
  alias:  string   // AS alias ใน SELECT
}
```

### `toolNode` — Operation Node
แทน SQL operation 1 ขั้น

| `data.nodeType` | SQL ที่ generate |
|---|---|
| `where` | `SELECT * FROM upstream WHERE ...` |
| `group` | `SELECT cols, AGG(...) FROM upstream GROUP BY ...` |
| `calc` | `SELECT *, (expr) AS alias FROM upstream` |
| `sort` | ไม่สร้าง CTE — เพิ่ม `ORDER BY` ใน final SELECT |
| `cte` | named CTE พร้อม SELECT cols + WHERE |
| `union` | `UNION / UNION ALL` จากหลาย upstream |

### `cteFrame` — CTE Frame Node
กรอบโปร่งใสครอบ `sqlTable` หลายตัว → สร้าง named CTE จาก JOIN ภายใน

| data field | type |
|---|---|
| `name` | string — ชื่อ CTE |
| `isOpen` | boolean — expand/collapse |
| `selectedCols` | string[] |
| `conditions` | FilterRow[] |
| `_expandedW/H` | number — เก็บ size ก่อน collapse |

Children ของ frame คำนวณด้วย **bounds check** (position overlap) ไม่ใช่ `parentNode`

---

## SQL Generation Algorithm

`useSqlGenerator.ts` → `generateSQL()`

```
1. แยก nodes เป็น 3 กลุ่ม: tableNodes, toolNodes, cteFrameNodes
2. ถ้าไม่มี toolNode และ cteFrame → buildDirectSQL (flat SELECT + JOIN)
3. ถ้ามี → buildCTESQL:
   a. topologicalSort (Kahn's algorithm) เรียงลำดับ node ตาม edge
   b. cteFrame nodes → แต่ละ frame สร้าง CTE 1 ตัว (JOIN ตาราง child ภายใน)
   c. sqlTable nodes ที่ไม่อยู่ใน frame → รวมเป็น _src CTE
   d. toolNodes (ตาม topo order) → แต่ละตัวสร้าง CTE 1 ตัว
      - sort node → เก็บ ORDER BY ไว้ใช้ท้ายสุด (ไม่สร้าง CTE)
   e. assemble: WITH cte1 AS (...), cte2 AS (...) SELECT * FROM <lastCTE> [ORDER BY ...]
```

### CTE naming

| กรณี | ชื่อ CTE |
|---|---|
| cteFrame มี `name` | ใช้ชื่อนั้น (sanitize) |
| toolNode type=cte/union มี `name` | ใช้ชื่อนั้น |
| อื่น ๆ | `_cte1`, `_cte2`, ... |
| standalone tables | `_src` |

---

## Composables

| file | หน้าที่ |
|---|---|
| `useSqlGenerator.ts` | generate SQL จาก store state |
| `useDragDrop.ts` | จัดการ drop table จาก left panel ลง canvas |
| `useFlowEvents.ts` | handle VueFlow events (click, connect, selection) |
| `useHistory.ts` | undo/redo (max 50 snapshots) |
| `useErpData.ts` | โหลด modules/objects/columns จาก ERP API |
| `useToolNodes.ts` | สร้าง tool node ใหม่ |
| `useKeyboardShortcuts.ts` | Ctrl+Z/Y/C/V shortcuts |
| `useJsonGenerator.ts` | export canvas เป็น JSON file |

> **หมายเหตุ:** composables อยู่ใน `~/composables/sql-builder/` → Nuxt **ไม่** auto-import
> ต้อง import ตรงในทุกไฟล์ที่ใช้

---

## Store (`stores/sql-builder.ts`)

### State หลัก
| state | type | หมายเหตุ |
|---|---|---|
| `nodes` | `Node[]` | VueFlow nodes ทั้งหมด |
| `edges` | `Edge[]` | VueFlow edges ทั้งหมด |
| `generatedSQL` | string | SQL ที่ generate ล่าสุด |
| `sqlPanelOpen` | boolean | เปิด/ปิด SQL panel ด้านล่าง |
| `modalNodeId` | string\|null | node ที่เปิด config modal |
| `filterNodeId` | string\|null | node ที่เปิด filter modal |
| `relationEdgeId` | string\|null | edge ที่เปิด relation modal |
| `columnCache` | `Record<string, ColumnInfo[]>` | cache columns ของแต่ละ table |

### LocalStorage
| key | เนื้อหา |
|---|---|
| `STORAGE_KEY` | canvas state (nodes + edges) |
| `TEMPLATES_KEY` | saved templates |

---

## API Endpoints

Route prefix: `api/v1/Planning/MangoBI/`

| Method | Endpoint | หมายเหตุ |
|---|---|---|
| GET | `GetSQLBuilders` | list ทั้งหมดของ maincode |
| GET | `GetSQLBuilder?id=` | โหลด 1 รายการ |
| POST | `SaveSQLBuilder` | save/update |
| POST | `DeleteSQLBuilder?id=` | ลบ |

### SaveSQLBuilder request body
```json
{
  "id": "guid (optional — omit for insert)",
  "name": "ชื่อ",
  "nodesJson": "[...VueFlow nodes]",
  "edgesJson":  "[...VueFlow edges]",
  "sqlText":    "WITH _src AS (...) SELECT * FROM _src"
}
```

---

## Database

```sql
CREATE TABLE [dbo].[MangoBISQLBuilder] (
    [Id]        UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWID(),
    [Name]      NVARCHAR(200)     NULL,
    [NodesJson] NVARCHAR(MAX)     NULL,   -- JSON: VueFlow Node[]
    [EdgesJson] NVARCHAR(MAX)     NULL,   -- JSON: VueFlow Edge[]
    [SqlText]   NVARCHAR(MAX)     NULL,   -- generated SQL
    [CreatedBy] NVARCHAR(100)     NULL,
    [CreatedAt] DATETIME          NOT NULL DEFAULT GETDATE(),
    [UpdatedAt] DATETIME          NULL,
    [maincode]  NVARCHAR(15)      NULL,
    CONSTRAINT [PK_MangoBISQLBuilder] PRIMARY KEY ([Id])
);
```

Entity: `MicroBackend/Database/DataModels/Internal/MangoBISQLBuilder.cs`

---

## VueFlow Notes

### CSS Import (สำคัญมาก)
ต้อง import ใน `SqlBuilderCanvas.vue` ก่อนเสมอ:
```ts
import '@vue-flow/core/dist/style.css'
import '@vue-flow/controls/dist/style.css'
```
ถ้าขาด → handle positions ผิด (ไปกองที่ top-left ทั้งหมด)

### First-load fix
```ts
// ล่าช้า mount VueFlow จนกว่า SidebarProvider animation (200ms) จบ
const flowReady = ref(false)
onMounted(() => {
  const ro = new ResizeObserver(() => {
    clearTimeout(timer)
    timer = setTimeout(() => { flowReady.value = true; ro.disconnect() }, 150)
  })
  ro.observe(containerEl)
})
```

### Handle re-measurement
แต่ละ node component ต้องเรียก:
```ts
const { updateNodeInternals } = useVueFlow()
onMounted(() => nextTick(() => updateNodeInternals([props.id])))
```

### Drop position
ใช้ `screenToFlowCoordinate` เท่านั้น — อย่าใช้ `getBoundingClientRect` โดยตรง:
```ts
const { x, y } = screenToFlowCoordinate({ x: e.clientX - 110, y: e.clientY - 40 })
```

---

## JOIN Types

| value | SQL |
|---|---|
| `LEFT JOIN` (default) | `LEFT JOIN tbl ON ...` |
| `INNER JOIN` | `INNER JOIN tbl ON ...` |
| `RIGHT JOIN` | `RIGHT JOIN tbl ON ...` |
| `FULL OUTER JOIN` | `FULL OUTER JOIN tbl ON ...` |
| `CROSS JOIN` | `CROSS JOIN tbl` |

ตั้งค่าผ่าน `RelationModal.vue` เมื่อ click เส้นเชื่อม

---

## Filter Operators

| operator | SQL |
|---|---|
| `=`, `<>`, `>`, `>=`, `<`, `<=` | ตรงตัว |
| `LIKE` | `col LIKE N'value'` |
| `IN` | `col IN (val1, val2)` |
| `IS NULL` | `col IS NULL` |
| `IS NOT NULL` | `col IS NOT NULL` |

---

## Keyboard Shortcuts

| shortcut | action |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+C` | Copy selected nodes |
| `Ctrl+V` | Paste |
| `Delete` | ลบ node/edge ที่ selected |
