/**
 * POST /api/ai/chat
 *
 * Proxy → AI provider with SSE streaming.
 * Config is read from DB (per-maincode) with .env fallback.
 *
 * Normalized output stream:
 *   data: {"text":"..."}
 *   data: [DONE]
 */
import type { AiConfigFull } from '../../utils/ai/config'
import { buildSystemPrompt } from '../../utils/ai/contexts'
import type { AiContextPayload } from '../../utils/ai/contexts'

export interface AiChatMessage {
  role:    'user' | 'assistant' | 'system'
  content: string
}

export interface AiChatRequest {
  messages: AiChatMessage[]
  context:  AiContextPayload
  model?:   string
}

export default defineEventHandler(async (event) => {
  await requireSession(event)

  const cfg = await getAiConfigFull(event)

  if (!cfg.enabled) {
    throw createError({ statusCode: 403, statusMessage: 'AI feature is not enabled' })
  }

  const body = await readBody<AiChatRequest>(event)
  const { messages, context, model: clientModel } = body
  const systemPrompt = buildSystemPrompt(context)

  setHeader(event, 'Content-Type',      'text/event-stream; charset=utf-8')
  setHeader(event, 'Cache-Control',     'no-cache')
  setHeader(event, 'Connection',        'keep-alive')
  setHeader(event, 'X-Accel-Buffering', 'no')

  const enc = new TextEncoder()
  const h: Helpers = {
    chunk:  (t) => enc.encode(`data: ${JSON.stringify({ text: t })}\n\n`),
    done:   ()  => enc.encode(`data: [DONE]\n\n`),
    error:  (m) => enc.encode(`data: ${JSON.stringify({ error: m })}\n\n`),
    stats:  (s) => enc.encode(`data: ${JSON.stringify({ stats: s })}\n\n`),
  }

  const stream = new ReadableStream({
    async start(ctrl) {
      try {
        switch (cfg.provider) {
          case 'claude':  await streamClaude    (cfg, messages, systemPrompt, ctrl, h); break
          case 'gemini':  await streamGemini    (cfg, messages, systemPrompt, ctrl, h); break
          case 'openai':  await streamOpenAI    (cfg, messages, systemPrompt, ctrl, h, clientModel); break
          default:        await streamBackend   (cfg, messages, systemPrompt, ctrl, h, clientModel); break
        }
      } catch (err: any) {
        ctrl.enqueue(h.error(err?.message ?? 'AI request failed'))
        ctrl.enqueue(h.done())
        ctrl.close()
      }
    },
  })

  return sendStream(event, stream)
})

// ─────────────────────────────────────────────────────────────────────────────
// Claude Anthropic
// ─────────────────────────────────────────────────────────────────────────────
async function streamClaude(
  cfg:  AiConfigFull,
  msgs: AiChatMessage[],
  sys:  string,
  ctrl: ReadableStreamDefaultController,
  h:    Helpers,
) {
  if (!cfg.apiKey) return abort(ctrl, h, 'Claude API key ยังไม่ได้ตั้งค่า — กรุณาตั้งค่าใน Settings')

  const model = cfg.model ?? 'claude-sonnet-4-6'

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      stream:     true,
      system:     sys,
      messages:   msgs.filter(m => m.role !== 'system'),
    }),
  })

  if (!res.ok || !res.body) {
    return abort(ctrl, h, `Claude ${res.status}: ${await res.text().catch(() => res.statusText)}`)
  }

  let eventType = ''
  await parseSse(res.body, (line) => {
    if (line.startsWith('event: ')) { eventType = line.slice(7).trim(); return }
    if (!line.startsWith('data: ')) return
    const raw = line.slice(6).trim()
    if (raw === '[DONE]') return
    try {
      const j = JSON.parse(raw)
      if (eventType === 'content_block_delta' && j.delta?.type === 'text_delta')
        ctrl.enqueue(h.chunk(j.delta.text ?? ''))
    } catch { /* skip */ }
  })

  ctrl.enqueue(h.done()); ctrl.close()
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Gemini
// ─────────────────────────────────────────────────────────────────────────────
async function streamGemini(
  cfg:  AiConfigFull,
  msgs: AiChatMessage[],
  sys:  string,
  ctrl: ReadableStreamDefaultController,
  h:    Helpers,
) {
  if (!cfg.apiKey) return abort(ctrl, h, 'Gemini API key ยังไม่ได้ตั้งค่า — กรุณาตั้งค่าใน Settings')

  const model = cfg.model ?? 'gemini-2.0-flash'
  const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${cfg.apiKey}`

  const contents = msgs
    .filter(m => m.role !== 'system')
    .map(m => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: sys ? { parts: [{ text: sys }] } : undefined,
      contents,
      generationConfig: { maxOutputTokens: 4096, temperature: 0.7 },
    }),
  })

  if (!res.ok || !res.body) {
    return abort(ctrl, h, `Gemini ${res.status}: ${await res.text().catch(() => res.statusText)}`)
  }

  await parseSse(res.body, (line) => {
    if (!line.startsWith('data: ')) return
    const raw = line.slice(6).trim()
    if (raw === '[DONE]') return
    try {
      const j    = JSON.parse(raw)
      const text = j?.candidates?.[0]?.content?.parts?.[0]?.text
      if (text) ctrl.enqueue(h.chunk(text))
    } catch { /* skip */ }
  })

  ctrl.enqueue(h.done()); ctrl.close()
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI-compatible (Typhoon, Groq, Together.ai, OpenAI, etc.)
// ─────────────────────────────────────────────────────────────────────────────
async function streamOpenAI(
  cfg:         AiConfigFull,
  msgs:        AiChatMessage[],
  sys:         string,
  ctrl:        ReadableStreamDefaultController,
  h:           Helpers,
  clientModel: string | undefined,
) {
  if (!cfg.backendUrl) return abort(ctrl, h, 'OpenAI-compatible URL ยังไม่ได้ตั้งค่า — กรุณาตั้งค่าใน Settings')

  // Normalise base URL: strip trailing /chat or /completions
  const base    = cfg.backendUrl.replace(/\/(chat\/completions|completions)\/?$/, '').replace(/\/$/, '')
  const url     = `${base}/chat/completions`
  const model   = clientModel || cfg.model || undefined
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`

  const allMsgs = sys ? [{ role: 'system' as const, content: sys }, ...msgs] : msgs

  const res = await fetch(url, {
    method:  'POST',
    headers,
    body: JSON.stringify({ ...(model ? { model } : {}), messages: allMsgs, stream: true }),
  })

  if (!res.ok || !res.body) {
    return abort(ctrl, h, `OpenAI API ${res.status}: ${await res.text().catch(() => res.statusText)}`)
  }

  let stats:     Record<string, number> | null = null
  let usedModel: string | null = null

  await parseSse(res.body, (line) => {
    if (!line.startsWith('data: ')) return
    const raw = line.slice(6).trim()
    if (raw === '[DONE]') return
    try {
      const j    = JSON.parse(raw)
      const text = j?.choices?.[0]?.delta?.content
      if (text) ctrl.enqueue(h.chunk(text))
      if (!usedModel && j?.model) usedModel = j.model
      if (j?.usage?.prompt_tokens != null) {
        stats = {
          promptTokens: j.usage.prompt_tokens,
          outputTokens: j.usage.completion_tokens ?? 0,
          totalMs: 0, genMs: 0,
        }
      }
    } catch { /* skip */ }
  })

  const resolvedModel = usedModel ?? model ?? undefined
  if (stats) ctrl.enqueue(h.stats({ ...stats, ...(resolvedModel ? { model: resolvedModel } : {}) }))
  ctrl.enqueue(h.done()); ctrl.close()
}

// ─────────────────────────────────────────────────────────────────────────────
// MangoBI AI Backend (OpenAI-compatible / Ollama)
// ─────────────────────────────────────────────────────────────────────────────
async function streamBackend(
  cfg:         AiConfigFull,
  msgs:        AiChatMessage[],
  sys:         string,
  ctrl:        ReadableStreamDefaultController,
  h:           Helpers,
  clientModel: string | undefined,
) {
  const url   = cfg.backendUrl ?? 'https://backend-ai.mangoanywhere.com/api/chat'
  const model = clientModel || cfg.backendModel || undefined
  const allMsgs = sys ? [{ role: 'system' as const, content: sys }, ...msgs] : msgs

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({ ...(model ? { model } : {}), messages: allMsgs, stream: true }),
  })

  if (!res.ok || !res.body) {
    const j    = await res.json().catch(() => null)
    const text = j?.message?.content ?? j?.choices?.[0]?.message?.content ?? 'AI error'
    ctrl.enqueue(h.chunk(text)); ctrl.enqueue(h.done()); ctrl.close()
    return
  }

  let stats:     Record<string, number> | null = null
  let usedModel: string | null = null

  await parseSse(res.body, (line) => {
    if (!line.trim()) return
    let raw = line
    if (line.startsWith('data: ')) raw = line.slice(6).trim()
    if (raw === '[DONE]') return
    try {
      const j    = JSON.parse(raw)
      const text = j?.choices?.[0]?.delta?.content
        ?? j?.message?.content
        ?? j?.text
        ?? j?.content
      if (text) ctrl.enqueue(h.chunk(text))
      if (!usedModel && j?.model) usedModel = j.model

      if (j?.done === true && j?.eval_count != null) {
        stats = {
          promptTokens: j.prompt_eval_count ?? 0,
          outputTokens: j.eval_count        ?? 0,
          totalMs:      Math.round((j.total_duration ?? 0) / 1e6),
          genMs:        Math.round((j.eval_duration  ?? 0) / 1e6),
        }
      }
      if (j?.usage?.prompt_tokens != null) {
        stats = {
          promptTokens: j.usage.prompt_tokens,
          outputTokens: j.usage.completion_tokens ?? 0,
          totalMs: 0, genMs: 0,
        }
      }
    } catch { /* skip non-JSON */ }
  })

  const resolvedModel = usedModel ?? model ?? undefined
  if (stats) ctrl.enqueue(h.stats({ ...stats, ...(resolvedModel ? { model: resolvedModel } : {}) }))
  ctrl.enqueue(h.done()); ctrl.close()
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
type Helpers = {
  chunk: (t: string) => Uint8Array
  done:  ()          => Uint8Array
  error: (m: string) => Uint8Array
  stats: (s: object) => Uint8Array
}

function abort(ctrl: ReadableStreamDefaultController, h: Helpers, msg: string) {
  ctrl.enqueue(h.error(msg)); ctrl.enqueue(h.done()); ctrl.close()
}

async function parseSse(body: ReadableStream<Uint8Array>, onLine: (line: string) => void) {
  const reader  = body.getReader()
  const decoder = new TextDecoder()
  let   buf     = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) onLine(line)
  }

  if (buf.trim()) onLine(buf)
}
