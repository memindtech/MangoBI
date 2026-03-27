/**
 * SQL Builder — Keyboard Shortcuts
 * Based on ChartDB: useKeyboardShortcuts.js §6.10
 *
 * Delete/Backspace → remove selected nodes
 * Ctrl+A           → select all nodes
 * Ctrl+C           → copy selected nodes + their inter-connected edges
 * Ctrl+V           → paste with +60px offset (cumulative per paste)
 * Ctrl+Z           → undo
 * Ctrl+Y           → redo
 * Escape           → close modals
 */
import type { Node, Edge } from '@vue-flow/core'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { useHistory } from '~/composables/sql-builder/useHistory'

export function useKeyboardShortcuts() {
  const store = useSqlBuilderStore()
  const { undo, redo } = useHistory()

  function onKeydown(e: KeyboardEvent) {
    // Skip when typing in input/textarea/select
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
    if (['input', 'textarea', 'select'].includes(tag)) return

    // ── Delete ──────────────────────────────────────────────────────────
    if (e.key === 'Delete' || e.key === 'Backspace') {
      store.nodes
        .filter((n: any) => n.selected)
        .forEach((n: Node) => store.removeNode(n.id))
      return
    }

    // ── Escape ──────────────────────────────────────────────────────────
    if (e.key === 'Escape') {
      store.modalNodeId    = null
      store.filterNodeId   = null
      store.relationEdgeId = null
      return
    }

    if (!(e.ctrlKey || e.metaKey)) return

    // ── Ctrl+Z / Ctrl+Y ──────────────────────────────────────────────────
    if (e.key === 'z') { e.preventDefault(); undo(); return }
    if (e.key === 'y') { e.preventDefault(); redo(); return }

    // ── Ctrl+A — select all ──────────────────────────────────────────────
    if (e.key === 'a') {
      e.preventDefault()
      store.nodes = store.nodes.map((n: any) => ({ ...n, selected: true }))
      return
    }

    // ── Ctrl+C — copy ────────────────────────────────────────────────────
    if (e.key === 'c') {
      e.preventDefault()
      const selected = store.nodes.filter((n: any) => n.selected)
      if (!selected.length) return
      const selectedIds = new Set(selected.map((n: Node) => n.id))
      const connectedEdges = store.edges.filter((e: Edge) =>
        selectedIds.has(e.source) && selectedIds.has(e.target)
      )
      store.clipboard = {
        nodes: JSON.parse(JSON.stringify(selected)),
        edges: JSON.parse(JSON.stringify(connectedEdges)),
        pasteCount: 0,
      }
      return
    }

    // ── Ctrl+V — paste ───────────────────────────────────────────────────
    if (e.key === 'v') {
      e.preventDefault()
      const { nodes: cbNodes, edges: cbEdges } = store.clipboard
      if (!cbNodes.length) return

      store.clipboard.pasteCount++
      const offset = store.clipboard.pasteCount * 60

      // Map old IDs → new IDs
      const idMap = new Map<string, string>()
      const newNodes: Node[] = cbNodes.map((n: Node) => {
        const newId = store.nextNodeId(n.type === 'toolNode' ? 'tool' : 'node')
        idMap.set(n.id, newId)
        return {
          ...JSON.parse(JSON.stringify(n)),
          id:       newId,
          selected: true,
          position: { x: n.position.x + offset, y: n.position.y + offset },
        }
      })

      const newEdges: Edge[] = cbEdges
        .filter((e: Edge) => idMap.has(e.source) && idMap.has(e.target))
        .map((e: Edge) => ({
          ...JSON.parse(JSON.stringify(e)),
          id:     `e-${idMap.get(e.source)}-${idMap.get(e.target)}`,
          source: idMap.get(e.source)!,
          target: idMap.get(e.target)!,
        }))

      // Deselect existing nodes, add new ones
      store.nodes = [
        ...store.nodes.map((n: Node) => ({ ...n, selected: false })),
        ...newNodes,
      ]
      store.edges = [...store.edges, ...newEdges as any]
      return
    }
  }

  function install()   { window.addEventListener('keydown', onKeydown) }
  function uninstall() { window.removeEventListener('keydown', onKeydown) }

  return { install, uninstall }
}
