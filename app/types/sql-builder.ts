/**
 * SQL Builder — Type definitions
 * Based on ChartDB System Workflow architecture
 */
import type { Node, Edge } from '@vue-flow/core'

// ── JOIN ────────────────────────────────────────────────────────────────────

export const JOIN_TYPES = [
  'LEFT JOIN', 'INNER JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN',
] as const
export type JoinType = typeof JOIN_TYPES[number]

export const JOIN_COLORS: Record<JoinType, string> = {
  'LEFT JOIN':  'bg-sky-500/20 text-sky-600 border-sky-500/40',
  'INNER JOIN': 'bg-emerald-500/20 text-emerald-600 border-emerald-500/40',
  'RIGHT JOIN': 'bg-violet-500/20 text-violet-600 border-violet-500/40',
  'FULL JOIN':  'bg-orange-500/20 text-orange-600 border-orange-500/40',
  'CROSS JOIN': 'bg-rose-500/20 text-rose-600 border-rose-500/40',
}

export const JOIN_EDGE_COLORS: Record<JoinType, string> = {
  'LEFT JOIN':  '#0ea5e9',
  'INNER JOIN': '#10b981',
  'RIGHT JOIN': '#8b5cf6',
  'FULL JOIN':  '#f97316',
  'CROSS JOIN': '#f43f5e',
}

const JOIN_DASH: Record<JoinType, string | undefined> = {
  'INNER JOIN': undefined,
  'LEFT JOIN':  '6 3',
  'RIGHT JOIN': '6 3',
  'FULL JOIN':  '2 4 8 4',
  'CROSS JOIN': '4 4',
}

export interface EdgeStyleConfig {
  label: string
  style: { stroke: string; strokeWidth: number; strokeDasharray?: string }
  labelStyle: { fontSize: string; fontWeight: number; fill: string }
  labelBgStyle: { fill: string }
  labelBgPadding: [number, number]
  labelBgBorderRadius: number
  labelShowBg: boolean
}

export function getEdgeStyle(joinType: JoinType): EdgeStyleConfig {
  const color = JOIN_EDGE_COLORS[joinType]
  const dash  = JOIN_DASH[joinType]
  return {
    label:              joinType,
    style:              { stroke: color, strokeWidth: 2, ...(dash ? { strokeDasharray: dash } : {}) },
    labelStyle:         { fontSize: '10px', fontWeight: 700, fill: '#fff' },
    labelBgStyle:       { fill: color },
    labelBgPadding:     [4, 2],
    labelBgBorderRadius: 4,
    labelShowBg:        true,
  }
}

// ── Tool Node Types ─────────────────────────────────────────────────────────

export type ToolId = 'cte' | 'calc' | 'group' | 'sort' | 'union' | 'where'

export interface ToolDefinition {
  id:     ToolId
  icon:   any        // Lucide icon component
  color:  string
  bg:     string
  border: string
  label:  string
  desc:   string
}

export interface ToolMeta {
  label:  string
  color:  string
  bg:     string
  border: string
}

// ── Node Data ───────────────────────────────────────────────────────────────

export interface SqlTableNodeData {
  label:            string
  tableName:        string
  objectName?:      string
  module:           string
  type:             string   // object_type: T, V, FN, R, SP
  ttype?:           string   // t_object_name
  useType?:         string   // H, D, M, O, V, U
  objectTypeLabel?: string   // Transaction, Master, Report …
  useTypeLabel?:    string   // Header, Detail, Update …
  isHeaderNode?:    boolean
  details?:         ColumnInfo[]    // ALL columns from DB schema
  visibleCols?:     VisibleCol[]    // SELECTED columns to use in SQL
  filters?:         FilterCondition[]
  columnsLoading?:  boolean
}

export interface ColumnInfo {
  column_name: string
  column_type: string
  data_type:   string
  data_pk:     'Y' | 'N'
  remark:      string
}

export interface VisibleCol {
  name:   string
  type:   string
  remark: string
  isPk:   boolean
  alias:  string
}

export const OBJECT_TYPE_LABELS: Record<string, string> = {
  T:  'Transaction',
  M:  'Master',
  F:  'Form',
  R:  'Report',
  FN: 'Function',
  P:  'Procedure',
  O:  'Other',
  V:  'View',
  SP: 'Procedure',
}

export const USE_TYPE_LABELS: Record<string, string> = {
  H: 'Header',
  D: 'Detail',
  U: 'Update',
  V: 'View',
  O: 'Other',
  M: 'Master',
}

export interface FilterCondition {
  column:   string
  operator: FilterOperator
  value:    string
  type:     'int' | 'date' | 'boolean' | 'varchar'
}

export type FilterOperator =
  | '=' | '!=' | '>' | '<' | '>=' | '<='
  | 'LIKE' | 'IN' | 'IS NULL' | 'IS NOT NULL'

// ── Tool Node Data ──────────────────────────────────────────────────────────

export interface CteNodeData {
  nodeType:     'cte'
  _toolId:      'cte'
  name:         string          // CTE name used in WITH clause
  selectedCols: string[]        // columns to SELECT (empty = *)
  conditions:   WhereCondition[] // WHERE filter
}

export interface CalcItem {
  col:   string
  op:    string
  value: string
  alias: string
}

export interface CalcNodeData {
  nodeType: 'calc'
  _toolId:  'calc'
  items:    CalcItem[]
}

export interface AggItem {
  col:   string
  func:  AggFunc
  alias: string
}

export type AggFunc = 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX' | 'COUNT DISTINCT'

export const AGG_FUNCS: AggFunc[] = ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'COUNT DISTINCT']

export interface HavingCondition {
  column:   string
  operator: string
  value:    string
}

export interface GroupNodeData {
  nodeType:  'group'
  _toolId:   'group'
  groupCols: string[]
  aggs:      AggItem[]
  filters:   HavingCondition[]
}

export interface SortItem {
  col: string
  dir: 'ASC' | 'DESC'
}

export interface SortNodeData {
  nodeType: 'sort'
  _toolId:  'sort'
  items:    SortItem[]
}

export interface UnionNodeData {
  nodeType:        'union'
  _toolId:         'union'
  name:            string                      // optional CTE name (empty = auto _cteN)
  unionType:       'UNION' | 'UNION ALL'
  selectedCols:    string[]                    // legacy / global fallback (empty = SELECT *)
  selectedColsMap: Record<string, string[]>   // per-sourceId column selection
  conditions:      WhereCondition[]           // optional WHERE filter applied after UNION
}

export interface WhereCondition {
  column:   string
  operator: FilterOperator
  value:    string
}

export interface WhereNodeData {
  nodeType:   'where'
  _toolId:    'where'
  conditions: WhereCondition[]
}

export type ToolNodeData =
  | CteNodeData | CalcNodeData | GroupNodeData
  | SortNodeData | UnionNodeData | WhereNodeData

// ── Flow Aliases ────────────────────────────────────────────────────────────

export type SqlNode = Node<SqlTableNodeData | ToolNodeData>
export type SqlEdge = Edge<{ joinType: JoinType; mappings?: EdgeMapping[] }>

export interface EdgeMapping {
  _id:      number
  source:   string
  target:   string
  operator: string
}

// ── Group CTE Node ───────────────────────────────────────────────────────────

export interface GroupCteNodeData {
  label:  string   // CTE name (used in WITH clause)
  isOpen: boolean  // Expanded (showing children) or collapsed
}

// ── Tool Defaults ───────────────────────────────────────────────────────────

export const TOOL_NODE_DEFAULTS: Record<ToolId, ToolNodeData> = {
  cte:   { nodeType: 'cte',   _toolId: 'cte',   name: 'my_cte', selectedCols: [], conditions: [] },
  calc:  { nodeType: 'calc',  _toolId: 'calc',   items: [], filters: [] },
  group: { nodeType: 'group', _toolId: 'group',  groupCols: [], aggs: [], filters: [] },
  sort:  { nodeType: 'sort',  _toolId: 'sort',   items: [] },
  union: { nodeType: 'union', _toolId: 'union',  name: '', unionType: 'UNION ALL', selectedCols: [], selectedColsMap: {}, conditions: [] },
  where: { nodeType: 'where', _toolId: 'where',  conditions: [] },
}

// ── ERP Data ────────────────────────────────────────────────────────────────

export interface ErpModule {
  module: string
}

export interface ErpObject {
  object_name:   string
  object_type:   string
  module:        string
  table_name?:   string
  remark?:       string
  t_object_name?: string
}

// ── History ─────────────────────────────────────────────────────────────────

export interface HistorySnapshot {
  nodes: Node[]
  edges: Edge[]
}

// ── Persistence ─────────────────────────────────────────────────────────────

export interface SavedFlowState {
  nodes:    Node[]
  edges:    Edge[]
  viewport: { x: number; y: number; zoom: number }
}

export const STORAGE_KEY    = 'mangobi_sql_builder_v1'
export const TEMPLATES_KEY  = 'mangobi_sql_templates_v1'

// ── Column Type Helpers ──────────────────────────────────────────────────────

// Use prefix-based matching so modifiers like `int identity`, `decimal(18,2)`,
// `datetime2(7)` are classified correctly (not as varchar).
const NUM_RE  = /^(int|integer|bigint|smallint|tinyint|decimal|numeric|float|double precision|double|real|money|smallmoney|number)(\s|\(|$)/
const DATE_RE = /^(datetime2|datetimeoffset|smalldatetime|datetime|date|time|timestamp|year)(\s|\(|$)/
const BIT_RE  = /^(bit|bool|boolean)$/
const BIN_RE  = /^(binary|varbinary|image)(\s|\(|$)/

function normType(colType: string): string { return (colType ?? '').toLowerCase().trim() }

/** Soft variant — for use on light backgrounds (badges inside lists, filter hints) */
export function getColTypeBadge(colType: string): { label: string; cls: string } {
  const t = normType(colType)
  if (NUM_RE.test(t))  return { label: 'NUM',  cls: 'bg-blue-500/20   text-blue-500'    }
  if (DATE_RE.test(t)) return { label: 'DATE', cls: 'bg-amber-500/20  text-amber-600'   }
  if (BIT_RE.test(t))  return { label: 'BIT',  cls: 'bg-violet-500/20 text-violet-500'  }
  if (BIN_RE.test(t))  return { label: 'BIN',  cls: 'bg-zinc-500/20   text-zinc-500'    }
  return { label: 'TXT', cls: 'bg-emerald-500/20 text-emerald-600' }
}

/** Solid variant — for use inside dark nodes / canvas cards */
export function getColTypeBadgeSolid(colType: string): { label: string; cls: string } {
  const t = normType(colType)
  if (NUM_RE.test(t))  return { label: 'NUM',  cls: 'bg-blue-500   text-white' }
  if (DATE_RE.test(t)) return { label: 'DATE', cls: 'bg-amber-500  text-white' }
  if (BIT_RE.test(t))  return { label: 'BIT',  cls: 'bg-violet-500 text-white' }
  if (BIN_RE.test(t))  return { label: 'BIN',  cls: 'bg-zinc-500   text-white' }
  return { label: 'TXT', cls: 'bg-emerald-500 text-white' }
}

export function getFilterType(colType: string): 'int' | 'date' | 'boolean' | 'varchar' {
  const t = normType(colType)
  if (NUM_RE.test(t))  return 'int'
  if (DATE_RE.test(t)) return 'date'
  if (BIT_RE.test(t))  return 'boolean'
  return 'varchar'
}

// ── Group Create Modal ───────────────────────────────────────────────────────

export interface GroupRelation {
  rel:           any
  relTable:      string
  label:         string
  srcCol:        string
  tgtCol:        string
  srcCols?:      string[]   // all columns from col_relation (comma-separated)
  tgtCols?:      string[]   // all columns from col_relation2 (comma-separated)
  tableRelation?: string    // which table to join FROM (from table_relation field)
  joinType?:     string     // INNER JOIN / LEFT JOIN etc.
}

export interface GroupModalData {
  primaryId:         string
  primaryTableName:  string
  primaryLabel:      string
  obj:               any
  relations:         GroupRelation[]
}

// ── Template ─────────────────────────────────────────────────────────────────

export interface SavedTemplate {
  id:        string
  name:      string
  nodes:     Node[]
  edges:     Edge[]
  createdAt: string
}
