<script setup lang="ts">
import type { DataRow, ChartType } from '~/stores/canvas'

const props = defineProps<{
  rows: DataRow[]
  xField: string
  yField: string
  chartType: ChartType
}>()

const W = 268
const H = 150
const PAD = { top: 8, right: 8, bottom: 26, left: 8 }
const CW = W - PAD.left - PAD.right
const CH = H - PAD.top - PAD.bottom

const COLORS = [
  '#f97316', '#3b82f6', '#10b981', '#a855f7',
  '#ef4444', '#f59e0b', '#06b6d4', '#ec4899',
]

const labels = computed(() => props.rows.map(r => String(r[props.xField] ?? '')))
const values = computed(() => props.rows.map(r => Number(r[props.yField] ?? 0)))
const maxVal = computed(() => Math.max(...values.value, 1))
const total  = computed(() => values.value.reduce((a, b) => a + b, 0) || 1)

// ── BAR CHART ─────────────────────────────────────────────────────
const bars = computed(() => {
  const n = props.rows.length
  if (!n) return []
  const slotW = CW / n
  const barW  = Math.max(slotW * 0.65, 4)
  return values.value.map((v, i) => {
    const bh = CH * v / maxVal.value
    return {
      x: PAD.left + slotW * i + (slotW - barW) / 2,
      y: PAD.top  + CH - bh,
      w: barW,
      h: bh,
      label: labels.value[i],
      color: COLORS[i % COLORS.length],
    }
  })
})

// ── LINE CHART ────────────────────────────────────────────────────
const linePoints = computed(() => {
  const n = props.rows.length
  if (!n) return []
  const step = n > 1 ? CW / (n - 1) : 0
  return values.value.map((v, i) => ({
    x: PAD.left + (n === 1 ? CW / 2 : step * i),
    y: PAD.top  + CH * (1 - v / maxVal.value),
    label: labels.value[i],
  }))
})

const lineD = computed(() => {
  const pts = linePoints.value
  if (!pts.length) return ''
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
})

const areaD = computed(() => {
  const pts = linePoints.value
  if (!pts.length) return ''
  const base = PAD.top + CH
  return (
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') +
    ` L${pts.at(-1)!.x.toFixed(1)},${base} L${pts[0].x.toFixed(1)},${base} Z`
  )
})

// ── PIE CHART ─────────────────────────────────────────────────────
const cx = W / 2
const cy = H / 2

const pieSlices = computed(() => {
  let angle = -Math.PI / 2
  const r = Math.min(W / 2, H / 2) - 16
  return values.value.map((v, i) => {
    const slice    = (v / total.value) * Math.PI * 2
    const x1       = cx + r * Math.cos(angle)
    const y1       = cy + r * Math.sin(angle)
    const midAngle = angle + slice / 2
    angle += slice
    const x2   = cx + r * Math.cos(angle)
    const y2   = cy + r * Math.sin(angle)
    const lArc = slice > Math.PI ? 1 : 0
    const pct  = Math.round(v / total.value * 100)
    return {
      d:     `M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${lArc} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`,
      color: COLORS[i % COLORS.length],
      label: labels.value[i],
      pct,
      lx: (cx + r * 0.6 * Math.cos(midAngle)).toFixed(1),
      ly: (cy + r * 0.6 * Math.sin(midAngle)).toFixed(1),
    }
  })
})

// Y-axis ticks (bar + line only)
const yTicks = computed(() =>
  [0, 0.25, 0.5, 0.75, 1].map(t => ({
    y:     PAD.top + CH * (1 - t),
    label: (maxVal.value * t) >= 1000
      ? `${((maxVal.value * t) / 1000).toFixed(0)}k`
      : (maxVal.value * t).toFixed(0),
  }))
)
</script>

<template>
  <svg
    :viewBox="`0 0 ${W} ${H}`"
    :width="W"
    :height="H"
    class="overflow-visible"
    xmlns="http://www.w3.org/2000/svg"
  >
    <!-- ── BAR ──────────────────────────────────────────────── -->
    <template v-if="chartType === 'bar'">
      <line
        v-for="t in yTicks" :key="t.y"
        :x1="PAD.left" :y1="t.y" :x2="PAD.left + CW" :y2="t.y"
        stroke="currentColor" stroke-opacity="0.08" stroke-width="1"
      />
      <rect
        v-for="b in bars" :key="b.label"
        :x="b.x" :y="b.y" :width="b.w" :height="b.h"
        :fill="b.color" rx="2" opacity="0.85"
      />
      <text
        v-for="b in bars" :key="`xl-${b.label}`"
        :x="b.x + b.w / 2" :y="H - 5"
        text-anchor="middle" font-size="8"
        fill="currentColor" fill-opacity="0.5"
      >{{ b.label.slice(0, 5) }}</text>
    </template>

    <!-- ── LINE ──────────────────────────────────────────────── -->
    <template v-else-if="chartType === 'line'">
      <line
        v-for="t in yTicks" :key="t.y"
        :x1="PAD.left" :y1="t.y" :x2="PAD.left + CW" :y2="t.y"
        stroke="currentColor" stroke-opacity="0.08" stroke-width="1"
      />
      <path :d="areaD" fill="#f97316" fill-opacity="0.1" />
      <path :d="lineD" fill="none" stroke="#f97316" stroke-width="2" stroke-linejoin="round" />
      <circle
        v-for="p in linePoints" :key="p.label"
        :cx="p.x" :cy="p.y" r="3"
        fill="#f97316" stroke="white" stroke-width="1.5"
      />
      <text
        v-for="p in linePoints" :key="`xl-${p.label}`"
        :x="p.x" :y="H - 5"
        text-anchor="middle" font-size="8"
        fill="currentColor" fill-opacity="0.5"
      >{{ p.label.slice(0, 5) }}</text>
    </template>

    <!-- ── PIE ────────────────────────────────────────────────── -->
    <template v-else-if="chartType === 'pie'">
      <path
        v-for="s in pieSlices" :key="s.label"
        :d="s.d" :fill="s.color"
        stroke="white" stroke-width="1.5" opacity="0.9"
      />
      <text
        v-for="s in pieSlices" :key="`pct-${s.label}`"
        :x="s.lx" :y="s.ly"
        text-anchor="middle" dominant-baseline="middle"
        font-size="9" font-weight="600" fill="white"
      >{{ s.pct > 8 ? `${s.pct}%` : '' }}</text>
    </template>

    <!-- Baseline (bar / line) -->
    <line
      v-if="chartType !== 'pie'"
      :x1="PAD.left" :y1="PAD.top + CH"
      :x2="PAD.left + CW" :y2="PAD.top + CH"
      stroke="currentColor" stroke-opacity="0.2" stroke-width="1"
    />
  </svg>
</template>
