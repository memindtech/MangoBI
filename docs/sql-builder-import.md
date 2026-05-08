# SQL Builder — Import Workflow

> สรุป workflow การ import SQL เข้า canvas + วิเคราะห์ปัญหาเรื่อง "ทุกอย่างต้องแก้ไขได้"
> + แผนการ refactor

---

## 1. ภาพรวม Workflow ของหน้า SQL Builder

```
┌──────────────────────────────────────────────────────────────────────────┐
│ หน้า  /sql-builder                                                        │
│                                                                           │
│  ┌──────────┐   ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐│
│  │ LeftPanel│ → │ Canvas      │ → │ RightPanel   │ → │ SqlPanel         ││
│  │ ERP tree │   │ Vue Flow    │   │ Tool palette │   │ Generated SQL    ││
│  └──────────┘   └─────────────┘   └──────────────┘   └──────────────────┘│
│       │              │                  │                    ↑           │
│       │ drag         │ drop / click     │ drag tool          │ Generate  │
│       └──────→ useDragDrop ──→ store.nodes/edges ──→ useSqlGenerator ─→ ─┘│
└──────────────────────────────────────────────────────────────────────────┘
```

### Module หลัก
- `pages/sql-builder.vue` — wrapper, layout, modal mounting
- `components/sql-builder/`
  - `layout/` — Header / LeftPanel / RightPanel / Canvas / SqlPanel / LayersPanel
  - `nodes/` — `SqlTableNode`, `SqlToolNode`, `CteFrameNode`, `SqlEdge`
  - `modals/` — `ToolConfigModal`, `RelationModal`, `FilterModal`, `GroupSelectModal`, `ToolCreateModal`, `FinishModal`
- `composables/sql-builder/`
  - `useDragDrop` — drag/drop, onRead flow, `loadColumnsForNode`
  - `useSqlGenerator` — topo sort + CTE pipeline → final SQL
  - `useToolNodes` — modal state mutations (selectItems/mathItems/aggs/conditions)
  - `useFlowEvents` — Vue Flow event wiring
  - `useHistory` — undo/redo
  - `useJsonGenerator` — export to JSON
  - `useAiContext` / `useAiActions` — AI assist
- `stores/sql-builder.ts` — single source of truth (`nodes`, `edges`, `modalNodeId`, ...)

### Flow การสร้าง SQL
1. Drop ตาราง ERP จาก LeftPanel → `useDragDrop.onDrop` → load schema → push `sqlTable` node
2. ลากเส้นระหว่าง 2 ตาราง → `useFlowEvents` → push edge ที่มี `mappings` (ON conditions)
3. Drop tool (where / group / sort / calc / union / cte / subquery) → push `toolNode`
4. กด Generate → `useSqlGenerator.generateSQL`:
   - Topo sort (Kahn) ทุก node
   - Tables → `_src` CTE (JOIN block)
   - แต่ละ tool node → CTE ของตัวเอง อ้างอิง upstream
   - `sort` → ORDER BY ปลายสุด (ห้ามอยู่ใน CTE)
   - `WITH ... SELECT * FROM <last_cte> [ORDER BY ...]`

---

## 2. SQL Generation — รูปแบบที่รองรับ

| Tool node | CTE ที่สร้าง |
|-----------|--------------|
| `where`   | `SELECT * FROM <up> WHERE <conds>` |
| `group`   | `SELECT <groupCols>, <aggs> FROM <up> GROUP BY ...` (ถ้ามี `customGroupSql` → verbatim) |
| `sort`    | `ORDER BY ...` (apply ที่ outer query) |
| `calc`    | `SELECT *, <expr> AS alias FROM <up>` |
| `union`   | `<up1> UNION [ALL] <up2> ...` |
| `cte`     | named CTE wrapper |
| `subquery`| 3 modes (ดูล่าง) |

### Subquery node — 3 modes
ผู้ใช้สลับโดยตั้งค่า `customSql` + `selectItems` / `mathItems` / `caseWhens`:

| Mode | เงื่อนไข | ผลลัพธ์ |
|------|---------|--------|
| **Verbatim** | `customSql` เซ็ต, `selectItems/mathItems/caseWhens` ว่าง | ใช้ `customSql` เป็น CTE body ตรง ๆ |
| **Hybrid** | `customSql` เซ็ต **และ** มี `selectItems/mathItems/caseWhens` | `SELECT <cols> FROM (<customSql>) <alias>` |
| **Builder** | `customSql` ว่าง, มี `selectItems/...` | `SELECT <cols> FROM <upstreamCTE>` |

ทั้งสาม mode รองรับ `WHERE` (`conditions`) ตามท้าย

---

## 3. Import SQL — Workflow ปัจจุบัน

ไฟล์: `app/components/sql-builder/layout/SqlBuilderHeader.vue` → `runImport(sql)`

### Step-by-step
1. **Detect template vars** (`{key}`) → ถามค่าจาก user (`importStep = 'vars'`) → substitute → re-run
2. **Extract CTEs** — parse `WITH a AS (...), b AS (...)` ด้วย paren-depth scan → `cteDefs: Map<lower, body>`
3. **Collect real tables** — `FROM/JOIN <name>` ที่ไม่ใช่ CTE → `tableByName`
4. **`tableImportedCols`** — scan `alias.col` ใน SELECT → เก็บคอลัมน์จริงเพื่อ restore ใน `loadColumnsForNode`
5. **JOIN edges** — `parseEdgesFromBlock` regex JOIN…ON conditions → `edgeMap`
6. **เลือก path:**

   ```
   isComplexBlock(body) =
     CASE WHEN  ‖  ( SELECT ...  ‖  arithmetic (a + b)
   ```

   - `cteDefs.size > 0 && any complex` → **Complex CTE Path** (ลง section 5b ด้านล่าง)
   - มิเช่นนั้น → **Simple Path** — table nodes + JOIN edges + tool nodes (where/group/sort)

### Complex CTE Path (5b)
แต่ละ CTE มี chain ของตัวเอง โดยแยกเป็น 3 patterns:

| Pattern | Trigger | Canvas output |
|---------|---------|---------------|
| **A — Hybrid** | `FROM (SELECT ...)` ใน body | tables + JOIN edges + 1 SUBQ (hybrid: customSql=inner, selectItems/mathItems/caseWhens=outer cols) |
| **B — Verbatim** | ไม่มี subquery, ไม่มี GROUP BY (แต่มี CASE WHEN / correlated subq) | tables + JOIN edges + 1 SUBQ (verbatim: customSql=full body) |
| **C — Group** | มี GROUP BY ที่ depth 0 (ไม่ใช่ subquery) | tables + JOIN edges + WHERE node + GROUP node |

CTE name replacement: `cte_boq → _cte1, cte_1 → _cte2` ก่อน inject เข้า `customSql` เพื่อให้ generator อ้างถึงชื่อที่ตัวเองจะ output

`prevToolId` chain — แต่ละ CTE chain ผูก dep edge จาก output ของ CTE ก่อนหน้า เพื่อให้ topo sort เรียงถูก

### Outer SQL
- WHERE → outer WHERE node ต่อท้าย chain สุดท้าย
- ORDER BY → outer SORT node

---

## 4. ตัวอย่าง — `v_bd_rpt100_1.txt`

```sql
WITH cte_boq AS (
  SELECT a.maincode, a.projno, a.current_c, a.exchange,
         (a.amtmat + amtlab) AS totamt,
         (COALESCE(amtmat_bg,0) + COALESCE(amtlab_bg,0)) AS totamt_budget
  FROM (SELECT a.maincode, a.projno, b.current_c, b.exchange,
               SUM(matamt_boq) AS amtmat, SUM(labamt_boq) AS amtlab,
               SUM(matamt) AS amtmat_bg, SUM(labamt) AS amtlab_bg
        FROM bd_boq_detail a LEFT JOIN bd_proj_h b ON ...
        WHERE COALESCE(a.boq_type,'D') = 'D'
        GROUP BY ...) a
),
cte_1 AS (
  SELECT a.maincode, a.data_ty, h.valuename data_name,
         a.projno, a.projname, ...,
         CASE WHEN a.proj_type='1' THEN 'Trading'
              WHEN a.proj_type='2' THEN 'Construction' ... END projtype,
         ..., i.totamt boqamt, i.totamt_budget,
         (SELECT SUM(xx.amountfee) FROM bd_boq_detail xx
            WHERE xx.maincode=a.maincode AND xx.projno=a.projno) AS amountfee
  FROM bd_proj_h a
  LEFT JOIN chq_proj b   ON ...
  LEFT JOIN hr_emp c     ON ...
  LEFT JOIN bd_mas_status d ON ...
  LEFT JOIN sm_sale e    ON ...
  LEFT JOIN ar_cust f    ON ...
  LEFT JOIN chq_proj_group g ON ...
  LEFT JOIN sm_rule h    ON ... AND h.rulecode='R0002'
  LEFT JOIN cte_boq i    ON ...
)
SELECT * FROM cte_1 WHERE maincode = 'MG1'
```

### ผลลัพธ์ปัจจุบันบน Canvas

| CTE | Pattern | Tables on canvas | Tool nodes | สิ่งที่ user ปรับได้ |
|-----|---------|------------------|------------|----------------------|
| `cte_boq` | A — Hybrid | `bd_boq_detail`, `bd_proj_h` + JOIN | 1 SUBQ (hybrid) | inner SQL textarea, 4 selectItems, 2 mathItems (totamt/totamt_budget), conditions |
| `cte_1` | **B — Verbatim** | 8 tables + 7 JOINs (cte_boq เป็น CTE → ไม่แสดง) | **1 SUBQ (verbatim — raw textarea)** | **เฉพาะ raw SQL block** |
| outer | — | — | 1 WHERE (`maincode='MG1'`) | conditions |

---

## 5. ปัญหาเรื่องการแสดงผล — "ทุกอย่างต้องแก้ไขได้"

### Gap ที่พบ

| # | ปัญหา | ผลกระทบ | ตัวอย่างจาก v_bd_rpt100_1 |
|---|--------|---------|---------------------------|
| 1 | **Pattern B (verbatim) ไม่ parse SELECT cols** — body ทั้งก้อนไป `customSql` | user ต้องแก้ raw SQL เท่านั้น | cte_1: SELECT 30+ cols + CASE WHEN + correlated subq → ทุกอย่างเป็น text dump |
| 2 | **CASE WHEN ใน Pattern B ไม่เข้า `caseWhens`** | UI builder ของ CASE WHEN ไม่ทำงาน | `CASE WHEN proj_type='1' THEN 'Trading' ... END projtype` เป็นข้อความล้วน |
| 3 | **Correlated subquery `(SELECT ... )` ไม่เข้า `mathItems`** | ไม่มี handle ปรับได้ | `(SELECT SUM(xx.amountfee) ...) AS amountfee` ถูก dump เป็น text |
| 4 | **JOIN ไป CTE ไม่แสดง edge** — `parseJoinsLocal` filter `cte_boq` ออก | user มองไม่เห็น dependency cte_1 → cte_boq | `LEFT JOIN cte_boq i ON ...` หายไปจาก canvas (มีแค่ serial dep edge) |
| 5 | **`runImport()` ใน SqlBuilderHeader.vue ใหญ่ ~750 บรรทัด** อยู่ใน `<script setup>` | ดูแลยาก, ทดสอบไม่ได้ | ทั้ง parsing + canvas building ผสมในฟังก์ชันเดียว |

### สาเหตุของปัญหาหลัก
`isComplexBlock(body)` ตัดสินใจครั้งเดียวแล้ว dump body ทั้งก้อนเป็น `customSql` โดยที่ regex parsing สำหรับ SELECT items มีอยู่แล้ว (ที่ Pattern A ใช้) แค่ไม่ได้เรียกใน Pattern B

---

## 6. แผน Refactor + Fix

### Phase 1 — แยก import logic ออกเป็น composable
**ไฟล์ใหม่:** `app/composables/sql-builder/useSqlImport.ts`

โครงสร้าง:
```ts
export function useSqlImport() {
  // Parsers (pure functions, testable)
  function extractCtes(sql: string): { outer: string; cteDefs: CteDef[] }
  function parseTables(block: string, cteNames: Set<string>): TableRef[]
  function parseJoins(block: string, cteNames: Set<string>): JoinEdge[]
  function parseSelectClause(body: string): {
    selectItems: SelectItem[]
    mathItems:   MathItem[]
    caseWhens:   CaseWhen[]
    correlatedSubqs: MathItem[]   // (SELECT ...) AS alias → mathItem
  }
  function parseWhere(block: string): Condition[]
  function parseOrderBy(block: string): SortItem[]
  function parseGroupBy(block: string): { groupCols: string[]; aggs: AggItem[] }

  // Canvas builders
  function buildTableNodes(...)
  function buildJoinEdges(...)
  function buildToolChain(cteDef: CteDef, prevId: string): { nodes; edges; outputId }

  // Public API
  function runImport(sql: string): { nodes; edges; warnings: string[] }
  return { runImport, extractCtes, ... }
}
```

`SqlBuilderHeader.vue` จะเหลือเพียง:
```ts
const sqlImport = useSqlImport()
function runImport(sql: string) {
  const { nodes, edges, warnings } = sqlImport.runImport(sql)
  appendNodesToCanvas(nodes, edges)
  ...
}
```

### Phase 2 — ทำให้ทุกอย่างแก้ไขได้ (ปิด Pattern B)
แทนที่ Pattern B (verbatim) ด้วยการ parse แบบ structured เสมอ:

```ts
// สำหรับทุก CTE body → parse เป็น Builder/Hybrid mode
function parseAnyCteBody(body: string, cteNameMap): SubqueryNodeData {
  const hasInlineSubq = /\bFROM\s*\(\s*SELECT\b/i.test(body)
  const hasGroupBy0   = hasGroupByAtDepth0(body)

  // Outer SELECT → split เป็น selectItems / mathItems / caseWhens / correlatedSubqs
  const selClause = extractSelectClause(body)
  const parsed    = parseSelectClause(selClause)

  // Inner SQL (ถ้ามี FROM (SELECT...)) → customSql (Hybrid)
  // ถ้าไม่มี → customSql = '' (Builder)
  const customSql = hasInlineSubq
    ? extractInnerSubqSql(body, cteNameMap)
    : ''

  return {
    customSql,
    selectItems: parsed.selectItems,
    mathItems:   [...parsed.mathItems, ...parsed.correlatedSubqs],
    caseWhens:   parsed.caseWhens,
    conditions:  parseWhere(extractWhereClause(body)),
    alias:       cteName,
  }
}
```

ผลลัพธ์: ทุก CTE บน canvas จะอยู่ใน Hybrid หรือ Builder mode เสมอ → user คลิกแก้ทีละ field ได้

**กรณี edge cases ที่ยังต้อง verbatim:**
- มี GROUP BY ที่ depth 0 → Pattern C (ใช้ Group node)
- Parse SELECT clause ล้มเหลว (regex ไม่จับ) → fallback verbatim + log warning

### Phase 3 — JOIN ไป CTE
แก้ `parseJoinsLocal` ให้ยอมรับ CTE references และสร้าง edge `cte_node → table_node` (target node = อันสุดท้ายของ CTE chain ก่อนหน้า)

```ts
const cteToOutputId = new Map<string, string>()  // cte_boq → sqid_of_cte_boq_subq
// เมื่อ parse JOIN ใน cte_1: ถ้า target เป็น cte_boq → ใช้ cteToOutputId
```

### Phase 4 — Documentation
- อัปเดต `docs/sql-builder.md` section "Import" ให้ link มาที่ doc นี้
- เพิ่ม unit-test fixtures ใน `tests/sql-import/` (สำหรับ phase ถัดไป)

---

## 7. ลำดับงานเสนอ

1. ✅ เขียน document นี้
2. ⏳ สร้าง `useSqlImport.ts` — ย้าย logic ทั้งก้อนจาก `SqlBuilderHeader.vue` (refactor บริสุทธิ์ ไม่เปลี่ยน behavior)
3. ⏳ ปรับ Pattern B → parse SELECT clause structurally (Phase 2)
4. ⏳ เพิ่ม CTE→table edge visualization (Phase 3)
5. ⏳ Test กับ `v_bd_rpt100_1.txt` + ไฟล์ตัวอย่างอื่น

---

## 8. References (อ่านเพิ่ม)

- `docs/sql-builder.md` — full architecture
- `doc/WORKFLOW_FRONTEND.md` — frontend overall flow
- Memory: `project_sql_import_complex_cte.md` — เดิมมี note Pattern A/B/C
