<!--
  No scan has read this project or server yet: the tab fills after its first scan, and the one
  button scans just it. Board 30, "Result screens · shared states".
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UiButton from '@/ui/UiButton.vue'
import UiEmptyState from '@/ui/UiEmptyState.vue'

defineProps<{ name: string; busy: boolean }>()
const emit = defineEmits<{ scan: [] }>()
const { t } = useI18n()
</script>

<template>
  <UiEmptyState
    icon="clock"
    :title="t('projectShared.waiting.title')"
    :text="t('projectShared.waiting.text', { name })"
  >
    <UiButton variant="primary" :disabled="busy" @click="emit('scan')">
      {{ t('projectShared.waiting.scan', { name }) }}
    </UiButton>
  </UiEmptyState>
</template>
