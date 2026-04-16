/**
 * biSession — server-side session management
 *
 * Session lifecycle:
 *   login  → createSession() → setCookie bi_session (HttpOnly)
 *   request → getSession()   → ดึง mangoAuth ไป inject เอง
 *   logout → deleteSession() → clearCookie
 *
 * Storage: Nitro useStorage('bi-sessions') → memory (dev) / redis (prod)
 * TTL: 8 ชั่วโมง (ตั้งได้ผ่าน SESSION_TTL_MS)
 */
import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'

export const SESSION_COOKIE = 'bi_session'
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000 // 8 h

export interface BiSession {
  mangoAuth:  string
  userId:     string
  maincode:   string
  exp:        number
  // employee profile (populated after login from Planning/MangoBI/Me)
  empno?:     number | null
  empname_t?: string | null
  prename_t?: string | null
  emppos?:    string | null
  dpt_code?:  string | null
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function createSession(
  data: Omit<BiSession, 'exp'>,
  ttlMs = SESSION_TTL_MS,
): Promise<string> {
  const id      = randomUUID()
  const storage = useStorage('bi-sessions')
  await storage.setItem<BiSession>(id, { ...data, exp: Date.now() + ttlMs })
  return id
}

export async function getSession(id: string): Promise<BiSession | null> {
  if (!id) return null
  const storage = useStorage('bi-sessions')
  const session = await storage.getItem<BiSession>(id)
  if (!session) return null
  if (Date.now() > session.exp) {
    await storage.removeItem(id)
    return null
  }
  return session
}

export async function deleteSession(id: string): Promise<void> {
  if (!id) return
  const storage = useStorage('bi-sessions')
  await storage.removeItem(id)
}

// ── Cookie helpers ─────────────────────────────────────────────────────────────

export function getSessionId(event: H3Event): string {
  return getCookie(event, SESSION_COOKIE) ?? ''
}

export function setSessionCookie(event: H3Event, sessionId: string): void {
  setCookie(event, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path:     '/',
    maxAge:   SESSION_TTL_MS / 1000,
  })
}

export function clearSessionCookie(event: H3Event): void {
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}

// ── Session-or-throw helper (ใช้ใน proxy routes) ──────────────────────────────

export async function requireSession(event: H3Event): Promise<BiSession> {
  const id      = getSessionId(event)
  const session = await getSession(id)
  if (!session) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return session
}
