# ChartDB System Workflow & Architecture Reference

> เอกสารนี้ออกแบบมาเพื่อให้ AI อ่านแล้วเข้าใจระบบ ChartDB ทั้งหมด สามารถนำไปสร้างโปรเจกต์ที่มีการทำงานเหมือนกันได้

---

## 1. ภาพรวมระบบ (System Overview)

**ChartDB** คือ Visual SQL Query Builder — เครื่องมือสร้าง SQL แบบ drag-and-drop บน canvas โดยไม่ต้องเขียน SQL เอง

### หลักการทำงาน
1. ผู้ใช้ลากตาราง (Table) จากแผงซ้ายวางบน canvas
2. เชื่อมต่อตารางด้วยเส้น (Edge) เพื่อสร้าง JOIN
3. เพิ่ม node ประมวลผล (Aggregate, Formula, Sort, Where, Union)
4. ระบบแปลง diagram เป็น SQL (CTE-based) อัตโนมัติ
5. Export เป็น SQL หรือ JSON ได้

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend Framework | Vue 3 (Composition API) |
| Diagram Engine | Vue Flow v1.22.2 (@vue-flow/core) |
| State Management | Vue reactive() + Composables pattern |
| UI Framework | Bootstrap 4.6 + AdminLTE 3.2 |
| Build Tool | Webpack 5 + Babel 7 |
| Backend | ASP.NET Core 8 |
| Database | SQLite |
| Testing | Vitest + Playwright |

---

## 2. สถาปัตยกรรมระบบ (Architecture)

### Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERACTION LAYER                    │
│  Drag Table → Drag Tool → Edit Filter → Edit Mapping →     │
│  Double-click Edge → Keyboard Shortcuts → Import SQL        │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              COMPOSABLE BUSINESS LOGIC LAYER                │
│  useDrag_Drop → useNodeFactory → useFlowEvents →           │
│  useNodeLogic → useKeyboardShortcuts → useHistory           │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              CORE TRANSFORMATION LAYER                       │
│  useSqlImport (parse SQL → nodes)                           │
│  useSqlGenerator (nodes → SQL with CTEs)                    │
│  useJsonGenerator (nodes → JSON payload)                    │
│  useChartDBData (API → schema loading)                      │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                  STATE MANAGEMENT LAYER                      │
│  chartdbStore (centralized reactive state)                  │
│  useChartDBState (data layer state)                         │
│  useHistory (undo/redo snapshots)                           │
│  usePersistence (localStorage save/restore)                 │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                   RENDERING LAYER                            │
│  Vue Flow (diagram canvas)                                  │
│  Custom Node Components (8 types)                           │
│  Bootstrap Modals → Toast Notifications                     │
└─────────────────────────────────────────────────────────────┘
```

### File Structure

```
ChartDB/
├── ChartDB.vue                    # Main controller (53KB) - orchestrates all composables
├── Layout/
│   ├── ChartDBCanvas.vue          # Vue Flow canvas wrapper + minimap
│   ├── ChartDBHeader.vue          # Toolbar (export, zoom, undo/redo)
│   ├── ChartDBLeftPanel.vue       # Table browser sidebar
│   └── ChartDBRightPanel.vue      # Tools & Layers sidebar
├── Nodes/                         # 8 node type components
│   ├── table_node.vue             # Data source node
│   ├── aggregate_node.vue         # GROUP BY + aggregation
│   ├── formula_node.vue           # Calculated column (CASE/math)
│   ├── sort_node.vue              # ORDER BY
│   ├── where_node.vue             # WHERE filter
│   ├── union_node.vue             # UNION/UNION ALL
│   ├── group_node.vue             # Visual CTE grouping container
│   └── index.js                   # Node type registry
├── Modals/
│   ├── ImportSqlModal.vue         # SQL text import dialog
│   ├── ToolQuickModal.vue         # Quick tool creation dialog
│   └── ChartDBModalsLegacy.vue    # Relation, filter, output modals
├── Shared/
│   ├── ConfirmModal.vue           # Confirmation dialog
│   ├── ChartDBMessageBox.vue      # Toast + modal message system
│   └── TableModuleAccordion.vue   # Module/table grouping
├── Composables/                   # 15 business logic modules
│   ├── useChartDBData.js          # API data loading
│   ├── useChartDBState.js         # Local reactive state
│   ├── useChartDBUI.js            # UI helpers (icons, dropdowns)
│   ├── useDrag_Drop.js            # Drag/drop handlers
│   ├── useFlowEvents.js           # Edge connections & validation
│   ├── useHistory.js              # Undo/redo system
│   ├── useJsonGenerator.js        # JSON export
│   ├── useKeyboardShortcuts.js    # Keyboard bindings
│   ├── useNodeFactory.js          # Node creation
│   ├── useNodeLogic.js            # Node operations & modals
│   ├── usePersistence.js          # LocalStorage save/restore
│   ├── useSqlGenerator.js         # SQL generation (CTE-based)
│   ├── useSqlImport.js            # SQL parsing & import
│   ├── useTemplateSystem.js       # Template save/load
│   └── index.js                   # Export aggregator
├── Embed/
│   ├── ChartDBEmbed.vue           # Embedded mode (no login)
│   └── useEmbedAuth.js            # Passcode authentication
└── __tests__/                     # 20 test files
```

---

## 3. UI Layout (3-Column Design)

```
┌──────────────────────────────────────────────────────────────┐
│                      HEADER TOOLBAR                          │
│  [Import SQL] [Generate JSON] [Template] [Reset]             │
│  [Zoom+] [Zoom-] [Fit] [MiniMap] [Undo] [Redo] [Export Img] │
├────────────┬─────────────────────────────┬───────────────────┤
│            │                             │                   │
│  LEFT 20%  │       CENTER 60%            │   RIGHT 20%      │
│            │                             │                   │
│ ┌────────┐ │   ┌─────────────────────┐   │ ┌─────────────┐  │
│ │Module  │ │   │                     │   │ │[Tools|Layers]│  │
│ │Filter  │ │   │   VUE FLOW CANVAS   │   │ │             │  │
│ ├────────┤ │   │                     │   │ │ Draggable:  │  │
│ │Search  │ │   │  ┌─────┐  ┌─────┐  │   │ │ • CTE Group │  │
│ ├────────┤ │   │  │Table│──│Table│  │   │ │ • Filter    │  │
│ │        │ │   │  └─────┘  └──┬──┘  │   │ │ • Aggregate │  │
│ │ Tables │ │   │         ┌────┴───┐ │   │ │ • Formula   │  │
│ │ List   │ │   │         │Aggreg. │ │   │ │ • Sort      │  │
│ │(drag)  │ │   │         └────────┘ │   │ │ • Union     │  │
│ │        │ │   │                     │   │ │             │  │
│ │ • tbl1 │ │   │   [MiniMap]        │   │ │ Layers:     │  │
│ │ • tbl2 │ │   │                     │   │ │ Node tree   │  │
│ │ • tbl3 │ │   └─────────────────────┘   │ └─────────────┘  │
│ └────────┘ │                             │                   │
├────────────┴─────────────────────────────┴───────────────────┤
│                      STATUS / DEBUG                          │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. Data Models (โครงสร้างข้อมูล)

### 4.1 Node Base Structure
ทุก node สืบทอดจาก Vue Flow node:

```javascript
{
  id: "node_1234",              // Unique ID
  type: "node-table",           // Node type string
  position: { x: 100, y: 200 },// Canvas position
  data: { /* type-specific */ },// Node payload
  parentNode: "group_1",        // Group parent (optional)
  zIndex: 1500                  // Layer ordering
}
```

### 4.2 Table Node Data
```javascript
{
  type: "node-table",
  data: {
    label: "ชื่อตาราง",           // Display name
    tableName: "tb_orders",      // Actual DB table name
    objectName: "OBJ_ORDER",     // API object name
    module: "SALES",             // Module name
    objectTypeLabel: "Transaction", // T, M, F, R labels
    useTypeLabel: "Header",      // H, D, U, V, O, M labels
    details: [                   // ALL columns in table
      {
        column_name: "order_id",
        column_type: "int",      // Actual DB type
        data_type: "int",        // Fallback type
        data_pk: "Y",            // Primary key flag
        remark: "รหัสคำสั่งซื้อ"
      }
    ],
    visibleCols: [               // SELECTED columns to show/use
      {
        name: "order_id",
        type: "int",
        remark: "รหัสคำสั่งซื้อ",
        isPk: true,
        alias: ""                // Optional display alias
      }
    ],
    filters: [                   // WHERE conditions on this table
      {
        column: "status",
        operator: "=",
        value: "active",
        type: "varchar",
        columnType: "nvarchar"
      }
    ],
    isHeaderNode: true           // Is Header type
  }
}
```

### 4.3 Aggregate Node Data
```javascript
{
  type: "node-aggregate",
  data: {
    label: "สรุปยอดขาย",
    availableCols: [             // Inherited from upstream
      { name: "product_id", type: "int", remark: "", table: "tb_orders" }
    ],
    groupBy: ["product_id"],     // GROUP BY columns
    metrics: [                   // Aggregate calculations
      {
        column: "amount",
        func: "SUM",            // SUM, AVG, COUNT, COUNT_DISTINCT, MIN, MAX
        alias: "total_amount"
      }
    ],
    filters: [                   // HAVING conditions
      { column: "total_amount", operator: ">", value: 1000, type: "int" }
    ]
  }
}
```

### 4.4 Formula Node Data
```javascript
{
  type: "node-formula",
  data: {
    label: "คำนวณส่วนลด",
    expression: "CASE WHEN amount > 1000 THEN amount * 0.1 ELSE 0 END",
    alias: "discount",
    availableCols: [
      { name: "amount", type: "decimal", remark: "" }
    ]
  }
}
```

### 4.5 Where Node Data
```javascript
{
  type: "node-where",
  data: {
    label: "Where Filter",
    availableCols: [
      { name: "status", type: "nvarchar", table: "tb_orders" }
    ],
    conditions: [
      {
        column: "status",
        operator: "=",           // =, !=, >, <, >=, <=, LIKE, IN, IS NULL, IS NOT NULL
        value: "active",
        type: "varchar"
      }
    ]
  }
}
```

### 4.6 Sort Node Data
```javascript
{
  type: "node-sort",
  data: {
    label: "Sort Data",
    availableCols: [
      { name: "created_date", type: "datetime", remark: "" }
    ],
    sorts: [
      { column: "created_date", direction: "DESC" }  // ASC or DESC
    ]
  }
}
```

### 4.7 Union Node Data
```javascript
{
  type: "node-union",
  data: {
    label: "Union",
    customName: "all_orders",
    unionType: "UNION ALL",      // UNION or UNION ALL
    availableCols: [             // Result columns
      { name: "order_id", type: "int", remark: "" }
    ],
    wrapAsCte: true,
    selectedCols: ["order_id", "amount"]
  }
}
```

### 4.8 Group Node Data (CTE Container)
```javascript
{
  type: "node-group",
  data: {
    label: "CTE_Orders",
    visibleCols: [],             // Output columns from group
    isOpen: true                 // Expanded or collapsed
  }
}
```

### 4.9 Edge (Relationship) Structure
```javascript
{
  id: "edge_abc123",
  source: "node_1",              // Source node ID
  target: "node_2",              // Target node ID
  data: {
    relationType: "1:N",         // 1:1 or 1:N cardinality
    joinType: "LEFT",            // INNER, LEFT, RIGHT, FULL
    mappings: [                  // JOIN ON conditions
      {
        _id: 1,                  // Stable key for rendering
        source: "order_id",      // Source column
        target: "order_id",      // Target column
        operator: "="            // Comparison operator
      }
    ]
  }
}
```

### 4.10 Filter Structure
```javascript
{
  column: "amount",
  operator: ">=",                // =, >, <, >=, <=, <>, LIKE, IN, IS NULL, IS NOT NULL
  value: 1000,
  type: "int",                   // int, date, boolean, varchar
  columnType: "decimal",         // Raw DB type
  options: [],                   // For dropdown values
  loading: false
}
```

---

## 5. State Management (การจัดการ State)

### 5.1 Centralized Store: `chartdbStore.js`

ใช้ Vue `reactive()` เป็น centralized state (ไม่ใช้ Vuex/Pinia):

```javascript
const state = reactive({
  // Data
  tables: [],                    // Available tables from API
  modules: [],                   // Available modules
  nodes: [],                     // Canvas nodes (Vue Flow)
  edges: [],                     // Canvas edges (Vue Flow)

  // UI State
  isLoading: false,
  searchQuery: "",
  selectedModules: [],
  activeTab: "tables",           // "tables" | "layers"
  showRelationModal: false,
  showFilterModal: false,
  showTemplateModal: false,
  showResultModal: false,

  // Selection
  selectedNodeIds: [],
  selectedEdgeIds: [],
  focusedNodeId: null,

  // Viewport
  viewport: { x: 0, y: 0, zoom: 1 },

  // Output
  generatedSQL: "",
  debugInfo: ""
})
```

**Getters** (computed values):
```javascript
tableNodes      → nodes filtered by type "node-table"
groupNodes      → nodes filtered by type "node-group"
processNodes    → formula, aggregate, sort, union nodes
filteredTables  → tables filtered by search + module
selectedNodes   → nodes matching selectedNodeIds
hasNodes        → boolean: any nodes exist
focusedNode     → node matching focusedNodeId
```

**Actions** (mutations):
```javascript
// Data
setTables(tables), setModules(modules)

// Node CRUD
addNode(node), removeNode(id), updateNode(id, data), updateNodeData(id, partial)
setNodes(nodes)

// Edge CRUD
addEdge(edge), removeEdge(id), updateEdge(id, data)
setEdges(edges)

// Selection
selectNode(id), deselectNode(id), selectAllNodes(), deselectAllNodes()
focusNode(id)

// UI
setViewport(vp), openModal(name), closeModal(name)
setGeneratedSQL(sql), resetAll()
```

### 5.2 Data Layer State: `useChartDBState.js`

```javascript
const state = reactive({
  table: [],                     // Raw table list from API
  data_module: [],               // Module list with active flag
  module: "",                    // Current module filter
  debugInfo: "",
  header: {},                    // Current object header
  detail: [],                    // Current table columns
  log: [],                       // Debug log messages
  isBegin: false,
  isMounted: false
})
```

---

## 6. Core Business Logic (Composables)

### 6.1 Data Loading: `useChartDBData.js`

#### loadTableList()
```
Flow:
1. Call API: AnywhereAPI/Master/Addspec_Object_ReadList
2. Handle response format variations (array vs nested)
3. Map object_type codes to labels:
   T → Transaction, M → Master, F → Form, R → Report
   FN → Function, P → Procedure, O → Other
4. Deduplicate by table_name
5. Format dates (DD/MM/YYYY HH:mm)
6. Store in state.table[]
```

#### loadModuleList()
```
Flow:
1. Call API: AnywhereAPI/Master/Addspec_Module_ReadList
2. Initialize each module with active: false
3. Store in state.data_module[]
```

#### onRead(objectName, moduleName)
```
Flow:
1. Fetch object header → Addspec_Object_Read
   └─ Get all tables referenced by this object
   └─ Identify primary table (priority: H → D → M → O → V)

2. Fetch columns → Addspec_Object_table_detail_Read
   └─ Get column details for primary table

3. Fetch schema types → Addspec_Table_Read  ★ CRITICAL
   └─ Get actual DB column_type (not just ADDSPEC metadata)
   └─ Merge: schema column_type overrides ADDSPEC data_type
   └─ This enables: numeric detection, filter types, SQL formatting

4. Extract relationships from object_table[] where relation defined

5. Return:
   {
     header: { table_name, remark, object_name, module, labels },
     detail: [{ column_name, column_type, data_pk, remark }],
     relationships: [tables with relation info],
     allTables: [all referenced tables for auto-loading]
   }
```

### 6.2 Node Creation: `useNodeFactory.js`

#### createTableNode(tableName, moduleName, position, context)
```
Flow:
1. Call onRead() → fetch schema & relationships
2. Extract PK columns (data_pk="Y") for auto-visible
3. Create primary node:
   { type: "node-table", data: { label, tableName, details, visibleCols, filters } }

4. AUTO-LOAD RELATED TABLES (if object defines relationships):
   a. Grid layout: 3 columns × N rows (300px apart)
   b. For each related table:
      - Load columns via loadTableColumns()
      - Create node with auto-visible PKs
      - Create edge with relationship mappings
   c. Position relative to primary node
```

#### createProcessNode(type, position, context)
```
Creates: node-aggregate, node-sort, node-formula, node-union, node-group
Each initialized with empty data appropriate to type.
```

#### Edge Styling (getEdgeStyle):
```
INNER → color: #28a745 (green),  stroke: solid
LEFT  → color: #007bff (blue),   stroke: dashed "5 5"
RIGHT → color: #fd7e14 (orange), stroke: dashed "5 5"
FULL  → color: #6f42c1 (purple), stroke: dot-dash "2 4 8 4"
```

### 6.3 SQL Generation: `useSqlGenerator.js` ★ CORE ALGORITHM

#### Overall Strategy: CTE-based SQL
แปลง diagram เป็น SQL โดยใช้ Common Table Expressions (CTEs)

#### generateSQL() — Main Orchestrator
```
Algorithm:
1. Collect all nodes → separate into groups & process nodes

2. Process GROUP nodes (nested groups first via topological sort):
   └─ For each group:
     a. Find all nodes inside the group
     b. Find all edges between nodes inside the group
     c. Call generateInnerSQL(nodesInGroup, edgesInGroup, groupNode)
     d. Store as CTE: "WITH group_name AS (SELECT ...)"

3. Topologically sort PROCESS nodes (Kahn's algorithm):
   └─ Dependency order: Table → Formula → Aggregate → Sort → Union
   └─ For each process node:
     a. Find upstream CTE/table as source
     b. Generate SQL based on type:
        - Formula → generateFormulaSQL()
        - Aggregate → generateAggregateSQL()
        - Sort → generateSortSQL()
        - Union → generateUnionSQL()
     c. Store as CTE
     d. Extract output columns for downstream nodes

4. Find FINAL output node (deepest group or last process node)

5. Build final SQL:
   WITH cte1 AS (...),
        cte2 AS (...),
        cte3 AS (...)
   SELECT * FROM cte3

6. OPTIMIZE: Inline non-essential CTEs as subqueries
   (CTEs referenced only once → converted to nested subquery)
```

#### generateInnerSQL(nodesInGroup, edgesInGroup, groupNode)
```
Generates SQL for nodes inside a group:

1. Start with first table: SELECT visibleCols FROM tableName
2. For each connected table (via edges):
   JOIN joinType targetTable ON mapping.source = mapping.target
3. Apply WHERE filters from each node's filters[]
4. Return: SELECT cols FROM t1 JOIN t2 ON ... WHERE ...
```

#### generateFormulaSQL(node, sourceTable)
```
Output: SELECT *, (expression) AS alias FROM sourceTable
Example: SELECT *, (CASE WHEN amount > 1000 THEN amount * 0.1 ELSE 0 END) AS discount FROM CTE_Orders
```

#### generateAggregateSQL(node, sourceTable)
```
Output: SELECT groupBy[], metrics[] FROM sourceTable GROUP BY ... HAVING ...
Example: SELECT product_id, SUM(amount) AS total_amount
         FROM CTE_Orders GROUP BY product_id HAVING SUM(amount) > 1000

★ Validates columns against schema before generation
★ Metrics: SUM, AVG, COUNT, COUNT_DISTINCT, MIN, MAX
★ COUNT_DISTINCT → COUNT(DISTINCT column)
```

#### generateSortSQL(node, sourceTable)
```
Output: SELECT * FROM sourceTable ORDER BY col1 ASC, col2 DESC
```

#### generateUnionSQL(node, unionSources)
```
Output: SELECT cols FROM source1 UNION [ALL] SELECT cols FROM source2
★ Validates column alignment (count & names must match)
```

#### Column Collection: collectColumnsFromNode(node)
```
Extracts available columns for downstream nodes:
- Table node → visibleCols[]
- Formula node → upstream cols + alias
- Aggregate node → groupBy[] + metric aliases
- Union node → availableCols[]
```

### 6.4 SQL Import: `useSqlImport.js`

#### importSqlToCanvas(rawSql, schemaCache) — Main Import Function
```
Algorithm:
1. Split SQL by UNION/UNION ALL (respecting subquery depth)
   └─ splitUnionParts(sql) → [{ sql, unionType }]

2. For each SELECT part:
   a. _parseSingleSelect() → Extract tables, aliases, join types
   b. _createNodesAndEdges() → Create table nodes with columns + join edges
      - Auto grid layout: 3 columns × N rows
      - Load schema for each table via API
      - Create edges with mappings from ON clauses
   c. _parseSelectList() → Set visibleCols for each node
      - Handle: table.column, aliased, expressions, wildcards
   d. _parseWhere() → Extract WHERE conditions → node.data.filters
   e. _parseGroupBy() → Create aggregate node if GROUP BY found
   f. _parseOrderBy() → Create sort node if ORDER BY found

3. If multiple UNION parts → create union node connecting all sources

4. Auto-layout all nodes on canvas
```

#### Key Parser Functions:
```
splitSelectFields(rawSelect)
  → Splits "a.col1, ISNULL(b.col2, 0), c.col3"
  → Respects parenthesis depth (won't split inside function calls)

splitUnionParts(sql)
  → Splits "SELECT ... UNION ALL SELECT ..."
  → Tracks parenthesis depth to skip UNION inside subqueries
  → Returns: [{ sql, unionType }]
```

### 6.5 Undo/Redo: `useHistory.js`

```
Architecture: Snapshot-based state machine

State:
  history[]      → Array of snapshots (max 50)
  historyIndex   → Current position
  isUndoing      → Flag to prevent recording during undo/redo

Snapshot = {
  nodes: deep_clone(nodes),
  edges: deep_clone(edges)
}

Functions:
  recordHistory()  → Debounced 300ms, takes snapshot on change
  undo()           → historyIndex--, restore snapshot
  redo()           → historyIndex++, restore snapshot
  initHistory()    → Create initial snapshot

Watcher: Deep watch on [nodes, edges] → auto recordHistory()
         (skipped when isUndoing = true)
```

### 6.6 Drag & Drop: `useDrag_Drop.js`

```
Drag Sources:
  - Left panel tables → creates node-table
  - Right panel tools → creates process nodes

onDrop(event):
  1. Parse dataTransfer: { type, payload }
  2. Convert screen coords → canvas coords (Vue Flow project())
  3. type === "table" → createTableNode(payload)
  4. type === "tool"  → createProcessNode(payload.type)

onNodeDragStop(event):
  1. Check if node was dropped inside a group
  2. Update parentNode reference
  3. Reorder z-index layers

Z-Index Strategy:
  Selected nodes:  3000
  Normal nodes:    1500
  Child of group:  2000
  Groups:          100 + (depth × 10)
```

### 6.7 Flow Events: `useFlowEvents.js`

#### Edge Connection
```
When user connects two nodes:
1. Validate connection (no self-loops, no duplicates)
2. Create edge with default:
   joinType: "LEFT", relationType: "1:N", mappings: []
3. Open relation modal for mapping configuration
```

#### Relation Modal
```
prepareModalData(edgeId):
  1. Get source & target nodes
  2. Extract columns from both (getCols)
  3. Build tempRelation state with mappings

saveRelation():
  1. Update edge.data.mappings
  2. Update edge.data.joinType
  3. Propagate changes to downstream nodes (updateDownstreamNodes)
```

#### getCols(node) — Column Extraction by Type
```
node-table    → visibleCols or details
node-formula  → single column: { name: alias, type: "varchar" }
node-aggregate → groupBy[] + metric aliases
node-union    → availableCols[]
node-group    → recursively collect from child nodes
```

### 6.8 Node Logic: `useNodeLogic.js`

```
handleEditFilter(nodeId):
  1. Collect available columns from node
  2. Load existing filters
  3. Open filter modal

saveFilterModal():
  1. Validate filters
  2. Update node.data.filters[]
  3. Propagate changes downstream

handleEditColumns(nodeId):
  1. List all available columns
  2. Show current visibleCols
  3. Allow reordering, add/remove
```

### 6.9 Persistence: `usePersistence.js`

```
Storage Key: "chartdb_save_data_v1"

restoreFlowState(externalData):
  1. Load from parameter or localStorage
  2. Reconstruct isPk flags from details
  3. Sort visibleCols (PKs first)
  4. Restore nodes, edges, viewport

Save Format:
{
  nodes: [Node],
  edges: [Edge],
  viewport: { x, y, zoom }
}
```

### 6.10 Keyboard Shortcuts: `useKeyboardShortcuts.js`

```
Delete     → Remove selected nodes
Ctrl+A     → Select all nodes
Ctrl+C     → Copy selected nodes & connected edges
Ctrl+V     → Paste with offset (+60px each paste)
Ctrl+Z     → Undo
Ctrl+Y     → Redo
Escape     → Close modals

Clipboard: { nodes: deep_clone[], edges: filtered_clone[] }
(Only edges where BOTH endpoints are selected)
```

### 6.11 Template System: `useTemplateSystem.js`

```
exportToJSON():
  1. Validate flow structure
  2. Generate JSON payload
  3. Download as .json file

exportToSQL():
  1. Generate SQL via useSqlGenerator
  2. Download as .sql file

saveTemplate(name):
  1. Serialize nodes, edges, viewport
  2. Save to localStorage/API
  3. Show success toast

loadTemplate(id):
  1. Fetch saved template
  2. Confirm canvas clear
  3. Call restoreFlowState()
```

### 6.12 JSON Generation: `useJsonGenerator.js`

```
Output Structure:
{
  sources: [{ id, table_name, display_label, alias, type }],
  joins: [{
    join_type, target_table_alias, target_table_name,
    conditions: [{ left: "t1.col", operator: "=", right: "t2.col" }]
  }],
  columns: [{ expression, alias, source_table }],
  filters: [{ column, operator, value, type }],
  group_by: ["col1", "col2"],
  having: [{ column, operator, value }],
  order_by: [{ column, direction }]
}
```

---

## 7. Data Type System

### 7.1 Supported Types (38 types)

| Category | Types |
|----------|-------|
| Numeric (13) | int, integer, bigint, smallint, tinyint, decimal, numeric, float, double, real, money, smallmoney, number |
| String (10) | char, varchar, nchar, nvarchar, text, ntext, sysname, xml |
| Date (7) | date, datetime, datetime2, datetimeoffset, smalldatetime, time, timestamp, year |
| Binary (3) | binary, varbinary, image |
| Special (6) | bit, geography, geometry, hierarchyid, sql_variant, uniqueidentifier |

### 7.2 Type Helper Functions
```javascript
isNumericColType(type)  → boolean   // ตรวจว่าเป็น numeric type
isDateColType(type)     → boolean   // ตรวจว่าเป็น date type
isStringColType(type)   → boolean   // ตรวจว่าเป็น string type
getFilterType(colType)  → "int" | "date" | "boolean" | "varchar"
getColTypeBadge(colType)→ "NUM" | "DATE" | "TEXT" | "BIT" | "BIN"
```

### 7.3 SQL Value Formatting
```javascript
formatSQLValue(value, colType):
  - Numeric types → raw number (no quotes)
  - String types  → 'escaped''value' (single quotes, escaped)
  - Date types    → 'YYYY-MM-DD' format
  - NULL          → NULL keyword
```

---

## 8. Validation System

### File: `utils/validation.js`

```
validateNodeData(nodeData)          → Check node data structure integrity
validateMetric(metric)              → Validate aggregate metric (column, func, alias)
validateFormula(formula)            → Check expression & alias exist
validateConnectionMapping(mapping)  → Validate edge mappings (source, target, operator)
detectCircularDependency(nodes, edges) → DFS cycle detection in flow graph
validateFlowStructure(nodes, edges) → Complete flow validation
validateTemplateData(data)          → Template structure check
sanitizeInput(input)                → XSS prevention (strip HTML tags)
isValidColumnName(name)             → SQL identifier validation (alphanumeric + _)
```

---

## 9. API Endpoints

### Data Loading APIs
```
GET  AnywhereAPI/Master/Addspec_Object_ReadList
  → Returns: [{ object_name, object_type, module, table_name, remark, editdate }]

GET  AnywhereAPI/Master/Addspec_Module_ReadList
  → Returns: [{ module, ... }]

GET  AnywhereAPI/Master/Addspec_Object_Read?object_name=X
  → Returns: { header, object_table: [{ table_name, use_type, relation }] }

GET  AnywhereAPI/Master/Addspec_Object_table_detail_Read?table_name=X
  → Returns: [{ column_name, column_type, data_type, data_pk, remark }]

GET  AnywhereAPI/Master/Addspec_Table_Read?table_name=X
  → Returns: { detail: [{ COLUMN_NAME, DATA_TYPE, COLUMN_KEY, COLUMN_COMMENT }] }
```

### Object Type Codes
```
T  → Transaction (รายการ)
M  → Master (ข้อมูลหลัก)
F  → Form (แบบฟอร์ม)
R  → Report (รายงาน)
FN → Function
P  → Procedure
O  → Other
```

### Use Type Codes
```
H → Header (หัวข้อ)
D → Detail (รายละเอียด)
U → Update
V → View
O → Other
M → Master
```

---

## 10. Theme & Styling

### CSS Variables (Dark Theme Default)
```css
--cdb-primary:      #6964fc   /* Purple - main accent */
--cdb-success:      #28a745   /* Green - INNER join, success */
--cdb-info:         #007bff   /* Blue - LEFT join, info */
--cdb-warning:      #fd7e14   /* Orange - RIGHT join, warning */
--cdb-danger:       #dc3545   /* Red - danger, delete */

--cdb-bg-main:      #1C1D24   /* Canvas background */
--cdb-bg-panel:     #23242C   /* Side panels */
--cdb-bg-secondary: rgba(44,46,53,0.95)
--cdb-bg-item:      #2D2E35   /* List items */
--cdb-bg-item-hover:#3E3F46   /* Hover state */

--cdb-border:       #3E3F46
--cdb-text:         #E9E9E9
--cdb-text-muted:   #76777C

--cdb-input-bg:     #23242C
--cdb-input-focus:  #2D2E35
```

### Node Colors
```
TABLE:     #343a40 (dark gray)
GROUP:     #6964fc (purple)
AGGREGATE: #fd7e14 (orange)
FORMULA:   #17a2b8 (teal)
SORT:      #28a745 (green)
UNION:     — (uses default)
WHERE:     — (uses default)
```

---

## 11. Key Workflows (User Journeys)

### Workflow 1: สร้าง Query จาก Drag & Drop
```
1. User เปิดหน้า /page/chartdb
2. ระบบโหลด loadTableList() + loadModuleList()
3. แผงซ้ายแสดงรายการตาราง (grouped by module)
4. User ลากตารางวางบน canvas
   → useDrag_Drop.onDrop()
   → useNodeFactory.createTableNode()
   → Auto-loads related tables & creates edges
5. User ลากตารางอีกตัวมาวาง
6. User เชื่อมต่อ 2 nodes ด้วยเส้น
   → useFlowEvents: create edge
   → เปิด relation modal
7. User กำหนด JOIN type + column mappings
   → useFlowEvents.saveRelation()
8. User เพิ่ม aggregate node จากแผงขวา
   → ลากวาง → เชื่อมต่อ
   → กำหนด groupBy + metrics
9. ระบบ generate SQL อัตโนมัติ
   → useSqlGenerator.generateSQL()
10. User กด Export → ดาวน์โหลด SQL/JSON
```

### Workflow 2: Import SQL
```
1. User กด Import SQL ที่ header
2. เปิด ImportSqlModal → วาง SQL text
3. กด "Build Diagram"
   → useSqlImport.importSqlToCanvas()
   → Parse SELECT, FROM, JOIN, ON, WHERE, GROUP BY, ORDER BY
   → สร้าง nodes & edges อัตโนมัติ
   → Auto-layout บน canvas
4. User สามารถแก้ไข diagram ต่อได้
```

### Workflow 3: Save & Load Template
```
Save:
1. User สร้าง diagram เสร็จ
2. กด Save Template → ตั้งชื่อ
3. useTemplateSystem.saveTemplate() → localStorage/API

Load:
1. User กด Load Template
2. เลือก template จากรายการ
3. ยืนยัน clear canvas
4. usePersistence.restoreFlowState() → วาง nodes/edges/viewport
```

### Workflow 4: Undo/Redo
```
1. ทุกการเปลี่ยนแปลง nodes/edges → watcher จับ
2. useHistory.recordHistory() (debounced 300ms)
3. Deep clone snapshot เก็บใน history[] (max 50)
4. User กด Ctrl+Z → undo() → restore previous snapshot
5. User กด Ctrl+Y → redo() → restore next snapshot
```

---

## 12. Critical Algorithms Detail

### 12.1 Topological Sort (Kahn's Algorithm) — ใช้ใน SQL Generation

```
Purpose: Sort process nodes by dependency order
         เพื่อให้ CTE ที่ถูกอ้างอิงถูกสร้างก่อน

Algorithm:
1. Build adjacency list from edges
2. Calculate in-degree for each node
3. Queue all nodes with in-degree 0
4. While queue not empty:
   a. Dequeue node
   b. Add to sorted result
   c. For each outgoing edge:
      - Decrease target's in-degree
      - If target in-degree = 0, enqueue
5. If sorted.length < total nodes → circular dependency detected
```

### 12.2 Circular Dependency Detection (DFS)

```
Purpose: ป้องกัน infinite loop ใน flow graph

Algorithm:
1. For each unvisited node:
   a. Mark as "visiting" (gray)
   b. DFS all neighbors:
      - If neighbor is "visiting" → CYCLE FOUND
      - If neighbor is "unvisited" → recurse
   c. Mark as "visited" (black)
2. Return: { hasCycle: boolean, cycleNodes: [] }
```

### 12.3 CTE Inlining Optimization

```
Purpose: ลด CTE ที่ไม่จำเป็น → แปลงเป็น subquery

Algorithm:
1. Count references to each CTE name in final SQL
2. For CTEs referenced only ONCE:
   a. Replace "FROM cte_name" with "FROM (cte_sql) AS cte_name"
   b. Remove from WITH clause
3. Keep CTEs referenced multiple times
```

### 12.4 SQL Import Parser — Parenthesis Tracking

```
Purpose: Split SQL ได้ถูกต้องแม้มี nested functions

splitSelectFields("a.col, ISNULL(b.col, 0), c.col"):
  depth = 0
  For each character:
    '(' → depth++
    ')' → depth--
    ',' && depth === 0 → SPLIT HERE
  Result: ["a.col", "ISNULL(b.col, 0)", "c.col"]
```

---

## 13. Embed Mode

### File: `Embed/ChartDBEmbed.vue` + `useEmbedAuth.js`

```
Purpose: แชร์ diagram โดยไม่ต้อง login

Route: /page/embed/chartdb
Authentication: Passcode-based (not session)

Flow:
1. User เข้า URL → ถูกถาม passcode
2. useEmbedAuth.verifyPasscode() → validate
3. If valid → show full ChartDB canvas (100vh, no AdminLTE wrapper)
4. Same features as normal mode
```

---

## 14. Testing Strategy

### Unit Tests (Vitest)
```
20 test files covering:
- useSqlGenerator.test.js       → SQL generation correctness
- useSqlImport.test.js          → SQL parsing accuracy
- useFlowEvents.test.js         → Edge validation
- useHistory.test.js            → Undo/redo state
- useNodeFactory.test.js        → Node creation
- useNodeLogic.test.js          → Node operations
- useDrag_Drop.test.js          → Drag/drop handlers
- useTemplateSystem.test.js     → Template CRUD
- useChartDBData.test.js        → Data loading
- sort_node.test.js             → Sort node component
- table_node.test.js            → Table node component
- ConfirmModal.test.js          → Modal component
- useEmbedAuth.test.js          → Embed authentication
```

### E2E Tests (Playwright)
```
- auth.setup.js                 → Login flow
- chartdb-page.spec.js          → Page load & navigation
- chartdb-canvas.spec.js        → Canvas interactions
- chartdb-sql.spec.js           → SQL generation validation
```

---

## 15. สรุปสำหรับ AI ที่จะสร้างโปรเจกต์ใหม่

### สิ่งที่ต้องสร้าง:
1. **Canvas Engine** — ใช้ Vue Flow หรือ React Flow สำหรับ diagram editor
2. **Node System** — 8 node types ที่แปลงเป็น SQL clauses
3. **Edge System** — เส้นเชื่อมที่เก็บ JOIN type + column mappings
4. **SQL Generator** — CTE-based generation with topological sort
5. **SQL Parser** — Import SQL text → auto-create nodes
6. **State Management** — Centralized reactive state + composable pattern
7. **Undo/Redo** — Snapshot-based history (max 50)
8. **Persistence** — localStorage save/restore
9. **Template System** — Save/load named templates
10. **Validation** — Circular dependency detection, column validation, XSS prevention

### Design Principles:
- **Composable Pattern** — แยก logic เป็น modules ย่อยๆ (15 composables)
- **CTE-first SQL** — ใช้ WITH clause เป็นหลัก ไม่ใช้ nested subquery ตรงๆ
- **Type Safety** — Enrich column types จาก schema จริง ไม่ใช่แค่ metadata
- **Offline-first** — LocalStorage persistence, ทำงานได้โดยไม่ต้องเชื่อมต่อ API ตลอด
- **Auto-layout** — Grid layout 3 columns สำหรับ auto-created nodes
- **Downstream Propagation** — เมื่อแก้ไข node → propagate changes ไปยัง nodes ที่อยู่ downstream

### Node → SQL Mapping:
```
node-table     → FROM table / JOIN table ON ...
node-group     → WITH cte_name AS (SELECT ... FROM ... JOIN ...)
node-formula   → SELECT *, (expr) AS alias FROM ...
node-aggregate → SELECT groupBy, AGG(col) FROM ... GROUP BY ... HAVING ...
node-where     → ... WHERE conditions ...
node-sort      → ... ORDER BY col1 ASC, col2 DESC
node-union     → SELECT ... UNION [ALL] SELECT ...
```
