/**
 * POST /api/ai/analyze-report
 *
 * SSE proxy → ASP.NET MangoBI/AiAnalyzeReport
 * Backend fetches report data, builds system prompt, calls AI provider, streams back.
 *
 * Body: { reportId: string, messages: [{ role, content }] }
 */
export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  const body    = await readBody(event)
  const config  = useRuntimeConfig(event)

  const base = String(
    (config.public as any).biBase ||
    (config.public as any).planningBase ||
    'http://localhost:8310/api/v1'
  ).replace(/\/$/, '')

  setHeader(event, 'Content-Type',      'text/event-stream; charset=utf-8')
  setHeader(event, 'Cache-Control',     'no-cache')
  setHeader(event, 'Connection',        'keep-alive')
  setHeader(event, 'X-Accel-Buffering', 'no')

  const res = await fetch(`${base}/MangoBI/AiAnalyzeReport`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Mango-Auth':  session.mangoAuth ?? '',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok || !res.body) {
    const msg = await res.text().catch(() => 'AI analyze error')
    throw createError({ statusCode: res.status, statusMessage: msg })
  }

  return sendStream(event, res.body)
})
