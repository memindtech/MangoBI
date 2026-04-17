/**
 * POST /api/ai/chat
 *
 * Proxy → AI provider พร้อม feature gate (AI_ENABLED)
 * แปลง SSE ของแต่ละ provider เป็น normalized stream:
 *   data: {"text":"..."}
 *   data: [DONE]
 *
 * Providers:
 *   claude  → Anthropic claude-sonnet-4-6
 *   gemini  → Google gemini-2.0-flash
 *   backend → MangoBI AI Backend (OpenAI-compatible)
 */
export interface AiChatMessage {
  role:    'user' | 'assistant' | 'system'
  content: string
}

export interface AiChatRequest {
  messages:     AiChatMessage[]
  systemPrompt: string
  model?:       string   // client-selected model override
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)

  // ── Feature gate ─────────────────────────────────────────────────────────
  // config.aiEnabled may be boolean (default) or string 'true'/'false' (from .env)
  if (config.aiEnabled !== true && String(config.aiEnabled) !== 'true') {
    throw createError({ statusCode: 403, statusMessage: 'AI feature is not enabled' })
  }

  // ── Require valid session ─────────────────────────────────────────────────
  await requireSession(event)

  const body   = await readBody<AiChatRequest>(event)
  const { messages, systemPrompt, model: clientModel } = body
  const provider = config.aiProvider ?? 'claude'

  // ── SSE headers ───────────────────────────────────────────────────────────
  setHeader(event, 'Content-Type',      'text/event-stream; charset=utf-8')
  setHeader(event, 'Cache-Control',     'no-cache')
  setHeader(event, 'Connection',        'keep-alive')
  setHeader(event, 'X-Accel-Buffering', 'no')

  const enc = new TextEncoder()
  const h   = {
    chunk:  (t: string) => enc.encode(`data: ${JSON.stringify({ text: t })}\n\n`),
    done:   ()           => enc.encode(`data: [DONE]\n\n`),
    error:  (m: string)  => enc.encode(`data: ${JSON.stringify({ error: m })}\n\n`),
    stats:  (s: object)  => enc.encode(`data: ${JSON.stringify({ stats: s })}\n\n`),
  }

  const stream = new ReadableStream({
    async start(ctrl) {
      try {
        switch (provider) {
          case 'claude':  await streamClaude (config, messages, systemPrompt, ctrl, h); break
          case 'gemini':  await streamGemini (config, messages, systemPrompt, ctrl, h); break
          default:        await streamBackend(config, messages, systemPrompt, ctrl, h, clientModel); break
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
  config:  any,
  msgs:    AiChatMessage[],
  sys:     string,
  ctrl:    ReadableStreamDefaultController,
  h:       Helpers,
) {
  const key = config.claudeApiKey
  if (!key) { return abort(ctrl, h, 'NUXT_CLAUDE_API_KEY ไม่ได้ตั้งค่า') }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         key,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens:  4096,
      stream:      true,
      system:      sys,
      messages:    msgs.filter(m => m.role !== 'system'),
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
  config:  any,
  msgs:    AiChatMessage[],
  sys:     string,
  ctrl:    ReadableStreamDefaultController,
  h:       Helpers,
) {
  const key = config.geminiApiKey
  if (!key) { return abort(ctrl, h, 'NUXT_GEMINI_API_KEY ไม่ได้ตั้งค่า') }

  const model = config.geminiModel ?? 'gemini-2.0-flash'
  const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`

  // Gemini uses 'model' role instead of 'assistant', and parts[] array
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

  // Gemini SSE: data: {"candidates":[{"content":{"parts":[{"text":"..."}]}}]}
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
// MangoBI AI Backend (OpenAI-compatible)
// ─────────────────────────────────────────────────────────────────────────────
async function streamBackend(
  config:      any,
  msgs:        AiChatMessage[],
  sys:         string,
  ctrl:        ReadableStreamDefaultController,
  h:           Helpers,
  clientModel: string | undefined = undefined,
) {
  const url   = config.aiBackendUrl ?? 'https://backend-ai.mangoanywhere.com/api/chat'
  // Client-selected model takes priority over server config
  const model = clientModel || config.aiBackendModel || undefined
  const allMsgs  = sys ? [{ role: 'system' as const, content: sys }, ...msgs] : msgs

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({ ...(model ? { model } : {}), messages: allMsgs, stream: true }),
  })

  if (!res.ok || !res.body) {
    // Fallback non-streaming
    const j    = await res.json().catch(() => null)
    const text = j?.message?.content ?? j?.choices?.[0]?.message?.content ?? 'AI error'
    ctrl.enqueue(h.chunk(text)); ctrl.enqueue(h.done()); ctrl.close()
    return
  }

  let stats: Record<string, number> | null = null

  await parseSse(res.body, (line) => {
    if (!line.trim()) return

    // SSE format: "data: {...}" or "data: [DONE]"
    // Ollama raw format: "{...}" (no prefix)
    let raw = line
    if (line.startsWith('data: ')) {
      raw = line.slice(6).trim()
    }
    if (raw === '[DONE]') return

    try {
      const j = JSON.parse(raw)
      // OpenAI-compatible streaming: choices[0].delta.content
      // Ollama streaming: message.content
      // Generic: text / content
      const text = j?.choices?.[0]?.delta?.content
        ?? j?.message?.content
        ?? j?.text
        ?? j?.content
      if (text) ctrl.enqueue(h.chunk(text))

      // Capture Ollama final chunk stats (done: true)
      if (j?.done === true && j?.eval_count != null) {
        stats = {
          promptTokens: j.prompt_eval_count ?? 0,
          outputTokens: j.eval_count        ?? 0,
          totalMs:      Math.round((j.total_duration   ?? 0) / 1e6),
          genMs:        Math.round((j.eval_duration    ?? 0) / 1e6),
        }
      }
      // OpenAI-compatible usage
      if (j?.usage?.prompt_tokens != null) {
        stats = {
          promptTokens: j.usage.prompt_tokens,
          outputTokens: j.usage.completion_tokens ?? 0,
          totalMs:      0,
          genMs:        0,
        }
      }
    } catch { /* skip non-JSON lines */ }
  })

  if (stats) ctrl.enqueue(h.stats(stats))
  ctrl.enqueue(h.done()); ctrl.close()
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────
type Helpers = { chunk: (t: string) => Uint8Array; done: () => Uint8Array; error: (m: string) => Uint8Array; stats: (s: object) => Uint8Array }

function abort(ctrl: ReadableStreamDefaultController, h: Helpers, msg: string) {
  ctrl.enqueue(h.error(msg)); ctrl.enqueue(h.done()); ctrl.close()
}

/** Generic SSE line reader — works for all providers */
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

  // Flush remaining buffer
  if (buf.trim()) onLine(buf)
}
