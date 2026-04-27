// ─── Shared value formatters for datamodel & report ──────────────────────────

export interface NumericFormat {
  comma?:              boolean    // thousands separator
  decimals?:           number     // fixed decimal places
  excludeDecimalCols?: string[]   // columns excluded from comma/decimal formatting
  datePattern?:        string     // e.g. 'DD/MM/YYYY'
  dateEra?:            'CE' | 'BE'  // CE = ค.ศ. (no change) | BE = พ.ศ. (+543)
}

export const DATE_PATTERNS = [
  { label: 'DD/MM/YYYY', value: 'DD/MM/YYYY' },
  { label: 'DD-MM-YYYY', value: 'DD-MM-YYYY' },
  { label: 'YYYY-MM-DD', value: 'YYYY-MM-DD' },
  { label: 'MM/DD/YYYY', value: 'MM/DD/YYYY' },
  { label: 'DD/MM/YY',   value: 'DD/MM/YY'   },
  { label: 'DD-MM-YY',   value: 'DD-MM-YY'   },
]

// Parse date string → { y, m, d } or null
function parseDate(value: any): { y: number; m: string; d: string } | null {
  if (value === null || value === undefined || value === '') return null
  const str = String(value)
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  return { y: parseInt(match[1]!), m: match[2]!, d: match[3]! }
}

export function formatDateValue(value: any, pattern: string, era: 'CE' | 'BE' = 'CE'): string {
  const parsed = parseDate(value)
  if (!parsed) return value === null || value === undefined ? '' : String(value)
  const year = era === 'BE' ? parsed.y + 543 : parsed.y
  return pattern
    .replace('YYYY', String(year).padStart(4, '0'))
    .replace('YY',   String(year % 100).padStart(2, '0'))
    .replace('MM', parsed.m)
    .replace('DD', parsed.d)
}

export function formatNumericValue(value: any, fmt: Pick<NumericFormat, 'comma' | 'decimals'>): string {
  if (value === null || value === undefined || value === '') return ''
  const n = Number(value)
  if (isNaN(n)) return String(value)
  if (fmt.comma) {
    const opts = fmt.decimals === undefined
      ? {}
      : { minimumFractionDigits: fmt.decimals, maximumFractionDigits: fmt.decimals }
    return n.toLocaleString(undefined, opts)
  }
  return fmt.decimals === undefined ? String(value) : n.toFixed(fmt.decimals)
}
