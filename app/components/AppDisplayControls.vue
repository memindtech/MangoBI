<script setup lang="ts">
import { Sun, Moon, ALargeSmall, Languages } from 'lucide-vue-next'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'

const { t, locale, setLocale } = useI18n()
const colorMode = useColorMode()
const { fontSize, fontSizeOptions, applySize } = useAppFontSize()

const languages = [
  { code: 'th', label: 'ไทย',    flag: '🇹🇭' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'cn', label: '中文',    flag: '🇨🇳' },
]

const isDark      = computed(() => colorMode.value === 'dark')
const currentLang = computed(() => languages.find(l => l.code === locale.value) ?? languages[0])

function toggleTheme() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}
</script>

<template>
  <div class="flex items-center gap-0.5">

    <!-- Theme -->
    <button
      @click="toggleTheme"
      :title="isDark ? t('nav_theme_light') : t('nav_theme_dark')"
      class="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
    >
      <Sun  v-if="isDark" class="size-4" />
      <Moon v-else        class="size-4" />
    </button>

    <!-- Font size -->
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <button
          :title="t('nav_font_size')"
          class="flex items-center gap-0.5 px-1.5 py-1 rounded-lg hover:bg-accent transition-colors
                 text-muted-foreground hover:text-foreground"
        >
          <ALargeSmall class="size-4" />
          <span class="text-[10px] font-semibold leading-none tabular-nums">{{ fontSize }}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="min-w-40">
        <DropdownMenuLabel>{{ t('nav_font_size') }}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          :model-value="String(fontSize)"
          @update:model-value="v => applySize(Number(v))"
        >
          <DropdownMenuRadioItem
            v-for="opt in fontSizeOptions"
            :key="opt.value"
            :value="String(opt.value)"
            class="cursor-pointer"
          >
            {{ opt.label }}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>

    <!-- Language -->
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <button
          :title="t('nav_language')"
          class="px-1.5 py-1 rounded-lg hover:bg-accent transition-colors text-base leading-none"
        >
          {{ currentLang.flag }}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="min-w-36">
        <DropdownMenuLabel>{{ t('nav_language') }}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          :model-value="locale"
          @update:model-value="v => setLocale(v as any)"
        >
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

  </div>
</template>
