<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import { Eye, EyeOff, Loader2 } from 'lucide-vue-next'
import { PublicClientApplication, type Configuration } from '@azure/msal-browser'

// นำเข้า shadcn/ui components
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

definePageMeta({
  layout: false
})

const { t } = useI18n()
useHead({ title: computed(() => `${t('page_title_login')} | MangoBI`) })

const router = useRouter()
const route = useRoute()

// --- State สำหรับ UI Control ---
const isLoading = ref(false)
const isPasswordVisible = ref(false)
const msgError = ref('')
const companyList = ref([])

// --- State สำหรับ Alert Dialog (แทน $msg) ---
const alertState = reactive({
  isOpen: false,
  title: '',
  description: '',
  type: 'info' // info, danger, warning
})

const showAlert = (title: string, description: string, type: string = 'info') => {
  alertState.title = title
  alertState.description = description
  alertState.type = type
  alertState.isOpen = true
}

// --- Microsoft Config ---
const microsoftClientID = ref('YOUR_CLIENT_ID') // ใส่ Client ID จริง
const microsoftTenantID = ref('YOUR_TENANT_ID') // ใส่ Tenant ID จริง

const form = reactive({
  maincode: '',
  userid: '',
  userpass: '',
  ms_access_token: null as string | null,
  oauth2: 'N',
  email: null as string | null
})

// --- Logic: Microsoft Login ---
const msLogin = async () => {
  const msalConfig: Configuration = {
    auth: {
      clientId: microsoftClientID.value || '',
      authority: `https://login.microsoftonline.com/${microsoftTenantID.value || ''}`
    }
  }

  const msalInstance = new PublicClientApplication(msalConfig)
  await msalInstance.initialize()
  
  try {
    const loginResponse = await msalInstance.loginPopup({ scopes: ["user.read"] })
    form.ms_access_token = loginResponse?.accessToken
    form.userid = ''
    form.userpass = ''
    return true
  } catch (err) {
    console.error("MS Login Error:", err)
    return false
  }
}

// --- Logic: Submit ---
const submitLogin = async (target: 'standard' | 'microsoft') => {
  if (isLoading.value) return
  
  if (!form.maincode) {
    showAlert(t('login_err_title_error'), t('login_err_no_company'), 'danger')
    return
  }

  msgError.value = ''
  isLoading.value = true

  try {
    if (target === 'microsoft') {
      form.ms_access_token = null
      form.oauth2 = 'Y'
      const success = await msLogin()
      if (!success || !form.ms_access_token) {
        showAlert(t('login_err_title_info'), t('login_err_ms_fail'), 'info')
        isLoading.value = false
        return
      }
    } else {
      form.ms_access_token = null
      form.oauth2 = 'N'
      if (!form.userid || !form.userpass) {
        msgError.value = t('login_err_no_cred')
        isLoading.value = false
        return
      }
    }

    const attempt = sessionStorage.getItem('attempt') || '1'

    // เรียก MangoBI server-side login proxy
    // — mango_auth token ถูกเก็บ server-side, browser ได้รับแค่ bi_session HttpOnly cookie
    const resp = await $fetch('/api/auth/login', {
      method: 'POST',
      body: { ...form, attempt },
    }).catch((err: any) => err?.data ?? { error: err?.message ?? 'Login failed' }) as any

    if (resp.error) {
      if (resp.error.indexOf('Request OTP;') === 0) {
        showAlert(t('login_err_title_otp'), t('login_err_otp'), 'info')
        return
      }

      if (resp.error_type === 'L') {
        let nextAttempt = (parseInt(attempt) + 1).toString()
        sessionStorage.setItem('attempt', nextAttempt)
        showAlert(t('login_err_title_error'), `${resp.error}: ${t('login_err_locked', { limit: resp.lock_limit_login })}`, 'danger')
        return
      }

      if (resp.error_type === 'L1') {
        sessionStorage.clear()
        showAlert(t('login_err_title_admin'), resp.error, 'warning')
        return
      }

      if (resp.error_type === 'C') {
        showAlert(t('login_err_title_error'), resp.error, 'danger')
        return
      }

      if (resp.error_type === 'F') {
        showAlert(t('login_err_title_full'), resp.error, 'warning')
        return
      }

      throw resp.error
    }

    // Login Success — bi_session cookie ถูก set โดย server แล้ว
    sessionStorage.clear()

    const redirectPath = (route.query.from as string) || '/'
    await navigateTo(redirectPath)

  } catch (err: any) {
    msgError.value = err.toString()
    showAlert('Login Failed', err.toString(), 'danger')
  } finally {
    isLoading.value = false
  }
}

const fetchCompanies = async () => {
  try {
    const resp: any = await $fetch('/api/auth/companies')
    companyList.value = resp.data || []
    if (companyList.value.length > 0) {
      form.maincode = companyList.value[0].maincode
    }
  } catch (err) {
    console.error('Failed to load companies', err)
  }
}

onMounted(() => {
  fetchCompanies()
})
</script>

<template>
  <div class="flex h-screen w-full items-center justify-center bg-muted/50 px-4">
    <Card class="w-full max-w-md shadow-lg">
      <CardHeader class="space-y-1 text-center">
        <div class="flex justify-center mb-4">
           <div class="h-12 w-12 bg-orange-500 rounded-xl flex items-center justify-center text-white font-bold text-2xl shadow-inner">BI</div>
        </div>
        <CardTitle class="text-2xl font-bold">{{ t('login_app_name') }}</CardTitle>
        <CardDescription>{{ t('login_subtitle') }}</CardDescription>
      </CardHeader>
      
      <CardContent>
        <div class="space-y-4">
          <div class="space-y-2">
            <Label>{{ t('login_company') }}</Label>
            <Select v-model="form.maincode">
              <SelectTrigger>
                <SelectValue :placeholder="t('login_company_ph')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="item in companyList" :key="item.maincode" :value="item.maincode">
                  {{ item.mainname }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label>{{ t('login_username') }}</Label>
            <Input v-model="form.userid" :placeholder="t('login_username')" @keyup.enter="submitLogin('standard')" />
          </div>

          <div class="space-y-2">
            <Label>{{ t('login_password') }}</Label>
            <div class="relative">
              <Input
                v-model="form.userpass"
                :type="isPasswordVisible ? 'text' : 'password'"
                :placeholder="t('login_password')"
                @keyup.enter="submitLogin('standard')"
              />
              <button 
                type="button"
                @click="isPasswordVisible = !isPasswordVisible"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Eye v-if="!isPasswordVisible" class="size-4" />
                <EyeOff v-else class="size-4" />
              </button>
            </div>
          </div>

          <div v-if="msgError" class="rounded-md bg-destructive/15 p-3 text-center text-sm text-destructive font-medium">
            {{ msgError }}
          </div>

          <Button @click="submitLogin('standard')" class="w-full bg-orange-600 hover:bg-orange-700 text-white" :disabled="isLoading">
            <Loader2 v-if="isLoading && form.oauth2 === 'N'" class="mr-2 size-4 animate-spin" />
            {{ t('login_btn') }}
          </Button>

          <div class="relative my-4">
            <div class="absolute inset-0 flex items-center">
              <span class="w-full border-t" />
            </div>
            <div class="relative flex justify-center text-xs uppercase">
              <span class="bg-background px-2 text-muted-foreground">{{ t('login_or') }}</span>
            </div>
          </div>

          <Button variant="outline" @click="submitLogin('microsoft')" class="w-full border-gray-300" :disabled="isLoading">
            <Loader2 v-if="isLoading && form.oauth2 === 'Y'" class="mr-2 size-4 animate-spin" />
            <template v-else>
              <svg class="mr-2 h-4 w-4" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
                <path fill="#f35325" d="M1 1h10v10H1z"/><path fill="#81bc06" d="M12 1h10v10H12z"/><path fill="#05a6f0" d="M1 12h10v10H1z"/><path fill="#ffba08" d="M12 12h10v10H12z"/>
              </svg>
              {{ t('login_ms_btn') }}
            </template>
          </Button>
        </div>
      </CardContent>
    </Card>

    <AlertDialog v-model:open="alertState.isOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle :class="alertState.type === 'danger' ? 'text-destructive' : ''">
            {{ alertState.title }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {{ alertState.description }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction @click="alertState.isOpen = false">{{ t('login_ok') }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>