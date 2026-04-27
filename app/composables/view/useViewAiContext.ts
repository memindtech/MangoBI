/**
 * useViewAiContext — Report Viewer AI Context
 * Sends full aggregated summary of every widget — no raw rows, no truncation.
 */
import type { Ref } from 'vue'

interface Dataset {
  id: string; name: string; rows: any[]
  columnLabels?: Record<string, any>
  numericFormat?: any
}
interface Widget {
  id: string; type: string; title: string; datasetId: string
  fields: { xField?: string; yField?: string; yFields?: string[]; columns?: string[]; groupByField?: string; aggregation?: string }
  x: number; y: number; w: number; h: number
}

export function useViewAiContext(
  reportName: Ref<string>,
  datasets:   Ref<Dataset[]>,
  widgets:    Ref<Widget[]>,
  getGroupedRows: (w: Widget) => any[],
) {
  const contextLabel = computed(() => {
    const n = widgets.value.length
    return n ? `${n} visual${n > 1 ? 's' : ''}` : 'ว่าง'
  })

  const systemPrompt = computed(() => {
    const today = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })

    const widgetSections = widgets.value.map(w => {
      const rows = getGroupedRows(w)
      const ds   = datasets.value.find(d => d.id === w.datasetId)
      if (!rows.length) return `### ${w.title} [${w.type}]\n(ไม่มีข้อมูล)`

      const cols    = Object.keys(rows[0])
      const numCols = cols.filter(c => rows.some(r => typeof r[c] === 'number'))
      const catCols = cols.filter(c => !numCols.includes(c))
      const label   = (c: string) => ds?.columnLabels?.[c]?.label ?? c

      // Cap numeric cols at 6 most significant
      const topNumCols = numCols
        .map(c => ({ c, sum: rows.reduce((s, r) => s + (Number(r[c]) || 0), 0) }))
        .filter(x => x.sum !== 0)
        .sort((a, b) => Math.abs(b.sum) - Math.abs(a.sum))
        .slice(0, 6)
        .map(x => x.c)

      const lines: string[] = [`### ${w.title} [${w.type}] — ${rows.length.toLocaleString()} rows`]

      // ── Numeric column totals ──────────────────────────────────────────
      if (topNumCols.length) {
        lines.push('Totals:')
        for (const c of topNumCols) {
          const vals = rows.map(r => Number(r[c])).filter(v => !isNaN(v))
          if (!vals.length) continue
          const sum = vals.reduce((a, b) => a + b, 0)
          const avg = sum / vals.length
          const min = Math.min(...vals)
          const max = Math.max(...vals)
          lines.push(`  ${label(c)}: total=${fmt(sum)}, avg=${fmt(avg)}, min=${fmt(min)}, max=${fmt(max)}`)
        }
      }

      // ── Category breakdown — only when grouped (rows ≤ 200) ───────────
      const xField = w.fields.xField ?? catCols[0]
      const yField = w.fields.yField ?? topNumCols[0]
      if (xField && yField && rows.length <= 200) {
        const grandTotal = rows.reduce((s, r) => s + (Number(r[yField]) || 0), 0)
        const sorted = [...rows].sort((a, b) => (Number(b[yField]) || 0) - (Number(a[yField]) || 0))
        const LIMIT  = 50
        lines.push(`\nBreakdown by ${label(xField)} (${label(yField)}):`)
        for (const r of sorted.slice(0, LIMIT)) {
          const val = Number(r[yField]) || 0
          const pct = grandTotal > 0 ? ((val / grandTotal) * 100).toFixed(1) : '0.0'
          lines.push(`  ${r[xField]}: ${fmt(val)} (${pct}%)`)
        }
        if (sorted.length > LIMIT) {
          const restVal = sorted.slice(LIMIT).reduce((s, r) => s + (Number(r[yField]) || 0), 0)
          const restPct = grandTotal > 0 ? ((restVal / grandTotal) * 100).toFixed(1) : '0.0'
          lines.push(`  … อีก ${sorted.length - LIMIT} รายการ: ${fmt(restVal)} (${restPct}%)`)
        }
      } else if (xField && yField) {
        lines.push(`(${rows.length.toLocaleString()} rows — too many to list individually, use totals above)`)
      }

      // ── Multi-series (stacked/grouped charts) ─────────────────────────
      const yFields = w.fields.yFields ?? []
      if (yFields.length > 1 && xField) {
        lines.push(`\nMulti-series totals:`)
        for (const yf of yFields) {
          const total = rows.reduce((s, r) => s + (Number(r[yf]) || 0), 0)
          lines.push(`  ${label(yf)}: ${fmt(total)}`)
        }
      }

      return lines.join('\n')
    }).join('\n\n')

    // ── Dataset-level totals (top 8 numeric cols only) ───────────────────
    const datasetSummary = datasets.value.map(ds => {
      if (!ds.rows.length) return `- ${ds.name}: (ไม่มีข้อมูล)`
      const allNumCols = Object.keys(ds.rows[0]).filter(c => typeof ds.rows[0][c] === 'number')
      // Prioritise columns that have non-zero sums, cap at 8
      const numCols = allNumCols
        .map(c => ({ c, sum: ds.rows.reduce((s, r) => s + (Number(r[c]) || 0), 0) }))
        .filter(x => x.sum !== 0)
        .sort((a, b) => Math.abs(b.sum) - Math.abs(a.sum))
        .slice(0, 8)
      const totals = numCols.map(({ c, sum }) => `${ds.columnLabels?.[c]?.label ?? c}=${fmt(sum)}`).join(', ')
      return `- ${ds.name} (${ds.rows.length.toLocaleString()} rows)${totals ? ` | ${totals}` : ''}`
    }).join('\n')

    return `You are an AI analyst for a MangoBI report dashboard.
Respond in Thai. Be concise — use bullet points and numbers.

════════════════════════════════════════
REPORT: ${reportName.value || 'Dashboard'}
DATE: ${today}
════════════════════════════════════════

DATASET TOTALS (raw, before filters):
${datasetSummary || '(ไม่มีข้อมูล)'}

════════════════════════════════════════
WIDGET DATA (after filters & grouping)
════════════════════════════════════════
${widgetSections || '(ยังไม่มี visual)'}

════════════════════════════════════════
RULES
════════════════════════════════════════
1. ใช้เฉพาะตัวเลขจาก WIDGET DATA ด้านบน — ห้ามคิดเลขเอง
2. ถ้าถามเรื่องที่ไม่มีในข้อมูล ให้บอกตรงๆ
3. เมื่อพูดถึงตัวเลข ให้อ้างชื่อ widget/column เสมอ
4. ถ้าเห็นตัวเลขผิดปกติ (สูง/ต่ำกว่าปกติมาก) ให้แจ้งเลย`
  })

  return { systemPrompt, contextLabel }
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}
