<script setup lang="ts">
import { UserCircle, Mail, Phone, Building2, Briefcase } from 'lucide-vue-next'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const props = defineProps<{ open: boolean }>()
const emit  = defineEmits<{ 'update:open': [value: boolean] }>()

const { $xt } = useNuxtApp()

interface ProfileData {
  empno:          number | null
  userid:         string | null
  prename_t:      string | null
  empname_t:      string | null
  empfullname_t:  string | null
  emppos:         string | null
  emppos_name:    string | null
  dpt_code:       string | null
  dpt_name:       string | null
  email:          string | null
  telephone:      string | null
  profile:        string | null
}

const profileData = ref<ProfileData | null>(null)
const loading     = ref(false)
const error       = ref('')

async function fetchProfile() {
  loading.value = true
  error.value   = ''
  try {
    const res: any = await $xt.getServer('Planning/MangoBI/Me')
    if (res?.error) { error.value = res.error; return }
    profileData.value = res?.data ?? res
  } catch (e: any) {
    error.value = e?.message ?? 'เกิดข้อผิดพลาด'
  } finally {
    loading.value = false
  }
}

watch(() => props.open, (val) => {
  if (val && !profileData.value) fetchProfile()
})

const avatarUrl = computed(() => {
  if (!profileData.value?.profile) return ''
  return $xt.getPic(false, profileData.value.profile)
})

const displayName = computed(() => {
  const p = profileData.value
  if (!p) return ''
  return p.empfullname_t || `${p.prename_t ?? ''}${p.empname_t ?? ''}`.trim() || p.userid || ''
})

const initial = computed(() => displayName.value?.charAt(0)?.toUpperCase() || 'U')
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <UserCircle class="size-5" />
          ข้อมูลพนักงาน
        </DialogTitle>
      </DialogHeader>

      <!-- Loading -->
      <div v-if="loading" class="flex justify-center items-center py-10">
        <div class="size-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="text-sm text-destructive text-center py-6">
        {{ error }}
      </div>

      <!-- Profile -->
      <div v-else-if="profileData" class="flex flex-col gap-4">
        <!-- Avatar + name -->
        <div class="flex items-center gap-4">
          <Avatar class="size-16 rounded-xl shrink-0">
            <AvatarImage :src="avatarUrl" :alt="displayName" />
            <AvatarFallback class="rounded-xl bg-orange-500 text-white text-xl font-bold">
              {{ initial }}
            </AvatarFallback>
          </Avatar>
          <div class="min-w-0">
            <p class="font-semibold text-base truncate">{{ displayName }}</p>
            <p v-if="profileData.emppos_name" class="text-sm text-muted-foreground truncate">
              {{ profileData.emppos_name }}
            </p>
            <p v-if="profileData.userid" class="text-xs text-muted-foreground">
              @{{ profileData.userid }}
            </p>
          </div>
        </div>

        <div class="border-t" />

        <!-- Details -->
        <div class="grid gap-3 text-sm">
          <div v-if="profileData.dpt_name" class="flex items-start gap-3">
            <Building2 class="size-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <p class="text-xs text-muted-foreground">แผนก</p>
              <p>{{ profileData.dpt_name }}</p>
            </div>
          </div>

          <div v-if="profileData.emppos_name" class="flex items-start gap-3">
            <Briefcase class="size-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <p class="text-xs text-muted-foreground">ตำแหน่ง</p>
              <p>{{ profileData.emppos_name }}</p>
            </div>
          </div>

          <div v-if="profileData.email" class="flex items-start gap-3">
            <Mail class="size-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <p class="text-xs text-muted-foreground">อีเมล</p>
              <p>{{ profileData.email }}</p>
            </div>
          </div>

          <div v-if="profileData.telephone" class="flex items-start gap-3">
            <Phone class="size-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <p class="text-xs text-muted-foreground">โทรศัพท์</p>
              <p>{{ profileData.telephone }}</p>
            </div>
          </div>
        </div>

        <!-- empno / dpt_code badge row -->
        <div class="flex gap-2 flex-wrap">
          <span v-if="profileData.empno" class="text-xs bg-muted rounded-md px-2 py-1">
            รหัสพนักงาน: {{ profileData.empno }}
          </span>
          <span v-if="profileData.dpt_code" class="text-xs bg-muted rounded-md px-2 py-1">
            รหัสแผนก: {{ profileData.dpt_code }}
          </span>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
