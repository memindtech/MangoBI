export default defineNuxtRouteMiddleware(async (to, from) => {
  // 1. ข้ามถ้าเป็นฝั่ง Server (แม้จะปิด SSR แต่ Nuxt อาจรันตอน Build/Generate)
  if (import.meta.server) return

  const authStore = useAuthStore()
  const token = localStorage.getItem('mango_auth')
  const { $xt } = useNuxtApp()

  // 2. จัดการ External Redirect
  if (to.meta.redirect) {
    window.location.href = to.meta.redirect as string
    return
  }

  // 3. ดักหน้า Login เป็นอันดับแรก (เพื่อหยุด Logic เช็คสิทธิ์ในหน้าที่ไม่ต้องใช้)
  if (to.path === '/login') {
    // ถ้า Login อยู่แล้วแต่จะพยายามเข้าหน้า Login ให้ดีดไปหน้าแรก
    if (token && authStore.auth.is_authen) {
      return navigateTo('/')
    }
    return // ปล่อยให้เข้าหน้า Login และหยุดทำงานตรงนี้
  }

  // 4. ตรวจสอบ Meta โดยใช้ to.matched เพื่อความแม่นยำใน CSR
  // บางครั้ง to.meta อาจจะว่างในเสี้ยววินาทีที่เปลี่ยนหน้า การใช้ matched จะชัวร์กว่า
  const mangoMenu = to.meta.mangoMenu as any
  const isPageProtected = to.matched.some(m => m.meta.auth === true) || mangoMenu?.checkUserRight
  
  // ถ้าเป็นหน้า Public ทั่วไปที่ไม่มีการป้องกัน ให้ปล่อยผ่านทันที
  if (!isPageProtected) return

  // 5. ตรวจสอบ Token เบื้องต้น
  if (!token) {
    authStore.auth = { is_authen: false }
    return navigateTo('/login')
  }

  // 6. การตรวจสอบสิทธิ์ผ่าน API (Authentication & Authorization)
  try {
    const menuName = mangoMenu?.menu_name || 'PLANWEB'
    const menuId = mangoMenu?.menu_id || ''
    const moduleName = to.meta.module as string

    // โหลดข้อมูล (ใน Store ควรเช็คว่าถ้ามีข้อมูลเมนูนี้อยู่แล้วไม่ต้องยิง API ซ้ำ)
    const success = await authStore.fetchUserAuth(menuName, menuId, moduleName)

    if (!success || !authStore.auth.is_authen) {
      localStorage.removeItem('mango_auth')
      return navigateTo('/login')
    }

    const auth = authStore.auth

    // 7. ตรวจสอบสิทธิ์ระดับละเอียด
    // Admin Only
    if (to.meta.adminOnly && !auth.is_admin && !auth.is_admin_it) {
        console.warn("🚫 Access Denied: Admin Only content");
      return navigateTo('/access-denied')
    }

    // Menu Right
    if (mangoMenu?.checkUserRight && !auth.is_super_admin) {
        console.log("🔍 Checking Right for Menu ID:", menuId);
      console.log("📋 User Rights in Store:", authStore.userRight);

      const hasMenuRight = authStore.userRight.some((x: any) => x.menu_id === menuId && x.isenabled === 1)
      console.log("📋 hasMenuRight:", hasMenuRight);
      if (!hasMenuRight) return navigateTo('/access-denied')

      // Project Right
      if (authStore.projectRight.length > 0) {
        let pre_event2 = (to.query.pre_event2 as string) || ''
        if (!pre_event2 && to.query.pre_event) {
          const pre = to.query.pre_event as string
          pre_event2 = pre.substring(pre.length - 4) + pre.substring(0, 3)
        }
        if (pre_event2) {
          const hasProj = authStore.projectRight.some((x: any) => x.pre_event2 === pre_event2)
          if (!hasProj) return navigateTo('/access-denied')
        }
      }
    }
  } catch (err) {
    console.error("Middleware Auth Error:", err)
    return navigateTo('/login')
  }
})