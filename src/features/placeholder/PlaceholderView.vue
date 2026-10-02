<!-- A destination that has its place in the layout but not its screen yet: just the title. -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import PageHeader from '@/layout/PageHeader.vue'

const { t } = useI18n()
const route = useRoute()

const title = computed(() => {
  const host = route.params.host
  if (typeof host === 'string') return host
  const key = route.meta.titleKey
  return typeof key === 'string' ? t(key) : ''
})
</script>

<template>
  <PageHeader :title="title" />
</template>
