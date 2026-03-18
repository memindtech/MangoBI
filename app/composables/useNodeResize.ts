import { ref } from 'vue'

export function useNodeResize(minWidth = 200, minHeight = 80) {
  const nodeEl = ref<HTMLElement | null>(null)
  const width  = ref('auto')
  const height = ref('auto')

  function onDragStart(e: MouseEvent) {
    e.preventDefault(); e.stopPropagation()
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

  function onDragStartHeight(e: MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    const startY = e.clientY
    const startH = nodeEl.value?.offsetHeight ?? minHeight
    const onMove = (ev: MouseEvent) => {
      height.value = `${Math.max(minHeight, startH + ev.clientY - startY)}px`
    }
    const onUp = () => {
      globalThis.removeEventListener('mousemove', onMove)
      globalThis.removeEventListener('mouseup', onUp)
    }
    globalThis.addEventListener('mousemove', onMove)
    globalThis.addEventListener('mouseup', onUp)
  }

  function onDragStartCorner(e: MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startW = nodeEl.value?.offsetWidth  ?? minWidth
    const startH = nodeEl.value?.offsetHeight ?? minHeight
    const onMove = (ev: MouseEvent) => {
      width.value  = `${Math.max(minWidth,  startW + ev.clientX - startX)}px`
      height.value = `${Math.max(minHeight, startH + ev.clientY - startY)}px`
    }
    const onUp = () => {
      globalThis.removeEventListener('mousemove', onMove)
      globalThis.removeEventListener('mouseup', onUp)
    }
    globalThis.addEventListener('mousemove', onMove)
    globalThis.addEventListener('mouseup', onUp)
  }

  return { nodeEl, width, height, onDragStart, onDragStartHeight, onDragStartCorner }
}
