/**
 * AI Context Builders — server-side system prompt generation
 *
 * Frontend composables collect state data and send typed context objects.
 * This module converts them into system prompts before forwarding to the AI provider.
 */

// ─── Context data types (mirrored on frontend in useAiChat.ts) ───────────────

export interface SqlBuilderContextData {
  tables: Array<{
    name:        string
    columns:     string[]
    visibleCols: Array<{ name: string; alias?: string }>
  }>
  joins: Array<{
    source:   string
    target:   string
    joinType: string
    on:       Array<{ sourceCol: string; targetCol: string }>
  }>
  tools: Array<{ nodeType: string; [key: string]: any }>
  sql:   string
}

export interface ReportContextData {
  widgets:  Array<{ type: string; title: string }>
  datasets: Array<{ name: string; rowCount: number; columns: string[] }>
}

export interface DataModelContextData {
  tables:     Array<{ name: string; rowCount: number }>
  relations:  Array<{ from: string; fromCol: string; to: string; toCol: string; cardinality: string }>
  transforms: number
  filters:    number
}

export interface ViewerWidgetData {
  title:   string
  type:    string
  xField?: string
  yField?: string
  rows:    Array<Record<string, any>>
}
export interface ViewerDatasetData {
  name:     string
  rowCount: number
  columns:  string[]
  totals:   Array<{ col: string; total: number; avg: number }>
}
export interface ViewerContextData {
  reportName: string
  widgets:    ViewerWidgetData[]
  datasets:   ViewerDatasetData[]
}

export type AiContextPayload =
  | { type: 'sql-builder';   data: SqlBuilderContextData }
  | { type: 'report';        data: ReportContextData }
  | { type: 'datamodel';     data: DataModelContextData }
  | { type: 'viewer';        data: ViewerContextData }    // rendered data from client
  | { type: 'viewer-report'; reportId: string }           // mobile: backend builds from DB

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export function buildSystemPrompt(ctx: AiContextPayload): string {
  switch (ctx.type) {
    case 'sql-builder': return buildSqlBuilderPrompt(ctx.data)
    case 'report':      return buildReportPrompt(ctx.data)
    case 'datamodel':   return buildDataModelPrompt(ctx.data)
    case 'viewer':      return buildViewerPrompt(ctx.data)
    case 'viewer-report': return ''   // handled by ASP.NET — never reaches here
    default:            return ''
  }
}

// ─── SQL Builder ─────────────────────────────────────────────────────────────

function buildSqlBuilderPrompt(d: SqlBuilderContextData): string {
  const tables = d.tables.map(t => {
    const colStr = t.columns.slice(0, 20).join(', ') + (t.columns.length > 20 ? '…' : '')
    const selStr = t.visibleCols.length
      ? ` [เลือก: ${t.visibleCols.map(c => c.alias ? `${c.name}→${c.alias}` : c.name).join(', ')}]`
      : ''
    return `- ${t.name}${colStr ? ` (${colStr})` : ''}${selStr}`
  }).join('\n')

  const joins = d.joins.map(j => {
    const on = j.on.map(m => `${j.source}.${m.sourceCol} = ${j.target}.${m.targetCol}`).join(', ')
    return `- ${j.source} [${j.joinType}] ${j.target}${on ? ` ON ${on}` : ''}`
  }).join('\n')

  const tools = (d.tools ?? []).map(t => {
    switch (t.nodeType) {
      case 'cte':   return `- [CTE] name: ${t.name}`
      case 'group': return `- [Group By] groupCols: ${(t.groupCols ?? []).join(', ')} | aggs: ${(t.aggs ?? []).map((a: any) => `${a.func}(${a.col}) AS ${a.alias}`).join(', ')}`
      case 'where': return `- [Where] ${(t.conditions ?? []).map((c: any) => `${c.column} ${c.operator} ${c.value}`).join(' AND ')}`
      case 'sort':  return `- [Sort] ${(t.items ?? []).map((i: any) => `${i.col} ${i.dir ?? 'ASC'}`).join(', ')}`
      case 'calc':  return `- [Calc] ${(t.items ?? []).map((i: any) => `${i.col} ${i.op} ${i.value} AS ${i.alias}`).join(', ')}`
      default:      return `- [${t.nodeType}]`
    }
  }).join('\n')

  const sql = d.sql
    ? `SQL ปัจจุบัน:\n\`\`\`sql\n${d.sql.slice(0, 600)}${d.sql.length > 600 ? '\n…' : ''}\n\`\`\``
    : 'ยังไม่มี SQL'

  const canvasSection = d.tables.length ? `## ข้อมูลบน Canvas
ตาราง (ใช้ได้เฉพาะที่ระบุไว้เท่านั้น):
${tables}
${joins ? `\nJoins:\n${joins}` : '\nยังไม่มี JOIN'}
${tools ? `\nTool Nodes:\n${tools}` : ''}

${sql}` : '## Canvas ว่างเปล่า — ยังไม่มีตารางบน canvas'

  return `คุณคือ AI ช่วย SQL Builder ใน MangoBI (ระบบ ERP ไทย)
ตอบเป็นภาษาไทย กระชับ ตรงประเด็น

${canvasSection}

## กฎ
- ใช้เฉพาะชื่อตาราง/คอลัมน์ที่ระบุในส่วน "ข้อมูลบน Canvas" เท่านั้น
- ถ้าคอลัมน์ที่ต้องการไม่อยู่ในรายการ ให้บอกตรงๆ ว่าไม่มี
- ตอบตรงคำถาม อย่าสอน SQL ทั่วไปที่ไม่เกี่ยวกับคำถาม

## Action Block
เมื่อ user ขอแก้ canvas ให้แนบ 1 action block หลังคำอธิบาย:
\`\`\`action
{ "type": "..." }
\`\`\`

รูปแบบที่ใช้ได้:
- CTE คลุม SQL ทั้งหมด: {"type":"add_cte","source":"_last","name":"ชื่อ_cte","selectedCols":[],"conditions":[]}
- CTE จากตารางที่ระบุ: {"type":"add_cte","source":"T","name":"ชื่อ_cte"}
- เพิ่ม JOIN: {"type":"add_edge","source":"T1","target":"T2","joinType":"LEFT JOIN","on":[{"sourceCol":"col","targetCol":"col"}]}
- เพิ่มตาราง: {"type":"add_table","tableName":"T"}
- เลือก column: {"type":"set_visible_cols","tableName":"T","cols":[{"name":"col"},{"name":"col","alias":"alias"}]}
- Group By: {"type":"add_group_by","source":"T","groupCols":["col"],"aggs":[{"col":"col","func":"SUM","alias":"alias"}]}
- WHERE: {"type":"add_where","source":"T","conditions":[{"column":"col","operator":"=","value":"val"}]}
- Sort: {"type":"add_sort","source":"T","items":[{"col":"col","dir":"DESC"}]}
- Calculator: {"type":"add_calc","source":"T","items":[{"col":"col","op":"*","value":"1.07","alias":"alias"}]}
- แก้ node: {"type":"update_tool","toolType":"group|where|sort|calc",...}
- ลบ JOIN: {"type":"remove_edge","source":"T1","target":"T2"}

หมายเหตุ: source:"_last" = แนบต่อท้าย node สุดท้ายในสาย (ใช้กับ CTE ที่ต้องการคลุม SQL ทั้งหมด)`
}

// ─── Report Builder ───────────────────────────────────────────────────────────

function buildReportPrompt(d: ReportContextData): string {
  const widgets  = d.widgets.map(w => `- [${w.type}] "${w.title || 'ไม่มีชื่อ'}"`).join('\n')
  const datasets = d.datasets.map(ds => {
    const cols = ds.columns.slice(0, 12)
    const more = ds.columns.length - 12
    return `- ${ds.name} (${ds.rowCount.toLocaleString()} rows${cols.length ? `, cols: ${cols.join(', ')}${more > 0 ? ` +${more}` : ''}` : ''})`
  }).join('\n')

  return `คุณคือ AI ช่วย Report Builder ใน MangoBI (ระบบ ERP ไทย)
ตอบเป็นภาษาไทย กระชับ ตรงประเด็น ไม่อธิบายทั่วไปที่ไม่เกี่ยวกับคำถาม

## Report ปัจจุบัน
Widgets (${d.widgets.length}):
${widgets || '(ว่าง — ยังไม่มี widget)'}

Datasets (${d.datasets.length}):
${datasets || '(ยังไม่มี dataset)'}

Chart types ที่มี: Bar, Line, Pie, Stacked 100%, H-Stack Bar, Stacked Line, Half Donut, Scatter, Tree, ECharts JSON, Table, KPI Card

## แนวทาง
- แนะนำ chart type ที่เหมาะกับข้อมูล (time series → Line, เปรียบเทียบ → Bar ฯลฯ)
- แนะนำ KPI จาก column ที่มีจริงใน dataset
- ตอบตรงคำถามที่ถาม ไม่ต้องสอนทฤษฎีทั่วไป`
}

// ─── Data Model ───────────────────────────────────────────────────────────────

function buildDataModelPrompt(d: DataModelContextData): string {
  const tables    = d.tables.map(t => `- ${t.name} (${t.rowCount.toLocaleString()} rows)`).join('\n')
  const relations = d.relations.map(r =>
    `- ${r.from} [${r.fromCol}] → ${r.to} [${r.toCol}] (${r.cardinality})`
  ).join('\n')

  return `คุณคือ AI ช่วย Data Model ใน MangoBI (ระบบ ERP ไทย)
ตอบเป็นภาษาไทย กระชับ ตรงประเด็น ไม่อธิบายทั่วไปที่ไม่เกี่ยวกับคำถาม

## Data Model ปัจจุบัน
ตาราง (${d.tables.length}):
${tables || '(ว่าง)'}

Relations (${d.relations.length}):
${relations || '(ยังไม่มี relation)'}

Transforms: ${d.transforms} รายการ · Pre-filters: ${d.filters} ตาราง

## แนวทาง
- แนะนำวิธี join ที่เหมาะกับชื่อตารางที่มีจริงเท่านั้น
- แนะนำ transform (filter, group by, computed column) เมื่อเหมาะสม
- ตอบตรงคำถามที่ถาม ไม่ต้องอธิบายทฤษฎีที่ไม่เกี่ยวข้อง`
}

// ─── Viewer ───────────────────────────────────────────────────────────────────

function buildViewerPrompt(d: ViewerContextData): string {
  const today = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })

  const fmt = (n: number) => {
    if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
    if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
    return Number.isInteger(n) ? String(n) : n.toFixed(2)
  }

  // Dataset-level totals
  const datasetSection = d.datasets.map(ds => {
    const totals = ds.totals.slice(0, 8).map(t => `${t.col}=${fmt(t.total)}`).join(', ')
    return `- ${ds.name} (${ds.rowCount.toLocaleString()} rows)${totals ? ` | ${totals}` : ''}`
  }).join('\n')

  // Per-widget rendered data
  const widgetSection = d.widgets.map(w => {
    const rows = w.rows
    if (!rows.length) return `### ${w.title} [${w.type}]\n(ไม่มีข้อมูล)`

    const cols    = Object.keys(rows[0])
    const numCols = cols.filter(c => rows.some(r => typeof r[c] === 'number'))
    const topNum  = numCols
      .map(c => ({ c, sum: rows.reduce((s, r) => s + (Number(r[c]) || 0), 0) }))
      .filter(x => x.sum !== 0)
      .sort((a, b) => Math.abs(b.sum) - Math.abs(a.sum))
      .slice(0, 6)

    const lines: string[] = [`### ${w.title} [${w.type}] — ${rows.length.toLocaleString()} rows`]

    // ── Table widget: show actual rows as markdown table ──────────────────
    if (w.type === 'table' || w.type === 'ag-grid') {
      const showCols = cols.slice(0, 20)   // up to 20 columns (pre-filtered at client)
      const showRows = rows.slice(0, 50)
      lines.push('| ' + showCols.join(' | ') + ' |')
      lines.push('| ' + showCols.map(() => '---').join(' | ') + ' |')
      for (const r of showRows) {
        const cells = showCols.map(c => {
          const v = r[c]
          if (v === null || v === undefined) return ''
          if (typeof v === 'number') return fmt(v)
          return String(v)
        })
        lines.push('| ' + cells.join(' | ') + ' |')
      }
      if (rows.length > 50) lines.push(`_(แสดง 50 จาก ${rows.length} rows)_`)
      // No grand-total section for tables — avoids AI confusing row-level values with totals
      return lines.join('\n')
    }

    // ── Chart / KPI: totals + breakdown ───────────────────────────────────
    if (topNum.length) {
      lines.push('Totals:')
      for (const { c, sum } of topNum) {
        const vals = rows.map(r => Number(r[c])).filter(v => !isNaN(v))
        const avg  = vals.length ? sum / vals.length : 0
        const min  = vals.length ? Math.min(...vals) : 0
        const max  = vals.length ? Math.max(...vals) : 0
        lines.push(`  ${c}: total=${fmt(sum)}, avg=${fmt(avg)}, min=${fmt(min)}, max=${fmt(max)}`)
      }
    }

    const xField = w.xField ?? cols.find(c => !numCols.includes(c))
    const yField = w.yField ?? topNum[0]?.c
    if (xField && yField && rows.length <= 200) {
      const grandTotal = rows.reduce((s, r) => s + (Number(r[yField]) || 0), 0)
      const sorted = [...rows].sort((a, b) => (Number(b[yField]) || 0) - (Number(a[yField]) || 0))
      const LIMIT  = 50
      lines.push(`\nBreakdown by ${xField} (${yField}):`)
      for (const r of sorted.slice(0, LIMIT)) {
        const val = Number(r[yField]) || 0
        const pct = grandTotal > 0 ? ((val / grandTotal) * 100).toFixed(1) : '0.0'
        lines.push(`  ${r[xField]}: ${fmt(val)} (${pct}%)`)
      }
      if (sorted.length > LIMIT) {
        const rest    = sorted.slice(LIMIT).reduce((s, r) => s + (Number(r[yField]) || 0), 0)
        const restPct = grandTotal > 0 ? ((rest / grandTotal) * 100).toFixed(1) : '0.0'
        lines.push(`  … อีก ${sorted.length - LIMIT} รายการ: ${fmt(rest)} (${restPct}%)`)
      }
    }

    return lines.join('\n')
  }).join('\n\n')

  return `คุณคือ AI วิเคราะห์ข้อมูล Dashboard ใน MangoBI (ระบบ ERP ไทย)
ตอบเป็นภาษาไทย กระชับ ตรงประเด็น ใช้ตัวเลขจากข้อมูลที่ให้เท่านั้น

## Dashboard: ${d.reportName || 'Report'}
วันที่: ${today}

## ข้อมูล Dataset (raw, ก่อน filter)
${datasetSection || '(ไม่มีข้อมูล)'}

## ข้อมูลที่แสดงบนหน้าจอ (หลัง filter + grouping)
${widgetSection || '(ยังไม่มี visual)'}

## กฎ
- ใช้เฉพาะตัวเลขจากส่วน "ข้อมูลที่แสดงบนหน้าจอ" — ห้ามคิดเลขเอง
- ถ้าถามเรื่องที่ไม่มีในข้อมูล ให้บอกตรงๆ
- เมื่อพูดถึงตัวเลข ให้อ้างชื่อ widget/column เสมอ
- ตอบตรงคำถาม ไม่ต้องอธิบายทั่วไป`
}
