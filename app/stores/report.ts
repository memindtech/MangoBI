import { defineStore } from 'pinia'
import type { DataRow } from './canvas'
import type { ColMeta } from '~/utils/columnMapping'
import { metaToColType, isDateMeta } from '~/utils/columnMapping'
import type { NumericFormat } from '~/utils/formatValue'
export type { NumericFormat }

export type WidgetType =
  | 'bar' | 'line' | 'pie' | 'table' | 'kpi'
  | 'stackedBar' | 'stackedHBar' | 'stackedLine'
  | 'halfDoughnut' | 'scatter' | 'tree' | 'ecOption'

export interface ReportDataset {
  id:             string
  name:           string
  rows:           DataRow[]
  columnLabels?:  Record<string, ColMeta>
  columnSources?: Record<string, string>   // finalColName → source table name
  numericFormat?: NumericFormat            // applies to all numeric columns
}

export interface WidgetFields {
  xField?:       string        // bar/line x-axis, pie label
  yField?:       string        // bar/line y-axis, pie value, kpi value
  yFields?:      string[]      // stacked / multi-series
  columns?:      string[]      // table: visible columns
  ecOptionJson?: string        // raw ECharts option JSON
}

// ── Filter types ──────────────────────────────────────────────────────────────
export type FilterOperator =
  | 'eq' | 'neq'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'notContains'
  | 'blank' | 'notBlank'
  | 'in' | 'notIn'

export interface FilterCondition {
  id:       string
  column:   string
  operator: FilterOperator
  value:    string       // used by eq/neq/gt/gte/lt/lte/contains/notContains
  values?:  string[]    // used by in/notIn only
}

export interface FilterConfig {
  logic:      'and' | 'or'
  conditions: FilterCondition[]
}

export type CellClickMode = 'none' | 'modal'

export interface ReportWidget {
  id:             string
  type:           WidgetType
  datasetId:      string
  title:          string
  fields:         WidgetFields
  filters?:       FilterConfig
  columnWidths?:  Record<string, number>
  cellClickMode?: CellClickMode
  xAxisRotate?:   number   // x-axis label rotation in degrees (0 = horizontal)
  fontSize?:      number   // table cell font size in px (default 11)
  x: number; y: number
  w: number; h: number
}

export const useReportStore = defineStore('report', () => {
  const datasets = ref<ReportDataset[]>([])
  const widgets  = ref<ReportWidget[]>([])

  function addDataset(ds: ReportDataset) {
    if (!datasets.value.some(d => d.id === ds.id)) datasets.value.push(ds)
  }

  function removeDataset(id: string) {
    datasets.value = datasets.value.filter(d => d.id !== id)
    widgets.value  = widgets.value.filter(w => w.datasetId !== id)
  }

  function columnsOf(datasetId: string): { name: string; label: string; type: 'number' | 'string' | 'date' }[] {
    const ds = datasets.value.find(d => d.id === datasetId)
    if (!ds?.rows.length) return []
    const first = ds.rows[0]!
    return Object.keys(first).map(name => {
      const meta = ds.columnLabels?.[name]
      return {
        name,
        label: meta?.label || name,
        type:  isDateMeta(meta, first[name]) ? 'date' : metaToColType(meta, first[name]),
      }
    })
  }

  function labelOf(datasetId: string, colName: string): string {
    return columnsOf(datasetId).find(c => c.name === colName)?.label ?? colName
  }

  function rowsOf(datasetId: string): DataRow[] {
    return datasets.value.find(d => d.id === datasetId)?.rows ?? []
  }

  function numericFormatOf(datasetId: string): NumericFormat {
    return datasets.value.find(d => d.id === datasetId)?.numericFormat ?? {}
  }

  function addWidget(w: ReportWidget) {
    widgets.value.push(w)
  }

  function updateWidget(id: string, patch: Partial<ReportWidget>) {
    const idx = widgets.value.findIndex(w => w.id === id)
    if (idx !== -1) widgets.value[idx] = { ...widgets.value[idx]!, ...patch } as ReportWidget
  }

  function updateFields(id: string, fields: Partial<WidgetFields>) {
    const idx = widgets.value.findIndex(w => w.id === id)
    if (idx !== -1) widgets.value[idx]!.fields = { ...widgets.value[idx]!.fields, ...fields }
  }

  function removeWidget(id: string) {
    widgets.value = widgets.value.filter(w => w.id !== id)
  }

  function resetAll() {
    datasets.value = []
    widgets.value  = []
  }

  function updateFilters(id: string, filters: FilterConfig) {
    const idx = widgets.value.findIndex(w => w.id === id)
    if (idx !== -1) widgets.value[idx] = { ...widgets.value[idx]!, filters } as ReportWidget
  }

  return {
    datasets, widgets,
    addDataset, removeDataset, columnsOf, rowsOf, labelOf, numericFormatOf,
    addWidget, updateWidget, updateFields, updateFilters, removeWidget, resetAll,
  }
})
