# MangoBI — SQL Builder

Visual drag-and-drop query builder บน Vue Flow ที่แปลง diagram เป็น SQL แบบ **CTE pipeline** อัตโนมัติ

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Directory Structure](#2-directory-structure)
3. [Data Types & Interfaces](#3-data-types--interfaces)
4. [Node Types](#4-node-types)
5. [Edge Types](#5-edge-types)
6. [SQL Generation Pipeline](#6-sql-generation-pipeline)
7. [Store (State Management)](#7-store-state-management)
8. [Composables](#8-composables)
9. [Components](#9-components)
10. [Backend API Routes](#10-backend-api-routes)
11. [Cloud Persistence API](#11-cloud-persistence-api)
12. [Database Schema](#12-database-schema)
13. [ERP Data Loading](#13-erp-data-loading)
14. [Keyboard Shortcuts](#14-keyboard-shortcuts)
15. [Vue Flow Notes](#15-vue-flow-notes)
16. [Error Handling & Edge Cases](#16-error-handling--edge-cases)
17. [Performance Optimizations](#17-performance-optimizations)
18. [AI Integration](#18-ai-integration)

---

## 1. Architecture Overview

```
Browser (Vue 3 + Vue Flow)
    ↕  same-origin only
MangoBI Nuxt Server (proxy layer)
    ↕  firewall-controlled
Mango ERP API  (schema metadata)
    ↕
MangoBI DB  (saved builders)
```

### Component Tree

```
sql-builder.vue  (page)
├── SqlBuilderHeader.vue          ← toolbar: save/load/sync/finish/undo/redo
├── SqlBuilderLeftPanel.vue       ← ERP table browser: modules → objects → drag
├── SqlBuilderCanvas.vue          ← VueFlow canvas wrapper
│   ├── SqlTableNode.vue          ← node: ตาราง ERP พร้อม column selector
│   ├── SqlToolNode.vue           ← node: operation (where/group/calc/sort/cte/union)
│   ├── CteFrameNode.vue          ← node: resizable CTE frame กรอบครอบตาราง
│   ├── SqlEdge.vue               ← edge: JOIN / tool connection
│   └── SqlBuilderSqlPanel.vue    ← Generated SQL output (resizable bottom panel)
├── SqlBuilderRightPanel.vue      ← Tool nodes palette + Layers panel toggle
├── SqlBuilderLayersPanel.vue     ← Tree view ของ nodes ทั้งหมด
└── modals/
    ├── FilterModal.vue           ← WHERE filter ระดับ table node
    ├── RelationModal.vue         ← ตั้งค่า JOIN type + column mappings
    ├── ToolConfigModal.vue       ← config tool node ทุกประเภท
    ├── GroupSelectModal.vue      ← เลือก related tables หลัง drag-drop
    └── FinishModal.vue           ← save/share builder ไปยัง cloud
```

---

## 2. Directory Structure

```
app/
├── pages/
│   └── sql-builder.vue                         ← entry page
├── components/
│   └── sql-builder/
│       ├── layout/
│       │   ├── SqlBuilderCanvas.vue
│       │   ├── SqlBuilderHeader.vue
│       │   ├── SqlBuilderLeftPanel.vue
│       │   ├── SqlBuilderRightPanel.vue
│       │   ├── SqlBuilderSqlPanel.vue
│       │   └── SqlBuilderLayersPanel.vue
│       ├── nodes/
│       │   ├── SqlTableNode.vue
│       │   ├── SqlToolNode.vue
│       │   ├── CteFrameNode.vue
│       │   └── SqlEdge.vue
│       └── modals/
│           ├── FilterModal.vue
│           ├── RelationModal.vue
│           ├── ToolConfigModal.vue
│           ├── GroupSelectModal.vue
│           └── FinishModal.vue
├── composables/
│   └── sql-builder/                            ← ไม่ auto-import, ต้อง import เอง
│       ├── useSqlGenerator.ts                  ← SQL generation engine
│       ├── useDragDrop.ts                      ← drag-drop + onRead flow
│       ├── useFlowEvents.ts                    ← VueFlow event handlers
│       ├── useHistory.ts                       ← undo/redo
│       ├── useErpData.ts                       ← ERP metadata loading
│       ├── useToolNodes.ts                     ← tool node helpers
│       ├── useKeyboardShortcuts.ts             ← Ctrl+Z/Y/C/V
│       ├── useJsonGenerator.ts                 ← JSON export
│       ├── useAiContext.ts                     ← AI system prompt builder
│       └── useAiActions.ts                     ← AI action executor
├── stores/
│   └── sql-builder.ts                          ← Pinia store
├── types/
│   └── sql-builder.ts                          ← TypeScript interfaces
server/
└── api/
    └── mango-schema/
        ├── modules.get.ts                      ← GET /api/mango-schema/modules
        ├── objects.get.ts                      ← GET /api/mango-schema/objects
        ├── table-columns.get.ts                ← GET /api/mango-schema/table-columns
        ├── object-table-detail.get.ts          ← GET /api/mango-schema/object-table-detail
        ├── object-detail.get.ts                ← GET /api/mango-schema/object-detail
        └── sync.post.ts                        ← POST /api/mango-schema/sync
docs/
└── sql-builder-mango-proxy.md                  ← รายละเอียด proxy + cache strategy
```

---

## 3. Data Types & Interfaces

ทุก type อยู่ใน `app/types/sql-builder.ts`

### ColumnInfo — column metadata จาก DB

```typescript
interface ColumnInfo {
  column_name: string
  column_type: string          // แสดงผล (VARCHAR, INT, ...)
  data_type:   string          // ชนิดข้อมูลจริง
  data_pk:     'Y' | 'N'      // Primary key flag
  remark:      string          // คำอธิบาย (จาก ADDSPEC หรือ COLUMN_COMMENT)
}
```

### VisibleCol — column ที่ user เลือก SELECT

```typescript
interface VisibleCol {
  name:               string
  type:               string
  remark:             string
  isPk:               boolean
  alias:              string          // AS alias ใน SELECT (ว่าง = ใช้ชื่อจริง)
  sourceTable?:       string
  sourceTableLabel?:  string
}
```

### WhereCondition / FilterCondition

```typescript
interface WhereCondition {
  _id:       number
  column:    string
  operator:  string           // =, <>, >, >=, <, <=, LIKE, IN, IS NULL, IS NOT NULL
  value:     string
  valueType: 'literal' | 'column'
}

interface FilterCondition {
  id:       string
  column:   string
  operator: FilterOperator    // eq|neq|gt|gte|lt|lte|contains|notContains|blank|notBlank|in|notIn
  value:    string
  values?:  string[]
}
```

### EdgeMapping — JOIN column pair

```typescript
interface EdgeMapping {
  _id:      number
  source:   string            // column ฝั่ง source node
  target:   string            // column ฝั่ง target node
  operator: string            // โดยทั่วไปคือ =
}
```

### CalcItem — รายการคำนวณใน CALC node

```typescript
interface CalcItem {
  col:   string               // column ต้นทาง
  op:    string               // operator (+, -, *, /, CONCAT, ...)
  value: string               // ค่าขวา (หรือ column ที่ 2)
  alias: string               // ชื่อ output column
}
```

### AggItem — aggregation ใน GROUP node

```typescript
interface AggItem {
  col:   string
  func:  'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX' | 'COUNT DISTINCT'
  alias: string
}
```

---

## 4. Node Types

### `sqlTable` — Table Node

แทนตาราง ERP 1 ตาราง ลากมาจาก Left Panel

| data field        | type           | หมายเหตุ                               |
|-------------------|----------------|----------------------------------------|
| `label`           | string         | ชื่อแสดงผลบน canvas                    |
| `tableName`       | string         | ชื่อ table จริงในฐานข้อมูล             |
| `objectName`      | string?        | ชื่อ ERP object (เช่น PO, SO)          |
| `module`          | string         | ERP module (เช่น Logistics)            |
| `type`            | string         | ประเภท: T, V, FN, R, SP               |
| `useType`         | string?        | H (Header), D (Detail), M (Master)    |
| `details`         | ColumnInfo[]   | columns ทั้งหมดจาก DB schema           |
| `visibleCols`     | VisibleCol[]   | columns ที่ SELECT (เลือกโดย user)     |
| `filters`         | WhereCondition[] | WHERE filter ระดับ node เอง          |
| `isHeaderNode`    | boolean        | กำหนดให้เป็น primary table ของกลุ่ม   |
| `columnsLoading`  | boolean        | กำลังโหลด columns                     |
| `_objectMeta`     | any?           | raw metadata จาก ERP                  |

**Object type colors:**
| type | badge style |
|------|-------------|
| T (Transaction) | blue |
| V (View)        | purple |
| FN (Function)   | teal |
| R (Report)      | orange |
| SP (Stored Proc)| rose |

**Column type badges** (regex-based):
- `NUM` — int, float, decimal, numeric, money, ...
- `DATE` — date, datetime, timestamp
- `TXT` — char, varchar, nvarchar, text, ...
- `BIT` — bit, boolean
- `BIN` — binary, blob, image

---

### `toolNode` — Operation Node

แทน SQL operation 1 ขั้น เชื่อมต่อด้วย tool edge

| `data._toolId` | SQL ที่ generate                                    | สี     |
|----------------|-----------------------------------------------------|--------|
| `where`        | `SELECT * FROM upstream WHERE …`                   | rose   |
| `group`        | `SELECT cols, AGG() … GROUP BY … HAVING …`          | orange |
| `calc`         | `SELECT *, (expr) AS alias …`                       | teal   |
| `sort`         | ไม่สร้าง CTE — เพิ่ม `ORDER BY` ใน final SELECT    | green  |
| `cte`          | named CTE พร้อม optional WHERE + column selection  | violet |
| `union`        | `UNION / UNION ALL` จากหลาย upstream               | yellow |

**ToolNodeData variants:**

```typescript
// WHERE
interface WhereNodeData {
  nodeType: 'where'; _toolId: 'where'
  conditions: WhereCondition[]
}

// GROUP BY
interface GroupNodeData {
  nodeType: 'group'; _toolId: 'group'
  groupCols: string[]
  aggs:      AggItem[]
  filters:   WhereCondition[]   // HAVING conditions
}

// CALC
interface CalcNodeData {
  nodeType: 'calc'; _toolId: 'calc'
  items:   CalcItem[]
  filters: WhereCondition[]
}

// ORDER BY
interface SortNodeData {
  nodeType: 'sort'; _toolId: 'sort'
  items: Array<{ col: string; dir: 'ASC' | 'DESC' }>
}

// CTE
interface CteNodeData {
  nodeType: 'cte'; _toolId: 'cte'
  name:         string
  selectedCols: string[]
  conditions:   WhereCondition[]
}

// UNION
interface UnionNodeData {
  nodeType: 'union'; _toolId: 'union'
  name:             string
  unionType:        'UNION' | 'UNION ALL'
  selectedCols:     string[]                        // legacy fallback
  selectedColsMap:  Record<string, string[]>        // per-source column selection
  conditions:       WhereCondition[]
}
```

---

### `cteFrame` — CTE Frame Node

กรอบโปร่งใสครอบ `sqlTable` หลายตัว → สร้าง named CTE จาก JOIN ภายใน

| data field     | type      | หมายเหตุ                                  |
|----------------|-----------|-------------------------------------------|
| `name`         | string    | ชื่อ CTE                                  |
| `isOpen`       | boolean   | ขยาย/ย่อ frame                            |
| `selectedCols` | string[]  | columns ที่ SELECT (ว่าง = SELECT *)      |
| `conditions`   | WhereCondition[] | WHERE filter                       |
| `_expandedW`   | number    | ความกว้างก่อน collapse (restore on expand)|
| `_expandedH`   | number    | ความสูงก่อน collapse                      |

> **หมายเหตุ:** children ของ frame คำนวณด้วย **spatial bounds check** (ตรวจว่า node center อยู่ภายใน frame rectangle) — ไม่ใช้ `parentNode` ของ Vue Flow เพื่อให้ drag ได้อิสระ

---

## 5. Edge Types

### JOIN Edge (table → table)

```typescript
edge.data = {
  joinType:  'LEFT JOIN' | 'INNER JOIN' | 'RIGHT JOIN' | 'FULL OUTER JOIN' | 'CROSS JOIN'
  mappings:  EdgeMapping[]     // column pairs สำหรับ ON clause
  isTool:    false
}
```

| `joinType`        | SQL          | สี badge    |
|-------------------|--------------|-------------|
| `LEFT JOIN`       | default      | sky         |
| `INNER JOIN`      | INNER JOIN   | emerald     |
| `RIGHT JOIN`      | RIGHT JOIN   | violet      |
| `FULL OUTER JOIN` | FULL OUTER JOIN | orange  |
| `CROSS JOIN`      | CROSS JOIN (ไม่มี ON) | rose |

### Tool Edge (node → toolNode)

```typescript
edge.data = {
  joinType:  'LEFT JOIN'      // เสมอ (ไม่มีผลต่อ SQL)
  mappings:  []
  isTool:    true
  tgtToolId: ToolId           // ประเภท tool ปลายทาง
  srcCat:    'table' | 'cte' | 'other'
}
```

---

## 6. SQL Generation Pipeline

`useSqlGenerator.ts → generateSQL()`

### ขั้นตอน

```
1. แยก nodes เป็น 3 กลุ่ม
   ├── tableNodes    (type === 'sqlTable')
   ├── toolNodes     (type === 'toolNode')
   └── cteFrames     (type === 'cteFrame')

2. ถ้าไม่มี toolNode และ cteFrame
   └── buildDirectSQL()  →  flat SELECT...FROM...JOIN

3. ถ้ามี → buildCTESQL()
   a. topologicalSort()  →  เรียงลำดับ node ตาม edge direction (Kahn's algorithm)
   b. cteFrame nodes
      └── แต่ละ frame → buildCteFrameBlock() → CTE 1 ตัว (JOIN ตาราง child ภายใน frame)
   c. sqlTable nodes ที่ไม่อยู่ใน frame
      └── BFS จับกลุ่ม connected components → buildJoinBlock() → _src CTE
   d. toolNodes (ตาม topo order)
      ├── where  → buildWhereBlock()
      ├── group  → buildGroupBlock()   + store _resolvedGroupCols
      ├── calc   → buildCalcBlock()
      ├── union  → buildUnionBlock()
      ├── cte    → buildCteBlock()
      └── sort   → เก็บ ORDER BY ไว้ใช้ท้ายสุด (ไม่สร้าง CTE)
   e. assemble
      └── WITH cte1 AS (...), ... SELECT * FROM <lastCTE> [ORDER BY ...]
```

### CTE Naming

| กรณี                          | ชื่อ CTE ที่ได้         |
|-------------------------------|-------------------------|
| cteFrame มี `name`            | sanitize(name)          |
| tool type=cte มี `name`       | sanitize(name)          |
| tool type=union มี `name`     | sanitize(name)          |
| กลุ่ม table ปกติ              | `_src`                  |
| tool ที่เหลือ                  | `_cte1`, `_cte2`, ...   |
| ชื่อซ้ำ                        | `name_2`, `name_3`, ... |

### Column Aliasing (Collision Detection)

เมื่อ JOIN หลายตาราง อาจมีชื่อ column ซ้ำ:

```
1. ถ้า user ตั้ง col.alias → ใช้ alias นั้น
2. ถ้าชื่อซ้ำ (case-insensitive) กับ column ก่อนหน้า
   → prefix ด้วย table alias: tbl_colname
   → ถ้าซ้ำอีก: tbl_colname_2, tbl_colname_3, ...
3. ถ้าไม่ซ้ำ → ใช้ชื่อจริง
```

### Primary Table Selection (ต่อ connected component)

```
1. หา node ที่ isHeaderNode === true (ระบุ H manually)
2. ถ้าไม่มี → หา node ที่ไม่มี incoming edge (root ของ DAG)
3. Fallback → node แรกในลิสต์
```

### UNION Column Intersection

```
1. ถ้ามี selectedColsMap[sourceId] → ใช้ per-source selection
2. ถ้าไม่มี → ใช้ global selectedCols (legacy)
3. ถ้าทั้งคู่ว่าง → หา common columns ที่มีในทุก upstream CTE
```

### ตัวอย่าง SQL ที่ Generate ได้

```sql
WITH _src AS (
  SELECT
    po.doc_no,
    po.doc_date,
    pod.item_code,
    pod.qty,
    pod.unit_price
  FROM PO_H po
  LEFT JOIN PO_D pod ON po.doc_no = pod.doc_no
  WHERE po.status = 'A'
),
_cte1 AS (
  SELECT *
  FROM _src
  WHERE doc_date >= '2024-01-01'
),
_cte2 AS (
  SELECT item_code, SUM(qty) AS total_qty, SUM(qty * unit_price) AS total_amount
  FROM _cte1
  GROUP BY item_code
  HAVING SUM(qty) > 0
)
SELECT * FROM _cte2
ORDER BY total_amount DESC
```

---

## 7. Store (State Management)

`app/stores/sql-builder.ts` — Pinia store

### State หลัก

| state                    | type                          | หมายเหตุ                                         |
|--------------------------|-------------------------------|--------------------------------------------------|
| `nodes`                  | `Node[]`                      | VueFlow nodes ทั้งหมด                            |
| `edges`                  | `Edge[]`                      | VueFlow edges ทั้งหมด                            |
| `generatedSQL`           | string                        | SQL ล่าสุดที่ generate                           |
| `sqlPanelOpen`           | boolean                       | เปิด/ปิด SQL panel ด้านล่าง                      |
| `lastGenerationWarnings` | string[]                      | คำเตือนจากการ generate ล่าสุด                    |
| `selectedNodeId`         | string \| null                | node ที่ selected                                |
| `selectedNodeIds`        | string[]                      | multi-select                                     |
| `modalNodeId`            | string \| null                | node ที่เปิด tool config modal                   |
| `filterNodeId`           | string \| null                | node ที่เปิด filter modal                        |
| `relationEdgeId`         | string \| null                | edge ที่เปิด relation modal                      |
| `activeEdgeId`           | string \| null                | edge ที่ selected ขณะนั้น                        |
| `modules`                | string[]                      | ERP modules ที่โหลดมา                            |
| `objects`                | `Record<string, any[]>`       | objects ต่อ module                               |
| `expandedMods`           | `Set<string>`                 | modules ที่ expand ใน left panel                 |
| `loadingMods`            | boolean                       | loading modules                                  |
| `loadingObjs`            | `Record<string, boolean>`     | loading per module                               |
| `searchLoading`          | boolean                       | loading all objects สำหรับ search               |
| `search`                 | string                        | search query ใน left panel                       |
| `syncStatus`             | `'idle'\|'syncing'\|'ok'\|'stale'\|'error'` | สถานะ ERP sync       |
| `syncLastAt`             | Date \| null                  | เวลา sync ล่าสุด                                 |
| `columnCache`            | `Record<string, ColumnInfo[]>`| columns cache ต่อ table (memoize)               |
| `history`                | `HistorySnapshot[]`           | undo/redo stack (max 50)                         |
| `historyIndex`           | number                        | pointer ปัจจุบันใน history                      |
| `clipboard`              | object                        | copy-paste buffer                                |

### Computed หลัก

| computed                 | คืนค่า                                             |
|--------------------------|----------------------------------------------------|
| `tableNodes`             | `nodes.filter(n => n.type === 'sqlTable')`         |
| `toolNodes`              | `nodes.filter(n => n.type === 'toolNode')`         |
| `modalNodeUpstreamCols`  | columns ทั้งหมดที่ modal node ปัจจุบันเห็นได้ (traverses upstream edges, รวม GROUP BY output) |

### Key Actions

```typescript
addNode(node)                       // เพิ่ม node
removeNode(id)                      // ลบ node + edges ที่เชื่อม
updateNodeData(id, patch)           // อัปเดต data บางส่วน
setJoinType(edgeId, type)           // เปลี่ยน JOIN type
updateEdgeData(id, patch)           // อัปเดต edge data
cacheColumns(tableName, cols)       // บันทึก cache
getCachedColumns(tableName)         // อ่าน cache
saveToStorage()                     // บันทึก canvas → localStorage
loadFromStorage()                   // โหลด canvas จาก localStorage
```

### LocalStorage Keys

| key                          | เนื้อหา                                            |
|------------------------------|----------------------------------------------------|
| `mangobi_sql_builder_v1`     | `{ nodes, edges, viewport }` — canvas state       |
| `mangobi_sql_templates_v1`   | `Array<{ id, name, nodes, edges, createdAt }>`     |

---

## 8. Composables

> **สำคัญ:** composables อยู่ใน `~/composables/sql-builder/` → Nuxt **ไม่** auto-import  
> ต้องใช้ explicit import ในทุกไฟล์ที่ต้องการ

---

### `useSqlGenerator.ts` — SQL Generation Engine

**หน้าที่:** แปลง canvas state → SQL string

**ฟังก์ชันหลัก:**

| ฟังก์ชัน | หน้าที่ |
|----------|---------|
| `generateSQL()` | entry point รัน full pipeline + อัปเดต `store.generatedSQL` |
| `topologicalSort(nodes, edges)` | Kahn's algorithm เรียงลำดับ node |
| `buildDirectSQL(tableNodes, edges)` | กรณีไม่มี tool/frame: flat SELECT JOIN |
| `buildCTESQL(tableNodes, toolNodes, frameNodes, edges)` | กรณีมี tool/frame: CTE pipeline |
| `buildJoinBlock(tableNodes, edges)` | สร้าง SELECT…FROM…JOIN…WHERE สำหรับกลุ่ม table |
| `buildCteFrameBlock(frame, childTables, edges)` | JOIN สำหรับตารางภายใน CTE frame |
| `buildWhereBlock(node, upstreamName)` | WHERE tool |
| `buildGroupBlock(node, upstreamName, inputCols)` | GROUP BY + HAVING tool |
| `buildCalcBlock(node, upstreamName, inputCols)` | CALC tool |
| `buildSortBlock(node)` | เก็บ ORDER BY clause (ไม่ return CTE) |
| `buildCteBlock(node, upstreamName)` | named CTE tool |
| `buildUnionBlock(node, upstreamPairs, cteOutputCols)` | UNION tool |

---

### `useErpData.ts` — ERP Metadata Loading

**หน้าที่:** โหลด module/object/column metadata จาก Mango ERP ผ่าน Nuxt proxy

**ฟังก์ชัน:**

| ฟังก์ชัน | Route | Cache |
|----------|-------|-------|
| `loadModules()` | `GET /api/mango-schema/modules` | 24h |
| `toggleModule(mod)` | `GET /api/mango-schema/objects` | 24h per module |
| `loadAllObjects()` | parallel fetch ทุก module | 24h per module |
| `loadTableColumns(tableName)` | `GET /api/mango-schema/table-columns` | 1h per table |
| `loadObjectTableDetail(tableName)` | `GET /api/mango-schema/object-table-detail` | 1h |
| `loadTableColumnsEnriched(tableName)` | merge DB columns + ADDSPEC remarks | — |
| `loadObjectDetail(objectName, module)` | `GET /api/mango-schema/object-detail` | — |
| `syncNow()` | `POST /api/mango-schema/sync` | cache bust |

**Helper ที่ export ออกไปใช้ภายนอก:**

```typescript
filteredModules     // computed — กรองตาม search query
filteredObjects(mod) // กรอง objects type=T + search
objDisplayName(obj)  // แสดงชื่อที่อ่านง่าย (จาก remark หรือ object_name)
objectTypeColor(type) // badge color ตาม object type
```

---

### `useDragDrop.ts` — Drag-Drop & onRead Flow

**หน้าที่:** รับ drag event จาก left panel → สร้าง node + โหลด metadata

**onRead Flow:**

```
1. onDrop(event)
   └── สร้าง placeholder node ทันที (pending state)

2. onReadObject(primaryId, obj)
   ├── Step 1: fetch object header + object_table list
   ├── Step 2: resolvePrimaryTable() → หา table หลัก
   ├── Step 3: อัปเดต primary node ด้วย real metadata
   ├── Step 4: loadColumnsForNode() → โหลด columns
   ├── Step 5: สร้าง relations list
   └── Step 6: เปิด GroupSelectModal (ถ้ามี related tables)

3. createGroupFromSelection(selected)
   ├── สร้าง related table nodes (grid layout: 3 cols)
   ├── สร้าง JOIN edges พร้อม auto-detect column mappings
   └── loadColumnsForNode() สำหรับแต่ละ related node
```

**Grid Layout Algorithm:**
```
col 0 (x=base+0)   col 1 (x=base+260)  col 2 (x=base+520)
     row 0 (y=0)        row 0               row 0
     row 1 (y=200)      row 1               ...
```

---

### `useFlowEvents.ts` — Canvas Event Handlers

**ฟังก์ชัน:**

| ฟังก์ชัน | trigger | action |
|----------|---------|--------|
| `onConnect(conn)` | user ลากเส้น | validate, สร้าง edge (table หรือ tool), auto-populate mappings |
| `onEdgeClick(event)` | click เส้น | เปิด RelationModal (สำหรับ JOIN edges) |
| `onNodeClick(event)` | click node | select node |
| `onNodeDblClick(event)` | double-click | เปิด FilterModal (table) หรือ ToolConfigModal (tool) |
| `onSelectionChange({nodes})` | selection เปลี่ยน | อัปเดต `selectedNodeIds` |
| `removeNode(id)` | Delete key / ปุ่มลบ | ลบ node + edges |
| `setJoinType(type)` | UI | เปลี่ยน JOIN type ของ active edge |
| `sendToDataModel()` | ปุ่ม Finish | navigate ไปหน้า datamodel พร้อม generated SQL |

---

### `useHistory.ts` — Undo/Redo

**Algorithm:** Snapshot-based (deep copy), max 50 snapshots

```typescript
initHistory()      // บันทึก snapshot แรก
recordHistory()    // debounced 300ms — บันทึก snapshot ใหม่
undo()             // historyIndex-- → restore snapshot
redo()             // historyIndex++ → restore snapshot
```

**หมายเหตุ:** ถ้า undo แล้วทำการเปลี่ยนแปลงใหม่ → history ที่อยู่หลัง index จะถูก discard

---

### `useKeyboardShortcuts.ts`

ดูหัวข้อ [Keyboard Shortcuts](#14-keyboard-shortcuts)

---

### `useToolNodes.ts` — Tool Node Helpers

**หน้าที่:** provide ฟังก์ชัน CRUD สำหรับ tool node config modals

```typescript
// GROUP BY
addGroupCol()                     setGroupCol(i, col)             removeGroupCol(i)
addAgg()                          setAgg(i, patch)                removeAgg(i)

// CALC
addCalcItem()                     setCalcItem(i, patch)           removeCalcItem(i)

// ORDER BY
addSortItem()                     setSortItem(i, patch)           removeSortItem(i)

// WHERE / HAVING
addWhereCondition()               setWhereCondition(i, patch)     removeWhereCondition(i)

// CTE
toggleCteCol(name)                selectAllCteCols()              clearCteCols()

// UNION
toggleUnionCol(name)              toggleUnionSourceCol(srcId, name)

// Generic
setModalData(patch)               // อัปเดต store.modalNodeId's data
modalNodeData(key)                // อ่านค่า key จาก modal node data
```

---

### `useJsonGenerator.ts` — JSON Export

**Output format:**

```json
{
  "sources":  [{ "id": "...", "table_name": "...", "alias": "...", "type": "...", "module": "..." }],
  "joins":    [{ "join_type": "LEFT JOIN", "source_table": "...", "target_table": "...", "conditions": [...] }],
  "columns":  [{ "expression": "...", "alias": "...", "source_table": "...", "is_pk": false }],
  "filters":  [{ "column": "...", "operator": "=", "value": "..." }],
  "group_by": ["col1", "col2"],
  "having":   [{ "column": "...", "operator": ">", "value": "0" }],
  "order_by": [{ "column": "...", "direction": "ASC" }],
  "calc_cols": [{ "expression": "col1 + col2", "alias": "total" }]
}
```

---

## 9. Components

### SqlTableNode.vue

- แสดง table metadata (module badge, object type, use type)
- Column list พร้อม type badge (NUM/DATE/TXT/BIT/BIN) และ PK indicator
- Column selector (checkbox + alias input) แบบ inline
- ปุ่ม Filter → เปิด FilterModal
- ปุ่ม Expand Relations → สร้าง related nodes
- Tool badges แสดง operations ที่ connect อยู่ (CTE/Calc/Group/Sort/Union/Where)
- Visual state: loading, error retry, selected highlight

### SqlToolNode.vue

- Header แสดง icon + ชื่อ tool (สีตาม tool type)
- Summary inline per tool:
  - GROUP: "GROUP BY col1, col2 | SUM(col3) AS total"
  - SORT: "col1 ASC, col2 DESC"
  - CALC: "col1 + 100 AS col1_calc"
  - WHERE: "status = 'A' AND qty > 0"
  - CTE: "my_cte_name"
  - UNION: "UNION ALL (3 sources)"
- ปุ่ม Config → เปิด ToolConfigModal
- ปุ่ม Delete

### CteFrameNode.vue

**Expanded mode** (`isOpen=true`):
- Resizable frame (NodeResizer: min 280×180, drag handles สี violet)
- Title bar: toggle, ชื่อ CTE, child count, col count, tool badges
- Empty drop hint: "ลาก Table เข้ามาที่นี่"
- Bottom strip: แสดงชื่อตาราง child ที่อยู่ภายใน

**Collapsed mode** (`isOpen=false`):
- Compact card 200×56px
- แสดงชื่อ + table name pills (สูงสุด 2 ตัว + "+N")

### SqlEdge.vue

- SVG smooth step path
- JOIN edge: badge สีตาม JOIN type
- Tool edge: badge สีอ่อน + ลูกศร
- ปุ่มลบ (ขณะ selected)
- คลิก → เปิด RelationModal

### RelationModal.vue

- Join type selector พร้อม Venn diagram preview (SVG)
- Mappings grid: source column → operator → target column
- Auto-detect mappings จาก column name matching (case-insensitive)
- Add/remove mapping rows

### ToolConfigModal.vue

Config panel per tool:

| tool | UI |
|------|----|
| WHERE | conditions grid: column / operator / value |
| GROUP BY | group cols + aggs grid + HAVING conditions |
| CALC | items grid: col / op / value / alias |
| ORDER BY | items grid: col / dir (ASC/DESC) |
| CTE | ชื่อ CTE + column checkboxes + WHERE conditions |
| UNION | source picker + per-source column checkboxes + UNION type toggle |

### FilterModal.vue

- WHERE filter ระดับ table node (ใน FROM clause ของ CTE)
- Conditions grid: column / operator / value
- สนับสนุน: =, <>, >, >=, <, <=, LIKE, IN, IS NULL, IS NOT NULL

### GroupSelectModal.vue

เปิดอัตโนมัติหลัง drag table ที่มี related tables:
- แสดงรายการ related tables พร้อม JOIN type + column mappings
- User เลือก checkbox ว่าจะเอาตารางไหน
- กด Confirm → สร้าง nodes + edges ทั้งหมดพร้อมกัน

### FinishModal.vue

- ตั้งชื่อ builder
- Toggle public/private
- Save → POST ไปยัง MangoBI cloud API

---

## 10. Backend API Routes

ทุก route อยู่ใน `server/api/mango-schema/`  
Proxy ไปยัง Mango API ผ่าน session auth

### modules.get.ts

```
GET /api/mango-schema/modules
→ Mango: AnywhereAPI/SQLGenerator/Schema_Module_ReadList
Cache: 24h (key: modules)
Header: X-Cache: hit | miss | stale | miss-error
Error: 502 ถ้าไม่มี cache และ Mango ไม่ตอบ
```

### objects.get.ts

```
GET /api/mango-schema/objects?module=Logistics
→ Mango: AnywhereAPI/SQLGenerator/Schema_Object_ReadList
Cache: 24h per module
Response: { data: [{ object_name, object_type, table_name, remark, menu_id, menu_name, ... }] }
```

### table-columns.get.ts

```
GET /api/mango-schema/table-columns?table=PO_H
→ Mango: AnywhereAPI/SQLGenerator/Schema_Table_Read
Cache: 1h per table
Response: { data: { detail: [{ COLUMN_NAME, DATA_TYPE, COLUMN_KEY, COLUMN_COMMENT, ... }] } }
Error: throw 502 ถ้า Mango ไม่ตอบ (ไม่ silent null)
```

> **สำคัญ:** route นี้ throw 502 เพื่อให้ caller แยกระหว่าง "table ไม่มี column" กับ "API ล้มเหลว"

### object-table-detail.get.ts

```
GET /api/mango-schema/object-table-detail?table=PO_H
→ Mango: AnywhereAPI/SQLGenerator/Schema_Table_Detail (ADDSPEC metadata)
หน้าที่: เพิ่ม remark จาก ADDSPEC เข้าไปใน column info
```

### object-detail.get.ts

```
GET /api/mango-schema/object-detail?module=Logistics&object_name=PO
→ Mango: AnywhereAPI/SQLGenerator/Schema_Object_Detail
Response: {
  data: {
    header:       { ... },
    object_table: [{ table_name, use_type, col_relation, ... }]
  }
}
```

### sync.post.ts

```
POST /api/mango-schema/sync
หน้าที่: bust cache ทั้งหมด → re-fetch จาก Mango
Response: { syncedAt: ISO_date, mangoReachable: boolean }
```

### Cache Strategy (รายละเอียดใน `docs/sql-builder-mango-proxy.md`)

| สถานการณ์ | พฤติกรรม | X-Cache Header |
|-----------|---------|----------------|
| Cache valid | return cache ทันที | `hit` |
| Cache expired, Mango OK | fetch ใหม่ + update cache | `miss` |
| Cache expired, Mango down | return cache เก่า + คำเตือน | `stale` |
| ไม่มี cache, Mango down | throw 502 | `miss-error` |

---

## 11. Cloud Persistence API

Route prefix: `api/v1/Planning/MangoBI/`

| Method | Endpoint | หมายเหตุ |
|--------|----------|---------|
| GET | `GetSQLBuilders` | list ของ maincode นั้น |
| GET | `GetSQLBuilder?id=` | โหลด 1 รายการ |
| POST | `SaveSQLBuilder` | save/update |
| POST | `DeleteSQLBuilder?id=` | ลบ |

**SaveSQLBuilder request body:**

```json
{
  "id":       "guid (omit for insert)",
  "name":     "ชื่อ builder",
  "nodesJson": "[...VueFlow Node[]]",
  "edgesJson":  "[...VueFlow Edge[]]",
  "sqlText":    "WITH _src AS (...) SELECT * FROM _src"
}
```

---

## 12. Database Schema

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

## 13. ERP Data Loading

### Module Hierarchy

```
Module (เช่น Logistics)
└── Objects (เช่น PO, SO, GR)
    └── Tables (เช่น PO_H, PO_D)
        └── Columns (เช่น doc_no, doc_date, ...)
```

### Use Types

| use_type | ความหมาย | ลำดับความสำคัญเป็น primary |
|----------|---------|--------------------------|
| H        | Header  | สูงสุด                   |
| D        | Detail  | รอง                      |
| M        | Master  | ต่ำสุด                   |

### Auto JOIN Mapping

เมื่อสร้าง related nodes, ระบบพยายาม auto-detect column mappings โดย:
1. ใช้ `col_relation` จาก object_table definition
2. Fallback: match column names (case-insensitive) ระหว่าง 2 ตาราง

---

## 14. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + Z` | Undo |
| `Ctrl + Y` | Redo |
| `Ctrl + C` | Copy selected nodes + inter-connected edges |
| `Ctrl + V` | Paste (offset +60px ต่อครั้งที่ paste) |
| `Ctrl + A` | Select all nodes |
| `Delete` / `Backspace` | ลบ selected nodes (+ edges ที่เชื่อม) |
| `Escape` | ปิด modal ทั้งหมด |

**Copy-Paste:**
- Node IDs ถูก remap ใหม่ทั้งหมด (prefix `copy-`)
- Edges ระหว่าง copied nodes จะถูก copy ด้วย
- `pasteCount` track จำนวนครั้งเพื่อคำนวณ offset

---

## 15. Vue Flow Notes

### CSS Import (สำคัญมาก)

```typescript
// ใน SqlBuilderCanvas.vue — ต้อง import เสมอ
import '@vue-flow/core/dist/style.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/node-resizer/dist/style.css'  // สำหรับ CteFrameNode
```

ถ้าขาด → handle positions ผิด (nodes กองที่ top-left)

### First-load Fix

```typescript
// ล่าช้า mount VueFlow จนกว่า Sidebar animation (200ms) จบ
const flowReady = ref(false)
onMounted(() => {
  const ro = new ResizeObserver(() => {
    clearTimeout(timer)
    timer = setTimeout(() => { flowReady.value = true; ro.disconnect() }, 150)
  })
  ro.observe(containerRef.value)
})
```

### Handle Re-measurement

แต่ละ custom node component ต้องเรียก:

```typescript
const { updateNodeInternals } = useVueFlow()
onMounted(() => nextTick(() => updateNodeInternals([props.id])))
```

### Drop Position

```typescript
// ใช้ screenToFlowCoordinate เสมอ
const { x, y } = screenToFlowCoordinate({ x: e.clientX - 110, y: e.clientY - 40 })
```

### nodeTypes Registration

```typescript
// ต้อง markRaw() ทุกตัว — ป้องกัน Vue reactive proxy
const nodeTypes = {
  sqlTable:  markRaw(SqlTableNode),
  toolNode:  markRaw(SqlToolNode),
  cteFrame:  markRaw(CteFrameNode),
} as any  // cast as any: VueFlow NodeTypesObject type mismatch กับ SFC generics
```

### edgeTypes Registration

```typescript
const edgeTypes = {
  sqlEdge: markRaw(SqlEdge),
} as any
```

---

## 16. Error Handling & Edge Cases

### Column Loading Failure

- API throws 502 ถ้า Mango ไม่ตอบ (ไม่ silent null)
- Node แสดง error state พร้อมปุ่ม "Retry"
- SQL generation ถูก block พร้อม warning: `-- ⚠ โหลดคอลัมน์ไม่สำเร็จ: table1`

### Missing Upstream CTE

- Tool node ที่ upstream unreachable → บันทึก warning
- SQL generation ยังทำงานต่อโดย fallback ไป lastCTE
- Warning แสดงใน SQL panel banner

### Duplicate CTE Names

- Auto-rename: `my_cte` → `my_cte_2` → `my_cte_3` → ...
- ทั้ง tool nodes และ cteFrames

### History Branching

```
[snap0, snap1, snap2, snap3]   index=2
→ undo() → index=1
→ new change → discard [snap2, snap3] → [snap0, snap1, snap4]
```

### Stale Cache

```
ถ้า Mango ไม่ตอบ + มี cache เก่า:
  → return cache + X-Cache: stale
  → แสดง "ข้อมูลเก่า N ชั่วโมง" ใน sync status
ถ้าไม่มี cache เลย:
  → throw 502
  → แสดง error state + ปุ่ม Retry ใน left panel
```

### Empty Canvas

```sql
-- ลาก Table ลงบน Canvas ก่อน
```

---

## 17. Performance Optimizations

### Memoization

- `columnCache`: columns ต่อ table ถูก cache ใน store ตลอด session
- `visibleColSet` computed: O(1) lookup สำหรับ column selection check

### Debouncing

- `recordHistory()`: debounce 300ms — ป้องกัน history spam ขณะ drag
- Watcher บน nodes/edges: ป้องกัน render thrashing จาก Vue Flow internal updates

### Lazy Loading

- Modules โหลดตอน mount
- Objects โหลดต่อ module เมื่อ expand
- Columns โหลดต่อ table เมื่อ drag
- Search โหลด all modules พร้อมกัน (background parallel)

### Vue Flow Internals

- `updateNodeInternals()` เรียกเฉพาะ after `nextTick` หลัง mount
- ResizeObserver รอ animation จบก่อน mount canvas
- `onNodeDragStop` บันทึก history (ไม่ใช่ continuous drag)

### SQL Panel

- TOP N preview: default 200 rows (configurable)
- SQL copy ใช้ `navigator.clipboard.writeText`

---

## 18. AI Integration

### `useAiContext.ts` — System Prompt

สร้าง system prompt สำหรับ AI assistant โดยรวม:

- รายการ tables บน canvas (columns ทั้งหมด + ที่เลือกไว้)
- รายการ edges (JOINs พร้อม ON conditions)
- Generated SQL ล่าสุด (สูงสุด 800 chars)
- ERP modules ที่มีบน canvas
- กฎเคร่งครัด: ใช้เฉพาะ tables/columns ที่มีบน canvas

### `useAiActions.ts` — Action Executor

**Action types ที่รองรับ:**

| action | ผลลัพธ์ |
|--------|---------|
| `add_edge` | เชื่อม table nodes ด้วย mappings |
| `add_table` | เพิ่ม table จาก ERP |
| `remove_edge` | ลบ edge |
| `add_group_by` | สร้าง GROUP BY tool node |
| `add_where` | สร้าง WHERE tool node |
| `add_sort` | สร้าง ORDER BY tool node |
| `add_calc` | สร้าง CALC tool node |
| `update_tool` | แก้ไข config ของ tool node |
| `set_visible_cols` | toggle columns บน table node |

**Validation:**
- ตรวจสอบว่า table/column มีอยู่บน canvas ก่อน execute
- ตรวจ column names กับ upstream available columns
- Error message กลับไปยัง AI ถ้า validate ไม่ผ่าน

---

## Appendix: SQL Operator Reference

### Filter Operators (WhereCondition)

| operator | SQL |
|----------|-----|
| `=` | `col = N'value'` |
| `<>` | `col <> N'value'` |
| `>`, `>=`, `<`, `<=` | ตรงตัว |
| `LIKE` | `col LIKE N'%value%'` |
| `IN` | `col IN (N'a', N'b')` |
| `IS NULL` | `col IS NULL` |
| `IS NOT NULL` | `col IS NOT NULL` |

### Aggregation Functions (GROUP BY)

| func | SQL |
|------|-----|
| `SUM` | `SUM(col)` |
| `AVG` | `AVG(col)` |
| `COUNT` | `COUNT(col)` |
| `MIN` | `MIN(col)` |
| `MAX` | `MAX(col)` |
| `COUNT DISTINCT` | `COUNT(DISTINCT col)` |

### Calc Operators

| op | SQL |
|----|-----|
| `+` | `col + value` |
| `-` | `col - value` |
| `*` | `col * value` |
| `/` | `CASE WHEN value <> 0 THEN col / value ELSE NULL END` |
| `CONCAT` | `CONCAT(col, value)` |
| `DATEDIFF` | `DATEDIFF(day, col, value)` |
| `ROUND` | `ROUND(col, value)` |
| `ABS` | `ABS(col)` |
| `UPPER`/`LOWER` | `UPPER(col)` |

---

*อัปเดตล่าสุด: 2026-04-27*
