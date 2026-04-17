// ── Computed Column — Builder-based (no manual formula typing) ────────────────

// ── Shared types ──────────────────────────────────────────────────────────────

export type ColType   = 'arithmetic' | 'function' | 'if'
export type ArithOp   = '+' | '-' | '*' | '/' | '%'
export type CmpOp     = '=' | '!=' | '>' | '<' | '>=' | '<='

/** An operand: either a column reference or a literal constant */
export interface Operand {
  kind: 'col' | 'const'
  col?: string   // column name when kind='col'
  val?: string   // literal value when kind='const'
}

/** Full definition of one computed column */
export interface ComputedColDef {
  name:       string
  type:       ColType

  // ── arithmetic: left op right ──────────────────────────────────────────────
  left?:      Operand
  op?:        ArithOp
  right?:     Operand

  // ── function: FN(arg1 [, sep,] [, arg2]) ───────────────────────────────────
  fn?:        string
  arg1?:      Operand
  concatSep?: string   // optional separator for CONCAT only (blank = no separator)
  arg2?:      Operand  // optional — used by ROUND, LEFT, RIGHT, CONCAT, DATEDIF_*

  // ── IF: ifCol ifOp ifVal → thenVal else elseVal ────────────────────────────
  ifCol?:     string
  ifOp?:      CmpOp
  ifVal?:     Operand
  thenVal?:   Operand
  elseVal?:   Operand
}

// Keep legacy alias so TransformConfig stays compatible
export type ComputedColumn = ComputedColDef

// ── UI option lists ───────────────────────────────────────────────────────────

export const COL_TYPE_OPTIONS: { value: ColType; label: string }[] = [
  { value: 'arithmetic', label: 'คำนวณ (A op B)' },
  { value: 'function',   label: 'ฟังก์ชัน' },
  { value: 'if',         label: 'IF เงื่อนไข' },
]

export const ARITH_OP_OPTIONS: { value: ArithOp; label: string }[] = [
  { value: '+', label: '+  (บวก)' },
  { value: '-', label: '−  (ลบ)' },
  { value: '*', label: '×  (คูณ)' },
  { value: '/', label: '÷  (หาร)' },
  { value: '%', label: 'mod (เศษ)' },
]

export const CMP_OP_OPTIONS: { value: CmpOp; label: string }[] = [
  { value: '=',  label: '=  (เท่ากับ)' },
  { value: '!=', label: '≠  (ไม่เท่ากับ)' },
  { value: '>',  label: '>  (มากกว่า)' },
  { value: '<',  label: '<  (น้อยกว่า)' },
  { value: '>=', label: '≥  (มากกว่าหรือเท่า)' },
  { value: '<=', label: '≤  (น้อยกว่าหรือเท่า)' },
]

export interface FnDef {
  value:    string
  label:    string
  category: 'math' | 'text' | 'date'
  /** 'col' = column picker, 'n' = number input, 'col2' = second column picker */
  args:     ('col' | 'n' | 'col2')[]
}

export const FUNCTION_DEFS: FnDef[] = [
  // ── Math ───────────────────────────────────────────────────────────────────
  { value: 'ABS',       label: 'ABS  — ค่าสัมบูรณ์',         args: ['col'],        category: 'math' },
  { value: 'INT',       label: 'INT  — ตัดทศนิยม (floor)',    args: ['col'],        category: 'math' },
  { value: 'SQRT',      label: 'SQRT  — รากที่สอง',           args: ['col'],        category: 'math' },
  { value: 'TRUNC',     label: 'TRUNC  — ตัดทศนิยม',          args: ['col'],        category: 'math' },
  { value: 'ROUND',     label: 'ROUND  — ปัดทศนิยม',          args: ['col', 'n'],   category: 'math' },
  { value: 'ROUNDUP',   label: 'ROUNDUP  — ปัดขึ้น',          args: ['col', 'n'],   category: 'math' },
  { value: 'ROUNDDOWN', label: 'ROUNDDOWN  — ปัดลง',          args: ['col', 'n'],   category: 'math' },
  // ── Text ───────────────────────────────────────────────────────────────────
  { value: 'UPPER',     label: 'UPPER  — ตัวพิมพ์ใหญ่',       args: ['col'],        category: 'text' },
  { value: 'LOWER',     label: 'LOWER  — ตัวพิมพ์เล็ก',       args: ['col'],        category: 'text' },
  { value: 'TRIM',      label: 'TRIM  — ตัด space',            args: ['col'],        category: 'text' },
  { value: 'LEN',       label: 'LEN  — จำนวนตัวอักษร',        args: ['col'],        category: 'text' },
  { value: 'LEFT',      label: 'LEFT  — ตัดซ้าย N ตัว',       args: ['col', 'n'],   category: 'text' },
  { value: 'RIGHT',     label: 'RIGHT  — ตัดขวา N ตัว',       args: ['col', 'n'],   category: 'text' },
  { value: 'CONCAT',    label: 'CONCAT  — ต่อ text',           args: ['col', 'col2'], category: 'text' },
  // ── Date ───────────────────────────────────────────────────────────────────
  { value: 'YEAR',      label: 'YEAR  — ปี',                   args: ['col'],        category: 'date' },
  { value: 'MONTH',     label: 'MONTH  — เดือน',               args: ['col'],        category: 'date' },
  { value: 'DAY',       label: 'DAY  — วัน',                   args: ['col'],        category: 'date' },
  { value: 'DATEDIF_D', label: 'วันที่ระหว่าง 2 วัน',          args: ['col', 'col2'], category: 'date' },
  { value: 'DATEDIF_M', label: 'เดือนที่ระหว่าง 2 วัน',        args: ['col', 'col2'], category: 'date' },
  { value: 'DATEDIF_Y', label: 'ปีที่ระหว่าง 2 วัน',           args: ['col', 'col2'], category: 'date' },
]

export const FN_CATEGORY_LABELS: Record<string, string> = {
  math: 'Math',
  text: 'Text',
  date: 'Date',
}

// ── Factory ───────────────────────────────────────────────────────────────────

/** Create a fresh ComputedColDef with sensible defaults */
export function newComputedColDef(): ComputedColDef {
  return {
    name:      '',
    type:      'arithmetic',
    left:      { kind: 'col', col: '' },
    op:        '-',
    right:     { kind: 'col', col: '' },
    fn:        'ROUND',
    arg1:      { kind: 'col', col: '' },
    concatSep: '',
    arg2:      { kind: 'col', col: '' },
    ifCol:     '',
    ifOp:      '>',
    ifVal:     { kind: 'const', val: '0' },
    thenVal:   { kind: 'col', col: '' },
    elseVal:   { kind: 'const', val: '0' },
  }
}

// ── Formula builder ───────────────────────────────────────────────────────────

function operandToExpr(op: Operand | undefined, fallback = '0'): string {
  if (!op) return fallback
  if (op.kind === 'col') {
    if (!op.col) return fallback
    return `[${op.col}]`
  }
  // const
  const v = op.val ?? fallback
  if (v === '') return `""`
  // numeric literal — pass as-is
  if (!isNaN(Number(v))) return v
  // string literal — wrap in quotes
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** Convert a ComputedColDef to a formula string (for evaluation) */
export function defToFormula(def: ComputedColDef): string {
  switch (def.type) {
    case 'arithmetic': {
      const l  = operandToExpr(def.left)
      const r  = operandToExpr(def.right)
      const op = def.op ?? '+'
      // Wrap in parens so chaining works correctly
      return `(${l} ${op} ${r})`
    }

    case 'function': {
      const fnKey  = def.fn ?? 'ABS'
      const fnDef  = FUNCTION_DEFS.find(f => f.value === fnKey)
      const a1     = operandToExpr(def.arg1)
      const needs2 = fnDef?.args.length === 2
      const arg2Is = fnDef?.args[1]   // 'col2' | 'n' | undefined

      // Helper: arg2 as column reference (ignores .kind — uses .col directly)
      const a2col = () => def.arg2?.col ? `[${def.arg2.col}]` : '""'
      // Helper: arg2 as numeric literal (ignores .kind — uses .val directly)
      const a2num = () => {
        const v = def.arg2?.val != null ? String(def.arg2.val) : '0'
        return v !== '' && !isNaN(Number(v)) ? v : '0'
      }

      if (fnKey === 'DATEDIF_D') return `DATEDIF(${a1}, ${a2col()}, "D")`
      if (fnKey === 'DATEDIF_M') return `DATEDIF(${a1}, ${a2col()}, "M")`
      if (fnKey === 'DATEDIF_Y') return `DATEDIF(${a1}, ${a2col()}, "Y")`
      if (fnKey === 'CONCAT') {
        const sep = def.concatSep ?? ''
        return sep ? `CONCAT(${a1}, "${sep.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}", ${a2col()})`
                   : `CONCAT(${a1}, ${a2col()})`
      }
      if (needs2) return `${fnKey}(${a1}, ${arg2Is === 'col2' ? a2col() : a2num()})`
      return `${fnKey}(${a1})`
    }

    case 'if': {
      const col  = def.ifCol ? `[${def.ifCol}]` : '""'
      const op   = def.ifOp ?? '='
      const val  = operandToExpr(def.ifVal, '""')
      const then_ = operandToExpr(def.thenVal)
      const else_ = operandToExpr(def.elseVal, '""')
      return `IF(${col} ${op} ${val}, ${then_}, ${else_})`
    }

    default:
      return '0'
  }
}

// ── Tokenizer + Evaluator (internal, unchanged) ───────────────────────────────

type TNum    = { type: 'num';   value: number }
type TStr    = { type: 'str';   value: string }
type TIdent  = { type: 'ident'; value: string }
type TColRef = { type: 'col';   value: string }
type TOp     = { type: 'op';    value: string }
type TLp     = { type: 'lp' }
type TRp     = { type: 'rp' }
type TComma  = { type: 'comma' }
type Token   = TNum | TStr | TIdent | TColRef | TOp | TLp | TRp | TComma

function tokenize(src: string): Token[] {
  const toks: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]!
    if (/\s/.test(ch)) { i++; continue }
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(src[i + 1] ?? ''))) {
      let raw = ''
      while (i < src.length && /[\d.]/.test(src[i]!)) raw += src[i++]
      toks.push({ type: 'num', value: parseFloat(raw) }); continue
    }
    if (ch === '"' || ch === "'") {
      const q = ch; let s = ''; i++
      while (i < src.length && src[i] !== q) {
        s += (src[i] === '\\') ? (src[++i] ?? '') : src[i]!; i++
      }
      i++; toks.push({ type: 'str', value: s }); continue
    }
    if (ch === '[') {
      let col = ''; i++
      while (i < src.length && src[i] !== ']') col += src[i++]
      i++; toks.push({ type: 'col', value: col }); continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      let id = ''
      while (i < src.length && /[\w]/.test(src[i]!)) id += src[i++]
      toks.push({ type: 'ident', value: id.toUpperCase() }); continue
    }
    const two = src.slice(i, i + 2)
    if (two === '!=' || two === '<>' || two === '>=' || two === '<=' || two === '**') {
      toks.push({ type: 'op', value: two === '<>' ? '!=' : two === '**' ? '^' : two })
      i += 2; continue
    }
    if ('+-*/^%=><&|!'.includes(ch)) { toks.push({ type: 'op', value: ch }); i++; continue }
    if (ch === '(') { toks.push({ type: 'lp' }); i++; continue }
    if (ch === ')') { toks.push({ type: 'rp' }); i++; continue }
    if (ch === ',') { toks.push({ type: 'comma' }); i++; continue }
    i++
  }
  return toks
}

class Evaluator {
  private toks: Token[]; private pos = 0; private row: Record<string, any>
  constructor(toks: Token[], row: Record<string, any>) { this.toks = toks; this.row = row }
  private peek(): Token | undefined { return this.toks[this.pos] }
  private eat():  Token             { return this.toks[this.pos++]! }
  private peekOp(v: string): boolean { const t = this.peek(); return !!(t && t.type === 'op' && (t as TOp).value === v) }
  eval(): any { return this.exprConcat() }
  private exprConcat(): any {
    let v = this.exprOr()
    while (this.peekOp('&')) { this.eat(); v = String(v ?? '') + String(this.exprOr() ?? '') }
    return v
  }
  private exprOr(): any {
    let v = this.exprCmp()
    while (this.peekOp('|')) { this.eat(); v = v || this.exprCmp() }
    return v
  }
  private exprCmp(): any {
    let v = this.exprAdd()
    const CMP = new Set(['=', '!=', '>', '<', '>=', '<='])
    while (true) {
      const t = this.peek()
      if (!t || t.type !== 'op' || !CMP.has((t as TOp).value)) break
      const op = (this.eat() as TOp).value; const r = this.exprAdd()
      switch (op) {
        case '=':  v = v == r;  break; case '!=': v = v != r;  break
        case '>':  v = v > r;   break; case '<':  v = v < r;   break
        case '>=': v = v >= r;  break; case '<=': v = v <= r;  break
      }
    }
    return v
  }
  private exprAdd(): any {
    let v = this.exprMul()
    while (true) {
      if (this.peekOp('+')) {
        this.eat(); const r = this.exprMul()
        v = (typeof v === 'string' || typeof r === 'string') ? String(v ?? '') + String(r ?? '') : (+(v as any) || 0) + (+(r as any) || 0)
      } else if (this.peekOp('-')) {
        this.eat(); v = (+(v as any) || 0) - (+(this.exprMul() as any) || 0)
      } else break
    }
    return v
  }
  private exprMul(): any {
    let v = this.exprPow()
    while (true) {
      if (this.peekOp('*')) { this.eat(); v = (+(v as any) || 0) * (+(this.exprPow() as any) || 0)
      } else if (this.peekOp('/')) { this.eat(); const d = +(this.exprPow() as any) || 0; v = d === 0 ? 0 : (+(v as any) || 0) / d
      } else if (this.peekOp('%')) { this.eat(); const d = +(this.exprPow() as any) || 0; v = d === 0 ? 0 : (+(v as any) || 0) % d
      } else break
    }
    return v
  }
  private exprPow(): any {
    let v = this.exprUnary()
    if (this.peekOp('^')) { this.eat(); return Math.pow(+(v as any) || 0, +(this.exprUnary() as any) || 0) }
    return v
  }
  private exprUnary(): any {
    if (this.peekOp('-')) { this.eat(); return -(+(this.exprUnary() as any) || 0) }
    if (this.peekOp('!')) { this.eat(); return !this.exprUnary() }
    return this.exprPrimary()
  }
  private collectArgs(): any[] {
    const list: any[] = []
    if (this.peek()?.type === 'rp') return list
    list.push(this.eval())
    while (this.peek()?.type === 'comma') { this.eat(); list.push(this.eval()) }
    return list
  }
  private exprPrimary(): any {
    const t = this.peek()
    if (!t) return undefined
    if (t.type === 'num') { this.eat(); return (t as TNum).value }
    if (t.type === 'str') { this.eat(); return (t as TStr).value }
    if (t.type === 'col') { this.eat(); const c = (t as TColRef).value; return c in this.row ? this.row[c] : undefined }
    if (t.type === 'lp')  { this.eat(); const v = this.eval(); if (this.peek()?.type === 'rp') this.eat(); return v }
    if (t.type === 'ident') {
      const name = (t as TIdent).value
      if (name === 'TRUE')  { this.eat(); return true  }
      if (name === 'FALSE') { this.eat(); return false }
      if (name === 'NULL')  { this.eat(); return null  }
      if (this.toks[this.pos + 1]?.type === 'lp') {
        this.eat(); this.eat()
        const args = this.collectArgs()
        if (this.peek()?.type === 'rp') this.eat()
        return this.callFn(name, args)
      }
      this.eat()
      if (name in this.row) return this.row[name]
      for (const [k, v] of Object.entries(this.row)) if (k.toUpperCase() === name) return v
      return undefined
    }
    return undefined
  }
  private callFn(name: string, a: any[]): any {
    const n = (v: any): number => typeof v === 'number' ? v : +v || 0
    const s = (v: any): string => v == null ? '' : String(v)
    switch (name) {
      case 'IF': return a[0] ? a[1] : a[2]
      case 'AND': return a.every(Boolean); case 'OR': return a.some(Boolean); case 'NOT': return !a[0]
      case 'IFERROR': return a[0] == null ? (a[1] ?? '') : a[0]
      case 'ISBLANK': return a[0] == null || a[0] === ''
      case 'SUM': return a.reduce((acc, v) => acc + n(v), 0)
      case 'AVERAGE': case 'AVG': return a.length ? a.reduce((acc, v) => acc + n(v), 0) / a.length : 0
      case 'MAX': return a.length ? Math.max(...a.map(n)) : 0
      case 'MIN': return a.length ? Math.min(...a.map(n)) : 0
      case 'ABS': return Math.abs(n(a[0])); case 'INT': return Math.floor(n(a[0])); case 'SIGN': return Math.sign(n(a[0]))
      case 'SQRT': return Math.sqrt(Math.max(0, n(a[0]))); case 'TRUNC': return n(a[0]) < 0 ? Math.ceil(n(a[0])) : Math.floor(n(a[0]))
      case 'POWER': return Math.pow(n(a[0]), n(a[1]))
      case 'MOD': { const d = n(a[1]); return d === 0 ? 0 : n(a[0]) % d }
      case 'ROUND': { const p = Math.pow(10, n(a[1] ?? 0)); return Math.round(n(a[0]) * p) / p }
      case 'ROUNDUP': { const p = Math.pow(10, n(a[1] ?? 0)); return Math.ceil(n(a[0]) * p) / p }
      case 'ROUNDDOWN': { const p = Math.pow(10, n(a[1] ?? 0)); return Math.floor(n(a[0]) * p) / p }
      case 'CONCAT': case 'CONCATENATE': return a.map(s).join('')
      case 'LEN': return s(a[0]).length; case 'UPPER': return s(a[0]).toUpperCase(); case 'LOWER': return s(a[0]).toLowerCase(); case 'TRIM': return s(a[0]).trim()
      case 'LEFT': return s(a[0]).slice(0, n(a[1])); case 'RIGHT': { const str = s(a[0]); return str.slice(str.length - n(a[1])) }
      case 'MID': return s(a[0]).slice(n(a[1]) - 1, n(a[1]) - 1 + n(a[2]))
      case 'VALUE': return n(a[0]); case 'TEXT': return s(a[0])
      case 'TODAY': return new Date().toISOString().split('T')[0]
      case 'NOW':   return new Date().toISOString()
      case 'YEAR':  { const d = new Date(s(a[0])); return isNaN(d.getTime()) ? null : d.getFullYear() }
      case 'MONTH': { const d = new Date(s(a[0])); return isNaN(d.getTime()) ? null : d.getMonth() + 1 }
      case 'DAY':   { const d = new Date(s(a[0])); return isNaN(d.getTime()) ? null : d.getDate() }
      case 'DATEDIF': {
        const d1 = new Date(s(a[0])), d2 = new Date(s(a[1])); const unit = s(a[2]).toUpperCase()
        const ms = d2.getTime() - d1.getTime()
        if (unit === 'D') return Math.floor(ms / 86_400_000)
        if (unit === 'M') return (d2.getFullYear() - d1.getFullYear()) * 12 + d2.getMonth() - d1.getMonth()
        if (unit === 'Y') return d2.getFullYear() - d1.getFullYear()
        return Math.floor(ms / 86_400_000)
      }
      default: return undefined
    }
  }
}

function evaluateFormula(formula: string, row: Record<string, any>): any {
  try {
    const toks = tokenize(formula.trim())
    if (!toks.length) return undefined
    return new Evaluator(toks, row).eval()
  } catch { return undefined }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Evaluate a built-up column definition against one row */
export function evaluateColDef(def: ComputedColDef, row: Record<string, any>): any {
  if (!def.name.trim()) return undefined
  try {
    return evaluateFormula(defToFormula(def), row)
  } catch { return undefined }
}

/** Apply all computed column defs to every row */
export function applyComputedColumns(rows: any[], cols: ComputedColDef[]): any[] {
  const valid = cols.filter(c => c.name.trim())
  if (!valid.length) return rows
  return rows.map(row => {
    const out: Record<string, any> = { ...row }
    for (const cc of valid) out[cc.name.trim()] = evaluateColDef(cc, out)
    return out
  })
}

/** Get a human-readable preview of what a def will compute (using first row) */
export function previewColDef(def: ComputedColDef, sampleRow: Record<string, any>): string {
  if (!def.name.trim()) return '—'
  try {
    const formula = defToFormula(def)
    const result  = evaluateFormula(formula, sampleRow)
    if (result === undefined || result === null) return '—'
    return String(result)
  } catch { return '—' }
}
