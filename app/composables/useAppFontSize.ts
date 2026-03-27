// ── Global UI font-size — persisted to localStorage ───────────────────────────
const STORAGE_KEY = 'mango_ui_font_size'
const DEFAULT_SIZE = 16

// Module-level singleton so every component shares the same ref
const _fontSize = ref(DEFAULT_SIZE)

export const FONT_SIZE_OPTIONS = [
  { label: 'เล็ก (14)',     value: 14 },
  { label: 'ปกติ (16)',     value: 16 },
  { label: 'ใหญ่ (18)',     value: 18 },
  { label: 'ใหญ่มาก (20)', value: 20 },
]

export function useAppFontSize() {
  function applySize(size: number) {
    _fontSize.value = size
    if (import.meta.client) {
      document.documentElement.style.fontSize = size + 'px'
      localStorage.setItem(STORAGE_KEY, String(size))
    }
  }

  function initFontSize() {
    if (!import.meta.client) return
    const saved = parseInt(localStorage.getItem(STORAGE_KEY) ?? '')
    applySize(!isNaN(saved) ? saved : DEFAULT_SIZE)
  }

  return { fontSize: _fontSize, fontSizeOptions: FONT_SIZE_OPTIONS, applySize, initFontSize }
}
