import { ref } from 'vue'

export function useNodeResize(minWidth = 200) {
  const nodeEl = ref<HTMLElement | null>(null)
  const width  = ref('auto')

  function onDragStart(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = nodeEl.value?.offsetWidth ?? minWidth

    const onMove = (ev: MouseEvent) => {
      width.value = `${Math.max(minWidth, startW + ev.clientX - startX)}px`
    }
    const onUp = () => {
      globalThis.removeEventListener('mousemove', onMove)
      globalThis.removeEventListener('mouseup', onUp)
    }
    globalThis.addEventListener('mousemove', onMove)
    globalThis.addEventListener('mouseup', onUp)
  }

  return { nodeEl, width, onDragStart }
}
