<script setup lang="ts">
definePageMeta({
  auth: true,
  mangoMenu: {
    checkUserRight: false,
    menu_name: 'PLANWEB',
    menu_id: ''
  }
})

const { t } = useI18n()
useHead({ title: computed(() => `${t('page_title_dashboard')} | MangoBI`) })
</script>

<template>
  <div class="flex h-screen items-center justify-center">
    <p class="text-muted-foreground">Welcome</p>
  </div>
</template>
