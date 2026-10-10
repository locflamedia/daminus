<!--
  The saved scan could not be read: the reason when one has a short name, what did not happen
  on the server, and Try again. Board 30, "Result screens · shared states".
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AppError } from '@/api'
import UiButton from '@/ui/UiButton.vue'
import UiEmptyState from '@/ui/UiEmptyState.vue'

const props = defineProps<{ error: AppError | null; busy?: boolean }>()
const emit = defineEmits<{ retry: [] }>()
const { t, te } = useI18n()

const text = computed(() => {
  const key = `projectShared.error.reason.${props.error?.code.kind ?? ''}`
  return props.error && te(key)
    ? t('projectShared.error.textWhy', { reason: t(key) })
    : t('projectShared.error.text')
})
</script>

<template>
  <UiEmptyState icon="warn" :title="t('projectShared.error.title')" :text="text">
    <UiButton icon="refresh" :busy="busy" @click="emit('retry')">
      {{ t('projectShared.error.retry') }}
    </UiButton>
  </UiEmptyState>
</template>
