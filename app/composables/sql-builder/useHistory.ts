/**
 * SQL Builder — Undo/Redo History
 * Snapshot-based state machine (max 50 snapshots)
 * Based on ChartDB: useHistory.js
 */
import type { HistorySnapshot } from '~/types/sql-builder'
import { useSqlBuilderStore } from '~/stores/sql-builder'

export function useHistory() {
  const store = useSqlBuilderStore()
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  // ── Take snapshot ─────────────────────────────────────────────────────
  function takeSnapshot(): HistorySnapshot {
    return {
      nodes: JSON.parse(JSON.stringify(store.nodes)),
      edges: JSON.parse(JSON.stringify(store.edges)),
    }
  }

  // ── Record history (debounced) ────────────────────────────────────────
  function recordHistory() {
    if (store.isUndoing) return
    if (debounceTimer) clearTimeout(debounceTimer)

    debounceTimer = setTimeout(() => {
      const snapshot = takeSnapshot()

      // Check if snapshot is same as current
      const current = store.history[store.historyIndex]
      if (current && JSON.stringify(current) === JSON.stringify(snapshot)) return

      // Discard future history if we branched
      if (store.historyIndex < store.history.length - 1) {
        store.history = store.history.slice(0, store.historyIndex + 1)
      }

      store.history.push(snapshot)

      // Enforce max history
      if (store.history.length > store.MAX_HISTORY) {
        store.history = store.history.slice(store.history.length - store.MAX_HISTORY)
      }

      store.historyIndex = store.history.length - 1
    }, 300)
  }

  // ── Initialize history ────────────────────────────────────────────────
  function initHistory() {
    store.history = [takeSnapshot()]
    store.historyIndex = 0
  }

  // ── Undo ──────────────────────────────────────────────────────────────
  function undo() {
    if (store.historyIndex <= 0) return
    store.isUndoing = true
    store.historyIndex--
    restoreSnapshot(store.history[store.historyIndex] as HistorySnapshot)
    nextTick(() => { store.isUndoing = false })
  }

  // ── Redo ──────────────────────────────────────────────────────────────
  function redo() {
    if (store.historyIndex >= store.history.length - 1) return
    store.isUndoing = true
    store.historyIndex++
    restoreSnapshot(store.history[store.historyIndex] as HistorySnapshot)
    nextTick(() => { store.isUndoing = false })
  }

  // ── Restore snapshot ──────────────────────────────────────────────────
  function restoreSnapshot(snapshot: HistorySnapshot) {
    store.nodes = JSON.parse(JSON.stringify(snapshot.nodes))
    store.edges = JSON.parse(JSON.stringify(snapshot.edges))
  }

  // ── Computed: can undo/redo ───────────────────────────────────────────
  const canUndo = computed(() => store.historyIndex > 0)
  const canRedo = computed(() => store.historyIndex < store.history.length - 1)

  return { recordHistory, initHistory, undo, redo, canUndo, canRedo }
}
