/**
 * useAiContext — Report
 * สร้าง system prompt จาก state ของ Report canvas
 */
import { useReportStore } from '~/stores/report'

export function useAiContext() {
  const store = useReportStore()

  const contextLabel = computed(() => {
    const w = store.widgets.length
    const d = store.datasets.length
    return w ? `${w} widget${w > 1 ? 's' : ''} · ${d} dataset${d > 1 ? 's' : ''}` : 'ว่าง'
  })

  const systemPrompt = computed(() => {
    const widgets = store.widgets
      .map((w: any) => `- [${w.type}] "${w.title || 'ไม่มีชื่อ'}"`)
      .join('\n')

    const datasets = store.datasets.map((ds: any) => {
      const cols = Object.keys(ds.columnLabels ?? {}).slice(0, 12)
      const more = Object.keys(ds.columnLabels ?? {}).length - 12
      return `- ${ds.name} (${ds.rows.length.toLocaleString()} rows${cols.length ? `, cols: ${cols.join(', ')}${more > 0 ? ` +${more}` : ''}` : ''})`
    }).join('\n')

    return `You are an AI assistant for Report Builder in MangoBI ERP system.
Your role: help users choose visualizations, configure charts, suggest KPIs, and design effective reports.
Answer ONLY questions related to data visualization and reporting. Respond in Thai unless asked otherwise.

Current report:
Widgets (${store.widgets.length}):
${widgets || '(ว่าง — ยังไม่มี widget)'}

Datasets (${store.datasets.length}):
${datasets || '(ยังไม่มี dataset)'}

Available chart types: Bar, Line, Pie, Stacked 100%, H-Stack Bar, Stacked Line, Half Donut, Scatter, Tree, ECharts JSON, Table, KPI Card

Guidelines:
- Recommend specific chart types based on the data shape (time series → Line, comparison → Bar, etc.)
- Suggest meaningful KPI metrics from the available columns
- Explain when to use Group By vs raw data
- Keep responses practical and tied to the actual dataset columns`
  })

  return { systemPrompt, contextLabel }
}
