import { defineStore } from 'pinia'
import type { DataRow } from './canvas'
import type { ColMeta } from '~/utils/columnMapping'
import { metaToColType, isDateMeta } from '~/utils/columnMapping'
import type { TransformConfig, TransformFilter } from '~/utils/transformData'

export interface ModelTable {
  id:           string
  name:         string
  rows:         DataRow[]
  columnLabels?: Record<string, ColMeta>   // ColumnName → { label, dataType }
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

export const useDataModelStore = defineStore('datamodel', () => {
  const tables      = ref<ModelTable[]>([])
  const relations   = ref<Record<string, ModelRelation>>({})
  const transforms  = ref<Record<string, TransformConfig>>({})
  const nodeFilters = ref<Record<string, TransformFilter[]>>({})

  function addTable(table: ModelTable) {
    if (!tables.value.find(t => t.id === table.id)) {
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
  }

  function getTable(id: string) {
    return tables.value.find(t => t.id === id)
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

  return {
    tables, relations, transforms, nodeFilters,
    addTable, removeTable, getTable, columnsOf,
    setRelation, removeRelation,
    setTransform, getTransform, removeTransform,
    setNodeFilters, getNodeFilters, removeNodeFilters,
  }
})
