export interface ColMeta {
  label:    string   // Remark (ชื่อภาษาไทย) หรือ ColumnName ถ้า Remark ว่าง
  dataType: string   // varchar, int, datetime …
}

const NUM_DATATYPES = new Set([
  'int', 'bigint', 'smallint', 'tinyint',
  'decimal', 'numeric', 'float', 'real', 'double',
  'money', 'smallmoney', 'number',
])

export function parseColumnMapping(raw: any): Record<string, ColMeta> {
  if (!raw) return {}
  try {
    const arr: { ColumnName: string; Remark: string; DataType: string }[] =
      typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(arr)) return {}
    return Object.fromEntries(
      arr.map(c => [
        c.ColumnName,
        { label: c.Remark?.trim() || c.ColumnName, dataType: c.DataType ?? '' },
      ]),
    )
  } catch {
    return {}
  }
}

export function metaToColType(
  meta: ColMeta | undefined,
  fallbackValue: unknown,
): 'number' | 'string' {
  if (meta && NUM_DATATYPES.has(meta.dataType.toLowerCase())) return 'number'
  return typeof fallbackValue === 'number' ? 'number' : 'string'
}
