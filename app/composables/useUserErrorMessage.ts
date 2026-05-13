/**
 * useUserErrorMessage — map technical errors to user-friendly Thai messages.
 *
 * Goal: non-technical users should see "what happened + what to do next",
 * not raw SQL/HTTP errors or English stack traces.
 *
 * Usage:
 *   const { format, friendly } = useUserErrorMessage()
 *   const { title, hint } = friendly(err)
 *   // or: format(err) → "เกิดอะไรขึ้น\nต้องทำอะไรต่อ"
 */

export interface FriendlyError {
  /** สั้น กระชับ "เกิดอะไร" — เหมาะใช้เป็น title ของ toast/banner */
  title: string
  /** "ต้องทำอะไรต่อ" — action-oriented hint */
  hint: string
  /** raw error for dev console */
  raw?: unknown
}

/** Map an error object / string to a user-facing { title, hint } pair. */
export function friendlyError(err: unknown): FriendlyError {
  if (!err) return { title: 'ไม่พบข้อผิดพลาด', hint: 'ลองรีเฟรชหน้าและลองใหม่' }

  const anyErr = err as any
  const status = anyErr?.statusCode ?? anyErr?.status ?? anyErr?.response?.status
  const message = String(anyErr?.statusMessage ?? anyErr?.message ?? err)

  // Network / timeout
  if (anyErr?.name === 'AbortError' || /timeout|aborted/i.test(message)) {
    return {
      title: 'เซิร์ฟเวอร์ไม่ตอบกลับ',
      hint: 'ลองใหม่ในอีกสักครู่ หรือตรวจการเชื่อมต่ออินเทอร์เน็ต',
      raw: err,
    }
  }
  if (/fetch failed|Failed to fetch|NetworkError/i.test(message)) {
    return {
      title: 'เชื่อมต่อไม่ได้',
      hint: 'ตรวจอินเทอร์เน็ตของคุณ แล้วลองใหม่',
      raw: err,
    }
  }

  // HTTP status-based messages
  if (status === 401 || status === 403) {
    return {
      title: 'เซสชันหมดอายุ',
      hint: 'กรุณาล็อกอินใหม่',
      raw: err,
    }
  }
  if (status === 404) {
    return {
      title: 'ไม่พบข้อมูล',
      hint: 'ลิงก์หรือไอดีอาจถูกลบไปแล้ว — ลองโหลดจากรายการใหม่',
      raw: err,
    }
  }
  if (status === 502 || status === 503 || status === 504) {
    return {
      title: 'ระบบหลังบ้านไม่ตอบ',
      hint: 'Mango API อาจทำงานไม่ปกติ — รอสักครู่แล้วลองใหม่',
      raw: err,
    }
  }
  if (typeof status === 'number' && status >= 500) {
    return {
      title: 'เกิดข้อผิดพลาดฝั่งเซิร์ฟเวอร์',
      hint: 'ลองใหม่อีกครั้ง หากยังเกิดปัญหา แจ้งผู้ดูแลระบบ',
      raw: err,
    }
  }

  // Schema / parse issues from SQL import or API shape validation
  if (/invalid_shape|unexpected response/i.test(message)) {
    return {
      title: 'ข้อมูลจากเซิร์ฟเวอร์ไม่ถูกต้อง',
      hint: 'ลองโหลดใหม่ หรือแจ้งผู้ดูแลระบบถ้ายังเป็นอยู่',
      raw: err,
    }
  }
  if (/SELECT clause|FROM clause|FROM table|ไม่พบ/i.test(message)) {
    return {
      title: 'SQL ที่วางมาอ่านไม่ออก',
      hint: 'ตรวจว่ามี SELECT ... FROM ... ครบ หรือวาง SQL ที่เคย export จากโปรแกรมนี้',
      raw: err,
    }
  }

  // Fallback — show trimmed message so user has *something* actionable
  const clean = message.replace(/^\[\d+\]\s*/, '').slice(0, 160)
  return {
    title: 'เกิดข้อผิดพลาด',
    hint: clean || 'ลองใหม่อีกครั้ง',
    raw: err,
  }
}

export function useUserErrorMessage() {
  const friendly = (err: unknown): FriendlyError => friendlyError(err)
  const format   = (err: unknown): string => {
    const { title, hint } = friendly(err)
    return `${title}\n${hint}`
  }
  return { friendly, format, friendlyError }
}
