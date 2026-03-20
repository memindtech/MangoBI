<script setup lang="ts">
import {
  BarChart2, TrendingUp, PieChart, Table2, Hash,
  Database, Download, Loader2, AlertCircle,
  LayoutDashboard, ArrowLeft, Plus, X, Trash2,
  ChevronDown, Hash as HashIcon, Type as TypeIcon, Filter,
  Layers, Activity, Network, Code2,
} from 'lucide-vue-next'
import ReportWidget from '~/components/report/ReportWidget.vue'
import { MOCK_DATA, DATASET_META, type DatasetKey } from '~/stores/canvas'
import type { WidgetType, WidgetFields, FilterCondition, FilterOperator, ReportWidget as RWidget } from '~/stores/report'
import type { DataRow } from '~/stores/canvas'
import { parseColumnMapping } from '~/utils/columnMapping'

// ─── Page meta ────────────────────────────────────────────────────────────────
definePageMeta({ layout: false, auth: true })

// ─── Store / Router ───────────────────────────────────────────────────────────
const store  = useReportStore()
const router = useRouter()
const { $xt } = useNuxtApp() as any

// ─── Selection ────────────────────────────────────────────────────────────────
const selectedWidgetId = ref<string | null>(null)
const selectedWidget   = computed(() => store.widgets.find(w => w.id === selectedWidgetId.value) ?? null)
const selectedDataset  = computed(() => selectedWidget.value
  ? store.datasets.find(d => d.id === selectedWidget.value!.datasetId) ?? null
  : null,
)

// Active field well: when user clicks a field well, the next column click assigns to it
const activeField = ref<keyof WidgetFields | null>(null)

function setActiveField(f: keyof WidgetFields) {
  activeField.value = activeField.value === f ? null : f
}

// ─── Resolve which field to assign when no field well is active ───────────────
function resolveField(type: WidgetType, colType: 'number' | 'string'): keyof WidgetFields {
  if (type === 'table') return 'columns'
  if (type === 'kpi')   return 'yField'
  if (stackedWidgetTypes.includes(type)) return colType === 'number' ? 'yFields' : 'xField'
  return colType === 'number' ? 'yField' : 'xField'
}

// ─── Column click → assign to active field (or auto-assign if none active) ───
function onColumnClick(datasetId: string, colName: string) {
  if (!selectedWidgetId.value) return

  const widget = selectedWidget.value!
  if (widget.datasetId !== datasetId) return

  // Determine target field: use active well, or fall back to smart auto-assign
  const cols  = store.columnsOf(datasetId)
  const col   = cols.find(c => c.name === colName)
  const field = activeField.value ?? resolveField(widget.type, col?.type ?? 'string')

  if (field === 'columns' || field === 'yFields') {
    const cur: string[] = [...((widget.fields as any)[field] ?? [])]
    const idx = cur.indexOf(colName)
    store.updateFields(widget.id, { [field]: idx === -1 ? [...cur, colName] : cur.filter(c => c !== colName) })
  } else {
    store.updateFields(widget.id, { [field]: colName })
    if (activeField.value) activeField.value = null  // advance only when field well was explicitly active
  }
}

// ─── Add Visual ───────────────────────────────────────────────────────────────
const showVisualMenu = ref(false)
const WIDGET_TYPES: { type: WidgetType; label: string; icon: any; color: string }[] = [
  { type: 'bar',          label: 'Bar Chart',     icon: BarChart2,  color: 'text-blue-500'   },
  { type: 'line',         label: 'Line Chart',    icon: TrendingUp, color: 'text-teal-500'   },
  { type: 'pie',          label: 'Pie Chart',     icon: PieChart,   color: 'text-violet-500' },
  { type: 'stackedBar',   label: 'Stacked 100%',  icon: Layers,     color: 'text-blue-500'   },
  { type: 'stackedHBar',  label: 'H-Stack Bar',   icon: Layers,     color: 'text-blue-400'   },
  { type: 'stackedLine',  label: 'Stacked Line',  icon: Layers,     color: 'text-teal-500'   },
  { type: 'halfDoughnut', label: 'Half Donut',    icon: PieChart,   color: 'text-violet-400' },
  { type: 'scatter',      label: 'Scatter',       icon: Activity,   color: 'text-orange-500' },
  { type: 'tree',         label: 'Tree',          icon: Network,    color: 'text-green-500'  },
  { type: 'ecOption',     label: 'ECharts JSON',  icon: Code2,      color: 'text-slate-500'  },
  { type: 'table',        label: 'Table',         icon: Table2,     color: 'text-indigo-500' },
  { type: 'kpi',          label: 'KPI Card',      icon: Hash,       color: 'text-amber-500'  },
]

const stackedWidgetTypes: WidgetType[] = ['stackedBar', 'stackedHBar', 'stackedLine']
const isStackedWidget = computed(() =>
  stackedWidgetTypes.includes(selectedWidget.value?.type ?? 'bar' as WidgetType),
)

let _placeCursor = 40
function addWidget(type: WidgetType) {
  if (!store.datasets.length) return
  const id = `widget_${Date.now()}`
  const ds = store.datasets[0]
  const cols = store.columnsOf(ds.id)
  const numCols = cols.filter(c => c.type === 'number')
  const strCols = cols.filter(c => c.type === 'string')

  const defaultFields: WidgetFields = {
    xField:  strCols[0]?.name ?? cols[0]?.name ?? '',
    yField:  numCols[0]?.name ?? '',
    columns: cols.slice(0, 6).map(c => c.name),
  }
  store.addWidget({
    id, type, datasetId: ds.id,
    title: `${WIDGET_TYPES.find(t => t.type === type)?.label} ${store.widgets.length + 1}`,
    fields: defaultFields,
    x: _placeCursor, y: _placeCursor,
    w: type === 'kpi' ? 200 : type === 'table' ? 460 : 340,
    h: type === 'kpi' ? 140 : 260,
  })
  _placeCursor = (_placeCursor + 24) % 200
  selectedWidgetId.value = id
  activeField.value = null
  showVisualMenu.value = false
}

// ─── Add Data panel ───────────────────────────────────────────────────────────
const showAddPanel  = ref(false)
const addMode       = ref<'mock' | 'sql'>('mock')
const customName    = ref('')
const selectedKey   = ref<DatasetKey>('sales_monthly')
const loading       = ref(false)
const errorMsg      = ref('')

const datasetOptions = Object.entries(DATASET_META).map(([key, m]) => ({
  key: key as DatasetKey, label: m.label,
}))

// SQL Template
const sqlPasscode        = ref('')
const sqlTemplates       = ref<{ template_id: number; template_name: string }[]>([])
const selectedTemplateId = ref<number | null>(null)
const sqlTemplatesLoaded = ref(false)
const sqlLoading         = ref(false)

async function fetchSqlTemplates() {
  if (!sqlPasscode.value.trim()) return
  sqlTemplatesLoaded.value = false; sqlTemplates.value = []; selectedTemplateId.value = null
  sqlLoading.value = true
  try {
    const res: any = await $xt.getServer(
      `Planning/Master/GetSqlFlowTemplate?passcode=${encodeURIComponent(sqlPasscode.value.trim())}`,
    )
    sqlTemplates.value = Array.isArray(res?.data) ? res.data : []
    if (sqlTemplates.value.length) selectedTemplateId.value = sqlTemplates.value[0].template_id
  } catch { sqlTemplates.value = [] }
  finally { sqlLoading.value = false; sqlTemplatesLoaded.value = true }
}

watch(addMode, (m) => { if (m === 'sql') { sqlTemplatesLoaded.value = false; sqlTemplates.value = [] } })

// แกะ response จาก JsonContentResult({ data, column_mapping_json })
// Structure: { success, error, data: { data: [...rows], column_mapping_json: "..." } }
function extractSqlPayload(res: any): { rows: any[]; column_mapping_json?: any } | null {
  if (!res) return null
  // unwrap JsonContentResult wrapper → inner = { data: [...], column_mapping_json: "..." }
  const inner = res?.data ?? res
  // inner.data = actual rows array
  const rows = Array.isArray(inner?.data)   ? inner.data
             : Array.isArray(inner?.rows)   ? inner.rows
             : Array.isArray(inner?.result) ? inner.result
             : Array.isArray(inner?.list)   ? inner.list
             : Array.isArray(inner?.items)  ? inner.items
             : Array.isArray(inner)         ? inner
             : null
  if (!rows) return null
  return { rows, column_mapping_json: inner?.column_mapping_json }
}

function extractRows(res: any): any[] | null {
  return extractSqlPayload(res)?.rows ?? null
}

function addMockDataset() {
  const name = customName.value.trim() || DATASET_META[selectedKey.value].label
  store.addDataset({ id: `${selectedKey.value}_${Date.now()}`, name, rows: MOCK_DATA[selectedKey.value] })
  showAddPanel.value = false; customName.value = ''
}

async function addSQLDataset() {
  if (!selectedTemplateId.value) { errorMsg.value = 'กรุณาเลือก Template'; return }
  loading.value = true; errorMsg.value = ''
  try {
    const res: any = await $xt.getServer(
      `Planning/Master/ExecuteSqlFlowTemplate?template_id=${selectedTemplateId.value}&passcode=${encodeURIComponent(sqlPasscode.value.trim())}`,
    )
    if (res?.error) throw new Error(res.error)
    const payload = extractSqlPayload(res)
    if (!payload?.rows) throw new Error('ไม่พบข้อมูล')
    const tmpl    = sqlTemplates.value.find(t => t.template_id === selectedTemplateId.value)
    const name    = customName.value.trim() || tmpl?.template_name || `Template ${selectedTemplateId.value}`
    store.addDataset({
      id:           `sql_${Date.now()}`,
      name,
      rows:         payload.rows,
      columnLabels: parseColumnMapping(payload.column_mapping_json),
    })
    showAddPanel.value = false; customName.value = ''
  } catch (e: any) { errorMsg.value = e?.message ?? 'เกิดข้อผิดพลาด' }
  finally { loading.value = false }
}

// ─── Field wells config per type ─────────────────────────────────────────────
interface FieldWell { key: keyof WidgetFields; label: string; multi?: boolean }
const fieldWells: Record<WidgetType, FieldWell[]> = {
  bar:          [{ key: 'xField', label: 'X-Axis (Category)' }, { key: 'yField',  label: 'Y-Axis (Value)'   }],
  line:         [{ key: 'xField', label: 'X-Axis (Category)' }, { key: 'yField',  label: 'Y-Axis (Value)'   }],
  pie:          [{ key: 'xField', label: 'Label'             }, { key: 'yField',  label: 'Value'            }],
  halfDoughnut: [{ key: 'xField', label: 'Label'             }, { key: 'yField',  label: 'Value'            }],
  scatter:      [{ key: 'xField', label: 'X (Numeric)'       }, { key: 'yField',  label: 'Y (Numeric)'      }],
  tree:         [{ key: 'xField', label: 'Parent Group'      }, { key: 'yField',  label: 'Child Node'       }],
  stackedBar:   [{ key: 'xField', label: 'X-Axis (Category)' }, { key: 'yFields', label: 'Y Series (หลาย field)', multi: true }],
  stackedHBar:  [{ key: 'xField', label: 'Y-Axis (Category)' }, { key: 'yFields', label: 'X Series (หลาย field)', multi: true }],
  stackedLine:  [{ key: 'xField', label: 'X-Axis (Category)' }, { key: 'yFields', label: 'Y Series (หลาย field)', multi: true }],
  ecOption:     [],
  table:        [{ key: 'columns',  label: 'Columns', multi: true }],
  kpi:          [{ key: 'yField',   label: 'Value (Sum)'     }],
}

function getFieldValue(well: FieldWell): string {
  if (!selectedWidget.value) return ''
  if (well.multi) {
    const vals: string[] = (selectedWidget.value.fields as any)[well.key] ?? []
    return vals.length ? `${vals.length} fields` : ''
  }
  const colName = (selectedWidget.value.fields as any)[well.key] ?? ''
  return colName ? store.labelOf(selectedWidget.value.datasetId, colName) : ''
}

function clearField(well: FieldWell) {
  if (!selectedWidget.value) return
  if (well.multi) store.updateFields(selectedWidget.value.id, { [well.key]: [] })
  else store.updateFields(selectedWidget.value.id, { [well.key]: '' })
}

function isColumnActive(datasetId: string, colName: string): boolean {
  if (!selectedWidget.value || selectedWidget.value.datasetId !== datasetId) return false
  const f = selectedWidget.value.fields
  if (activeField.value === 'columns') return f.columns?.includes(colName) ?? false
  if (activeField.value === 'yFields') return f.yFields?.includes(colName) ?? false
  if (activeField.value) return (f as any)[activeField.value] === colName
  return Object.values(f).flat().includes(colName)
}

// ─── Filter logic ─────────────────────────────────────────────────────────────
function matchCondition(row: DataRow, c: FilterCondition): boolean {
  const v = row[c.column]
  switch (c.operator) {
    case 'eq':         return String(v ?? '') === c.value
    case 'neq':        return String(v ?? '') !== c.value
    case 'gt':         return Number(v) >  Number(c.value)
    case 'gte':        return Number(v) >= Number(c.value)
    case 'lt':         return Number(v) <  Number(c.value)
    case 'lte':        return Number(v) <= Number(c.value)
    case 'contains':   return String(v ?? '').toLowerCase().includes(c.value.toLowerCase())
    case 'notContains':return !String(v ?? '').toLowerCase().includes(c.value.toLowerCase())
    case 'blank':      return v === null || v === undefined || v === ''
    case 'notBlank':   return v !== null && v !== undefined && v !== ''
  }
}

function filteredRowsOf(widget: RWidget): DataRow[] {
  const rows = store.rowsOf(widget.datasetId)
  const filters = widget.filters
  if (!filters?.conditions.length) return rows
  const valid = filters.conditions.filter(c =>
    c.column && (c.operator === 'blank' || c.operator === 'notBlank' || c.value !== ''),
  )
  if (!valid.length) return rows
  return rows.filter(row =>
    filters.logic === 'and'
      ? valid.every(c => matchCondition(row, c))
      : valid.some(c => matchCondition(row, c)),
  )
}

// ─── Filter panel helpers ─────────────────────────────────────────────────────
const NUMBER_OPS: { value: FilterOperator; label: string }[] = [
  { value: 'eq',  label: '=' }, { value: 'neq', label: '≠' },
  { value: 'gt',  label: '>' }, { value: 'gte', label: '≥' },
  { value: 'lt',  label: '<' }, { value: 'lte', label: '≤' },
  { value: 'blank', label: 'ว่าง' }, { value: 'notBlank', label: 'ไม่ว่าง' },
]
const STRING_OPS: { value: FilterOperator; label: string }[] = [
  { value: 'eq',         label: '= เท่ากับ' },
  { value: 'neq',        label: '≠ ไม่เท่ากับ' },
  { value: 'contains',   label: '⊃ มี' },
  { value: 'notContains',label: '⊅ ไม่มี' },
  { value: 'blank',      label: 'ว่างเปล่า' },
  { value: 'notBlank',   label: 'ไม่ว่างเปล่า' },
]

const filterCols = computed(() =>
  selectedWidget.value ? store.columnsOf(selectedWidget.value.datasetId) : [],
)

const filterConditions = computed(() =>
  selectedWidget.value?.filters?.conditions ?? [],
)

const filterLogic = computed(() =>
  selectedWidget.value?.filters?.logic ?? 'and',
)

const activeFilterCount = computed(() => {
  const conds = selectedWidget.value?.filters?.conditions ?? []
  return conds.filter(c =>
    c.column && (c.operator === 'blank' || c.operator === 'notBlank' || c.value !== ''),
  ).length
})

function getColType(colName: string): 'number' | 'string' {
  return filterCols.value.find(c => c.name === colName)?.type ?? 'string'
}

function opsForCol(colName: string) {
  return getColType(colName) === 'number' ? NUMBER_OPS : STRING_OPS
}

function setFilterLogic(logic: 'and' | 'or') {
  if (!selectedWidget.value) return
  const filters = selectedWidget.value.filters ?? { logic: 'and', conditions: [] }
  store.updateFilters(selectedWidget.value.id, { ...filters, logic })
}

function addFilterCondition() {
  if (!selectedWidget.value) return
  const first = filterCols.value[0]?.name ?? ''
  const filters = selectedWidget.value.filters ?? { logic: 'and', conditions: [] }
  store.updateFilters(selectedWidget.value.id, {
    ...filters,
    conditions: [
      ...filters.conditions,
      { id: `f_${Date.now()}_${Math.random().toString(36).slice(2)}`, column: first, operator: 'eq', value: '' },
    ],
  })
}

function removeFilterCondition(id: string) {
  if (!selectedWidget.value) return
  const filters = selectedWidget.value.filters!
  store.updateFilters(selectedWidget.value.id, {
    ...filters,
    conditions: filters.conditions.filter(c => c.id !== id),
  })
}

function updateFilterCondition(id: string, patch: Partial<FilterCondition>) {
  if (!selectedWidget.value) return
  const filters = selectedWidget.value.filters!
  store.updateFilters(selectedWidget.value.id, {
    ...filters,
    conditions: filters.conditions.map(c => c.id === id ? { ...c, ...patch } : c),
  })
}

// ─── Canvas click ─────────────────────────────────────────────────────────────
function onCanvasClick() {
  selectedWidgetId.value = null
  activeField.value = null
  showVisualMenu.value = false
}

// ─── Title editing ────────────────────────────────────────────────────────────
function onTitleInput(e: Event) {
  if (!selectedWidgetId.value) return
  store.updateWidget(selectedWidgetId.value, { title: (e.target as HTMLInputElement).value })
}

// ─── Dataset change for widget ────────────────────────────────────────────────
function onDatasetChange(e: Event) {
  if (!selectedWidgetId.value) return
  const dsId = (e.target as HTMLSelectElement).value
  const cols = store.columnsOf(dsId)
  const numCols = cols.filter(c => c.type === 'number')
  const strCols = cols.filter(c => c.type === 'string')
  store.updateWidget(selectedWidgetId.value, {
    datasetId: dsId,
    fields: {
      xField: strCols[0]?.name ?? cols[0]?.name ?? '',
      yField: numCols[0]?.name ?? '',
      columns: cols.slice(0, 6).map(c => c.name),
    },
  })
}

// ─── Widget type change ───────────────────────────────────────────────────────
function changeWidgetType(type: WidgetType) {
  if (!selectedWidgetId.value) return
  store.updateWidget(selectedWidgetId.value, { type })
}
</script>

<template>
  <div class="fixed inset-0 flex flex-col bg-background" @click="onCanvasClick">

    <!-- ── Header ─────────────────────────────────────────────────────────── -->
    <header
      class="flex items-center gap-3 px-4 h-12 border-b shrink-0 bg-background z-30"
      @click.stop
    >
      <button
        @click="router.back()"
        class="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft class="size-4" />
        Back
      </button>
      <div class="h-4 w-px bg-border" />
      <LayoutDashboard class="size-4 text-orange-500" />
      <span class="font-semibold text-sm">Report Builder</span>

      <div class="ml-auto flex items-center gap-2">
        <span class="text-xs text-muted-foreground">
          {{ store.datasets.length }} dataset · {{ store.widgets.length }} visual
        </span>

        <!-- Add Data -->
        <button
          @click.stop="showAddPanel = !showAddPanel; showVisualMenu = false"
          class="flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-lg
                 hover:bg-accent transition-colors font-medium"
        >
          <Database class="size-3.5" />
          + Data
        </button>

        <!-- Add Visual dropdown -->
        <div class="relative">
          <button
            @click.stop="showVisualMenu = !showVisualMenu; showAddPanel = false"
            :disabled="!store.datasets.length"
            class="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-orange-500 hover:bg-orange-600
                   text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            <Plus class="size-3.5" />
            + Visual
            <ChevronDown class="size-3 ml-0.5" />
          </button>
          <div
            v-if="showVisualMenu"
            class="absolute right-0 top-full mt-1 bg-background border rounded-xl shadow-xl z-50 py-1 min-w-[160px]"
          >
            <button
              v-for="vt in WIDGET_TYPES" :key="vt.type"
              @click.stop="addWidget(vt.type)"
              class="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
            >
              <component :is="vt.icon" class="size-4 shrink-0" :class="vt.color" />
              {{ vt.label }}
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- ── Body ───────────────────────────────────────────────────────────── -->
    <div class="relative flex flex-1 overflow-hidden" @click.stop>

      <!-- ── Left: Fields panel ─────────────────────────────────────────── -->
      <aside class="w-52 border-r bg-background flex flex-col overflow-hidden shrink-0">
        <div class="px-3 py-2 border-b shrink-0">
          <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Fields</p>
        </div>

        <div class="flex-1 overflow-y-auto">
          <!-- No dataset -->
          <div
            v-if="!store.datasets.length"
            class="flex flex-col items-center justify-center gap-2 h-32 text-center px-4"
          >
            <Database class="size-6 text-muted-foreground/30" />
            <p class="text-[11px] text-muted-foreground">กด "+ Data" เพื่อโหลดข้อมูล</p>
          </div>

          <!-- Dataset sections -->
          <div v-for="ds in store.datasets" :key="ds.id" class="border-b last:border-0">
            <!-- Dataset header -->
            <div class="flex items-center gap-1.5 px-3 py-2 bg-muted/30 sticky top-0 z-10">
              <Database class="size-3 text-orange-400 shrink-0" />
              <span class="text-[11px] font-semibold truncate flex-1" :title="ds.name">{{ ds.name }}</span>
              <span class="text-[10px] text-muted-foreground font-mono shrink-0">{{ ds.rows.length }}r</span>
              <button
                @click.stop="store.removeDataset(ds.id)"
                class="text-muted-foreground hover:text-destructive transition-colors ml-1"
              >
                <X class="size-3" />
              </button>
            </div>

            <!-- Columns -->
            <div>
              <button
                v-for="col in store.columnsOf(ds.id)"
                :key="col.name"
                class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/40 transition-colors"
                :class="[
                  isColumnActive(ds.id, col.name)
                    ? 'bg-orange-50 dark:bg-orange-950/30'
                    : '',
                  selectedWidget && selectedWidget.datasetId !== ds.id
                    ? 'opacity-40 cursor-not-allowed'
                    : 'cursor-pointer',
                ]"
                @click.stop="onColumnClick(ds.id, col.name)"
              >
                <HashIcon v-if="col.type === 'number'" class="size-3 shrink-0 text-blue-400" />
                <TypeIcon v-else class="size-3 shrink-0 text-emerald-400" />
                <div class="min-w-0 flex-1">
                  <span class="text-[11px] block truncate" :title="col.name">{{ col.label }}</span>
                  <span v-if="col.label !== col.name" class="text-[9px] block truncate text-muted-foreground/50 font-mono leading-tight">{{ col.name }}</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <!-- ── Add Data Slide Panel ────────────────────────────────────────── -->
      <Transition name="slide-panel">
        <div
          v-if="showAddPanel"
          class="w-64 border-r bg-background z-20 flex flex-col shrink-0 shadow-lg absolute left-52 top-0 bottom-0"
          @click.stop
        >
          <!-- Tabs + Close -->
          <div class="flex border-b text-[10px] shrink-0">
            <button
              v-for="[m, label] in ([['mock','📦 Demo'],['sql','🗄️ SQL']] as const)"
              :key="m"
              @click="addMode = m; errorMsg = ''"
              :class="['flex-1 py-2 font-semibold transition-colors', addMode === m ? 'bg-orange-500 text-white' : 'text-muted-foreground hover:bg-accent']"
            >{{ label }}</button>
            <button
              @click="showAddPanel = false"
              class="px-3 flex items-center justify-center border-l text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="ปิด"
            >
              <X class="size-3.5" />
            </button>
          </div>

          <!-- Scrollable content -->
          <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
            <div>
              <p class="text-[10px] font-semibold text-muted-foreground mb-1">ชื่อ Dataset (ไม่บังคับ)</p>
              <input v-model="customName" placeholder="ชื่อที่แสดง..."
                class="w-full text-xs border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-orange-400" />
            </div>

            <!-- Mock -->
            <template v-if="addMode === 'mock'">
              <select v-model="selectedKey"
                class="w-full text-xs border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-orange-400">
                <option v-for="ds in datasetOptions" :key="ds.key" :value="ds.key">{{ ds.label }}</option>
              </select>
              <button @click="addMockDataset"
                class="w-full text-xs py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors">
                + เพิ่ม Dataset
              </button>
            </template>

            <!-- SQL -->
            <template v-else>
              <div>
                <p class="text-[10px] font-semibold text-muted-foreground mb-1">Passcode</p>
                <div class="flex gap-1.5">
                  <input v-model="sqlPasscode" type="text" placeholder="กรอก passcode..."
                    class="flex-1 text-xs border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-orange-400 font-mono min-w-0"
                    @keydown.enter.stop="fetchSqlTemplates" />
                  <button @click="fetchSqlTemplates" :disabled="sqlLoading"
                    class="px-2.5 text-[10px] font-semibold bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300
                           border border-orange-200 rounded-lg hover:bg-orange-200 transition-colors disabled:opacity-60 shrink-0">
                    <Loader2 v-if="sqlLoading" class="size-3 animate-spin" />
                    <span v-else>ค้นหา</span>
                  </button>
                </div>
              </div>

              <template v-if="sqlTemplatesLoaded">
                <div v-if="sqlTemplates.length" class="space-y-1.5">
                  <div class="flex items-center justify-between">
                    <p class="text-[10px] font-semibold text-muted-foreground">Template</p>
                    <span class="text-[10px] text-orange-500">{{ sqlTemplates.length }} รายการ</span>
                  </div>
                  <select v-model="selectedTemplateId"
                    class="w-full text-xs border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-orange-400">
                    <option v-for="t in sqlTemplates" :key="t.template_id" :value="t.template_id">
                      {{ t.template_name }}
                    </option>
                  </select>
                </div>
                <div v-else class="text-[10px] text-center text-muted-foreground py-2 border border-dashed rounded-lg">
                  ไม่พบ Template
                </div>
              </template>

              <div v-if="errorMsg" class="flex items-start gap-1.5 text-[10px] text-destructive bg-destructive/10 rounded-lg px-2 py-1.5">
                <AlertCircle class="size-3 shrink-0 mt-0.5" />
                <span class="break-all">{{ errorMsg }}</span>
              </div>

              <button v-if="sqlTemplatesLoaded && sqlTemplates.length"
                @click="addSQLDataset" :disabled="loading || !selectedTemplateId"
                class="w-full flex items-center justify-center gap-1.5 text-xs py-2 bg-orange-500 hover:bg-orange-600
                       text-white rounded-lg font-medium transition-colors disabled:opacity-60">
                <Loader2 v-if="loading" class="size-3 animate-spin" />
                <Download v-else class="size-3" />
                {{ loading ? 'กำลังโหลด...' : '+ เพิ่ม Dataset' }}
              </button>
            </template>
          </div>
        </div>
      </Transition>

      <!-- ── Canvas ──────────────────────────────────────────────────────── -->
      <div
        class="flex-1 relative overflow-auto bg-background bg-[radial-gradient(circle,_hsl(var(--border))_1px,_transparent_1px)] bg-[size:24px_24px]"
        @click="onCanvasClick"
      >
        <!-- Empty state -->
        <div
          v-if="!store.widgets.length"
          class="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none"
        >
          <LayoutDashboard class="size-14 text-muted-foreground/15" />
          <p class="text-sm font-medium text-muted-foreground">
            {{ store.datasets.length ? 'คลิก "+ Visual" เพื่อเพิ่ม visualization' : 'เริ่มจากกด "+ Data" เพื่อโหลดข้อมูล' }}
          </p>
          <p v-if="store.datasets.length" class="text-xs text-muted-foreground/60">
            จากนั้น click column ที่ panel ซ้ายเพื่อ assign field
          </p>
        </div>

        <!-- Canvas size extender -->
        <div style="min-width: 1400px; min-height: 900px; position: relative;">
          <ReportWidget
            v-for="widget in store.widgets"
            :key="widget.id"
            :widget="widget"
            :rows="filteredRowsOf(widget)"
            :selected="selectedWidgetId === widget.id"
            @select="selectedWidgetId = widget.id; activeField = null"
            @delete="store.removeWidget(widget.id); if (selectedWidgetId === widget.id) selectedWidgetId = null"
            @move="(x, y) => store.updateWidget(widget.id, { x, y })"
            @resize="(w, h) => store.updateWidget(widget.id, { w, h })"
          />
        </div>
      </div>

      <!-- ── Right: Visualization config ────────────────────────────────── -->
      <Transition name="slide-right">
        <aside
          v-if="selectedWidget"
          class="w-56 border-l bg-background flex flex-col overflow-hidden shrink-0"
          @click.stop
        >
          <!-- Panel header -->
          <div class="px-3 py-2 border-b shrink-0 flex items-center justify-between">
            <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Visualizations</p>
            <button @click="store.removeWidget(selectedWidget.id); selectedWidgetId = null"
              class="text-muted-foreground hover:text-destructive transition-colors" title="ลบ Visual">
              <Trash2 class="size-3.5" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-4">

            <!-- Visual type picker -->
            <div>
              <p class="text-[10px] font-semibold text-muted-foreground mb-2">ประเภท Visual</p>
              <div class="grid grid-cols-2 gap-1">
                <button
                  v-for="vt in WIDGET_TYPES" :key="vt.type"
                  @click="changeWidgetType(vt.type)"
                  :class="[
                    'flex items-center gap-1.5 px-2 py-1.5 text-[10px] rounded-lg border transition-colors',
                    selectedWidget.type === vt.type
                      ? 'border-primary bg-primary/5 font-semibold'
                      : 'border-transparent hover:border-border hover:bg-muted/40',
                  ]"
                  :title="vt.label"
                >
                  <component :is="vt.icon" class="size-3 shrink-0" :class="vt.color" />
                  {{ vt.label }}
                </button>
              </div>
            </div>

            <!-- Title -->
            <div>
              <p class="text-[10px] font-semibold text-muted-foreground mb-1">ชื่อ</p>
              <input
                :value="selectedWidget.title"
                @input="onTitleInput"
                class="w-full text-xs border rounded-lg px-2 py-1.5 bg-background
                       focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="ชื่อ visual..."
              />
            </div>

            <!-- Dataset selector -->
            <div v-if="store.datasets.length > 1">
              <p class="text-[10px] font-semibold text-muted-foreground mb-1">Dataset</p>
              <select
                :value="selectedWidget.datasetId"
                @change="onDatasetChange"
                class="w-full text-xs border rounded-lg px-2 py-1.5 bg-background
                       focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option v-for="ds in store.datasets" :key="ds.id" :value="ds.id">{{ ds.name }}</option>
              </select>
            </div>

            <!-- Field wells -->
            <div>
              <p class="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Fields</p>

              <!-- ecOption: raw JSON textarea -->
              <template v-if="selectedWidget.type === 'ecOption'">
                <p class="text-[10px] text-muted-foreground/70 mb-2">วาง ECharts option JSON</p>
                <textarea
                  rows="10"
                  placeholder="{&#10;  &quot;series&quot;: [...]&#10;}"
                  class="w-full text-[10px] font-mono border rounded-lg px-2 py-1.5 bg-background
                         focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  :value="selectedWidget.fields.ecOptionJson ?? ''"
                  @input="store.updateFields(selectedWidget.id, { ecOptionJson: ($event.target as HTMLTextAreaElement).value })"
                />
              </template>

              <!-- Normal field wells -->
              <template v-else>
                <p class="text-[10px] text-muted-foreground/70 mb-3 leading-relaxed">
                  คลิก field well → แล้วคลิก column ซ้ายเพื่อ assign
                </p>
                <div class="space-y-2">
                  <div
                    v-for="well in fieldWells[selectedWidget.type]"
                    :key="well.key"
                  >
                    <p class="text-[10px] font-medium text-muted-foreground mb-1">{{ well.label }}</p>
                    <div
                      @click.stop="setActiveField(well.key)"
                      :class="[
                        'flex items-center gap-1.5 rounded-lg border px-2.5 py-2 cursor-pointer transition-all',
                        activeField === well.key
                          ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30 ring-1 ring-orange-400'
                          : 'border-dashed hover:border-border bg-muted/20',
                      ]"
                    >
                      <span class="text-[11px] flex-1 truncate font-mono" :class="getFieldValue(well) ? 'text-foreground' : 'text-muted-foreground/50'">
                        {{ getFieldValue(well) || (well.multi ? 'คลิกเพื่อเลือก fields...' : 'คลิกเพื่อเลือก column...') }}
                      </span>
                      <button
                        v-if="getFieldValue(well)"
                        @click.stop="clearField(well)"
                        class="text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <X class="size-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </template>
            </div>

            <!-- Selected yFields detail (stacked types) -->
            <div v-if="isStackedWidget && selectedWidget.fields.yFields?.length">
              <p class="text-[10px] font-semibold text-muted-foreground mb-1.5">Y Series ที่เลือก</p>
              <div class="space-y-1">
                <div
                  v-for="col in selectedWidget.fields.yFields"
                  :key="col"
                  class="flex items-center gap-1.5 text-[11px] py-0.5"
                >
                  <span class="flex-1 truncate text-foreground/70">
                    {{ store.labelOf(selectedWidget.datasetId, col) }}
                  </span>
                  <button
                    @click.stop="store.updateFields(selectedWidget.id, { yFields: selectedWidget.fields.yFields!.filter(c => c !== col) })"
                    class="text-muted-foreground hover:text-destructive"
                  ><X class="size-3" /></button>
                </div>
              </div>
            </div>

            <!-- Selected columns detail (table type) -->
            <div v-if="selectedWidget.type === 'table' && selectedWidget.fields.columns?.length">
              <p class="text-[10px] font-semibold text-muted-foreground mb-1.5">Columns ที่เลือก</p>
              <div class="space-y-1">
                <div
                  v-for="col in selectedWidget.fields.columns"
                  :key="col"
                  class="flex items-center gap-1.5 text-[11px] py-0.5"
                >
                  <span class="flex-1 truncate text-foreground/70 text-[11px]">
                    {{ store.labelOf(selectedWidget.datasetId, col) }}
                    <span v-if="store.labelOf(selectedWidget.datasetId, col) !== col" class="text-muted-foreground/50 font-mono text-[9px] ml-1">{{ col }}</span>
                  </span>
                  <button
                    @click.stop="store.updateFields(selectedWidget.id, { columns: selectedWidget.fields.columns!.filter(c => c !== col) })"
                    class="text-muted-foreground hover:text-destructive"
                  ><X class="size-3" /></button>
                </div>
              </div>
            </div>

            <!-- ── Filters ─────────────────────────────────────────────── -->
            <div class="border-t pt-3">

              <!-- Header -->
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-1.5">
                  <Filter class="size-3 text-muted-foreground" />
                  <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Filters</p>
                  <span
                    v-if="activeFilterCount"
                    class="bg-orange-500 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 leading-none"
                  >{{ activeFilterCount }}</span>
                </div>
                <!-- AND / OR toggle -->
                <div class="flex text-[9px] border rounded-lg overflow-hidden">
                  <button
                    @click.stop="setFilterLogic('and')"
                    :class="['px-2 py-1 font-semibold transition-colors', filterLogic === 'and' ? 'bg-orange-500 text-white' : 'hover:bg-muted text-muted-foreground']"
                  >AND</button>
                  <button
                    @click.stop="setFilterLogic('or')"
                    :class="['px-2 py-1 font-semibold transition-colors', filterLogic === 'or' ? 'bg-orange-500 text-white' : 'hover:bg-muted text-muted-foreground']"
                  >OR</button>
                </div>
              </div>

              <!-- Condition rows -->
              <div class="space-y-2">
                <div
                  v-for="cond in filterConditions"
                  :key="cond.id"
                  class="rounded-lg border bg-muted/20 p-2 space-y-1.5"
                >
                  <!-- Row 1: column + remove -->
                  <div class="flex items-center gap-1">
                    <select
                      :value="cond.column"
                      @change="updateFilterCondition(cond.id, {
                        column: ($event.target as HTMLSelectElement).value,
                        operator: 'eq',
                        value: '',
                      })"
                      class="flex-1 text-[10px] border rounded-md px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-orange-400 min-w-0 truncate"
                    >
                      <option v-for="col in filterCols" :key="col.name" :value="col.name">
                        {{ col.label }}{{ col.label !== col.name ? ` (${col.name})` : '' }}
                      </option>
                    </select>
                    <button
                      @click.stop="removeFilterCondition(cond.id)"
                      class="text-muted-foreground hover:text-destructive shrink-0 p-0.5"
                    ><X class="size-3" /></button>
                  </div>

                  <!-- Row 2: operator -->
                  <select
                    :value="cond.operator"
                    @change="updateFilterCondition(cond.id, {
                      operator: ($event.target as HTMLSelectElement).value as FilterOperator,
                      value: '',
                    })"
                    class="w-full text-[10px] border rounded-md px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-orange-400"
                  >
                    <option v-for="op in opsForCol(cond.column)" :key="op.value" :value="op.value">
                      {{ op.label }}
                    </option>
                  </select>

                  <!-- Row 3: value (hidden for blank/notBlank) -->
                  <input
                    v-if="cond.operator !== 'blank' && cond.operator !== 'notBlank'"
                    :value="cond.value"
                    @input="updateFilterCondition(cond.id, { value: ($event.target as HTMLInputElement).value })"
                    placeholder="ค่า..."
                    :type="getColType(cond.column) === 'number' ? 'number' : 'text'"
                    class="w-full text-[10px] border rounded-md px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-muted-foreground/40 font-mono"
                  />
                </div>
              </div>

              <!-- Add condition button -->
              <button
                @click.stop="addFilterCondition"
                :disabled="!filterCols.length"
                class="mt-2 w-full flex items-center justify-center gap-1 text-[10px] py-1.5 border border-dashed rounded-lg
                       text-muted-foreground hover:text-foreground hover:border-primary hover:bg-muted/30
                       transition-colors disabled:opacity-40"
              >
                <Plus class="size-3" />
                Add condition
              </button>

            </div>

          </div>
        </aside>
      </Transition>

    </div>
  </div>
</template>

<style scoped>
.slide-panel-enter-active,
.slide-panel-leave-active { transition: all 0.2s ease; }
.slide-panel-enter-from,
.slide-panel-leave-to     { transform: translateX(-100%); opacity: 0; }

.slide-right-enter-active,
.slide-right-leave-active { transition: all 0.2s ease; }
.slide-right-enter-from,
.slide-right-leave-to     { transform: translateX(100%); opacity: 0; }
</style>
