<script setup lang="ts">
/**
 * SQL Builder — Free-form SQL Editor (Navicat-like)
 * Lets users who know SQL write/edit the entire query by hand with
 * autocomplete for keywords, ERP tables, and columns (table.<cursor>).
 * On Apply: hands SQL to SqlBuilderHeader.runImport via store.pendingImportSql
 * so the existing parser rebuilds canvas nodes from the typed SQL.
 */
import { storeToRefs } from 'pinia'
import { Code2, X, Sparkles, Play, FileText, KeyRound, Loader2, TableIcon, AlertCircle, ChevronDown } from 'lucide-vue-next'
import type { ColDef } from 'ag-grid-community'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { useErpData } from '~/composables/sql-builder/useErpData'
import { useMangoBIApi } from '~/composables/useMangoBIApi'
import type { ColumnInfo } from '~/types/sql-builder'

// Lazy-load AG Grid — mirrors the pattern in pages/datamodel.vue so we share
// the same module registration and theme across the app.
let _agGridReady = false
const AgGridVue = defineAsyncComponent(async () => {
  const [{ AgGridVue: Grid }, { ClientSideRowModelModule, CommunityFeaturesModule, ModuleRegistry }] = await Promise.all([
    import('ag-grid-vue3'),
    import('ag-grid-community'),
  ])
  if (!_agGridReady) {
    ModuleRegistry.registerModules([ClientSideRowModelModule, CommunityFeaturesModule])
    _agGridReady = true
  }
  return Grid
})

const { t } = useI18n()

const colorMode  = useColorMode()
const isDark     = computed(() => colorMode.value === 'dark')
const themeClass = computed(() => isDark.value ? 'ag-theme-quartz-dark' : 'ag-theme-quartz')

const store   = useSqlBuilderStore()
const erpData = useErpData()
const api     = useMangoBIApi()
const { showSqlEditor, sourceSql } = storeToRefs(store)

const sqlText  = ref('')
const elRef    = ref<HTMLTextAreaElement | null>(null)
const errorMsg = ref('')

// ── Run / Preview (raw rows from executeQuery) ────────────────────────────
// Mirrors the DataModel page sample-data grid: AgGrid with auto-generated
// ColDefs from the first row's keys. No transforms — just the raw result.
const previewRows    = ref<Record<string, unknown>[]>([])
const previewLoading = ref(false)
const previewError   = ref('')
const previewShown   = ref(false)
const previewRanAt   = ref<Date | null>(null)

const previewColDefs = computed<ColDef[]>(() => {
  const sample = previewRows.value[0]
  if (!sample) return []
  return Object.keys(sample).map(k => ({
    field:                  k,
    headerName:             k,
    sortable:               true,
    resizable:              true,
    filter:                 true,
    enableCellTextSelection: true,
    valueFormatter:         (p: any) => p?.value == null ? '' : String(p.value),
  }))
})

async function runPreview() {
  const sql = sqlText.value.trim()
  if (!sql) { previewError.value = t('sqlbuilder_editor_err_empty'); previewShown.value = true; return }
  if (!/^\s*(WITH|SELECT)\b/i.test(sql)) {
    previewError.value = t('sqlbuilder_editor_err_select_only')
    previewShown.value = true
    return
  }
  previewError.value = ''
  previewLoading.value = true
  previewShown.value   = true
  try {
    const res = await api.executeQuery(sql)
    if (!res || !Array.isArray(res.rows)) {
      previewError.value = t('sqlbuilder_editor_err_execute_failed')
      previewRows.value  = []
    } else {
      previewRows.value = res.rows
      previewRanAt.value = new Date()
      if (!res.rows.length) previewError.value = t('sqlbuilder_editor_err_no_data')
    }
  } catch (e: any) {
    previewError.value = e?.message ?? 'Execute error'
    previewRows.value  = []
  } finally {
    previewLoading.value = false
  }
}

function closePreview() {
  previewShown.value = false
  previewError.value = ''
}

watch(showSqlEditor, async (open) => {
  if (!open) {
    previewShown.value = false
    previewRows.value  = []
    previewError.value = ''
    return
  }
  sqlText.value  = sourceSql.value || ''
  errorMsg.value = ''
  previewRows.value  = []
  previewError.value = ''
  previewShown.value = false
  // Eagerly populate autocomplete sources
  // - addspecTables: ALL DB tables (richer — Master/Addspec_Table_ReadList)
  // - modules/objects: kept for fallback in case addspec call fails
  erpData.loadAddspecTables()
  if (!store.modules.length) erpData.loadModules()
  await nextTick()
  elRef.value?.focus()
})

function close() { store.showSqlEditor = false }

// ── Apply ──────────────────────────────────────────────────────────────────
function apply() {
  const sql = sqlText.value.trim()
  if (!sql) { errorMsg.value = t('sqlbuilder_editor_err_empty'); return }
  if (!/^\s*(WITH|SELECT)\b/i.test(sql)) {
    errorMsg.value = t('sqlbuilder_editor_err_select_only')
    return
  }
  errorMsg.value = ''
  store.pendingImportSql = sql      // SqlBuilderHeader watcher picks this up
  close()
}

// ── Autocomplete pool ──────────────────────────────────────────────────────
const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS NULL', 'IS NOT NULL',
  'LIKE', 'BETWEEN', 'GROUP BY', 'ORDER BY', 'HAVING', 'DISTINCT', 'TOP', 'AS',
  'LEFT JOIN', 'INNER JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN', 'ON',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'WITH', 'UNION ALL', 'UNION',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
  'COALESCE', 'ISNULL', 'NULLIF', 'CAST', 'CONVERT',
  'GETDATE', 'DATEADD', 'DATEDIFF', 'YEAR', 'MONTH', 'DAY',
  'ROUND', 'ABS', 'LEN', 'UPPER', 'LOWER', 'TRIM', 'SUBSTRING', 'REPLACE',
  'EXISTS', 'NOT EXISTS', 'CROSS APPLY', 'OUTER APPLY',
]

interface SnippetDef { label: string; insert: string; description: string }
const SNIPPETS: SnippetDef[] = [
  {
    label: 'snip:WITH cte',
    description: 'CTE skeleton',
    insert: 'WITH cte_name AS (\n  SELECT *\n  FROM table_name\n  WHERE 1=1\n)\nSELECT *\nFROM   cte_name',
  },
  {
    label: 'snip:LEFT JOIN',
    description: 'LEFT JOIN with ON',
    insert: 'LEFT JOIN target_table t\n  ON t.id = source.id',
  },
  {
    label: 'snip:GROUP BY + agg',
    description: 'aggregate template',
    insert: 'SELECT col_a,\n       SUM(col_b) AS total\nFROM   table_name\nGROUP  BY col_a',
  },
  {
    label: 'snip:CASE WHEN',
    description: 'conditional column',
    insert: "CASE WHEN col = 'A' THEN 'Alpha'\n     WHEN col = 'B' THEN 'Beta'\n     ELSE 'Other'\nEND",
  },
  {
    label: 'snip:ROW_NUMBER',
    description: 'window numbering',
    insert: 'ROW_NUMBER() OVER (PARTITION BY group_col ORDER BY sort_col) AS rn',
  },
]

// Flat table list across all modules — name + remark for display.
// Primary source: Addspec_Table_ReadList (covers ALL DB tables).
// Fallback: store.objects (only registered objects) — used while addspec
// is still loading or if the upstream call failed.
interface TblItem { name: string; remark: string; module: string }
const allTables = computed((): TblItem[] => {
  if (store.addspecTables.length) {
    const seen = new Set<string>()
    const out: TblItem[] = []
    for (const t of store.addspecTables) {
      const key = t.table_name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        name:   t.table_name,
        remark: (t.remark ?? '').trim(),
        module: t.module ?? '',
      })
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }
  // Fallback: registered objects only
  const out: TblItem[] = []
  for (const mod of store.modules) {
    for (const o of (store.objects[mod] ?? [])) {
      if (o?.object_type === 'T' && o.object_name) {
        out.push({ name: o.object_name, remark: o.remark ?? '', module: mod })
      }
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
})

// table_name → columns (lazy-loaded per autocomplete request)
const tableCols = ref<Record<string, ColumnInfo[]>>({})
const loadingCols = ref<Set<string>>(new Set())

async function ensureColumns(table: string) {
  const key = table.toLowerCase()
  if (tableCols.value[key] || loadingCols.value.has(key)) return
  loadingCols.value.add(key)
  try {
    const cols = await erpData.loadTableColumnsEnriched(table)
    tableCols.value = { ...tableCols.value, [key]: cols }
  } catch {
    tableCols.value = { ...tableCols.value, [key]: [] }
  } finally {
    loadingCols.value.delete(key)
  }
}

// ── Suggestion dropdown ────────────────────────────────────────────────────
type SuggestKind = 'keyword' | 'table' | 'col' | 'snip'
interface Suggestion {
  text:        string
  insert:      string          // what we paste (may differ from text for snippets)
  kind:        SuggestKind
  description?: string
  pk?:          boolean
  type?:        string
}

const KIND_META: Record<SuggestKind, { label: string; cls: string }> = {
  keyword: { label: 'SQL',  cls: 'bg-sky-500/20 text-sky-500' },
  table:   { label: 'TBL',  cls: 'bg-emerald-500/20 text-emerald-500' },
  col:     { label: 'COL',  cls: 'bg-amber-500/20 text-amber-500' },
  snip:    { label: 'SNIP', cls: 'bg-violet-500/20 text-violet-500' },
}

const dropdown = reactive({
  show: false,
  items: [] as Suggestion[],
  active: 0,
  top: 0, left: 0, width: 0,
  contextStart: 0,   // index in textarea where current "word" begins
  contextEnd:   0,   // cursor position
})

function wordAtCursor(): { word: string; start: number; end: number; tablePrefix?: string } {
  const el = elRef.value
  if (!el) return { word: '', start: 0, end: 0 }
  const cursor = el.selectionStart ?? 0
  const before = el.value.slice(0, cursor)

  // Table-qualified pattern: <ident>.<partial>
  const qm = /(\w+)\.(\w*)$/.exec(before)
  if (qm) {
    return {
      word:        qm[2] ?? '',
      tablePrefix: qm[1]!,
      start:       cursor - (qm[2]?.length ?? 0),
      end:         cursor,
    }
  }

  // Plain word
  const wm = /\w+$/.exec(before)
  if (wm) return { word: wm[0], start: cursor - wm[0].length, end: cursor }
  return { word: '', start: cursor, end: cursor }
}

// Look up the table for an alias by scanning the current SQL text:
//   FROM table [AS] alias
//   JOIN table [AS] alias
// Returns the real table name (case-preserved) if the alias matches, else
// returns the input as-is so users can type the real table name directly.
function resolveAliasOrTable(prefix: string, sqlBefore: string): string | null {
  const lp = prefix.toLowerCase()
  const re = /\b(?:FROM|JOIN)\s+(\[?\w[\w.]*\]?)\s*(?:AS\s+)?(\w+)?/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(sqlBefore)) !== null) {
    const tbl = (m[1] ?? '').replace(/[\[\]]/g, '')
    const alias = (m[2] ?? tbl).toLowerCase()
    if (alias === lp) return tbl
    if (tbl.toLowerCase() === lp) return tbl
  }
  // Direct table-name typed (no alias yet)
  const direct = allTables.value.find(t => t.name.toLowerCase() === lp)
  return direct?.name ?? null
}

// All FROM/JOIN tables in the entire SQL text — these define the column scope
// at the cursor position. CTE refs are skipped (they don't have addspec columns).
interface ScopeTable { realTable: string; alias: string }
function getInScopeTables(sql: string): ScopeTable[] {
  const cteNames = new Set<string>()
  const cteRe = /\b(\w+)\s+AS\s*\(/gi
  // Pick up CTE names declared right after WITH (loose — best-effort skip list)
  if (/^\s*WITH\b/i.test(sql)) {
    let m: RegExpExecArray | null
    while ((m = cteRe.exec(sql)) !== null) cteNames.add(m[1]!.toLowerCase())
  }

  const out: ScopeTable[] = []
  const seen = new Set<string>()
  const re = /\b(?:FROM|JOIN)\s+(?!\()(\[?\w[\w.]*\]?)(?:\s+(?:AS\s+)?(\w+))?/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(sql)) !== null) {
    const tbl = (m[1] ?? '').replace(/[\[\]]/g, '')
    const low = tbl.toLowerCase()
    if (cteNames.has(low)) continue
    if (seen.has(low)) continue
    seen.add(low)
    out.push({ realTable: tbl, alias: m[2] ?? tbl })
  }
  return out
}

// Is the cursor in a position where a column reference is expected?
// Triggered after SELECT, comma, WHERE/AND/OR, ON, GROUP/ORDER/PARTITION BY,
// HAVING, or inside parens of common SQL functions.
const COL_CONTEXT_RE =
  /(?:\bSELECT\b|,|\bWHERE\b|\bAND\b|\bOR\b|\bON\b|\bBY\b|\bHAVING\b|\bSET\b|\(|\bWHEN\b|\bTHEN\b|\bELSE\b)\s*\w*$/i
function isInColumnContext(textBeforeCursor: string): boolean {
  return COL_CONTEXT_RE.test(textBeforeCursor)
}

function buildSuggestions(): Suggestion[] {
  const ctx = wordAtCursor()
  if (!ctx.word && !ctx.tablePrefix) return []

  const el = elRef.value!
  const wLower = ctx.word.toLowerCase()
  const out: Suggestion[] = []

  // ── Column suggestion when user typed `alias.` ──────────────────────────
  if (ctx.tablePrefix) {
    const realTable = resolveAliasOrTable(ctx.tablePrefix, el.value.slice(0, ctx.end))
    if (realTable) {
      ensureColumns(realTable)
      const cols = tableCols.value[realTable.toLowerCase()] ?? []
      for (const c of cols) {
        if (wLower && !c.column_name.toLowerCase().startsWith(wLower)) continue
        out.push({
          text:        c.column_name,
          insert:      c.column_name,
          kind:        'col',
          description: c.remark || c.column_type,
          pk:          c.data_pk === 'Y',
          type:        c.column_type,
        })
        if (out.length >= 30) break
      }
      return out
    }
    // Fall through — no real table match. Don't suggest tables/keywords after dot.
    return []
  }

  // ── Column-context: cursor after SELECT/WHERE/AND/OR/ON/BY/HAVING/comma ──
  // Suggest columns from every FROM/JOIN table in scope (whole query scan).
  // This is the key UX the user asked for:
  //   SELECT xxx FROM chq_proj   → xxx suggests chq_proj.<columns>
  //   SELECT a.id, xxx FROM bd_proj_h a JOIN ar_cust b ON …
  //     → xxx suggests columns of bd_proj_h AND ar_cust
  const textBefore = el.value.slice(0, ctx.end)
  if (isInColumnContext(textBefore)) {
    const scope = getInScopeTables(el.value)
    if (scope.length) {
      const seenCols = new Set<string>()         // dedupe across tables
      for (const t of scope) ensureColumns(t.realTable)
      for (const t of scope) {
        const cols = tableCols.value[t.realTable.toLowerCase()] ?? []
        for (const c of cols) {
          if (wLower && !c.column_name.toLowerCase().startsWith(wLower)) continue
          const key = `${t.realTable.toLowerCase()}.${c.column_name.toLowerCase()}`
          if (seenCols.has(key)) continue
          seenCols.add(key)
          out.push({
            text:        c.column_name,
            insert:      c.column_name,
            kind:        'col',
            description: `${t.alias === t.realTable ? t.realTable : t.alias + ' · ' + t.realTable}${c.remark ? ' — ' + c.remark : ''}`,
            pk:          c.data_pk === 'Y',
            type:        c.column_type,
          })
          if (out.length >= 30) break
        }
        if (out.length >= 30) break
      }

      // Also let the user keep typing keywords (FROM/WHERE/etc.) so an empty
      // scope query like `SELECT xxx F` still surfaces FROM.
      let kwAdded = 0
      for (const k of SQL_KEYWORDS) {
        if (k.toLowerCase().startsWith(wLower)) {
          out.push({ text: k, insert: k, kind: 'keyword' })
          if (++kwAdded >= 4) break
        }
      }
      return out
    }
  }

  // ── Plain word context: keywords + tables + snippets ────────────────────
  // Keywords
  for (const k of SQL_KEYWORDS) {
    if (k.toLowerCase().startsWith(wLower)) {
      out.push({ text: k, insert: k, kind: 'keyword' })
      if (out.length >= 8) break
    }
  }
  // Tables
  let tblAdded = 0
  for (const t of allTables.value) {
    if (t.name.toLowerCase().startsWith(wLower)) {
      out.push({ text: t.name, insert: t.name, kind: 'table', description: t.remark })
      if (++tblAdded >= 12) break
    }
  }
  // Snippets
  for (const s of SNIPPETS) {
    if (s.label.toLowerCase().includes(wLower) || s.description.toLowerCase().includes(wLower)) {
      out.push({ text: s.label.replace(/^snip:/, ''), insert: s.insert, kind: 'snip', description: s.description })
    }
  }

  return out
}

function reposition() {
  const el = elRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  // Approximate caret by line — keep dropdown anchored to textarea top-left + offset
  const lines = el.value.slice(0, el.selectionStart ?? 0).split('\n')
  const row = lines.length - 1
  const col = lines[lines.length - 1]?.length ?? 0
  // Rough char width estimates inside the monospace textarea
  const charW = 7.4
  const lineH = 18.5
  const top  = r.top  + 10 + (row + 1) * lineH - el.scrollTop
  const left = Math.min(r.left + 12 + col * charW - el.scrollLeft, r.right - 280)
  dropdown.top   = Math.max(r.top + 24, Math.min(top, window.innerHeight - 280))
  dropdown.left  = Math.max(r.left + 4, left)
  dropdown.width = 320
}

function refreshDropdown() {
  const items = buildSuggestions()
  if (!items.length) { dropdown.show = false; return }
  dropdown.items  = items
  dropdown.active = 0
  const ctx = wordAtCursor()
  dropdown.contextStart = ctx.start
  dropdown.contextEnd   = ctx.end
  dropdown.show = true
  reposition()
}

function onInput() {
  refreshDropdown()
}

// When columns finish loading in the background (async ensureColumns), the
// dropdown was built with an empty list. Re-run suggestions once new data
// arrives so the user sees the columns without retyping.
watch(tableCols, () => {
  if (dropdown.show) {
    const items = buildSuggestions()
    if (items.length) {
      dropdown.items = items
      if (dropdown.active >= items.length) dropdown.active = 0
    }
  }
}, { deep: false })

function insertSuggestion(s: Suggestion) {
  const el = elRef.value
  if (!el) return
  const before = el.value.slice(0, dropdown.contextStart)
  const after  = el.value.slice(dropdown.contextEnd)
  const next   = before + s.insert + after
  sqlText.value = next
  dropdown.show = false
  nextTick(() => {
    const newCursor = (before + s.insert).length
    el.setSelectionRange(newCursor, newCursor)
    el.focus()
  })
}

function onKeydown(e: KeyboardEvent) {
  if (dropdown.show) {
    const n = dropdown.items.length
    if (e.key === 'ArrowDown') { e.preventDefault(); dropdown.active = (dropdown.active + 1) % n; return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); dropdown.active = (dropdown.active - 1 + n) % n; return }
    if (e.key === 'Tab')       { e.preventDefault(); insertSuggestion(dropdown.items[dropdown.active]!); return }
    if (e.key === 'Enter' && !e.shiftKey) {
      // Enter accepts when dropdown active; Shift+Enter always inserts newline
      e.preventDefault(); insertSuggestion(dropdown.items[dropdown.active]!); return
    }
    if (e.key === 'Escape')    { dropdown.show = false; return }
  } else {
    // Manually trigger autocomplete with Ctrl+Space
    if (e.key === ' ' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      refreshDropdown()
    }
  }
}

function onBlur() { setTimeout(() => { dropdown.show = false }, 160) }

function insertSnippet(s: SnippetDef) {
  const el = elRef.value
  if (!el) return
  const cur = el.selectionStart ?? sqlText.value.length
  sqlText.value = sqlText.value.slice(0, cur) + s.insert + sqlText.value.slice(cur)
  const newCursor = cur + s.insert.length
  nextTick(() => { el.setSelectionRange(newCursor, newCursor); el.focus() })
}

function clearEditor() {
  sqlText.value  = ''
  errorMsg.value = ''
  nextTick(() => elRef.value?.focus())
}

const lineCount = computed(() => sqlText.value.split('\n').length)
const charCount = computed(() => sqlText.value.length)
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="showSqlEditor"
        class="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="close"
      >
        <div
          class="bg-background border rounded-2xl shadow-2xl w-full max-w-5xl mx-4 flex flex-col overflow-hidden"
          style="height: 85vh"
          @click.stop
        >
          <!-- ── Header ─────────────────────────────────────────────────── -->
          <div class="flex items-center gap-3 px-5 py-4 border-b bg-sky-500/5 shrink-0">
            <div class="flex size-9 items-center justify-center rounded-xl bg-sky-500/15 border border-sky-500/25">
              <Code2 class="size-4 text-sky-500" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-bold">{{ t('sqlbuilder_editor_title') }}</p>
              <p class="text-[11px] text-muted-foreground mt-0.5">
                {{ t('sqlbuilder_editor_subtitle') }}
              </p>
            </div>
            <button @click="close"
              class="size-7 flex items-center justify-center rounded-lg hover:bg-accent text-muted-foreground transition-colors">
              <X class="size-4" />
            </button>
          </div>

          <!-- ── Body ───────────────────────────────────────────────────── -->
          <div class="flex-1 grid grid-cols-[1fr_220px] divide-x divide-border min-h-0">

            <!-- Editor column -->
            <div class="flex flex-col min-h-0">
              <textarea
                ref="elRef"
                v-model="sqlText"
                @input="onInput"
                @keydown="onKeydown"
                @blur="onBlur"
                @click="dropdown.show = false"
                spellcheck="false"
                :placeholder="t('sqlbuilder_editor_placeholder')"
                :class="['w-full font-mono text-[12.5px] leading-[1.5] px-4 py-3 bg-background resize-none focus:outline-none text-foreground min-h-0',
                         previewShown ? 'flex-[1_1_45%]' : 'flex-1']"
                style="font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace; tab-size: 2;"
              />

              <!-- ── Preview panel (raw rows from executeQuery) ───────── -->
              <div
                v-if="previewShown"
                class="flex-[1_1_55%] border-t flex flex-col min-h-0 bg-background"
              >
                <!-- Preview header -->
                <div class="flex items-center gap-2 px-3 py-1.5 border-b bg-emerald-500/5 shrink-0">
                  <TableIcon class="size-3.5 text-emerald-600" />
                  <span class="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{{ t('sqlbuilder_editor_preview_title') }}</span>
                  <span v-if="previewLoading" class="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Loader2 class="size-3 animate-spin" /> {{ t('sqlbuilder_editor_preview_loading') }}
                  </span>
                  <span v-else-if="previewRows.length" class="text-[10px] font-mono text-muted-foreground">
                    {{ t('sqlbuilder_editor_preview_stats', { rows: previewRows.length.toLocaleString(), cols: previewColDefs.length }) }}
                    <span v-if="previewRanAt" class="opacity-60">
                      · {{ previewRanAt.toLocaleTimeString() }}
                    </span>
                  </span>
                  <button @click="runPreview"
                    :disabled="previewLoading"
                    class="ml-auto flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 transition-colors disabled:opacity-40">
                    <Loader2 v-if="previewLoading" class="size-3 animate-spin" />
                    <Play v-else class="size-3" />
                    {{ t('sqlbuilder_editor_preview_rerun') }}
                  </button>
                  <button @click="closePreview"
                    class="size-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground transition-colors"
                    :title="t('sqlbuilder_editor_preview_hide')">
                    <ChevronDown class="size-3.5" />
                  </button>
                </div>

                <!-- Body: grid / empty / error -->
                <div class="flex-1 min-h-0 relative">
                  <div v-if="previewLoading"
                    class="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 backdrop-blur-sm z-10">
                    <Loader2 class="size-4 animate-spin text-emerald-500" />
                    <span class="text-xs text-muted-foreground">{{ t('sqlbuilder_editor_preview_executing') }}</span>
                  </div>

                  <div v-if="previewError && !previewRows.length"
                    class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
                    <AlertCircle class="size-6 text-rose-500" />
                    <p class="text-xs font-medium text-rose-500">{{ previewError }}</p>
                    <p class="text-[10px] text-muted-foreground/70">
                      {{ t('sqlbuilder_editor_err_check_syntax') }}
                    </p>
                  </div>

                  <ClientOnly>
                    <AgGridVue
                      v-if="previewRows.length"
                      :class="[themeClass, 'w-full h-full']"
                      :rowData="previewRows"
                      :columnDefs="previewColDefs"
                      :rowHeight="26"
                      :headerHeight="30"
                      :suppressMovableColumns="false"
                      :suppressCellFocus="false"
                      :enableCellTextSelection="true"
                      :tooltipShowDelay="300"
                    />
                  </ClientOnly>
                </div>

                <!-- Inline notice when rows arrived but error/0 — keep grid visible above -->
                <div v-if="previewError && previewRows.length"
                  class="px-3 py-1 border-t text-[10px] text-amber-600 bg-amber-500/5 shrink-0">
                  {{ previewError }}
                </div>
              </div>

              <!-- Footer / status bar -->
              <div class="flex items-center gap-3 px-4 py-2 border-t bg-muted/20 text-[10px] text-muted-foreground shrink-0">
                <span class="font-mono">{{ t('sqlbuilder_editor_stats_lines', { lines: lineCount, chars: charCount }) }}</span>
                <span v-if="errorMsg" class="ml-auto text-rose-500 font-medium">{{ errorMsg }}</span>
                <span v-else-if="sourceSql && sqlText === sourceSql" class="ml-auto text-emerald-500">
                  {{ t('sqlbuilder_editor_source_loaded') }}
                </span>
                <span v-else class="ml-auto" />
                <span class="font-mono opacity-70 flex items-center gap-1">
                  <Loader2 v-if="store.addspecTablesLoading" class="size-3 animate-spin" />
                  {{ t('sqlbuilder_editor_tables_count', { n: allTables.length }) }}
                  <span v-if="store.addspecTables.length" class="text-emerald-500" :title="t('sqlbuilder_editor_tables_full_title')">·full</span>
                  <span v-else-if="store.modules.length" class="text-amber-500" :title="t('sqlbuilder_editor_tables_obj_title')">·obj</span>
                </span>
              </div>
            </div>

            <!-- Right helper rail -->
            <aside class="flex flex-col min-h-0 bg-muted/10">
              <div class="px-3 py-2 border-b shrink-0">
                <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1.5">
                  <Sparkles class="size-3" /> {{ t('sqlbuilder_editor_snippets_label') }}
                </p>
              </div>
              <div class="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 min-h-0">
                <button v-for="s in SNIPPETS" :key="s.label"
                  @click="insertSnippet(s)"
                  class="text-left rounded-lg border bg-background px-2.5 py-2 hover:border-violet-400 hover:bg-violet-500/5 transition-colors group"
                >
                  <p class="text-[11px] font-semibold text-violet-500 group-hover:text-violet-600">
                    {{ s.label.replace(/^snip:/, '') }}
                  </p>
                  <p class="text-[10px] text-muted-foreground mt-0.5 truncate">{{ s.description }}</p>
                </button>
              </div>

              <div class="px-3 py-2 border-t border-b shrink-0">
                <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1.5">
                  <FileText class="size-3" /> {{ t('sqlbuilder_editor_tips_label') }}
                </p>
              </div>
              <div class="p-3 text-[10px] text-muted-foreground/80 leading-relaxed shrink-0">
                <p>• <i18n-t keypath="sqlbuilder_editor_tip_dot" tag="span">
                  <template #code><code class="font-mono text-sky-500">alias.</code></template>
                </i18n-t></p>
                <p>• <i18n-t keypath="sqlbuilder_editor_tip_tab" tag="span">
                  <template #kbd><kbd class="px-1 py-0.5 rounded border bg-background text-foreground text-[9px]">Tab</kbd></template>
                </i18n-t></p>
                <p>• <i18n-t keypath="sqlbuilder_editor_tip_ctrl_space" tag="span">
                  <template #kbd><kbd class="px-1 py-0.5 rounded border bg-background text-foreground text-[9px]">Ctrl+Space</kbd></template>
                </i18n-t></p>
                <p>• <i18n-t keypath="sqlbuilder_editor_tip_run" tag="span">
                  <template #label><span class="text-emerald-500 font-semibold">Run</span></template>
                </i18n-t></p>
                <p>• <i18n-t keypath="sqlbuilder_editor_tip_apply" tag="span">
                  <template #label><span class="text-sky-500 font-semibold">Apply</span></template>
                </i18n-t></p>
              </div>
            </aside>
          </div>

          <!-- ── Footer ─────────────────────────────────────────────────── -->
          <div class="flex items-center justify-between gap-3 px-5 py-3.5 border-t bg-muted/10 shrink-0">
            <button @click="clearEditor"
              class="text-xs px-3 py-2 text-muted-foreground hover:text-destructive transition-colors">
              {{ t('sqlbuilder_editor_clear_all') }}
            </button>
            <div class="flex items-center gap-2">
              <button @click="close"
                class="text-xs px-4 py-2 border rounded-lg hover:bg-accent transition-colors text-muted-foreground">
                {{ t('sqlbuilder_editor_cancel') }}
              </button>
              <button @click="runPreview"
                :disabled="!sqlText.trim() || previewLoading"
                class="flex items-center gap-1.5 text-xs px-4 py-2 border border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
                :title="t('sqlbuilder_editor_run_preview_title')">
                <Loader2 v-if="previewLoading" class="size-3.5 animate-spin" />
                <TableIcon v-else class="size-3.5" />
                {{ t('sqlbuilder_editor_run_preview') }}
              </button>
              <button @click="apply"
                :disabled="!sqlText.trim()"
                class="flex items-center gap-1.5 text-xs px-5 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors">
                <Play class="size-3.5" />
                {{ t('sqlbuilder_editor_apply') }}
              </button>
            </div>
          </div>

        </div>
      </div>
    </Transition>

    <!-- Autocomplete dropdown — teleported so it floats above the modal -->
    <Transition name="fade">
      <div
        v-if="showSqlEditor && dropdown.show && dropdown.items.length"
        :style="{ top: dropdown.top + 'px', left: dropdown.left + 'px', width: dropdown.width + 'px' }"
        class="fixed z-[200] rounded-lg border bg-popover shadow-2xl overflow-hidden max-h-[260px] flex flex-col"
        @mousedown.prevent
      >
        <div class="overflow-y-auto flex-1">
          <button
            v-for="(item, i) in dropdown.items"
            :key="item.kind + ':' + item.text + i"
            @mousedown.prevent="insertSuggestion(item)"
            :class="[
              'w-full flex items-start gap-2 px-2.5 py-1.5 text-left transition-colors',
              i === dropdown.active ? 'bg-sky-500/15' : 'hover:bg-accent/50',
            ]"
          >
            <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 mt-0.5', KIND_META[item.kind].cls]">
              {{ KIND_META[item.kind].label }}
            </span>
            <KeyRound v-if="item.pk" class="size-3 text-amber-500 shrink-0 mt-0.5" />
            <div class="flex-1 min-w-0">
              <p class="text-[11px] font-mono font-semibold truncate" :class="item.pk ? 'text-amber-500' : ''">
                {{ item.text }}
              </p>
              <p v-if="item.description" class="text-[9.5px] text-muted-foreground truncate">
                {{ item.description }}
              </p>
            </div>
            <span v-if="item.type"
              class="text-[8px] font-mono text-muted-foreground/60 shrink-0 mt-0.5 uppercase">
              {{ item.type }}
            </span>
          </button>
        </div>
        <div class="px-2 py-1 border-t bg-muted/30 text-[9px] text-muted-foreground/70 font-mono flex items-center gap-2 shrink-0">
          <kbd class="px-1 rounded border bg-background">↑↓</kbd> {{ t('sqlbuilder_editor_ac_select') }}
          <kbd class="px-1 rounded border bg-background">Tab/Enter</kbd> {{ t('sqlbuilder_editor_ac_accept') }}
          <kbd class="px-1 rounded border bg-background">Esc</kbd> {{ t('sqlbuilder_editor_ac_close') }}
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
