<!--
  The Settings page frame: the section title in the 20 px heading of the board, and the line
  under it that says what the section is for, then the section itself (`section-views.ts`).
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { SETTINGS_SECTIONS } from '@/layout/settings-sections'
import { SECTION_VIEWS } from './section-views'

const { t, te } = useI18n()
const route = useRoute()

const section = computed(() => {
  const id = route.params.section
  return SETTINGS_SECTIONS.find((s) => s.id === id)?.id ?? 'general'
})

const body = computed(() => SECTION_VIEWS[section.value])

/** About has no line under its title on the boards. */
const description = computed(() =>
  te(`settingsNav.desc.${section.value}`) ? t(`settingsNav.desc.${section.value}`) : '',
)
</script>

<template>
  <header class="head">
    <div class="words">
      <h2 class="title">{{ t(`settingsNav.${section}`) }}</h2>
      <p v-if="description" class="sub">{{ description }}</p>
    </div>
    <div id="settings-actions" class="actions" />
  </header>
  <component :is="body" v-if="body" :key="section" />
</template>

<style scoped>
.head {
  display: flex;
  align-items: flex-end;
  gap: var(--space-3);
  padding-top: 28px;
  line-height: normal;
}

.words {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.actions {
  display: flex;
  flex: none;
  gap: var(--space-2);
}

.title {
  font-size: var(--text-20);
  font-weight: var(--weight-medium);
  letter-spacing: var(--track-20);
}

.sub {
  color: var(--ink-3);
  font-size: var(--text-13);
}
</style>
