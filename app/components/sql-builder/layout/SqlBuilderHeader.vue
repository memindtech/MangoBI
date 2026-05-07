<script setup lang="ts">
/**
 * SQL Builder — Header Toolbar
 * Based on ChartDB: ChartDBHeader.vue
 * Added: Template save/load, JSON export, Finish (API save), Load from cloud
 */
import {
  Code2, ArrowRight, Trash2, Undo2, Redo2,
  BookmarkPlus, BookMarked, Download, X as XIcon,
  CloudDownload, Loader2, FileCode2, CheckCheck, Globe,
  FolderOpen, PlusCircle, Sparkles, Braces, ChevronLeft,
} from 'lucide-vue-next'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useAiChatStore } from '~/stores/ai-chat'
import { useAiFeature } from '~/composables/useAiFeature'

const aiStore = useAiChatStore()
const { enabled: aiEnabled } = useAiFeature()
import { MarkerType } from '@vue-flow/core'
import { getEdgeStyle, getToolEdgeStyle } from '~/types/sql-builder'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { useFlowEvents } from '~/composables/sql-builder/useFlowEvents'
import { useHistory } from '~/composables/sql-builder/useHistory'
import { useJsonGenerator } from '~/composables/sql-builder/useJsonGenerator'
import { useDragDrop } from '~/composables/sql-builder/useDragDrop'
import { useMangoBIApi } from '~/composables/useMangoBIApi'
import type { BIListItem } from '~/composables/useMangoBIApi'

const store = useSqlBuilderStore()
const { sendToDataModel, resetCanvas } = useFlowEvents()
const dragDrop = useDragDrop()
const { undo, redo, canUndo, canRedo } = useHistory()
const { downloadJSON } = useJsonGenerator()
const api = useMangoBIApi()

// ── Template dropdown (localStorage) ─────────────────────────────────────
const showTemplateMenu = ref(false)
const templateName     = ref('')
const templates        = computed(() => store.listTemplates())

function saveTemplate() {
  const name = templateName.value.trim() || `Template ${templates.value.length + 1}`
  store.saveTemplate(name)
  templateName.value  = ''
  showTemplateMenu.value = false
}

function loadTemplate(id: string) {
  addLocalToCanvas(id)
  showTemplateMenu.value = false
}

function deleteTemplate(id: string) {
  store.deleteTemplate(id)
}

function closeTemplateMenu() { showTemplateMenu.value = false }

// ── Load from cloud / templates ───────────────────────────────────────────
const showLoadModal   = ref(false)
const cloudItems      = ref<BIListItem[]>([])
const publicItems     = ref<BIListItem[]>([])
const loadingCloud    = ref(false)
const loadingPublic   = ref(false)
const deletingId      = ref<string | null>(null)
const loadTab         = ref<'cloud' | 'local' | 'import' | 'public'>('cloud')
const appendingId     = ref<string | null>(null)
const loadingId       = ref<string | null>(null)

// ── Import Query ──────────────────────────────────────────────────────────
const importSQL       = ref('')
const importError     = ref('')
const importSuccess   = ref(false)
const importStep      = ref<'input' | 'vars'>('input')
const templateVars    = ref<Array<{ key: string; value: string }>>([])

watch(showLoadModal, (open) => { if (!open) importStep.value = 'input' })
watch(loadTab,      (tab)  => { if (tab === 'import') importStep.value = 'input' })

function importSQLToCanvas() {
  importError.value   = ''
  importSuccess.value = false
  const sql = importSQL.value.trim()
  if (!sql) { importError.value = 'กรุณาวาง SQL ก่อน'; return }

  // Detect {key} template variables → show substitution step
  const varRe = /\{([\w.]+)\}/g
  const found = new Map<string, string>()
  let vm: RegExpExecArray | null
  while ((vm = varRe.exec(sql)) !== null)
    if (!found.has(vm[1]!)) found.set(vm[1]!, '')

  if (found.size > 0) {
    templateVars.value = [...found.keys()].map(key => ({ key, value: '' }))
    importStep.value   = 'vars'
    return
  }

  runImport(sql)
}

function confirmVarsAndImport() {
  let sql = importSQL.value.trim()
  for (const v of templateVars.value) {
    const esc = v.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    sql = sql.replace(new RegExp(`'\\{${esc}\\}'`, 'g'), `'${v.value}'`)
    sql = sql.replace(new RegExp(`\\{${esc}\\}`, 'g'), v.value)
  }
  importStep.value = 'input'
  runImport(sql)
}

/** Parse SQL → nodes + edges and append to canvas.
 *  Handles CTEs, nested subqueries, WHERE/GROUP BY/ORDER BY → creates Tool Nodes. */
function runImport(sql: string) {
  importError.value   = ''
  importSuccess.value = false

  try {
    const norm = sql.replace(/\s+/g, ' ').trim()

    // ── 1. Extract CTE names + bodies ─────────────────────────────────────
    interface CteDef { name: string; body: string; lower: string }
    const cteNames = new Set<string>()             // lowercase
    const cteDefs  = new Map<string, CteDef>()     // lowercase → def

    let outerSql = norm
    if (/^WITH\b/i.test(norm)) {
      let pos = 4  // skip "WITH "
      while (pos < norm.length) {
        while (pos < norm.length && /\s/.test(norm[pos]!)) pos++
        const nm = norm.slice(pos).match(/^(\w+)\s+AS\s*\(/i)
        if (!nm) break
        const cName = nm[1]!, lower = cName.toLowerCase()
        cteNames.add(lower)
        pos += nm[0]!.length  // past opening '('
        let depth = 1, bodyStart = pos
        while (pos < norm.length && depth > 0) {
          if (norm[pos] === '(') depth++
          else if (norm[pos] === ')') depth--
          pos++
        }
        cteDefs.set(lower, { name: cName, body: norm.slice(bodyStart, pos - 1), lower })
        while (pos < norm.length && /[\s,]/.test(norm[pos]!)) pos++
      }
      outerSql = norm.slice(pos)
    }

    // ── 2. Collect all unique REAL table names ─────────────────────────────
    const tableByName = new Map<string, string>()  // lower → originalCase
    const tableRefRe  = /\b(?:FROM|JOIN)\s+(?!\()(\[?[\w.]+\]?)(?:\s+(?:AS\s+)?(\w+))?/gi
    let tr: RegExpExecArray | null
    while ((tr = tableRefRe.exec(norm)) !== null) {
      const tbl = tr[1]!.replace(/\[|\]/g, '')
      const low = tbl.toLowerCase()
      if (!cteNames.has(low)) tableByName.set(low, tbl)
    }

    if (tableByName.size === 0) { importError.value = 'ไม่พบตาราง'; return }
    const tableNames = [...tableByName.values()]

    // ── 2b. Parse SELECT columns per real table ────────────────────────────
    // For each CTE body that selects from real tables, extract qualified
    // alias.col references so loadColumnsForNode can restore the exact column
    // selection instead of falling back to PK-only defaults.
    const tableImportedCols = new Map<string, Set<string>>()  // lower → Set<colName>

    function collectSelectCols(block: string) {
      // Build alias → real table map for this block (skip CTEs + subqueries)
      const a2tSel = new Map<string, string>()
      const atRe3  = /\b(?:FROM|JOIN)\s+(?!\()(\[?[\w.]+\]?)(?:\s+(?:AS\s+)?(\w+))?/gi
      let atm3: RegExpExecArray | null
      while ((atm3 = atRe3.exec(block)) !== null) {
        const tbl = atm3[1]!.replace(/\[|\]/g, '')
        const al  = (atm3[2] ?? tbl).toLowerCase()
        if (!cteNames.has(tbl.toLowerCase())) a2tSel.set(al, tbl)
      }
      if (!a2tSel.size) return  // all sources are CTEs — skip

      // Extract SELECT … FROM (first level only)
      const sm = /\bSELECT\b([\s\S]+?)\bFROM\b/i.exec(block)
      if (!sm) return
      const selectStr = sm[1]!

      // Skip bare SELECT * (no column constraint → leave _importedCols unset)
      if (/^\s*\*\s*$/.test(selectStr)) return

      // Collect alias.col references — skip aggregate function names as the "alias"
      const SKIP_FUNCS = /^(SUM|COUNT|AVG|MAX|MIN|ISNULL|COALESCE|CAST|CONVERT|YEAR|MONTH|DAY|LEN|LEFT|RIGHT|UPPER|LOWER|TRIM|ROUND|ABS|FLOOR|CEILING)$/i
      const colRe2 = /\b(\w+)\.(\w+)\b/g
      let mc: RegExpExecArray | null
      while ((mc = colRe2.exec(selectStr)) !== null) {
        if (SKIP_FUNCS.test(mc[1]!)) continue
        const realTable = a2tSel.get(mc[1]!.toLowerCase())?.toLowerCase()
        if (!realTable) continue
        const set = tableImportedCols.get(realTable) ?? new Set<string>()
        set.add(mc[2]!)
        tableImportedCols.set(realTable, set)
      }
    }

    // Skip CTE bodies that wrap an inner subquery (FROM (SELECT...)) — the outer
    // alias (e.g. `a`) refers to the derived table, not the real inner table, so
    // collectSelectCols would misattribute columns like `a.exchange` to
    // `bd_boq_detail` when they actually come from `bd_proj_h` inside the subquery.
    for (const { body } of cteDefs.values()) {
      if (!/\bFROM\s*\(\s*SELECT\b/i.test(body)) collectSelectCols(body)
    }
    collectSelectCols(outerSql)

    // ── 3. Parse JOIN edges from each CTE body + outer SQL ─────────────────
    interface Mapping  { _id: number; source: string; target: string; operator: string }
    interface EdgeEntry { srcTable: string; tgtTable: string; joinType: string; mappings: Mapping[] }
    const edgeMap = new Map<string, EdgeEntry>()

    function parseEdgesFromBlock(block: string) {
      const a2t = new Map<string, string>()
      const atRe = /\b(?:FROM|JOIN)\s+(?!\()(\[?[\w.]+\]?)(?:\s+(?:AS\s+)?(\w+))?/gi
      let atm: RegExpExecArray | null
      while ((atm = atRe.exec(block)) !== null) {
        const tbl = atm[1]!.replace(/\[|\]/g, '')
        const al  = (atm[2] ?? tbl).toLowerCase()
        if (!cteNames.has(tbl.toLowerCase())) a2t.set(al, tbl)
      }
      const joinRe = /\b(LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|FULL\s+(?:OUTER\s+)?JOIN|CROSS\s+JOIN|JOIN)\s+(?!\()(\[?[\w.]+\]?)(?:\s+(?:AS\s+)?(\w+))?\s+(?:WITH\s*\([^)]*\)\s*)?ON\s+([\s\S]+?)(?=\b(?:LEFT|RIGHT|INNER|FULL|CROSS|JOIN|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|\))|$)/gi
      let jm: RegExpExecArray | null
      while ((jm = joinRe.exec(block)) !== null) {
        const tbl = jm[2]!.replace(/\[|\]/g, '')
        if (cteNames.has(tbl.toLowerCase())) continue
        const jType = jm[1]!.replace(/\s+/g, ' ').toUpperCase()
        const alias = (jm[3] ?? tbl).toLowerCase()
        const onStr = jm[4]!
        const condRe = /(\w+)\.(\w+)\s*(=|!=|<>|>=|<=|>|<)\s*(\w+)\.(\w+)/g
        const mappings: Mapping[] = []
        let cm: RegExpExecArray | null, seq = 0, srcTable = ''
        while ((cm = condRe.exec(onStr)) !== null) {
          const la = cm[1]!.toLowerCase(), lc = cm[2]!, op = cm[3]!, ra = cm[4]!.toLowerCase(), rc = cm[5]!
          const leftIsNew = la === alias
          if (!srcTable) srcTable = a2t.get(leftIsNew ? ra : la) ?? ''
          mappings.push({ _id: ++seq, source: leftIsNew ? rc : lc, target: leftIsNew ? lc : rc, operator: op })
        }
        const key = `${srcTable.toLowerCase()}|${tbl.toLowerCase()}`
        if (!edgeMap.has(key) && srcTable) {
          const jt = jType.includes('LEFT') ? 'LEFT JOIN'
                   : jType.includes('RIGHT') ? 'RIGHT JOIN'
                   : (jType.includes('INNER') || jType === 'JOIN') ? 'INNER JOIN'
                   : jType.includes('FULL') ? 'FULL JOIN' : 'LEFT JOIN'
          edgeMap.set(key, { srcTable, tgtTable: tbl, joinType: jt, mappings })
        }
      }
    }

    for (const { body } of cteDefs.values()) parseEdgesFromBlock(body)
    parseEdgesFromBlock(outerSql)

    // ── 4. SQL parsing helpers ─────────────────────────────────────────────

    // Trace FROM clause back through CTE chain → real table name
    function resolveRootTable(block: string): string {
      const m = /\bFROM\s+(?!\()(\[?[\w.]+\]?)/i.exec(block)
      if (!m) return ''
      const tbl = m[1]!.replace(/\[|\]/g, '')
      const low = tbl.toLowerCase()
      if (cteNames.has(low)) {
        const cte = cteDefs.get(low)
        return cte ? resolveRootTable(cte.body) : ''
      }
      return tbl
    }

    // Parse WHERE → array of { column, operator, value }
    function parseWhere(block: string) {
      const wm = /\bWHERE\b([\s\S]+?)(?:\bGROUP\s+BY\b|\bORDER\s+BY\b|\bHAVING\b|\bLIMIT\b|\)|\bUNION\b|$)/i.exec(block)
      if (!wm) return []
      const result: Array<{ column: string; operator: string; value: string }> = []
      const re = /(?:\w+\.)?(\w+)\s*(=|!=|<>|>=|<=|>|<|LIKE|NOT\s+LIKE)\s*('[^']*'|"[^"]*"|\{[^}]*\}|\d[\d.]*\d*|\w+)/gi
      let m2: RegExpExecArray | null
      while ((m2 = re.exec(wm[1]!)) !== null) {
        const col = m2[1]!, op = m2[2]!.replace(/\s+/g, ' ')
        let val = m2[3]!
        if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"')))
          val = val.slice(1, -1)
        result.push({ column: col, operator: op, value: val })
      }
      return result
    }

    // Parse GROUP BY clause + SELECT aggregates
    interface AggItem { col: string; func: string; alias: string }
    function parseGroupBy(block: string): { groupCols: string[]; aggs: AggItem[] } {
      const gm = /\bGROUP\s+BY\b([\s\S]+?)(?:\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|\)|\bUNION\b|$)/i.exec(block)
      if (!gm) return { groupCols: [], aggs: [] }
      const groupCols = gm[1]!
        .split(',')
        .map(s => s.replace(/\b(?:HAVING|ORDER|LIMIT|UNION)\b[\s\S]*/i, '').trim())
        .map(s => s.replace(/^\w+\./, '').trim())
        .filter(s => s.length > 0 && !/^\d+$/.test(s))
      const aggs: AggItem[] = []
      const sm = /\bSELECT\b([\s\S]+?)\bFROM\b/i.exec(block)
      if (sm) {
        const aggRe = /\b(SUM|COUNT|AVG|MAX|MIN)\s*\(\s*(?:\w+\.)?([\w*]+)\s*\)(?:\s+AS\s+(\w+))?/gi
        let am: RegExpExecArray | null
        while ((am = aggRe.exec(sm[1]!)) !== null)
          aggs.push({ col: am[2]!, func: am[1]!.toUpperCase(), alias: am[3] ?? am[2]! })
      }
      return { groupCols, aggs }
    }

    // Parse ORDER BY clause
    interface SortItem { col: string; dir: string }
    function parseOrderBy(block: string): SortItem[] {

      const om = /\bORDER\s+BY\b([\s\S]+?)(?:\bLIMIT\b|\bOFFSET\b|\)|\bUNION\b|$)/i.exec(block)
      if (!om) return []
      return om[1]!
        .split(',')
        .map(s => s.trim())
        .map(s => { const m2 = /(?:\w+\.)?(\w+)(?:\s+(ASC|DESC))?/i.exec(s); return m2 ? { col: m2[1]!, dir: (m2[2] ?? 'ASC').toUpperCase() } : null })
        .filter(Boolean) as SortItem[]
    }

    // Parse subquery CTE body: outer SELECT columns + inner FROM (...) query
    interface SubqSelectItem { col: string; alias: string }
    interface SubqCaseWhen   { alias: string; branches: Array<{ condition: string; result: string }>; elsePart: string }
    interface ParsedSubquery { selectItems: SubqSelectItem[]; caseWhens: SubqCaseWhen[]; innerSql: string; conditions: ReturnType<typeof parseWhere> }

    function parseSubqueryBody(body: string): ParsedSubquery {
      const fromParenMatch = /\bFROM\s*\(/i.exec(body)
      if (!fromParenMatch) return { selectItems: [], caseWhens: [], innerSql: '', conditions: [] }

      const selectStart = /\bSELECT\b/i.exec(body)?.index ?? 0
      const outerSelectStr = body.slice(selectStart + 'SELECT'.length, fromParenMatch.index).trim()

      // Extract inner query from FROM (...)
      const openAt = fromParenMatch.index + fromParenMatch[0].length
      let depth = 1, pos = openAt
      while (pos < body.length && depth > 0) {
        if (body[pos] === '(') depth++
        else if (body[pos] === ')') { if (--depth === 0) break }
        pos++
      }
      const innerSql = body.slice(openAt, pos).trim()
      const conditions = parseWhere(body.slice(pos + 1))

      // Split outer SELECT by comma (respecting paren depth)
      function splitCols(str: string): string[] {
        const result: string[] = []; let d = 0, start = 0
        for (let i = 0; i < str.length; i++) {
          if (str[i] === '(') d++
          else if (str[i] === ')') d--
          else if (str[i] === ',' && d === 0) { result.push(str.slice(start, i).trim()); start = i + 1 }
        }
        const last = str.slice(start).trim(); if (last) result.push(last)
        return result
      }

      // Strip single-letter table alias prefix (e.g. "a.maincode" → "maincode")
      function stripAlias(expr: string): string { return expr.replace(/\b[a-zA-Z_]\./g, '').trim() }

      function parseCaseWhenStr(expr: string): SubqCaseWhen | null {
        const aliasM = /\bEND\s+(?:AS\s+)?(\w+)\s*$/i.exec(expr)
        const alias = aliasM?.[1] ?? ''
        const branches: Array<{ condition: string; result: string }> = []
        const re = /\bWHEN\s+([\s\S]+?)\s+THEN\s+([\s\S]+?)(?=\s+(?:WHEN|ELSE|END)\b)/gi
        let m: RegExpExecArray | null
        while ((m = re.exec(expr)) !== null) branches.push({ condition: m[1]!.trim(), result: m[2]!.trim() })
        const elseM = /\bELSE\s+([\s\S]+?)\s+END\b/i.exec(expr)
        if (!branches.length) return null
        return { alias, branches, elsePart: elseM?.[1]?.trim() ?? '' }
      }

      const selectItems: SubqSelectItem[] = []
      const caseWhens:   SubqCaseWhen[]   = []

      for (const rawCol of splitCols(outerSelectStr)) {
        const col = rawCol.trim(); if (!col) continue
        if (/\bCASE\b/i.test(col)) {
          const cw = parseCaseWhenStr(col); if (cw) caseWhens.push(cw)
          continue
        }
        const asMatch = /^([\s\S]+?)\s+AS\s+(\w+)\s*$/i.exec(col)
        if (asMatch) { selectItems.push({ col: stripAlias(asMatch[1]!.trim()), alias: asMatch[2]! }); continue }
        const sp = col.split(/\s+/)
        if (sp.length === 2 && /^\w+$/.test(sp[1]!)) { selectItems.push({ col: stripAlias(sp[0]!), alias: sp[1]! }); continue }
        selectItems.push({ col: stripAlias(col), alias: '' })
      }

      return { selectItems, caseWhens, innerSql, conditions }
    }

    // ── 5. Build tool scopes — one per CTE body + outer SELECT ────────────
    interface ToolScope {
      rootTable:  string
      conditions: ReturnType<typeof parseWhere>
      groupCols:  string[]
      aggs:       AggItem[]
      sortItems:  SortItem[]
    }

    const toolScopes: ToolScope[] = []
    function addScope(block: string) {
      const rootTable = resolveRootTable(block)
      if (!rootTable) return
      const conditions          = parseWhere(block)
      const { groupCols, aggs } = parseGroupBy(block)
      const sortItems           = parseOrderBy(block)
      if (conditions.length || groupCols.length || sortItems.length)
        toolScopes.push({ rootTable, conditions, groupCols, aggs, sortItems })
    }

    for (const { body } of cteDefs.values()) addScope(body)
    addScope(outerSql)

    // ── 5b. Complex CTE path — structured per-CTE chains ─────────────────────
    // Detect CTEs that cannot be represented as simple table-tool nodes.
    const isComplexBlock = (body: string) =>
      /\bCASE\s+WHEN\b/i.test(body) ||
      /\(\s*SELECT\s/i.test(body)   ||
      /\(\s*\w+(?:\.\w+)?\s*[+\-*/]\s*\w+(?:\.\w+)?\s*\)/i.test(body)

    if (cteDefs.size > 0 && [...cteDefs.values()].some(d => isComplexBlock(d.body))) {
      const ts = Date.now()
      let cei = 0
      const complexNodes: any[] = []
      const complexEdges: any[] = []

      // ── Local helpers (scoped to this block) ──────────────────────────────

      // Primary FROM table at depth-0 — skips FROMs inside subquery parens and CTE refs
      function getFromTblLocal(block: string): string {
        let depth = 0, i = 0
        while (i < block.length) {
          const ch = block[i]!
          if (ch === "'") { i++; while (i < block.length && block[i] !== "'") i++; i++; continue }
          if (ch === '(') { depth++; i++; continue }
          if (ch === ')') { depth--; i++; continue }
          if (depth === 0) {
            const m = /^FROM\s+(?!\()(\[?[\w.]+\]?)/i.exec(block.slice(i))
            if (m) {
              const tbl = m[1]!.replace(/\[|\]/g, '')
              return cteNames.has(tbl.toLowerCase()) ? '' : tbl
            }
          }
          i++
        }
        return ''
      }

      // JOIN edges in a block — real tables only, skip CTE references
      type JE = { srcTable: string; tgtTable: string; joinType: string; mappings: any[] }
      function parseJoinsLocal(block: string): JE[] {
        const a2t = new Map<string, string>()
        const atRe2 = /\b(?:FROM|JOIN)\s+(?!\()(\[?[\w.]+\]?)(?:\s+(?:AS\s+)?(\w+))?/gi
        let am2: RegExpExecArray | null
        while ((am2 = atRe2.exec(block)) !== null) {
          const tbl = am2[1]!.replace(/\[|\]/g, '')
          const al  = (am2[2] ?? tbl).toLowerCase()
          if (!cteNames.has(tbl.toLowerCase())) a2t.set(al, tbl)
        }
        const res: JE[] = []
        const jRe = /\b(LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|FULL\s+(?:OUTER\s+)?JOIN|CROSS\s+JOIN|JOIN)\s+(?!\()(\[?[\w.]+\]?)(?:\s+(?:AS\s+)?(\w+))?\s+(?:WITH\s*\([^)]*\)\s*)?ON\s+([\s\S]+?)(?=\b(?:LEFT|RIGHT|INNER|FULL|CROSS|JOIN|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|\))|$)/gi
        let jm2: RegExpExecArray | null
        while ((jm2 = jRe.exec(block)) !== null) {
          const tbl = jm2[2]!.replace(/\[|\]/g, '')
          if (cteNames.has(tbl.toLowerCase())) continue
          const jt2 = jm2[1]!.replace(/\s+/g, ' ').toUpperCase()
          const al2 = (jm2[3] ?? tbl).toLowerCase()
          const on2 = jm2[4]!
          const cRe = /(\w+)\.(\w+)\s*(=|!=|<>|>=|<=|>|<)\s*(\w+)\.(\w+)/g
          const maps: any[] = []; let cm2: RegExpExecArray | null, seq2 = 0, src2 = ''
          while ((cm2 = cRe.exec(on2)) !== null) {
            const la2 = cm2[1]!.toLowerCase(), lc2 = cm2[2]!, op2 = cm2[3]!, ra2 = cm2[4]!.toLowerCase(), rc2 = cm2[5]!
            const lin = la2 === al2
            if (!src2) src2 = a2t.get(lin ? ra2 : la2) ?? ''
            maps.push({ _id: ++seq2, source: lin ? rc2 : lc2, target: lin ? lc2 : rc2, operator: op2 })
          }
          if (src2) {
            const jt3 = jt2.includes('LEFT') ? 'LEFT JOIN' : jt2.includes('RIGHT') ? 'RIGHT JOIN'
              : (jt2.includes('INNER') || jt2 === 'JOIN') ? 'INNER JOIN'
              : jt2.includes('FULL') ? 'FULL JOIN' : 'LEFT JOIN'
            res.push({ srcTable: src2, tgtTable: tbl, joinType: jt3, mappings: maps })
          }
        }
        return res
      }

      // Split outer SELECT → plain column refs vs expression/math items
      function parseOuterSelect(outerStr: string): {
        selectItems: Array<{ col: string; alias: string }>
        mathItems:   Array<{ expr: string; alias: string }>
      } {
        const si: Array<{ col: string; alias: string }> = []
        const mi: Array<{ expr: string; alias: string }> = []
        const parts: string[] = []; let dp = 0, st = 0
        for (let i = 0; i < outerStr.length; i++) {
          if (outerStr[i] === '(') dp++
          else if (outerStr[i] === ')') dp--
          else if (outerStr[i] === ',' && dp === 0) { parts.push(outerStr.slice(st, i).trim()); st = i + 1 }
        }
        const last2 = outerStr.slice(st).trim(); if (last2) parts.push(last2)
        for (const raw of parts) {
          const c = raw.trim(); if (!c || /^\*$/.test(c)) continue
          const asM2 = /^([\s\S]+?)\s+AS\s+(\w+)\s*$/i.exec(c)
          if (asM2) {
            const expr2  = asM2[1]!.replace(/\b[a-zA-Z_]\./g, '').trim()
            const alias2 = asM2[2]!
            if (/^[\w]+$/.test(expr2)) si.push({ col: expr2, alias: alias2 })
            else                        mi.push({ expr: expr2, alias: alias2 })
          } else {
            const s2 = c.replace(/\b[a-zA-Z_]\./g, '').trim()
            if (/^[\w]+$/.test(s2)) si.push({ col: s2, alias: '' })
          }
        }
        return { selectItems: si, mathItems: mi }
      }

      // Count tool nodes a CTE body will generate (for pre-computing _cteN numbers)
      function countCteTools(body: string): number {
        const hasSq  = /\bFROM\s*\(\s*SELECT\b/i.test(body)
        const hasGb  = /\bGROUP\s+BY\b/i.test(body)
        if (hasSq) {
          const parsed3 = parseSubqueryBody(body)
          return (parseWhere(parsed3.innerSql).length ? 1 : 0) +
                 (/\bGROUP\s+BY\b/i.test(parsed3.innerSql) ? 1 : 0) + 1
        }
        if (hasGb) return (parseWhere(body).length ? 1 : 0) + 1
        return 1  // verbatim SUBQ
      }

      // ── Pre-compute cteNameMap: lower CTE name → _cteN it outputs ─────────
      // This must match the topological-sort order the SQL generator will assign.
      // Each CTE's chain connects to the previous one (serial dependency), so tool
      // nodes are numbered strictly in CTE declaration order.
      let cumTools2 = 0
      const cteNameMap = new Map<string, string>()
      for (const [lower2, { body }] of cteDefs.entries()) {
        cumTools2 += countCteTools(body)
        cteNameMap.set(lower2, `_cte${cumTools2}`)
      }

      const replaceCteRefs = (block: string) => {
        let out = block
        for (const [orig, mapped] of cteNameMap)
          out = out.replace(new RegExp(`\\b${orig}\\b`, 'gi'), mapped)
        return out
      }

      // ── Layout constants ───────────────────────────────────────────────────
      const TBL_X_GAP  = 300   // x gap between table nodes in a row
      const TOOL_X_GAP = 200   // x gap between tool nodes
      const ROW_H      = 300   // y advance between CTE chain rows
      const SUB_ROW_H  = 220   // y advance between sub-rows within one CTE's table grid
      const MAX_COLS   = 4     // max table nodes per sub-row before wrapping

      let rowY       = 0    // current row Y (advances per CTE)
      let prevToolId = ''   // output node of previous CTE chain (for serial ordering)
      let lastToolX  = 0    // x position of last placed tool node
      let lastToolY  = 0    // y position of last placed tool node

      // Place table names in a grid (MAX_COLS wide), return ids + tool-start coords
      function layoutTables(
        tableNames: string[], cteKey2: string, baseY: number
      ): { ids: Map<string, string>; toolX: number; toolY: number } {
        const ids = new Map<string, string>()
        for (const [i, tbl] of tableNames.entries()) {
          const col = i % MAX_COLS
          const row = Math.floor(i / MAX_COLS)
          const nid = `import-${ts}-${cteKey2}-t${i}`
          ids.set(tbl.toLowerCase(), nid)
          const impSet = tableImportedCols.get(tbl.toLowerCase())
          complexNodes.push({ id: nid, type: 'sqlTable',
            position: { x: col * TBL_X_GAP, y: baseY + row * SUB_ROW_H },
            data: { label: tbl, tableName: tbl, objectName: tbl, module: '', type: 'T',
                    details: [], visibleCols: [], filters: [], columnsLoading: true,
                    ...(impSet?.size ? { _importedCols: [...impSet] } : {}) } })
        }
        const numCols = Math.min(tableNames.length, MAX_COLS)
        const numRows = Math.ceil(tableNames.length / MAX_COLS)
        return {
          ids,
          toolX: numCols * TBL_X_GAP,
          toolY: baseY + (numRows - 1) * SUB_ROW_H,
        }
      }

      // ── Build one chain per CTE ────────────────────────────────────────────
      for (const [cteKey, { body }] of cteDefs.entries()) {
        const hasInlineSq2 = /\bFROM\s*\(\s*SELECT\b/i.test(body)
        const hasGrpBy2    = /\bGROUP\s+BY\b/i.test(body)
        const isVerbatim2  = !hasInlineSq2 && !hasGrpBy2

        if (hasInlineSq2) {
          // ── Pattern A: inline subquery + outer math ────────────────────────
          // e.g. cte_boq: SELECT ..., expr AS alias FROM (SELECT ... GROUP BY ...) src
          // → inner table nodes + JOIN edges → WHERE → GROUP → SUBQ(math)
          const parsedSub2   = parseSubqueryBody(body)        // parse BEFORE CTE renaming
          const innerSql2    = parsedSub2.innerSql
          const innerFrom2   = getFromTblLocal(innerSql2)
          const innerJoins2  = parseJoinsLocal(innerSql2)
          const innerWhere2  = parseWhere(innerSql2)
          const { groupCols: gc2, aggs: ag2 } = parseGroupBy(innerSql2)

          // Parse outer SELECT into plain column refs vs expressions
          const fromPI      = /\bFROM\s*\(/i.exec(body)!.index
          const selStart2   = /\bSELECT\b/i.exec(body)!.index + 'SELECT'.length
          const outerStr2   = body.slice(selStart2, fromPI).trim()
          const { selectItems: outSI, mathItems: outMI } = parseOuterSelect(outerStr2)

          // Build inner table map (primary first)
          const innerTblMap2 = new Map<string, string>()
          if (innerFrom2) innerTblMap2.set(innerFrom2.toLowerCase(), innerFrom2)
          for (const { srcTable, tgtTable } of innerJoins2) {
            innerTblMap2.set(srcTable.toLowerCase(), srcTable)
            innerTblMap2.set(tgtTable.toLowerCase(), tgtTable)
          }

          // Table nodes (grid layout)
          const { ids: tblNIds2, toolX: tblToolX2, toolY: tblToolY2 } =
            layoutTables([...innerTblMap2.values()], cteKey, rowY)
          for (const { srcTable, tgtTable, joinType, mappings } of innerJoins2) {
            const sId2 = tblNIds2.get(srcTable.toLowerCase())
            const tId2 = tblNIds2.get(tgtTable.toLowerCase())
            if (!sId2 || !tId2) continue
            complexEdges.push({
              id: `import-${ts}-je-${cei++}`, source: sId2, target: tId2,
              type: 'sqlEdge', ...getEdgeStyle(joinType as any),
              markerEnd: MarkerType.ArrowClosed, data: { joinType, mappings },
            })
          }

          const anchor2 = innerFrom2
            ? (tblNIds2.get(innerFrom2.toLowerCase()) ?? [...tblNIds2.values()][0]!)
            : ([...tblNIds2.values()][0] ?? '')

          if (prevToolId) {
            complexEdges.push({
              id: `import-${ts}-dep-${cei++}`, source: prevToolId, target: anchor2,
              type: 'sqlEdge', ...getToolEdgeStyle('subquery'), markerEnd: MarkerType.ArrowClosed,
              data: { joinType: 'LEFT JOIN', mappings: [], isTool: true, tgtToolId: 'table', srcCat: 'tool' },
            })
          }

          let prevId2 = anchor2; let toolX2 = tblToolX2
          if (innerWhere2.length) {
            const wid2 = `import-${ts}-${cteKey}-w`
            complexNodes.push({ id: wid2, type: 'toolNode', position: { x: toolX2, y: tblToolY2 },
              data: { _toolId: 'where', nodeType: 'where', conditions: innerWhere2 } })
            complexEdges.push({ id: `import-${ts}-${cteKey}-we-${cei++}`, source: prevId2, target: wid2,
              type: 'sqlEdge', ...getToolEdgeStyle('where'), markerEnd: MarkerType.ArrowClosed,
              data: { joinType: 'LEFT JOIN', mappings: [], isTool: true, tgtToolId: 'where', srcCat: 'table' } })
            prevId2 = wid2; toolX2 += TOOL_X_GAP
          }
          if (gc2.length) {
            const gid2 = `import-${ts}-${cteKey}-g`
            complexNodes.push({ id: gid2, type: 'toolNode', position: { x: toolX2, y: tblToolY2 },
              data: { _toolId: 'group', nodeType: 'group',
                      customGroupSql: innerSql2,
                      groupCols: gc2, aggs: ag2, filters: [] } })
            complexEdges.push({ id: `import-${ts}-${cteKey}-ge-${cei++}`, source: prevId2, target: gid2,
              type: 'sqlEdge', ...getToolEdgeStyle('group'), markerEnd: MarkerType.ArrowClosed,
              data: { joinType: 'LEFT JOIN', mappings: [], isTool: true, tgtToolId: 'group', srcCat: 'table' } })
            prevId2 = gid2; toolX2 += TOOL_X_GAP
          }
          const sqid2 = `import-${ts}-${cteKey}-sq`
          complexNodes.push({ id: sqid2, type: 'toolNode', position: { x: toolX2, y: tblToolY2 },
            data: { _toolId: 'subquery', nodeType: 'subquery',
                    alias: cteKey, customSql: '',
                    selectItems: outSI, mathItems: outMI,
                    caseWhens: [], conditions: parsedSub2.conditions } })
          complexEdges.push({ id: `import-${ts}-${cteKey}-sqe-${cei++}`, source: prevId2, target: sqid2,
            type: 'sqlEdge', ...getToolEdgeStyle('subquery'), markerEnd: MarkerType.ArrowClosed,
            data: { joinType: 'LEFT JOIN', mappings: [], isTool: true, tgtToolId: 'subquery', srcCat: 'table' } })

          prevToolId = sqid2; lastToolX = toolX2; lastToolY = tblToolY2
          rowY += ROW_H

        } else if (isVerbatim2) {
          // ── Pattern B: verbatim — display table nodes + SUBQ(verbatim) ────
          // Create visible table nodes + JOIN edges so the user can see which
          // tables are involved. SUBQ holds the full verbatim body; its _src_N
          // is silently dropped by dead-code elimination (customSql takes over).
          const verbFrom3  = getFromTblLocal(body)
          const verbJoins3 = parseJoinsLocal(body)
          const verbTblSet3 = new Map<string, string>()
          if (verbFrom3) verbTblSet3.set(verbFrom3.toLowerCase(), verbFrom3)
          for (const { srcTable, tgtTable } of verbJoins3) {
            verbTblSet3.set(srcTable.toLowerCase(), srcTable)
            verbTblSet3.set(tgtTable.toLowerCase(), tgtTable)
          }

          const { ids: verbTblIds3, toolX: verbTblX3, toolY: verbTblY3 } =
            layoutTables([...verbTblSet3.values()], cteKey, rowY)
          for (const { srcTable, tgtTable, joinType, mappings } of verbJoins3) {
            const sId3v = verbTblIds3.get(srcTable.toLowerCase())
            const tId3v = verbTblIds3.get(tgtTable.toLowerCase())
            if (!sId3v || !tId3v) continue
            complexEdges.push({ id: `import-${ts}-je-${cei++}`, source: sId3v, target: tId3v,
              type: 'sqlEdge', ...getEdgeStyle(joinType as any),
              markerEnd: MarkerType.ArrowClosed, data: { joinType, mappings } })
          }

          // SUBQ(verbatim) placed after the last sub-row of tables
          const sqid3 = `import-${ts}-${cteKey}-sq`
          complexNodes.push({ id: sqid3, type: 'toolNode',
            position: { x: verbTblX3, y: verbTblY3 },
            data: { _toolId: 'subquery', nodeType: 'subquery',
                    alias: cteKey, customSql: replaceCteRefs(body),
                    selectItems: [], mathItems: [], caseWhens: [], conditions: [] } })
          // Serial dep edge from previous CTE output (ordering guarantee)
          if (prevToolId) {
            complexEdges.push({ id: `import-${ts}-${cteKey}-sqe-${cei++}`, source: prevToolId, target: sqid3,
              type: 'sqlEdge', ...getToolEdgeStyle('subquery'), markerEnd: MarkerType.ArrowClosed,
              data: { joinType: 'LEFT JOIN', mappings: [], isTool: true, tgtToolId: 'subquery', srcCat: 'tool' } })
          }
          // Visual edge: primary table → SUBQ (shows which tables feed this verbatim block)
          const verbAnchor3 = verbFrom3
            ? (verbTblIds3.get(verbFrom3.toLowerCase()) ?? '')
            : ([...verbTblIds3.values()][0] ?? '')
          if (verbAnchor3) {
            complexEdges.push({ id: `import-${ts}-${cteKey}-tqe-${cei++}`, source: verbAnchor3, target: sqid3,
              type: 'sqlEdge', ...getToolEdgeStyle('subquery'), markerEnd: MarkerType.ArrowClosed,
              data: { joinType: 'LEFT JOIN', mappings: [], isTool: true, tgtToolId: 'subquery', srcCat: 'table' } })
          }
          prevToolId = sqid3; lastToolX = verbTblX3; lastToolY = verbTblY3
          rowY += ROW_H

        } else {
          // ── Pattern C: plain GROUP BY CTE ─────────────────────────────────
          const primaryF3 = getFromTblLocal(body)
          const joins3    = parseJoinsLocal(body)
          const { groupCols: gc3, aggs: ag3 } = parseGroupBy(body)
          const where3    = parseWhere(body)

          const tblSet3 = new Map<string, string>()
          if (primaryF3) tblSet3.set(primaryF3.toLowerCase(), primaryF3)
          for (const { srcTable, tgtTable } of joins3) {
            tblSet3.set(srcTable.toLowerCase(), srcTable)
            tblSet3.set(tgtTable.toLowerCase(), tgtTable)
          }
          const { ids: tblIds3, toolX: tblToolX3, toolY: tblToolY3 } =
            layoutTables([...tblSet3.values()], cteKey, rowY)
          for (const { srcTable, tgtTable, joinType, mappings } of joins3) {
            const sId3 = tblIds3.get(srcTable.toLowerCase())
            const tId3 = tblIds3.get(tgtTable.toLowerCase())
            if (!sId3 || !tId3) continue
            complexEdges.push({ id: `import-${ts}-je-${cei++}`, source: sId3, target: tId3,
              type: 'sqlEdge', ...getEdgeStyle(joinType as any),
              markerEnd: MarkerType.ArrowClosed, data: { joinType, mappings } })
          }
          const anchor3 = primaryF3
            ? (tblIds3.get(primaryF3.toLowerCase()) ?? [...tblIds3.values()][0]!)
            : ([...tblIds3.values()][0] ?? '')
          if (prevToolId) {
            complexEdges.push({ id: `import-${ts}-dep-${cei++}`, source: prevToolId, target: anchor3,
              type: 'sqlEdge', ...getToolEdgeStyle('group'), markerEnd: MarkerType.ArrowClosed,
              data: { joinType: 'LEFT JOIN', mappings: [], isTool: true, tgtToolId: 'table', srcCat: 'tool' } })
          }
          let prevId3 = anchor3; let toolX3 = tblToolX3
          if (where3.length) {
            const wid3 = `import-${ts}-${cteKey}-w`
            complexNodes.push({ id: wid3, type: 'toolNode', position: { x: toolX3, y: tblToolY3 },
              data: { _toolId: 'where', nodeType: 'where', conditions: where3 } })
            complexEdges.push({ id: `import-${ts}-${cteKey}-we-${cei++}`, source: prevId3, target: wid3,
              type: 'sqlEdge', ...getToolEdgeStyle('where'), markerEnd: MarkerType.ArrowClosed,
              data: { joinType: 'LEFT JOIN', mappings: [], isTool: true, tgtToolId: 'where', srcCat: 'table' } })
            prevId3 = wid3; toolX3 += TOOL_X_GAP
          }
          const gid3 = `import-${ts}-${cteKey}-g`
          complexNodes.push({ id: gid3, type: 'toolNode', position: { x: toolX3, y: tblToolY3 },
            data: { _toolId: 'group', nodeType: 'group', groupCols: gc3, aggs: ag3, filters: [] } })
          complexEdges.push({ id: `import-${ts}-${cteKey}-ge-${cei++}`, source: prevId3, target: gid3,
            type: 'sqlEdge', ...getToolEdgeStyle('group'), markerEnd: MarkerType.ArrowClosed,
            data: { joinType: 'LEFT JOIN', mappings: [], isTool: true, tgtToolId: 'group', srcCat: 'table' } })

          prevToolId = gid3; lastToolX = toolX3; lastToolY = tblToolY3
          rowY += ROW_H
        }
      }

      // ── Outer SQL: WHERE + ORDER BY ────────────────────────────────────────
      const outerConds = parseWhere(outerSql)
      const outerSort  = parseOrderBy(outerSql)
      let outerPrevId  = prevToolId
      let outerX       = lastToolX + TOOL_X_GAP

      if (outerConds.length && outerPrevId) {
        const wid4 = `import-${ts}-ow`
        complexNodes.push({ id: wid4, type: 'toolNode', position: { x: outerX, y: lastToolY },
          data: { _toolId: 'where', nodeType: 'where', conditions: outerConds } })
        complexEdges.push({ id: `import-${ts}-owe-${cei++}`, source: outerPrevId, target: wid4,
          type: 'sqlEdge', ...getToolEdgeStyle('where'), markerEnd: MarkerType.ArrowClosed,
          data: { joinType: 'LEFT JOIN', mappings: [], isTool: true, tgtToolId: 'where', srcCat: 'tool' } })
        outerPrevId = wid4; outerX += TOOL_X_GAP
      }
      if (outerSort.length && outerPrevId) {
        const sid2 = `import-${ts}-os`
        complexNodes.push({ id: sid2, type: 'toolNode', position: { x: outerX, y: lastToolY },
          data: { _toolId: 'sort', nodeType: 'sort', items: outerSort } })
        complexEdges.push({ id: `import-${ts}-ose-${cei++}`, source: outerPrevId, target: sid2,
          type: 'sqlEdge', ...getToolEdgeStyle('sort'), markerEnd: MarkerType.ArrowClosed,
          data: { joinType: 'LEFT JOIN', mappings: [], isTool: true, tgtToolId: 'sort', srcCat: 'tool' } })
      }

      const added = appendNodesToCanvas(complexNodes, complexEdges)
      for (const n of added) {
        if (n.data?.tableName) dragDrop.loadColumnsForNode(n.id, n.data.tableName)
      }
      importSuccess.value = true
      importSQL.value     = ''
      setTimeout(() => { importSuccess.value = false; showLoadModal.value = false }, 1500)
      return
    }

    // ── 6. Build table nodes ───────────────────────────────────────────────
    const ts       = Date.now()
    const tableIdx = new Map<string, number>()
    const GAP_X = 300, GAP_Y = 240, COLS = 3
    const nodes: any[] = tableNames.map((tbl, i) => {
      tableIdx.set(tbl.toLowerCase(), i)
      const importedSet = tableImportedCols.get(tbl.toLowerCase())
      return {
        id:       `import-${ts}-${i}`,
        type:     'sqlTable',
        position: { x: (i % COLS) * GAP_X, y: Math.floor(i / COLS) * GAP_Y },
        data: { label: tbl, tableName: tbl, objectName: tbl, module: '', type: 'T',
                details: [], visibleCols: [], filters: [], columnsLoading: true,
                ...(importedSet?.size ? { _importedCols: [...importedSet] } : {}) },
      }
    })

    // ── 7. Build JOIN edges ────────────────────────────────────────────────
    const edges: any[] = []
    let ei = 0
    for (const { srcTable, tgtTable, joinType, mappings } of edgeMap.values()) {
      const srcI = tableIdx.get(srcTable.toLowerCase())
      const tgtI = tableIdx.get(tgtTable.toLowerCase())
      if (srcI === undefined || tgtI === undefined) continue
      edges.push({
        id: `import-${ts}-e-${ei++}`,
        source: `import-${ts}-${srcI}`, target: `import-${ts}-${tgtI}`,
        type: 'sqlEdge', ...getEdgeStyle(joinType as any),
        markerEnd: MarkerType.ArrowClosed,
        data: { joinType, mappings },
      })
    }

    // ── 8. Build tool nodes ────────────────────────────────────────────────
    const TOOL_X = COLS * GAP_X + 80
    const TOOL_H = 164
    let toolY = 0

    function addToolNode(toolId: 'where' | 'group' | 'sort', data: any, sourceId: string) {
      const nid = `import-${ts}-tool-${ei++}`
      nodes.push({ id: nid, type: 'toolNode', position: { x: TOOL_X, y: toolY },
        data: { _toolId: toolId, ...data } })
      edges.push({ id: `import-${ts}-te-${ei++}`, source: sourceId, target: nid,
        type: 'sqlEdge', ...getToolEdgeStyle(toolId), markerEnd: MarkerType.ArrowClosed,
        data: { joinType: 'LEFT JOIN', mappings: [], isTool: true, tgtToolId: toolId, srcCat: 'table' } })
      toolY += TOOL_H
    }

    for (const scope of toolScopes) {
      const srcIdx = tableIdx.get(scope.rootTable.toLowerCase())
      if (srcIdx === undefined) continue
      const sourceId = `import-${ts}-${srcIdx}`
      if (scope.conditions.length)
        addToolNode('where', { nodeType: 'where', conditions: scope.conditions }, sourceId)
      if (scope.groupCols.length)
        addToolNode('group', { nodeType: 'group', groupCols: scope.groupCols, aggs: scope.aggs, filters: [] }, sourceId)
      if (scope.sortItems.length)
        addToolNode('sort', { nodeType: 'sort', items: scope.sortItems }, sourceId)
    }

    // ── 9. Append to canvas ────────────────────────────────────────────────
    const added = appendNodesToCanvas(nodes, edges)
    for (const n of added) {
      if (n.data?.tableName) dragDrop.loadColumnsForNode(n.id, n.data.tableName)
    }
    importSuccess.value = true
    importSQL.value     = ''
    setTimeout(() => {
      importSuccess.value = false
      showLoadModal.value = false
    }, 1500)
  } catch (e: any) {
    importError.value = `Parse error: ${e?.message ?? e}`
  }
}

const localTemplates  = computed(() => store.listTemplates())

async function openLoadModal() {
  showLoadModal.value = true
  loadTab.value       = 'cloud'
  loadingCloud.value  = true
  try {
    cloudItems.value = await api.listSQLBuilders()
  } catch {
    cloudItems.value = []
  } finally {
    loadingCloud.value = false
  }
}

async function loadPublicItems() {
  if (publicItems.value.length) return   // already loaded
  loadingPublic.value = true
  try {
    publicItems.value = await api.listPublicSQLBuilders()
  } catch {
    publicItems.value = []
  } finally {
    loadingPublic.value = false
  }
}

watch(loadTab, (tab) => {
  if (tab === 'public') loadPublicItems()
})

/** Remap node IDs + edge refs, offset positions, then append to canvas.
 *  New nodes are placed to the RIGHT of existing nodes (never overlapping),
 *  vertically centred relative to the existing cluster. */
function appendNodesToCanvas(rawNodes: any[], rawEdges: any[]): any[] {
  const suffix = `-${Date.now()}`
  const idMap  = new Map<string, string>()

  let dx = 0, dy = 0

  if (store.nodes.length && rawNodes.length) {
    // ── Right edge of existing nodes ──────────────────────────────────────
    const existRight = Math.max(...store.nodes.map((n: any) => {
      const w = parseFloat(String((n.style as any)?.width ?? 220))
      return (n.position?.x ?? 0) + (Number.isFinite(w) ? w : 220)
    }))

    // ── Vertical centre of existing nodes ─────────────────────────────────
    const existYLo = Math.min(...store.nodes.map((n: any) => n.position?.y ?? 0))
    const existYHi = Math.max(...store.nodes.map((n: any) => {
      const h = parseFloat(String((n.style as any)?.height ?? 80))
      return (n.position?.y ?? 0) + (Number.isFinite(h) ? h : 80)
    }))
    const existCY = (existYLo + existYHi) / 2

    // ── Bounding box of new nodes ──────────────────────────────────────────
    const newLeft  = Math.min(...rawNodes.map((n: any) => n.position?.x ?? 0))
    const newYLo   = Math.min(...rawNodes.map((n: any) => n.position?.y ?? 0))
    const newYHi   = Math.max(...rawNodes.map((n: any) => {
      const h = parseFloat(String((n.style as any)?.height ?? 80))
      return (n.position?.y ?? 0) + (Number.isFinite(h) ? h : 80)
    }))
    const newCY = (newYLo + newYHi) / 2

    dx = existRight + 140 - newLeft   // gap of 140 px to the right
    dy = existCY - newCY              // align vertical centres
  }

  const remappedNodes = rawNodes.map((n: any) => {
    const newId = n.id + suffix
    idMap.set(n.id, newId)
    const data = n.type === 'sqlTable' && n.data?.columnsLoading
      ? { ...n.data, columnsLoading: false }
      : n.data
    return {
      ...n,
      id: newId,
      data,
      position: { x: (n.position?.x ?? 0) + dx, y: (n.position?.y ?? 0) + dy },
    }
  })

  const remappedEdges = rawEdges.map((e: any) => ({
    ...e,
    id:     e.id + suffix,
    source: idMap.get(e.source) ?? (e.source + suffix),
    target: idMap.get(e.target) ?? (e.target + suffix),
  }))

  store.nodes = [...store.nodes, ...remappedNodes]
  store.edges = [...store.edges, ...remappedEdges]
  return remappedNodes
}

/** REPLACE: clear canvas and load item as the active document */
async function loadCloudToCanvas(item: BIListItem) {
  loadingId.value = item.id
  try {
    const data = await api.loadSQLBuilder(item.id)
    if (!data) return
    store.resetCanvas()
    store.nodes = (JSON.parse(data.nodesJson ?? '[]') as any[]).map((n: any) =>
      n.type === 'sqlTable' && n.data?.columnsLoading
        ? { ...n, data: { ...n.data, columnsLoading: false } }
        : n
    )
    store.edges = JSON.parse(data.edgesJson ?? '[]')
    store.savedId       = item.id
    store.savedName     = item.name
    store.savedIsPublic = item.isPublic ?? false
    showLoadModal.value = false
  } catch {
    // ignore
  } finally {
    loadingId.value = null
  }
}

/** APPEND: add item nodes to the RIGHT of the current canvas */
async function addCloudToCanvas(item: BIListItem) {
  appendingId.value = item.id
  try {
    const data = await api.loadSQLBuilder(item.id)
    if (!data) return
    const nodes = JSON.parse(data.nodesJson ?? '[]')
    const edges = JSON.parse(data.edgesJson ?? '[]')
    appendNodesToCanvas(nodes, edges)
    // Set as current save target only if canvas was empty before
    if (!store.savedId) {
      store.savedId   = item.id
      store.savedName = item.name
    }
  } catch {
    // ignore
  } finally {
    appendingId.value = null
  }
}

/** REPLACE local template */
function loadLocalToCanvas(id: string) {
  const tpl = store.listTemplates().find((t: any) => t.id === id)
  if (!tpl) return
  store.resetCanvas()
  store.nodes = ((tpl.nodes ?? []) as any[]).map((n: any) =>
    n.type === 'sqlTable' && n.data?.columnsLoading
      ? { ...n, data: { ...n.data, columnsLoading: false } }
      : n
  )
  store.edges = tpl.edges ?? []
  showLoadModal.value = false
}

/** APPEND local template */
function addLocalToCanvas(id: string) {
  const tpl = store.listTemplates().find((t: any) => t.id === id)
  if (!tpl) return
  appendNodesToCanvas(tpl.nodes ?? [], tpl.edges ?? [])
}

async function deleteFromCloud(id: string) {
  deletingId.value = id
  try {
    await api.deleteSQLBuilder(id)
    cloudItems.value = cloudItems.value.filter(i => i.id !== id)
  } finally {
    deletingId.value = null
  }
}

function nodeStats(nodes: any[]) {
  const tables = nodes.filter((n: any) => n.type === 'sqlTable').length
  const tools  = nodes.filter((n: any) => n.type === 'toolNode').length
  return { tables, tools, total: nodes.length }
}
</script>

<template>
  <header class="flex items-center gap-3 px-4 h-11 border-b shrink-0 bg-background z-20">
    <SidebarTrigger class="-ml-1" />
    <div class="h-4 w-px bg-border" />
    <!-- Title -->
    <div class="flex items-center gap-2">
      <div class="flex size-7 items-center justify-center rounded-lg bg-sky-500/10 border border-sky-500/20">
        <Code2 class="size-3.5 text-sky-500" />
      </div>
      <span class="font-semibold text-sm">SQL Builder</span>
    </div>

    <div class="h-4 w-px bg-border" />

    <!-- Stats -->
    <span class="text-xs text-muted-foreground">
      {{ store.tableNodes.length }} tables ·
      {{ store.edges.length }} joins ·
      {{ store.toolNodes.length }} operations
    </span>

    <!-- Actions -->
    <div class="ml-auto flex items-center gap-2">

      <!-- Undo / Redo -->
      <button @click="undo" :disabled="!canUndo"
        class="flex items-center gap-1 text-xs px-2 py-1.5 border rounded-lg hover:bg-accent transition-colors disabled:opacity-30"
        title="Undo (Ctrl+Z)">
        <Undo2 class="size-3.5" />
      </button>
      <button @click="redo" :disabled="!canRedo"
        class="flex items-center gap-1 text-xs px-2 py-1.5 border rounded-lg hover:bg-accent transition-colors disabled:opacity-30"
        title="Redo (Ctrl+Y)">
        <Redo2 class="size-3.5" />
      </button>

      <div class="h-4 w-px bg-border" />


      <!-- Template save/load dropdown -->
      <div class="relative">
        <button
          @click="showTemplateMenu = !showTemplateMenu"
          class="flex items-center gap-1 text-xs px-2 py-1.5 border rounded-lg hover:bg-accent transition-colors"
          title="Templates"
        >
          <BookMarked class="size-3.5" />
          <span class="hidden sm:inline">Templates</span>
        </button>

        <!-- Invisible backdrop to close on outside click -->
        <div v-if="showTemplateMenu" class="fixed inset-0 z-40" @click="closeTemplateMenu" />

        <Transition name="fade">
          <div
            v-if="showTemplateMenu"
            class="absolute right-0 top-full mt-1 z-50 bg-background border rounded-xl shadow-2xl w-64 overflow-hidden"
          >
            <!-- Save section -->
            <div class="p-3 border-b">
              <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">บันทึก Template</p>
              <div class="flex gap-1.5">
                <input v-model="templateName" placeholder="ชื่อ template…"
                  class="flex-1 text-xs border rounded-lg px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-sky-400" />
                <button @click="saveTemplate"
                  class="flex items-center gap-1 text-xs px-2.5 py-1 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-semibold transition-colors">
                  <BookmarkPlus class="size-3" />
                </button>
              </div>
            </div>

            <!-- Saved templates list -->
            <div class="max-h-48 overflow-y-auto">
              <div v-if="!templates.length" class="px-3 py-4 text-xs text-muted-foreground/60 text-center italic">
                ยังไม่มี template ที่บันทึก
              </div>
              <div
                v-for="tpl in templates" :key="tpl.id"
                class="flex items-center gap-2 px-3 py-2 hover:bg-accent transition-colors"
              >
                <button @click="loadTemplate(tpl.id)"
                  class="flex-1 text-left text-xs font-medium truncate hover:text-sky-500">
                  {{ tpl.name }}
                </button>
                <span class="text-[9px] text-muted-foreground/60 shrink-0">
                  {{ new Date(tpl.createdAt).toLocaleDateString('th-TH') }}
                </span>
                <button @click.stop="deleteTemplate(tpl.id)"
                  class="size-4 flex items-center justify-center text-muted-foreground hover:text-destructive shrink-0">
                  <Trash2 class="size-3" />
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>

      <!-- JSON Export -->
      <button @click="downloadJSON" :disabled="!store.hasNodes"
        class="flex items-center gap-1 text-xs px-2 py-1.5 border rounded-lg hover:bg-accent transition-colors disabled:opacity-30"
        title="Export JSON">
        <Download class="size-3.5" />
        <span class="hidden sm:inline">JSON</span>
      </button>

      <div class="h-4 w-px bg-border" />

      <!-- Load from cloud -->
      <button @click="openLoadModal"
        class="flex items-center gap-1 text-xs px-2 py-1.5 border rounded-lg hover:bg-accent transition-colors"
        title="โหลด template จาก cloud">
        <CloudDownload class="size-3.5" />
        <span class="hidden sm:inline">Load</span>
      </button>

      <!-- Send to DataModel -->
      <button @click="sendToDataModel" :disabled="!store.generatedSQL"
        class="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-40">
        <ArrowRight class="size-3.5" /> DataModel
      </button>

      <!-- Clear -->
      <button @click="resetCanvas"
        class="text-xs px-2 py-1.5 border rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors"
        title="Clear canvas">
        <Trash2 class="size-3.5" />
      </button>

      <!-- AI Assistant (paying customers only) -->
      <button
        v-if="aiEnabled"
        @click="aiStore.togglePanel('sql-builder')"
        :class="[
          'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all',
          aiStore.openPage === 'sql-builder'
            ? 'bg-violet-500 text-white border-violet-500'
            : 'border-violet-300 text-violet-600 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-950/30',
        ]"
        title="AI Assistant"
      >
        <Sparkles class="size-3.5" />
        AI
      </button>

      <div class="h-4 w-px bg-border" />
      <AppDisplayControls />
    </div>
  </header>

  <!-- ── Load Modal (Cloud + Local templates) ──────────────────────────── -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showLoadModal"
        class="fixed inset-0 z-[200] flex items-center justify-center bg-black/50"
        @click.self="showLoadModal = false">
        <div class="bg-background border rounded-2xl shadow-2xl w-full max-w-lg p-6">
          <!-- Header -->
          <div class="flex items-center gap-2 mb-4">
            <CloudDownload class="size-5 text-sky-500" />
            <h2 class="font-bold text-sm">เพิ่ม Template ลง Canvas</h2>
            <button @click="showLoadModal = false" class="ml-auto text-muted-foreground hover:text-foreground">
              <XIcon class="size-4" />
            </button>
          </div>

          <!-- Tabs -->
          <div class="flex gap-1 mb-3 p-1 bg-muted/50 rounded-lg">
            <button
              @click="loadTab = 'cloud'"
              :class="['flex-1 text-xs py-1 rounded-md font-medium transition-colors',
                loadTab === 'cloud' ? 'bg-background shadow text-sky-600' : 'text-muted-foreground hover:text-foreground']"
            >
              ของฉัน <span class="text-[10px] opacity-60">({{ cloudItems.length }})</span>
            </button>
            <button
              @click="loadTab = 'public'"
              :class="['flex-1 text-xs py-1 rounded-md font-medium transition-colors',
                loadTab === 'public' ? 'bg-background shadow text-sky-600' : 'text-muted-foreground hover:text-foreground']"
            >
              <Globe class="size-3 inline-block mr-0.5 -mt-px" />สาธารณะ
            </button>
            <button
              @click="loadTab = 'local'"
              :class="['flex-1 text-xs py-1 rounded-md font-medium transition-colors',
                loadTab === 'local' ? 'bg-background shadow text-sky-600' : 'text-muted-foreground hover:text-foreground']"
            >
              Local <span class="text-[10px] opacity-60">({{ localTemplates.length }})</span>
            </button>
            <button
              @click="loadTab = 'import'"
              :class="['flex-1 text-xs py-1 rounded-md font-medium transition-colors',
                loadTab === 'import' ? 'bg-background shadow text-emerald-600' : 'text-muted-foreground hover:text-foreground']"
            >
              Import SQL
            </button>
          </div>

          <!-- ── Cloud tab ── -->
          <div v-if="loadTab === 'cloud'">
            <div v-if="loadingCloud" class="flex items-center justify-center gap-2 py-8 text-muted-foreground text-xs">
              <Loader2 class="size-4 animate-spin" /> กำลังโหลด…
            </div>
            <div v-else-if="!cloudItems.length" class="text-center py-8 text-xs text-muted-foreground/60 italic">
              ยังไม่มีข้อมูล Cloud ที่บันทึกไว้
            </div>
            <div v-else class="flex flex-col gap-1 max-h-80 overflow-y-auto -mx-1 px-1">
              <div
                v-for="item in cloudItems" :key="item.id"
                class="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-accent transition-colors group"
              >
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">{{ item.name }}</p>
                  <p class="text-[10px] text-muted-foreground/60">
                    {{ new Date(item.updatedAt ?? item.createdAt).toLocaleString('th-TH') }}
                  </p>
                </div>
                <!-- Load (replace) -->
                <button
                  @click.stop="loadCloudToCanvas(item)"
                  :disabled="loadingId === item.id || appendingId === item.id"
                  class="flex items-center gap-1 text-[10px] px-2.5 py-1 border rounded-lg font-semibold transition-colors disabled:opacity-50 shrink-0 hover:bg-accent"
                  title="โหลดแทน Canvas ปัจจุบัน"
                >
                  <Loader2 v-if="loadingId === item.id" class="size-3 animate-spin" />
                  <FolderOpen v-else class="size-3" />
                  <span class="hidden sm:inline">Load</span>
                </button>
                <!-- Add beside -->
                <button
                  @click.stop="addCloudToCanvas(item)"
                  :disabled="appendingId === item.id || loadingId === item.id"
                  class="flex items-center gap-1 text-[10px] px-2.5 py-1 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 shrink-0"
                  title="เพิ่มต่อจาก Canvas ปัจจุบัน"
                >
                  <Loader2 v-if="appendingId === item.id" class="size-3 animate-spin" />
                  <PlusCircle v-else class="size-3" />
                  <span>Add</span>
                </button>
                <!-- Delete -->
                <button
                  @click.stop="deleteFromCloud(item.id)"
                  :disabled="deletingId === item.id"
                  class="size-7 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all disabled:opacity-50 shrink-0"
                >
                  <Loader2 v-if="deletingId === item.id" class="size-3.5 animate-spin" />
                  <Trash2 v-else class="size-3.5" />
                </button>
              </div>
            </div>
          </div>

          <!-- ── Public tab ── -->
          <div v-else-if="loadTab === 'public'">
            <div v-if="loadingPublic" class="flex items-center justify-center gap-2 py-8 text-muted-foreground text-xs">
              <Loader2 class="size-4 animate-spin" /> กำลังโหลด…
            </div>
            <div v-else-if="!publicItems.length" class="text-center py-8 text-xs text-muted-foreground/60 italic">
              ยังไม่มี Query สาธารณะ
            </div>
            <div v-else class="flex flex-col gap-1 max-h-80 overflow-y-auto -mx-1 px-1">
              <div
                v-for="item in publicItems" :key="item.id"
                class="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-accent transition-colors group"
              >
                <Globe class="size-3.5 text-sky-400 shrink-0" />
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">{{ item.name }}</p>
                  <p class="text-[10px] text-muted-foreground/60">
                    {{ item.createdBy }} ·
                    {{ new Date(item.updatedAt ?? item.createdAt).toLocaleString('th-TH') }}
                  </p>
                </div>
                <!-- Load (replace) -->
                <button
                  @click.stop="loadCloudToCanvas(item)"
                  :disabled="loadingId === item.id || appendingId === item.id"
                  class="flex items-center gap-1 text-[10px] px-2.5 py-1 border rounded-lg font-semibold transition-colors disabled:opacity-50 shrink-0 hover:bg-accent"
                  title="โหลดแทน Canvas ปัจจุบัน"
                >
                  <Loader2 v-if="loadingId === item.id" class="size-3 animate-spin" />
                  <FolderOpen v-else class="size-3" />
                  <span class="hidden sm:inline">Load</span>
                </button>
                <!-- Add beside -->
                <button
                  @click.stop="addCloudToCanvas(item)"
                  :disabled="appendingId === item.id || loadingId === item.id"
                  class="flex items-center gap-1 text-[10px] px-2.5 py-1 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 shrink-0"
                  title="เพิ่มต่อจาก Canvas ปัจจุบัน"
                >
                  <Loader2 v-if="appendingId === item.id" class="size-3 animate-spin" />
                  <PlusCircle v-else class="size-3" />
                  <span>Add</span>
                </button>
              </div>
            </div>
          </div>

          <!-- ── Local tab ── -->
          <div v-else-if="loadTab === 'local'">
            <div v-if="!localTemplates.length" class="text-center py-8 text-xs text-muted-foreground/60 italic">
              ยังไม่มี Template ที่บันทึกไว้ในเครื่อง
            </div>
            <div v-else class="flex flex-col gap-1 max-h-80 overflow-y-auto -mx-1 px-1">
              <div
                v-for="tpl in localTemplates" :key="tpl.id"
                class="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-accent transition-colors group"
              >
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">{{ tpl.name }}</p>
                  <p class="text-[10px] text-muted-foreground/60">
                    {{ nodeStats(tpl.nodes ?? []).tables }} tables ·
                    {{ nodeStats(tpl.nodes ?? []).tools }} ops ·
                    {{ new Date(tpl.createdAt).toLocaleDateString('th-TH') }}
                  </p>
                </div>
                <!-- Load (replace) -->
                <button
                  @click.stop="loadLocalToCanvas(tpl.id)"
                  class="flex items-center gap-1 text-[10px] px-2.5 py-1 border rounded-lg font-semibold transition-colors shrink-0 hover:bg-accent"
                  title="โหลดแทน Canvas ปัจจุบัน"
                >
                  <FolderOpen class="size-3" />
                  <span class="hidden sm:inline">Load</span>
                </button>
                <!-- Add beside -->
                <button
                  @click.stop="addLocalToCanvas(tpl.id)"
                  class="flex items-center gap-1 text-[10px] px-2.5 py-1 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-semibold transition-colors shrink-0"
                  title="เพิ่มต่อจาก Canvas ปัจจุบัน"
                >
                  <PlusCircle class="size-3" />
                  <span>Add</span>
                </button>
                <!-- Delete -->
                <button
                  @click.stop="deleteTemplate(tpl.id)"
                  class="size-7 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all shrink-0"
                >
                  <Trash2 class="size-3.5" />
                </button>
              </div>
            </div>
          </div>

          <!-- ── Import Query tab ── -->
          <div v-if="loadTab === 'import'" class="flex flex-col gap-3">

            <!-- Step 1: SQL input -->
            <template v-if="importStep === 'input'">
              <div class="flex items-center gap-2">
                <FileCode2 class="size-4 text-emerald-500 shrink-0" />
                <div>
                  <p class="text-xs font-semibold">Import จาก SQL Query</p>
                  <p class="text-[10px] text-muted-foreground">วาง Generated SQL เพื่อสร้าง Table nodes อัตโนมัติ</p>
                </div>
              </div>

              <textarea
                v-model="importSQL"
                placeholder="วาง SQL ที่นี่…&#10;เช่น:&#10;SELECT ...&#10;FROM table_a&#10;  LEFT JOIN table_b ON table_b.id = table_a.b_id"
                class="w-full h-48 px-3 py-2.5 rounded-xl border bg-muted/30 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none"
                spellcheck="false"
              />

              <p v-if="importError" class="text-xs text-destructive">{{ importError }}</p>

              <div v-if="importSuccess" class="flex items-center gap-2 text-emerald-500 text-xs font-semibold">
                <CheckCheck class="size-4" /> สร้าง nodes สำเร็จ!
              </div>

              <div class="flex items-center gap-2 p-3 rounded-xl bg-muted/40 border text-[10px] text-muted-foreground leading-relaxed">
                <span class="shrink-0">💡</span>
                <span>ระบบจะอ่าน <code class="font-mono bg-muted px-1 rounded">FROM</code> และ <code class="font-mono bg-muted px-1 rounded">JOIN</code> เพื่อสร้าง Table node พร้อม mapping อัตโนมัติ ตัวแปร <code class="font-mono bg-muted px-1 rounded">{key}</code> จะถูกถามค่าก่อน Import</span>
              </div>

              <button
                @click="importSQLToCanvas"
                class="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors"
              >
                <FileCode2 class="size-4" /> สร้าง Nodes จาก SQL
              </button>
            </template>

            <!-- Step 2: Template variable substitution -->
            <template v-else-if="importStep === 'vars'">
              <!-- Header -->
              <div class="flex items-center gap-2">
                <button
                  @click="importStep = 'input'"
                  class="size-6 flex items-center justify-center rounded-lg hover:bg-accent text-muted-foreground transition-colors shrink-0"
                  title="ย้อนกลับ"
                >
                  <ChevronLeft class="size-4" />
                </button>
                <Braces class="size-4 text-amber-500 shrink-0" />
                <div>
                  <p class="text-xs font-semibold">ตัวแปรใน Query ({{ templateVars.length }} รายการ)</p>
                  <p class="text-[10px] text-muted-foreground">ระบุค่าของตัวแปรก่อนนำเข้า</p>
                </div>
              </div>

              <!-- Variable inputs -->
              <div class="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                <div
                  v-for="v in templateVars"
                  :key="v.key"
                  class="flex items-center gap-2 p-2.5 rounded-xl border bg-muted/20"
                >
                  <code class="text-[11px] font-mono text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md shrink-0 min-w-0 max-w-[40%] truncate">
                    &#123;{{ v.key }}&#125;
                  </code>
                  <span class="text-muted-foreground text-xs shrink-0">=</span>
                  <input
                    v-model="v.value"
                    :placeholder="`ค่าของ ${v.key}…`"
                    class="flex-1 min-w-0 text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-amber-400"
                    @keydown.enter.prevent="confirmVarsAndImport"
                  />
                </div>
              </div>

              <p v-if="importError" class="text-xs text-destructive">{{ importError }}</p>

              <!-- Actions -->
              <div class="flex gap-2">
                <button
                  @click="importStep = 'input'"
                  class="flex-1 py-2.5 rounded-xl border text-xs font-semibold transition-colors hover:bg-accent"
                >
                  ย้อนกลับ
                </button>
                <button
                  @click="confirmVarsAndImport"
                  class="flex-[2] flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors"
                >
                  <CheckCheck class="size-4" /> ยืนยัน → สร้าง Nodes
                </button>
              </div>
            </template>

          </div>

          <!-- Footer hint -->
          <p v-if="loadTab !== 'import'" class="text-[10px] text-muted-foreground/50 text-center mt-3">
            <span class="font-semibold">Load</span> = โหลดแทน canvas ปัจจุบัน &nbsp;·&nbsp;
            <span class="font-semibold">Add</span> = เพิ่มไว้ข้างๆ node ที่มีอยู่
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
