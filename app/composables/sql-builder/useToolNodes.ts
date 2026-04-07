/**
 * SQL Builder — Tool Node Logic
 * Modal data helpers for CTE, Calc, Group, Sort, Union, Where
 * Based on ChartDB: useNodeLogic.js
 */

import { useSqlBuilderStore } from '~/stores/sql-builder'

export function useToolNodes() {
  const store = useSqlBuilderStore()

  // ── Generic modal data access ─────────────────────────────────────────
  function modalNodeData(key: string) {
    return store.modalNode?.data?.[key]
  }

  function setModalData(patch: Record<string, any>) {
    if (!store.modalNodeId) return
    store.updateNodeData(store.modalNodeId, patch)
  }

  // ── GROUP BY helpers ──────────────────────────────────────────────────
  function addGroupCol() {
    setModalData({ groupCols: [...(modalNodeData('groupCols') ?? []), ''] })
  }
  function removeGroupCol(i: number) {
    const cols = [...(modalNodeData('groupCols') ?? [])]
    cols.splice(i, 1)
    setModalData({ groupCols: cols })
  }
  function setGroupCol(i: number, val: string) {
    const cols = [...(modalNodeData('groupCols') ?? [])]
    cols[i] = val
    setModalData({ groupCols: cols })
  }

  // ── Aggregation helpers ───────────────────────────────────────────────
  function addAgg() {
    setModalData({
      aggs: [...(modalNodeData('aggs') ?? []), { col: '', func: 'SUM', alias: '' }],
    })
  }
  function removeAgg(i: number) {
    const aggs = [...(modalNodeData('aggs') ?? [])]
    aggs.splice(i, 1)
    setModalData({ aggs })
  }
  function setAgg(i: number, patch: any) {
    const aggs = (modalNodeData('aggs') ?? []).map(
      (a: any, idx: number) => idx === i ? { ...a, ...patch } : a
    )
    setModalData({ aggs })
  }

  // ── Generic item helpers (Calc + Sort share same pattern) ─────────────
  function removeItem(i: number) {
    const items = [...(modalNodeData('items') ?? [])]
    items.splice(i, 1)
    setModalData({ items })
  }
  function patchItem(i: number, patch: any) {
    const items = (modalNodeData('items') ?? []).map(
      (a: any, idx: number) => idx === i ? { ...a, ...patch } : a
    )
    setModalData({ items })
  }

  // ── Calculator helpers ────────────────────────────────────────────────
  function addCalcItem() {
    setModalData({ items: [...(modalNodeData('items') ?? []), { col: '', op: '', value: '', alias: '' }] })
  }
  const removeCalcItem = removeItem
  const setCalcItem = patchItem

  // ── Sort helpers ──────────────────────────────────────────────────────
  function addSortItem() {
    setModalData({ items: [...(modalNodeData('items') ?? []), { col: '', dir: 'ASC' }] })
  }
  const removeSortItem = removeItem
  const setSortItem = patchItem

  // ── Union condition helpers ───────────────────────────────────────────
  function addUnionCondition() {
    setModalData({ conditions: [...(modalNodeData('conditions') ?? []), { column: '', operator: '=', value: '' }] })
  }
  function removeUnionCondition(i: number) {
    const conditions = [...(modalNodeData('conditions') ?? [])]
    conditions.splice(i, 1)
    setModalData({ conditions })
  }
  function setUnionCondition(i: number, patch: any) {
    const conditions = (modalNodeData('conditions') ?? []).map(
      (c: any, idx: number) => idx === i ? { ...c, ...patch } : c
    )
    setModalData({ conditions })
  }

  // ── Union helpers ─────────────────────────────────────────────────────
  function toggleUnionCol(colName: string) {
    const current = [...(modalNodeData('selectedCols') ?? [])] as string[]
    const idx = current.indexOf(colName)
    if (idx >= 0) current.splice(idx, 1)
    else current.push(colName)
    setModalData({ selectedCols: current })
  }

  function selectAllUnionCols(colNames: string[]) {
    setModalData({ selectedCols: colNames })
  }

  function clearUnionCols() {
    setModalData({ selectedCols: [] })
  }

  // ── Union per-source column helpers ───────────────────────────────────
  function toggleUnionSourceCol(sourceId: string, colName: string) {
    const map = { ...(modalNodeData('selectedColsMap') ?? {}) } as Record<string, string[]>
    const current = [...(map[sourceId] ?? [])]
    const idx = current.indexOf(colName)
    if (idx >= 0) current.splice(idx, 1)
    else current.push(colName)
    map[sourceId] = current
    setModalData({ selectedColsMap: map })
  }

  function selectAllUnionSourceCols(sourceId: string, colNames: string[]) {
    const map = { ...(modalNodeData('selectedColsMap') ?? {}) } as Record<string, string[]>
    map[sourceId] = [...colNames]
    setModalData({ selectedColsMap: map })
  }

  function clearUnionSourceCols(sourceId: string) {
    const map = { ...(modalNodeData('selectedColsMap') ?? {}) } as Record<string, string[]>
    map[sourceId] = []
    setModalData({ selectedColsMap: map })
  }

  function selectAllUnionSourcesWithCols(sourceIds: string[], colNames: string[]) {
    const map: Record<string, string[]> = {}
    for (const id of sourceIds) map[id] = [...colNames]
    setModalData({ selectedColsMap: map })
  }

  function isUnionSourceColSelected(sourceId: string, colName: string): boolean {
    const map = (modalNodeData('selectedColsMap') ?? {}) as Record<string, string[]>
    return (map[sourceId] ?? []).includes(colName)
  }

  // ── CTE helpers ───────────────────────────────────────────────────────
  function toggleCteCol(colName: string) {
    const current = [...(modalNodeData('selectedCols') ?? [])] as string[]
    const idx = current.indexOf(colName)
    if (idx >= 0) current.splice(idx, 1)
    else current.push(colName)
    setModalData({ selectedCols: current })
  }
  function selectAllCteCols(colNames: string[]) { setModalData({ selectedCols: colNames }) }
  function clearCteCols() { setModalData({ selectedCols: [] }) }

  function addCteCondition() {
    setModalData({ conditions: [...(modalNodeData('conditions') ?? []), { column: '', operator: '=', value: '' }] })
  }
  function removeCteCondition(i: number) {
    const conditions = [...(modalNodeData('conditions') ?? [])]
    conditions.splice(i, 1)
    setModalData({ conditions })
  }
  function setCteCondition(i: number, patch: any) {
    const conditions = (modalNodeData('conditions') ?? []).map(
      (c: any, idx: number) => idx === i ? { ...c, ...patch } : c
    )
    setModalData({ conditions })
  }

  // ── Where helpers ─────────────────────────────────────────────────────
  function addWhereCondition() {
    setModalData({
      conditions: [...(modalNodeData('conditions') ?? []), { column: '', operator: '=', value: '' }],
    })
  }
  function removeWhereCondition(i: number) {
    const conditions = [...(modalNodeData('conditions') ?? [])]
    conditions.splice(i, 1)
    setModalData({ conditions })
  }
  function setWhereCondition(i: number, patch: any) {
    const conditions = (modalNodeData('conditions') ?? []).map(
      (c: any, idx: number) => idx === i ? { ...c, ...patch } : c
    )
    setModalData({ conditions })
  }

  // ── Group HAVING helpers ──────────────────────────────────────────────────
  function addGroupFilter() {
    setModalData({
      filters: [...(modalNodeData('filters') ?? []), { column: '', operator: '>', value: '' }],
    })
  }
  function removeGroupFilter(i: number) {
    const filters = [...(modalNodeData('filters') ?? [])]
    filters.splice(i, 1)
    setModalData({ filters })
  }
  function setGroupFilter(i: number, patch: any) {
    const filters = (modalNodeData('filters') ?? []).map(
      (f: any, idx: number) => idx === i ? { ...f, ...patch } : f
    )
    setModalData({ filters })
  }

  // ── Calc Filter helpers ───────────────────────────────────────────────────
  function addCalcFilter() {
    setModalData({
      filters: [...(modalNodeData('filters') ?? []), { column: '', operator: '=', value: '' }],
    })
  }
  function removeCalcFilter(i: number) {
    const filters = [...(modalNodeData('filters') ?? [])]
    filters.splice(i, 1)
    setModalData({ filters })
  }
  function setCalcFilter(i: number, patch: any) {
    const filters = (modalNodeData('filters') ?? []).map(
      (f: any, idx: number) => idx === i ? { ...f, ...patch } : f
    )
    setModalData({ filters })
  }

  // ── Tool node summary for display ─────────────────────────────────────
  function toolNodeSummary(data: any): string {
    switch (data.nodeType) {
      case 'cte':
        return data.name || 'my_cte'
      case 'group':
        return (data.groupCols ?? []).filter(Boolean).join(', ') || 'ยังไม่ได้ตั้งค่า'
      case 'calc':
        return (data.items ?? []).filter((c: any) => c.alias).map((c: any) => c.alias).join(', ') || 'ยังไม่ได้ตั้งค่า'
      case 'sort':
        return (data.items ?? []).filter((s: any) => s.col).map((s: any) => `${s.col} ${s.dir}`).join(', ') || 'ยังไม่ได้ตั้งค่า'
      case 'union': {
        const nm  = data.name ? data.name + ' — ' : ''
        const cols = (data.selectedCols ?? []).length ? data.selectedCols.length + ' cols' : '*'
        const conds = (data.conditions ?? []).filter((c: any) => c.column).length
        return `${nm}${data.unionType} · ${cols}${conds ? ' · ' + conds + ' filter' : ''}`
      }
      case 'where':
        return (data.conditions ?? []).filter((c: any) => c.column).map((c: any) => `${c.column} ${c.operator}`).join(', ') || 'ยังไม่ได้ตั้งค่า'
      default:
        return ''
    }
  }

  return {
    modalNodeData, setModalData,
    // Group
    addGroupCol, removeGroupCol, setGroupCol,
    addAgg, removeAgg, setAgg,
    // Calc
    addCalcItem, removeCalcItem, setCalcItem,
    // Sort
    addSortItem, removeSortItem, setSortItem,
    // Union
    toggleUnionCol, selectAllUnionCols, clearUnionCols,
    toggleUnionSourceCol, selectAllUnionSourceCols, clearUnionSourceCols,
    selectAllUnionSourcesWithCols, isUnionSourceColSelected,
    addUnionCondition, removeUnionCondition, setUnionCondition,
    // CTE
    toggleCteCol, selectAllCteCols, clearCteCols,
    addCteCondition, removeCteCondition, setCteCondition,
    // Where
    addWhereCondition, removeWhereCondition, setWhereCondition,
    // Group HAVING
    addGroupFilter, removeGroupFilter, setGroupFilter,
    // Calc Filter
    addCalcFilter, removeCalcFilter, setCalcFilter,
    // Display
    toolNodeSummary,
  }
}
