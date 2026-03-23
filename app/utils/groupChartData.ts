import type { DataRow } from '~/stores/canvas'

/**
 * Group rows by xField, summing each yField per group.
 * Preserves insertion order of first-seen x values.
 *
 * Returns:
 *   labels  – unique x values in order
 *   series  – (yField) => array of summed values aligned with labels
 */
export function groupChartData(
  rows:    DataRow[],
  xField:  string,
  yFields: string[],
): { labels: string[]; series: (yf: string) => number[] } {
  const order:  string[]                   = []
  const seen =  new Set<string>()
  const totals = new Map<string, Record<string, number>>()

  for (const row of rows) {
    const key = String(row[xField] ?? '')
    if (!seen.has(key)) {
      seen.add(key)
      order.push(key)
      totals.set(key, Object.fromEntries(yFields.map(f => [f, 0])))
    }
    const bucket = totals.get(key)!
    for (const f of yFields) bucket[f] = (bucket[f] ?? 0) + (Number(row[f]) || 0)
  }

  return {
    labels: order,
    series: (yf: string) => order.map(k => totals.get(k)?.[yf] ?? 0),
  }
}
