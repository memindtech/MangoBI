/**
 * useAiModels — model catalog + dynamic list from backend
 *
 * Known models have descriptions + tags.
 * Runtime list is fetched once from /api/ai/models.
 */

export interface AiModelMeta {
  name:  string
  label: string
  desc:  string
  tags:  string[]   // e.g. 'Thai', 'Fast', 'Reasoning'
}

// ── Known model metadata ───────────────────────────────────────────────────
const CATALOG: Record<string, Omit<AiModelMeta, 'name'>> = {
  'qwen3.5:9b': {
    label: 'Qwen 3.5 9B',
    tags:  ['Thai', 'Multilingual'],
    desc:  'สมดุลระหว่างความเร็วและคุณภาพ รองรับไทย/อังกฤษ/จีนได้ดี',
  },
  'qwen3.5:27b': {
    label: 'Qwen 3.5 27B',
    tags:  ['Thai', 'High Quality'],
    desc:  'Qwen ขนาดใหญ่ คุณภาพสูง เหมาะงานซับซ้อน',
  },
  'scb10x/llama3.1-typhoon2-8b-instruct:latest': {
    label: 'Typhoon2 8B',
    tags:  ['Thai', 'Instruct'],
    desc:  'เน้นภาษาไทยโดยเฉพาะ ความเข้าใจบริบทไทยดีที่สุด จาก SCB10X',
  },
  'gemma3:4b': {
    label: 'Gemma 3 4B',
    tags:  ['Fast', 'Efficient'],
    desc:  'เร็ว ประหยัด VRAM เหมาะงานทั่วไปที่ต้องการความเร็ว',
  },
  'gemma3:27b': {
    label: 'Gemma 3 27B',
    tags:  ['High Quality'],
    desc:  'Gemma ขนาดใหญ่ คุณภาพสูง การเขียนและอธิบายดีมาก',
  },
  'gemma4:e4b': {
    label: 'Gemma 4 E4B',
    tags:  ['New', 'Efficient'],
    desc:  'Gemma 4 รุ่นใหม่ล่าสุด quantized ประสิทธิภาพสูง',
  },
  'phi4:latest': {
    label: 'Phi-4',
    tags:  ['Reasoning', 'Microsoft'],
    desc:  'เก่งด้าน logic, math, coding จาก Microsoft เหมาะงานวิเคราะห์',
  },
  'llama4:latest': {
    label: 'Llama 4',
    tags:  ['Meta', 'Latest'],
    desc:  'Meta รุ่นล่าสุด รองรับ multimodal context ยาว',
  },
  'llama3.2:3b': {
    label: 'Llama 3.2 3B',
    tags:  ['Fast', 'Lightweight'],
    desc:  'เล็กมาก ตอบเร็ว เหมาะงานง่ายๆ ที่ต้องการ latency ต่ำ',
  },
  'llama3.2:latest': {
    label: 'Llama 3.2',
    tags:  ['General'],
    desc:  'Meta Llama 3.2 ทั่วไปดี สมดุลระหว่างขนาดและคุณภาพ',
  },
  'translategemma:4b': {
    label: 'TranslateGemma 4B',
    tags:  ['Translation'],
    desc:  'เน้น translation โดยเฉพาะ แปลภาษาแม่นกว่า model ทั่วไป',
  },
  'gemma3:latest': {
    label: 'Gemma 3',
    tags:  ['General'],
    desc:  'Gemma 3 รุ่น latest ทั่วไป Google DeepMind',
  },
}

// ── Context window limits (tokens) ────────────────────────────────────────
export const MODEL_CONTEXT: Record<string, number> = {
  'qwen3.5:9b':    32768,
  'qwen3.5:27b':   32768,
  'gemma3:4b':      8192,
  'gemma3:27b':     8192,
  'gemma3:latest':  8192,
  'gemma4:e4b':    32768,
  'phi4:latest':   16384,
  'llama4:latest': 131072,
  'llama3.2:3b':   131072,
  'llama3.2:latest':131072,
  'translategemma:4b': 8192,
  'scb10x/llama3.1-typhoon2-8b-instruct:latest': 8192,
}

export function getContextLimit(modelName: string): number {
  return MODEL_CONTEXT[modelName] ?? 8192
}

// Models that are NOT for chat (embedding, reranker) — filter ออก
const EXCLUDED_KEYWORDS = ['embed', 'reranker', 'e5-large']

function isEmbeddingModel(name: string) {
  return EXCLUDED_KEYWORDS.some(kw => name.toLowerCase().includes(kw))
}

function resolveMeta(name: string): AiModelMeta {
  const known = CATALOG[name]
  if (known) return { name, ...known }
  // Fallback for unknown models
  const label = name.split('/').pop()?.split(':')[0] ?? name
  return { name, label, tags: [], desc: 'Model จาก Ollama backend' }
}

// ── Singleton state ────────────────────────────────────────────────────────
const _models   = ref<AiModelMeta[]>([])
const _fetching = ref(false)
const _fetched  = ref(false)

export function useAiModels() {
  if (!_fetched.value && !_fetching.value && import.meta.client) {
    _fetching.value = true
    $fetch<{ models: string[] }>('/api/ai/models')
      .then(r => {
        _models.value = r.models
          .filter(n => !isEmbeddingModel(n))
          .map(resolveMeta)
        _fetched.value = true
      })
      .catch(() => {
        // Fallback: show known catalog models only
        _models.value = Object.keys(CATALOG).map(n => ({ name: n, ...CATALOG[n]! }))
        _fetched.value = true
      })
      .finally(() => { _fetching.value = false })
  }

  return { models: readonly(_models), fetching: readonly(_fetching) }
}

export { resolveMeta }
