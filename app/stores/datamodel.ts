import { defineStore } from 'pinia'
import type { DataRow } from './canvas'
import type { ColMeta } from '~/utils/columnMapping'
import { metaToColType, isDateMeta } from '~/utils/columnMapping'
import type { TransformConfig, TransformFilter } from '~/utils/transformData'
import type { NumericFormat } from '~/utils/formatValue'

export type { NumericFormat }

export interface ModelTable {
  id:             string
  name:           string
  rows:           DataRow[]
  columnLabels?:  Record<string, ColMeta>   // ColumnName → { label, dataType }
  sqlText?:       string                    // SQL ที่ใช้ดึงข้อมูล — ใช้ re-execute เพื่อ fresh data
  columnMapping?: string                    // JSON ColumnMapEntry[] สำหรับ rename columns
}

export type JoinType    = 'inner' | 'left' | 'right'
export type Cardinality = '1:1'   | '1:*'  | '*:1'  | '*:*'

export interface ModelRelation {
  fromTable:   string
  fromColumn:  string
  toTable:     string
  toColumn:    string
  joinType:    JoinType
  cardinality: Cardinality
}

export interface CanvasNode { id: string; position: { x: number; y: number } }
export interface CanvasEdge { id: string; source: string; target: string; [k: string]: any }

export const useDataModelStore = defineStore('datamodel', () => {
  const tables         = ref<ModelTable[]>([])
  const relations      = ref<Record<string, ModelRelation>>({})
  const transforms     = ref<Record<string, TransformConfig>>({})
  const nodeFilters    = ref<Record<string, TransformFilter[]>>({})
  const numericFormats = ref<Record<string, NumericFormat>>({})   // keyed by compKey
  const canvasNodes    = ref<CanvasNode[]>([])
  const canvasEdges    = ref<CanvasEdge[]>([])
  const canvasSavedId  = ref<string | null>(null)
  const canvasSaveName = ref('')
  const tableLoading   = ref<Record<string, boolean>>({})

  function saveCanvas(ns: CanvasNode[], es: CanvasEdge[], savedId?: string | null, saveName?: string) {
    canvasNodes.value  = ns
    canvasEdges.value  = es
    if (savedId  !== undefined) canvasSavedId.value  = savedId
    if (saveName !== undefined) canvasSaveName.value = saveName
  }

  function clearCanvas() {
    canvasNodes.value  = []
    canvasEdges.value  = []
    canvasSavedId.value  = null
    canvasSaveName.value = ''
  }

  function addTable(table: ModelTable) {
    if (!tables.value.some(t => t.id === table.id)) {
      tables.value.push(table)
    }
  }

  function removeTable(id: string) {
    tables.value = tables.value.filter(t => t.id !== id)
    for (const key of Object.keys(relations.value)) {
      const r = relations.value[key]
      if (r && (r.fromTable === id || r.toTable === id)) delete relations.value[key]
    }
    delete nodeFilters.value[id]
    delete numericFormats.value[id]
    delete tableLoading.value[id]
  }

  function setTableLoading(id: string, val: boolean) {
    if (val) tableLoading.value[id] = true
    else delete tableLoading.value[id]
  }

  function isTableLoading(id: string): boolean {
    return !!tableLoading.value[id]
  }

  function getTable(id: string) {
    return tables.value.find(t => t.id === id)
  }

  function updateTableRows(id: string, rows: DataRow[]) {
    const idx = tables.value.findIndex(t => t.id === id)
    if (idx !== -1) tables.value[idx] = { ...tables.value[idx]!, rows }
  }

  function columnsOf(tableId: string): { name: string; label: string; type: 'number' | 'string' | 'date' }[] {
    const t = getTable(tableId)
    if (!t?.rows.length) return []
    const first = t.rows[0]!
    return Object.keys(first).map(name => {
      const meta = t.columnLabels?.[name]
      return {
        name,
        label: meta?.label || name,
        type:  isDateMeta(meta, first[name]) ? 'date' : metaToColType(meta, first[name]),
      }
    })
  }

  function setRelation(edgeId: string, rel: ModelRelation) {
    relations.value[edgeId] = rel
  }

  function removeRelation(edgeId: string) {
    delete relations.value[edgeId]
  }

  function setTransform(compKey: string, cfg: TransformConfig) {
    transforms.value[compKey] = cfg
  }

  function getTransform(compKey: string): TransformConfig | null {
    return transforms.value[compKey] ?? null
  }

  function removeTransform(compKey: string) {
    delete transforms.value[compKey]
  }

  function setNodeFilters(tableId: string, filters: TransformFilter[]) {
    nodeFilters.value[tableId] = filters
  }

  function getNodeFilters(tableId: string): TransformFilter[] {
    return nodeFilters.value[tableId] ?? []
  }

  function removeNodeFilters(tableId: string) {
    delete nodeFilters.value[tableId]
  }

  function setNumericFormat(compKey: string, fmt: NumericFormat) {
    numericFormats.value[compKey] = { ...numericFormats.value[compKey], ...fmt }
  }

  function getNumericFormat(compKey: string): NumericFormat {
    return numericFormats.value[compKey] ?? {}
  }

  return {
    tables, relations, transforms, nodeFilters, numericFormats,
    canvasNodes, canvasEdges, canvasSavedId, canvasSaveName,
    addTable, removeTable, getTable, updateTableRows, columnsOf,
    tableLoading, setTableLoading, isTableLoading,
    setRelation, removeRelation,
    setTransform, getTransform, removeTransform,
    setNodeFilters, getNodeFilters, removeNodeFilters,
    setNumericFormat, getNumericFormat,
    saveCanvas, clearCanvas,
  }
})
