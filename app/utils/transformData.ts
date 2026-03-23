export type AggFn   = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'first' | 'none'
export type FilterOp = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'not contains'

export interface TransformFilter {
  field: string
  op:    FilterOp
  value: string
}

export interface TransformConfig {
  filters:      TransformFilter[]
  groupByField: string
  aggregations: Record<string, AggFn>
}

export const AGG_OPTIONS: { value: AggFn; label: string }[] = [
  { value: 'sum',   label: 'Sum'    },
  { value: 'avg',   label: 'Avg'    },
  { value: 'count', label: 'Count'  },
  { value: 'min',   label: 'Min'    },
  { value: 'max',   label: 'Max'    },
  { value: 'first', label: 'First'  },
  { value: 'none',  label: 'None' },
]

export const OP_OPTIONS: { value: FilterOp; label: string }[] = [
  { value: '=',            label: '='    },
  { value: '!=',           label: '≠'    },
  { value: '>',            label: '>'    },
  { value: '<',            label: '<'    },
  { value: '>=',           label: '≥'    },
  { value: '<=',           label: '≤'    },
  { value: 'contains',     label: 'Contains'     },
  { value: 'not contains', label: 'Not contains' },
]

// ── Dynamic date tokens ───────────────────────────────────────────────────────
export const DATE_TOKEN_TODAY     = '__TODAY__'
export const DATE_TOKEN_YESTERDAY = '__YESTERDAY__'

/** Labels shown to the user for each token */
export const DATE_TOKEN_LABELS: Record<string, string> = {
  [DATE_TOKEN_TODAY]:     'Today',
  [DATE_TOKEN_YESTERDAY]: 'Yesterday',
}

/** Resolve a filter value — replaces dynamic tokens with today's actual date */
export function resolveDynamicValue(value: string): string {
  const now = new Date()
  if (value === DATE_TOKEN_TODAY) {
    return now.toISOString().split('T')[0]!
  }
  if (value === DATE_TOKEN_YESTERDAY) {
    const d = new Date(now); d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]!
  }
  return value
}

/** Extract YYYY-MM-DD from an ISO datetime string, or return null.
 *  Exported so streaming join code can reuse it for group-key normalisation. */
export function normDateStr(val: unknown): string | null {
  if (!val) return null
  const m = String(val).match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1]! : null
}

/** Test a single row against a filter list.
 *  Exported for streaming join+GROUP BY without re-implementing filter logic. */
export function matchFilters(row: any, filters: TransformFilter[]): boolean {
  return filters.every(f => {
    if (!f.field) return true
    const cell     = row[f.field]
    const resolved = resolveDynamicValue(f.value)
    const cellDate   = normDateStr(cell)
    const filterDate = normDateStr(resolved)
    const isDateCmp  = cellDate !== null && filterDate !== null
    const cellStr = isDateCmp ? cellDate : String(cell ?? '').toLowerCase()
    const valStr  = isDateCmp ? filterDate : resolved.toLowerCase()
    const cellNum = Number(cell)
    const valNum  = Number(resolved)
    switch (f.op) {
      case '=':            return isDateCmp ? cellDate === filterDate : String(cell ?? '') === resolved
      case '!=':           return isDateCmp ? cellDate !== filterDate : String(cell ?? '') !== resolved
      case '>':            return isDateCmp ? cellStr > valStr : cellNum > valNum
      case '<':            return isDateCmp ? cellStr < valStr : cellNum < valNum
      case '>=':           return isDateCmp ? cellStr >= valStr : cellNum >= valNum
      case '<=':           return isDateCmp ? cellStr <= valStr : cellNum <= valNum
      case 'contains':     return String(cell ?? '').toLowerCase().includes(resolved.toLowerCase())
      case 'not contains': return !String(cell ?? '').toLowerCase().includes(resolved.toLowerCase())
      default:             return true
    }
  })
}

// ── Streaming GROUP BY accumulator type ──────────────────────────────────────
type GroupAcc = {
  n:      number
  sums:   Record<string, number>
  mins:   Record<string, number>
  maxs:   Record<string, number>
  firsts: Record<string, any>
}

/** Feed one row into a GROUP BY accumulator map. */
export function accumulateRow(
  row:     any,
  cfg:     TransformConfig,
  accs:    Map<string, GroupAcc>,
  colsRef: { v: string[] },
): void {
  if (cfg.filters.length && !matchFilters(row, cfg.filters)) return
  if (!colsRef.v.length) colsRef.v = Object.keys(row)

  const raw = row[cfg.groupByField]
  const key = normDateStr(raw) ?? String(raw ?? '')

  let a = accs.get(key)
  if (!a) { a = { n: 0, sums: {}, mins: {}, maxs: {}, firsts: {} }; accs.set(key, a) }
  a.n++

  for (const col of colsRef.v) {
    if (col === cfg.groupByField) continue
    const agg = cfg.aggregations[col] ?? 'first'
    if (agg === 'none') continue
    const val = row[col]
    const num = Number(val) || 0
    if (agg === 'sum' || agg === 'avg') { a.sums[col] = (a.sums[col] ?? 0) + num }
    else if (agg === 'min') { a.mins[col] = col in a.mins ? Math.min(a.mins[col]!, num) : num }
    else if (agg === 'max') { a.maxs[col] = col in a.maxs ? Math.max(a.maxs[col]!, num) : num }
    else if (agg === 'first' && !(col in a.firsts)) { a.firsts[col] = val }
  }
}

/** Materialise a GROUP BY accumulator map into output rows. */
export function materializeAccumulators(
  accs: Map<string, GroupAcc>,
  cols: string[],
  cfg:  TransformConfig,
): any[] {
  return Array.from(accs.entries()).map(([key, a]) => {
    const out: Record<string, any> = { [cfg.groupByField]: key }
    for (const col of cols) {
      if (col === cfg.groupByField) continue
      const agg = cfg.aggregations[col] ?? 'first'
      if (agg === 'none') continue
      switch (agg) {
        case 'sum':   out[col] = a.sums[col]  ?? 0; break
        case 'avg':   out[col] = a.n > 0 ? (a.sums[col] ?? 0) / a.n : 0; break
        case 'count': out[col] = a.n; break
        case 'min':   out[col] = a.mins[col] ?? 0; break
        case 'max':   out[col] = a.maxs[col] ?? 0; break
        case 'first': out[col] = a.firsts[col]; break
      }
    }
    return out
  })
}

/** Apply filter + optional GROUP BY to a row array.
 *  Single-pass streaming accumulation — never stores intermediate grouped arrays,
 *  so memory use is O(unique_groups × cols) regardless of input size. */
export function applyTransform(rows: any[], cfg: TransformConfig): any[] {
  // ── Filter only (no GROUP BY) ─────────────────────────────────────────────
  if (!cfg.groupByField) {
    return cfg.filters.length ? rows.filter(r => matchFilters(r, cfg.filters)) : rows
  }
  if (!rows.length) return []

  // ── Single-pass streaming GROUP BY ───────────────────────────────────────
  const accs: Map<string, GroupAcc> = new Map()
  const colsRef = { v: [] as string[] }
  for (const row of rows) accumulateRow(row, cfg, accs, colsRef)
  if (!colsRef.v.length) return []
  return materializeAccumulators(accs, colsRef.v, cfg)
}

/** Build BFS component key from a starting tableId */
export function componentKey(
  tableId: string,
  allTableIds: string[],
  relations: { fromTable: string; toTable: string }[],
): string {
  const adj = new Map<string, Set<string>>()
  for (const id of allTableIds) adj.set(id, new Set())
  for (const r of relations) {
    adj.get(r.fromTable)?.add(r.toTable)
    adj.get(r.toTable)?.add(r.fromTable)
  }
  const visited = new Set<string>()
  const queue   = [tableId]
  const comp:   string[] = []
  while (queue.length) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id); comp.push(id)
    for (const nb of adj.get(id) ?? []) if (!visited.has(nb)) queue.push(nb)
  }
  return [...comp].sort().join('+')
}
