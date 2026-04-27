import type { DataRow } from '~/stores/canvas'

export type ChartAggregationType = 'sum' | 'avg' | 'count' | 'min' | 'max'

/**
 * Group rows by xField, aggregating each yField per group.
 * Preserves insertion order of first-seen x values.
 *
 * Returns:
 *   labels  – unique x values in order
 *   series  – (yField) => array of aggregated values aligned with labels
 */
export function groupChartData(
  rows:        DataRow[],
  xField:      string,
  yFields:     string[],
  aggregation: ChartAggregationType = 'sum',
): { labels: string[]; series: (yf: string) => number[] } {
  const order   = [] as string[]
  const seen    = new Set<string>()
  const buckets = new Map<string, Record<string, number[]>>()

  for (const row of rows) {
    const key = String(row[xField] ?? '').trim().replaceAll(/\s+/g, ' ')
    if (!seen.has(key)) {
      seen.add(key)
      order.push(key)
      buckets.set(key, Object.fromEntries(yFields.map(f => [f, []])))
    }
    const bucket = buckets.get(key)!
    for (const f of yFields) {
      const v = Number(row[f])
      if (!Number.isNaN(v)) bucket[f]!.push(v)
    }
  }

  function agg(vals: number[]): number {
    if (!vals.length) return 0
    switch (aggregation) {
      case 'sum':   return vals.reduce((a, b) => a + b, 0)
      case 'avg':   return vals.reduce((a, b) => a + b, 0) / vals.length
      case 'count': return vals.length
      case 'min':   return Math.min(...vals)
      case 'max':   return Math.max(...vals)
    }
  }

  return {
    labels: order,
    series: (yf: string) => order.map(k => agg(buckets.get(k)?.[yf] ?? [])),
  }
}
