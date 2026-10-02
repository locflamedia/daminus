<!-- The Settings page frame: the section title, in the 20 px heading of the board. -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { SETTINGS_SECTIONS } from '@/layout/settings-sections'

const { t } = useI18n()
const route = useRoute()

const section = computed(() => {
  const id = route.params.section
  return SETTINGS_SECTIONS.find((s) => s.id === id)?.id ?? 'general'
})
</script>

<template>
  <h2 class="title">{{ t(`settingsNav.${section}`) }}</h2>
</template>

<style scoped>
.title {
  padding-top: 28px;
  font-size: var(--text-20);
  font-weight: var(--weight-medium);
  letter-spacing: var(--track-20);
}
</style>
