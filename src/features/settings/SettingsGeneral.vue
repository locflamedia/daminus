<!--
  Settings › General: language (the select with flags, search and the share of each language
  still being translated), the language of AI answers, the formats that follow the language,
  what happens when Daminus opens, and a live preview of the switch.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Locale } from '@/i18n'
import GeneralFormatsCard from './GeneralFormatsCard.vue'
import GeneralLanguageCard from './GeneralLanguageCard.vue'
import GeneralOpenCard from './GeneralOpenCard.vue'
import GeneralPreview from './GeneralPreview.vue'
import { nativeName } from './languages'

const TOAST_MS = 3200

const { t } = useI18n()

const switchedTo = ref<Locale | null>(null)
let timer: number | undefined

const toast = computed(() =>
  switchedTo.value
    ? t('settingsGeneral.preview.switched', { language: nativeName(switchedTo.value) })
    : null,
)

function onChanged(locale: Locale) {
  switchedTo.value = locale
  window.clearTimeout(timer)
  timer = window.setTimeout(() => (switchedTo.value = null), TOAST_MS)
}

onBeforeUnmount(() => window.clearTimeout(timer))
</script>

<template>
  <div class="general">
    <div class="layout">
      <div class="column">
        <GeneralLanguageCard @changed="onChanged" />
        <GeneralFormatsCard />
        <GeneralOpenCard />
      </div>
      <GeneralPreview :toast="toast" />
    </div>
  </div>
</template>

<style scoped>
.general {
  container-type: inline-size;
  min-width: 0;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: var(--space-4);
  align-items: stretch;
}

.column {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

/* Under 640 px of content the preview goes under the list. */
@container (max-width: 640px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
