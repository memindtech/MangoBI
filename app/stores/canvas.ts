import { defineStore } from 'pinia'

export type DataRow = Record<string, string | number>
export type DatasetKey = 'sales_monthly' | 'sales_category' | 'sales_regional' | 'employees'
export type ChartType =
  | 'bar' | 'line' | 'pie'
  | 'stackedBar' | 'stackedHBar' | 'stackedLine'
  | 'halfDoughnut' | 'scatter' | 'tree' | 'ecOption'

export interface CanvasNodeConfig {
  chartType?:    ChartType
  xField?:       string
  yField?:       string
  yFields?:      string[]    // stacked / multi-series
  ecOptionJson?: string      // raw ECharts option JSON
  maxRows?:      number
  columnWidths?: Record<string, number>
}

export const DATASET_META: Record<DatasetKey, { label: string }> = {
  sales_monthly:   { label: 'ยอดขายรายเดือน' },
  sales_category:  { label: 'ยอดขายตามหมวดสินค้า' },
  sales_regional:  { label: 'ข้อมูลตามภูมิภาค' },
  employees:       { label: 'ข้อมูลพนักงาน' },
}

export const MOCK_DATA: Record<DatasetKey, DataRow[]> = {
  sales_monthly: [
    { month: 'ม.ค.', revenue: 125000, cost: 82000, profit: 43000, orders: 145 },
    { month: 'ก.พ.', revenue: 143000, cost: 91000, profit: 52000, orders: 167 },
    { month: 'มี.ค.', revenue: 98000,  cost: 65000, profit: 33000, orders: 112 },
    { month: 'เม.ย.', revenue: 162000, cost: 104000, profit: 58000, orders: 189 },
    { month: 'พ.ค.', revenue: 187000, cost: 118000, profit: 69000, orders: 215 },
    { month: 'มิ.ย.', revenue: 154000, cost: 97000,  profit: 57000, orders: 178 },
    { month: 'ก.ค.', revenue: 198000, cost: 122000, profit: 76000, orders: 232 },
    { month: 'ส.ค.', revenue: 176000, cost: 109000, profit: 67000, orders: 205 },
  ],
  sales_category: [
    { category: 'Electronics', revenue: 450000, units: 823,  margin: 22 },
    { category: 'Clothing',    revenue: 320000, units: 2150, margin: 35 },
    { category: 'Food',        revenue: 280000, units: 5400, margin: 18 },
    { category: 'Beauty',      revenue: 195000, units: 1230, margin: 42 },
    { category: 'Sports',      revenue: 167000, units: 892,  margin: 28 },
  ],
  sales_regional: [
    { region: 'กรุงเทพฯ',   revenue: 580000, customers: 2340, growth: 12 },
    { region: 'เหนือ',       revenue: 230000, customers: 980,  growth: 8  },
    { region: 'ใต้',         revenue: 195000, customers: 820,  growth: 15 },
    { region: 'อีสาน',       revenue: 310000, customers: 1340, growth: 22 },
    { region: 'ตะวันออก',   revenue: 175000, customers: 720,  growth: 6  },
  ],
  employees: [
    { department: 'Sales',      headcount: 45, avg_salary: 28000, satisfaction: 78 },
    { department: 'IT',         headcount: 32, avg_salary: 42000, satisfaction: 82 },
    { department: 'Finance',    headcount: 18, avg_salary: 38000, satisfaction: 75 },
    { department: 'HR',         headcount: 12, avg_salary: 32000, satisfaction: 85 },
    { department: 'Operations', headcount: 56, avg_salary: 25000, satisfaction: 71 },
  ],
}

// column label map: ColumnName → display label (Remark)
export type ColumnLabelMap = Record<string, string>

export const useCanvasStore = defineStore('canvas', () => {
  // Written ONLY by DataSourceNode → triggers edge propagation watcher
  const nodeOutputs = ref<Record<string, DataRow[]>>({})
  // Written ONLY by canvas.vue watcher (edge propagation) → avoids infinite loop
  const nodeInputs = ref<Record<string, DataRow[]>>({})
  // Column labels that flow alongside data through edges
  const nodeOutputLabels = ref<Record<string, ColumnLabelMap>>({})
  const nodeInputLabels  = ref<Record<string, ColumnLabelMap>>({})
  // Node configs (chart type, field selections, etc.)
  const nodeConfigs = ref<Record<string, CanvasNodeConfig>>({})
  // Currently selected node ID
  const selectedNodeId = ref<string | null>(null)

  function setNodeOutput(nodeId: string, rows: DataRow[]) {
    nodeOutputs.value[nodeId] = rows
  }

  function setNodeInput(nodeId: string, rows: DataRow[]) {
    nodeInputs.value[nodeId] = rows
  }

  function setNodeOutputLabels(nodeId: string, labels: ColumnLabelMap) {
    nodeOutputLabels.value[nodeId] = labels
  }

  function setNodeInputLabels(nodeId: string, labels: ColumnLabelMap) {
    nodeInputLabels.value[nodeId] = labels
  }

  function setNodeConfig(nodeId: string, config: Partial<CanvasNodeConfig>) {
    nodeConfigs.value[nodeId] = { ...(nodeConfigs.value[nodeId] ?? {}), ...config }
  }

  function setSelectedNode(nodeId: string | null) {
    selectedNodeId.value = nodeId
  }

  function removeNodeData(nodeId: string) {
    delete nodeOutputs.value[nodeId]
    delete nodeInputs.value[nodeId]
    delete nodeOutputLabels.value[nodeId]
    delete nodeInputLabels.value[nodeId]
    delete nodeConfigs.value[nodeId]
    if (selectedNodeId.value === nodeId) selectedNodeId.value = null
  }

  return {
    nodeOutputs, nodeInputs, nodeOutputLabels, nodeInputLabels,
    nodeConfigs, selectedNodeId,
    setNodeOutput, setNodeInput,
    setNodeOutputLabels, setNodeInputLabels,
    setNodeConfig, setSelectedNode, removeNodeData,
  }
})
