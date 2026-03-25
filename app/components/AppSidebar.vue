<script setup lang="ts">
import {
  BarChart2, Share2,
  Sun, Moon, LogOut, ChevronUp, Languages,
  LayoutDashboard, Send, Code2,
} from 'lucide-vue-next'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarSeparator, useSidebar,
} from '@/components/ui/sidebar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const { t, locale, setLocale } = useI18n()
const colorMode = useColorMode()
const authStore = useAuthStore()
const route  = useRoute()
const router = useRouter()
const { state } = useSidebar()

// ข้อมูลผู้ใช้จาก store
const user = computed(() => authStore.auth)
const userName = computed(() => user.value?.full_name || user.value?.name || user.value?.user_name || 'User')
const userInitial = computed(() => userName.value?.charAt(0)?.toUpperCase() || 'U')
const userRole = computed(() => user.value?.position || user.value?.role || '')

// รายการ Nav
const navItems = [
  { icon: Share2,          label: 'Data Model',      path: '/datamodel'    },
  { icon: LayoutDashboard, label: 'Report Builder',  path: '/report'       },
  { icon: Send,            label: 'Send Report',     path: '/send-report'  },
  { icon: Code2,           label: 'SQL Builder',     path: '/sql-builder'  },
]

// ตัวเลือกภาษา
const languages = [
  { code: 'th', label: 'ไทย',    flag: '🇹🇭' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'cn', label: '中文',    flag: '🇨🇳' },
]

const currentLang = computed(() => languages.find(l => l.code === locale.value) ?? languages[0])
const isDark = computed(() => colorMode.value === 'dark')

function toggleTheme() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}

function switchLocale(code: string) {
  setLocale(code as any)
}

function logout(allDevices = false) {
  authStore.handleLogout(allDevices)
}

function isActive(path: string) {
  return route.path === path
}
</script>

<template>
  <Sidebar collapsible="icon">
    <!-- ===== HEADER ===== -->
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" @click="router.push('/')">
            <div class="flex size-8 items-center justify-center rounded-lg bg-orange-500 text-white shrink-0">
              <BarChart2 class="size-4" />
            </div>
            <div class="flex flex-col leading-none group-data-[collapsible=icon]:hidden">
              <span class="font-bold text-base">MangoBI</span>
              <span class="text-xs text-muted-foreground">Planning System</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>

    <SidebarSeparator />

    <!-- ===== CONTENT: Navigation ===== -->
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel class="group-data-[collapsible=icon]:hidden">
          Menu
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="item in navItems" :key="item.path">
              <SidebarMenuButton
                :is-active="isActive(item.path)"
                :tooltip="item.label"
                @click="router.push(item.path)"
              >
                <component :is="item.icon" class="size-4 shrink-0" />
                <span>{{ item.label }}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>

    <!-- ===== FOOTER ===== -->
    <SidebarFooter>
      <SidebarSeparator />
      <SidebarMenu>

        <!-- Theme Toggle -->
        <SidebarMenuItem>
          <SidebarMenuButton :tooltip="isDark ? t('nav_theme_light') : t('nav_theme_dark')" @click="toggleTheme">
            <Sun v-if="isDark" class="size-4 shrink-0" />
            <Moon v-else class="size-4 shrink-0" />
            <span class="group-data-[collapsible=icon]:hidden">
              {{ isDark ? t('nav_theme_light') : t('nav_theme_dark') }}
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>

        <!-- Language Switcher -->
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <SidebarMenuButton :tooltip="t('nav_language')">
                <Languages class="size-4 shrink-0" />
                <span class="group-data-[collapsible=icon]:hidden">
                  {{ currentLang.flag }} {{ currentLang.label }}
                </span>
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" class="min-w-40">
              <DropdownMenuLabel>{{ t('nav_language') }}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup :model-value="locale" @update:model-value="switchLocale">
                <DropdownMenuRadioItem
                  v-for="lang in languages"
                  :key="lang.code"
                  :value="lang.code"
                  class="cursor-pointer"
                >
                  {{ lang.flag }} {{ lang.label }}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>

        <SidebarSeparator />

        <!-- User + Logout -->
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <SidebarMenuButton
                size="lg"
                :tooltip="userName"
                class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <Avatar class="size-8 rounded-lg shrink-0">
                  <AvatarImage :src="user?.avatar || ''" :alt="userName" />
                  <AvatarFallback class="rounded-lg bg-orange-500 text-white text-xs font-bold">
                    {{ userInitial }}
                  </AvatarFallback>
                </Avatar>
                <div class="flex flex-col leading-none group-data-[collapsible=icon]:hidden min-w-0">
                  <span class="truncate font-medium text-sm">{{ userName }}</span>
                  <span class="truncate text-xs text-muted-foreground">{{ userRole }}</span>
                </div>
                <ChevronUp class="ml-auto size-4 shrink-0 group-data-[collapsible=icon]:hidden" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" class="min-w-48">
              <DropdownMenuLabel class="font-normal">
                <div class="flex flex-col gap-1">
                  <span class="font-semibold text-sm">{{ userName }}</span>
                  <span class="text-xs text-muted-foreground">{{ userRole }}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem class="cursor-pointer" @click="logout(false)">
                <LogOut class="size-4 mr-2 text-destructive" />
                <span>{{ t('nav_logout') }}</span>
              </DropdownMenuItem>
              <DropdownMenuItem class="cursor-pointer" @click="logout(true)">
                <LogOut class="size-4 mr-2 text-destructive" />
                <span>{{ t('nav_logout_all') }}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>

      </SidebarMenu>
    </SidebarFooter>
  </Sidebar>
</template>
