/**
 * useViewAiContext — Report Viewer AI Context
 * Collects rendered data (filtered + grouped rows) from the client
 * and sends as structured ViewerContextData for server-side prompt building.
 */
import type { Ref } from 'vue'
import type { AiContext, ViewerContextData } from '~/composables/useAiChat'
import { groupChartData } from '~/utils/groupChartData'

interface Dataset {
  id: string; name: string; rows: any[]
  columnLabels?: Record<string, any>
  numericFormat?: any
}
interface Widget {
  id: string; type: string; title: string; datasetId: string
  fields: { xField?: string; yField?: string; yFields?: string[]; columns?: string[] }
  x: number; y: number; w: number; h: number
}

export function useViewAiContext(
  reportName:     Ref<string>,
  datasets:       Ref<Dataset[]>,
  widgets:        Ref<Widget[]>,
  getGroupedRows: (w: Widget) => any[],
) {
  const contextLabel = computed(() => {
    const n = widgets.value.length
    return n ? `${n} visual${n > 1 ? 's' : ''}` : 'ว่าง'
  })

  const context = computed((): AiContext => {
    const data: ViewerContextData = {
      reportName: reportName.value || 'Dashboard',

      // Dataset-level totals (raw rows, before filter)
      datasets: datasets.value.map(ds => {
        const cols = ds.rows.length ? Object.keys(ds.rows[0]) : []
        const numCols = cols.filter(c => typeof ds.rows[0]?.[c] === 'number')
        const totals = numCols
          .map(c => ({
            col:   ds.columnLabels?.[c]?.label ?? c,
            total: ds.rows.reduce((s, r) => s + (Number(r[c]) || 0), 0),
            avg:   ds.rows.length ? ds.rows.reduce((s, r) => s + (Number(r[c]) || 0), 0) / ds.rows.length : 0,
          }))
          .filter(t => t.total !== 0)
          .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
          .slice(0, 8)
        return {
          name:     ds.name,
          rowCount: ds.rows.length,
          columns:  cols.slice(0, 15),
          totals,
        }
      }),

      // Per-widget rendered rows (after filter + groupBy)
      widgets: widgets.value.map(w => {
        const ds   = datasets.value.find(d => d.id === w.datasetId)
        const base = getGroupedRows(w)

        // For chart widgets: apply the same xField-level grouping that chartOption() uses,
        // so AI sees the exact values the chart displays (not just DataModel-level groupBy).
        const rows = (() => {
          if (['table', 'ag-grid', 'kpi', 'ecOption'].includes(w.type)) return base
          const x = w.fields.xField
          const y = w.fields.yField
          if (!x || !y) return base
          const yList = [...new Set([y, ...(w.fields.yFields ?? [])].filter(Boolean))]
          const grouped = groupChartData(base, x, yList, (w.fields as any).aggregation ?? 'sum')
          return grouped.labels.map((label, i) => {
            const row: Record<string, any> = { [x]: label }
            for (const yf of yList) row[yf] = grouped.series(yf)[i]
            return row
          })
        })()

        // Table: use only user-configured columns to avoid raw DB column clutter.
        // Chart/KPI: restrict to xField+yField(s) only so AI sees the same columns the chart shows.
        const configuredCols = (() => {
          if (w.type === 'table' || w.type === 'ag-grid')
            return w.fields.columns?.length ? w.fields.columns : null
          const chartCols = [w.fields.xField, w.fields.yField, ...(w.fields.yFields ?? [])]
            .filter(Boolean) as string[]
          return chartCols.length ? chartCols : null
        })()

        const labelledRows = rows.slice(0, 100).map(r => {
          const out: Record<string, any> = {}
          const keys = configuredCols ?? Object.keys(r)
          for (const k of keys) {
            if (!(k in r)) continue
            out[ds?.columnLabels?.[k]?.label ?? k] = r[k]
          }
          return out
        })
        return {
          title:  w.title || w.type,
          type:   w.type,
          xField: w.fields.xField ? (ds?.columnLabels?.[w.fields.xField]?.label ?? w.fields.xField) : undefined,
          yField: w.fields.yField ? (ds?.columnLabels?.[w.fields.yField]?.label ?? w.fields.yField) : undefined,
          rows:   labelledRows,
        }
      }),
    }

    return { type: 'viewer', data }
  })

  return { context, contextLabel }
}
