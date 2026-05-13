<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useSqlBuilderStore } from '~/stores/sql-builder'

const props = withDefaults(defineProps<{
  modelValue: string
  tag?:         'input' | 'textarea'
  rows?:        number
  placeholder?: string
  inputClass?:  string
  spellcheck?:  boolean
  /**
   * 'visible' (default) — suggest only columns in visibleCols (= what _src exposes).
   *   Use for math/CASE WHEN inputs so user only sees columns that actually exist.
   * 'all' — also suggest columns from details (full DB schema).
   *   Use for customSql textarea where the user may reference raw table columns.
   */
  colSource?: 'visible' | 'all'
}>(), { tag: 'input', rows: 4, spellcheck: false, colSource: 'visible' })

const emit = defineEmits<{ 'update:modelValue': [string] }>()

const store = useSqlBuilderStore()

// ── SQL Server keyword list ────────────────────────────────────────────
const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS NULL', 'IS NOT NULL',
  'LIKE', 'BETWEEN', 'GROUP BY', 'ORDER BY', 'HAVING',
  'LEFT JOIN', 'INNER JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN', 'ON',
  'AS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'WITH', 'UNION ALL', 'UNION', 'DISTINCT', 'TOP',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COUNT DISTINCT',
  'COALESCE', 'ISNULL', 'NULLIF', 'IIF', 'CHOOSE',
  'ROUND', 'ABS', 'CEILING', 'FLOOR', 'POWER', 'SQRT', 'SIGN',
  'CAST', 'CONVERT', 'TRY_CAST', 'TRY_CONVERT',
  'GETDATE', 'GETUTCDATE', 'SYSDATETIME',
  'DATEADD', 'DATEDIFF', 'DATENAME', 'DATEPART', 'FORMAT', 'EOMONTH',
  'YEAR', 'MONTH', 'DAY',
  'CONCAT', 'CONCAT_WS', 'LEN', 'DATALENGTH', 'UPPER', 'LOWER',
  'LTRIM', 'RTRIM', 'TRIM', 'SUBSTRING', 'REPLACE', 'STUFF',
  'CHARINDEX', 'PATINDEX', 'STRING_AGG',
  'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'NTILE',
  'OVER', 'PARTITION BY', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE',
  'EXISTS', 'NOT EXISTS', 'OUTER APPLY', 'CROSS APPLY',
  'DECIMAL', 'INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'BIT', 'FLOAT',
  'VARCHAR', 'NVARCHAR', 'CHAR', 'NCHAR',
  'DATETIME', 'DATETIME2', 'DATE', 'TIME', 'SMALLDATETIME',
  'MONEY', 'SMALLMONEY', 'NULL',
]

// ── Build suggestion pool from canvas nodes ───────────────────────────
const pool = computed(() => {
  const tableNodes = store.nodes.filter(n => n.type === 'sqlTable')
  const tables = tableNodes.map(n => (n.data as any).tableName as string).filter(Boolean)

  // 'visible': only columns that are actually in _src (from visibleCols)
  // 'all': include full DB schema (details) — use for raw SQL editing
  const cols = [...new Set(
    tableNodes.flatMap(n => {
      const d = n.data as any
      if (props.colSource === 'all') {
        const fromDetails = (d.details ?? []).map((c: any) => c.column_name as string)
        return fromDetails.length ? fromDetails : (d.visibleCols ?? []).map((c: any) => c.name as string)
      }
      return (d.visibleCols ?? []).map((c: any) => c.name as string)
    }).filter(Boolean)
  )]
  return { tables, cols }
})

// ── Dropdown state ─────────────────────────────────────────────────────
type ItemType = 'keyword' | 'table' | 'col'
interface Item { text: string; type: ItemType }

const elRef   = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)
const show    = ref(false)
const items   = ref<Item[]>([])
const active  = ref(0)
const style   = ref<Record<string, string>>({})

function wordAtCursor(el: HTMLInputElement | HTMLTextAreaElement) {
  const cursor = el.selectionStart ?? 0
  const match  = el.value.slice(0, cursor).match(/\w+$/)
  return match ? { word: match[0], start: cursor - match[0].length } : { word: '', start: cursor }
}

function match(list: string[], w: string, type: ItemType, limit: number): Item[] {
  const lw = w.toLowerCase()
  return list
    .filter(s => s.toLowerCase().startsWith(lw) && s.toLowerCase() !== lw)
    .slice(0, limit)
    .map(text => ({ text, type }))
}

function buildItems(word: string): Item[] {
  if (!word) return []
  const { tables, cols } = pool.value
  return [
    ...match(SQL_KEYWORDS, word, 'keyword', 6),
    ...match(tables, word, 'table', 5),
    ...match(cols, word, 'col', 8),
  ]
}

function reposition() {
  const el = elRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  style.value = {
    position: 'fixed',
    top:      `${r.bottom + 2}px`,
    left:     `${r.left}px`,
    minWidth: `${Math.max(r.width, 220)}px`,
    zIndex:   '9999',
  }
}

// ── Handlers ───────────────────────────────────────────────────────────
function onInput(e: Event) {
  const el = e.target as HTMLInputElement | HTMLTextAreaElement
  emit('update:modelValue', el.value)
  const { word } = wordAtCursor(el)
  const matched = buildItems(word)
  if (matched.length) {
    items.value = matched
    active.value = 0
    show.value = true
    reposition()
  } else {
    show.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (!show.value) return
  const n = items.value.length
  if (e.key === 'ArrowDown')  { e.preventDefault(); active.value = (active.value + 1) % n }
  else if (e.key === 'ArrowUp') { e.preventDefault(); active.value = (active.value - 1 + n) % n }
  else if (e.key === 'Tab') {
    // Tab: accept completion in both input and textarea
    const it = items.value[active.value]
    if (it) { e.preventDefault(); insert(it.text) }
    else show.value = false
  }
  else if (e.key === 'Enter' && props.tag !== 'textarea') {
    // Enter: only accept in single-line <input>; textarea needs Enter for newlines
    const it = items.value[active.value]
    if (it) { e.preventDefault(); insert(it.text) }
  }
  else if (e.key === 'Escape' || e.key === 'Enter') {
    // Escape (always) and Enter in textarea → close dropdown, let key pass through
    show.value = false
  }
}

function insert(text: string) {
  const el = elRef.value
  if (!el) return
  const cursor = el.selectionStart ?? 0
  const before = el.value.slice(0, cursor)
  const after  = el.value.slice(cursor)
  const match  = before.match(/\w+$/)
  const start  = match ? cursor - match[0].length : cursor
  const next   = before.slice(0, start) + text + after
  emit('update:modelValue', next)
  show.value = false
  nextTick(() => {
    el.setSelectionRange(start + text.length, start + text.length)
    el.focus()
  })
}

let blurTimer: ReturnType<typeof setTimeout> | null = null
function onBlur()  { blurTimer = setTimeout(() => { show.value = false }, 160) }
function cancelBlur() { if (blurTimer) { clearTimeout(blurTimer); blurTimer = null } }

const TYPE_CLS: Record<ItemType, string> = {
  keyword: 'bg-sky-500/20 text-sky-400',
  table:   'bg-emerald-500/20 text-emerald-400',
  col:     'bg-amber-500/20 text-amber-500',
}
const TYPE_LABEL: Record<ItemType, string> = { keyword: 'SQL', table: 'TBL', col: 'COL' }
</script>

<template>
  <div :class="['relative w-full', props.tag === 'textarea' ? 'flex-1 min-h-0 flex flex-col' : '']">
    <!-- textarea variant -->
    <textarea v-if="tag === 'textarea'"
      ref="elRef"
      :value="modelValue"
      :rows="rows"
      :placeholder="placeholder"
      :spellcheck="spellcheck"
      :class="inputClass"
      @input="onInput"
      @keydown="onKeydown"
      @blur="onBlur"
    />
    <!-- input variant -->
    <input v-else
      ref="elRef"
      :value="modelValue"
      :placeholder="placeholder"
      :spellcheck="spellcheck"
      :class="inputClass"
      @input="onInput"
      @keydown="onKeydown"
      @blur="onBlur"
    />

    <!-- Dropdown — teleported to body to avoid overflow clipping -->
    <Teleport to="body">
      <div v-if="show && items.length"
        :style="style"
        class="rounded-lg border border-border bg-popover shadow-xl overflow-hidden"
        @mousedown.prevent="cancelBlur">
        <button
          v-for="(item, i) in items"
          :key="item.text + i"
          @mousedown.prevent="insert(item.text)"
          :class="[
            'flex items-center gap-2 w-full px-3 py-1.5 text-left text-[10px] font-mono transition-colors',
            i === active ? 'bg-indigo-500/15 text-foreground' : 'text-muted-foreground hover:bg-muted',
          ]">
          <span :class="['text-[8px] px-1.5 py-0.5 rounded font-bold shrink-0', TYPE_CLS[item.type]]">
            {{ TYPE_LABEL[item.type] }}
          </span>
          <span class="truncate">{{ item.text }}</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>
