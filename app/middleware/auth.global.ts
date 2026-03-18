function checkRights(to: any, authStore: any): string | null {
  const mangoMenu = to.meta.mangoMenu
  const auth = authStore.auth

  if (to.meta.adminOnly && !auth.is_admin && !auth.is_admin_it) return '/access-denied'
  if (!mangoMenu?.checkUserRight || auth.is_super_admin) return null

  const menuId = mangoMenu?.menu_id || ''
  const hasMenuRight = authStore.userRight.some((x: any) => x.menu_id === menuId && x.isenabled === 1)
  if (!hasMenuRight) return '/access-denied'

  if (authStore.projectRight.length === 0) return null
  let pre_event2 = (to.query.pre_event2 as string) || ''
  if (!pre_event2 && to.query.pre_event) {
    const pre = to.query.pre_event as string
    pre_event2 = pre.substring(pre.length - 4) + pre.substring(0, 3)
  }
  if (pre_event2 && !authStore.projectRight.some((x: any) => x.pre_event2 === pre_event2)) {
    return '/access-denied'
  }
  return null
}

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return

  const authStore = useAuthStore()
  const token = localStorage.getItem('mango_auth')

  if (to.meta.redirect) {
    globalThis.location.href = to.meta.redirect as string
    return
  }

  if (to.path === '/login') {
    if (token && authStore.auth.is_authen) return navigateTo('/')
    return
  }

  const mangoMenu = to.meta.mangoMenu as any
  const isPageProtected = to.matched.some(m => m.meta.auth === true) || mangoMenu?.checkUserRight
  if (!isPageProtected) return

  if (!token) {
    authStore.auth = { is_authen: false }
    return navigateTo('/login')
  }

  try {
    const success = await authStore.fetchUserAuth(
      mangoMenu?.menu_name || 'PLANWEB',
      mangoMenu?.menu_id   || '',
      to.meta.module as string,
    )
    if (!success || !authStore.auth.is_authen) {
      localStorage.removeItem('mango_auth')
      return navigateTo('/login')
    }
  } catch (err) {
    console.error('Middleware Auth Error:', err)
    return navigateTo('/login')
  }

  const denied = checkRights(to, authStore)
  if (denied) return navigateTo(denied)
})
