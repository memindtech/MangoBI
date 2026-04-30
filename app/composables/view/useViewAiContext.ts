/**
 * useViewAiContext — Report Viewer AI Context
 * Collects rendered data (filtered + grouped rows) from the client
 * and sends as structured ViewerContextData for server-side prompt building.
 */
import type { Ref } from 'vue'
import type { AiContext, ViewerContextData } from '~/composables/useAiChat'

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
        const rows = getGroupedRows(w)

        // For table widgets: use only user-configured columns to avoid raw DB column clutter.
        // For charts: use all columns (xField/yField drive which ones matter).
        const configuredCols = (w.type === 'table' || w.type === 'ag-grid')
          ? (w.fields.columns?.length ? w.fields.columns : null)
          : null

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
