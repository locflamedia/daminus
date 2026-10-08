<!--
  "Ask AI", the button of the Overview toolbar, the project header and the server header
  (boards "Overview · results", "Project", "Server detail"): a secondary button with the spark.
  It opens the Ask panel on `scope`; the question is typed there and reviewed before anything
  is sent.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAiThreadStore } from '@/stores/ai-thread'
import UiButton from '@/ui/UiButton.vue'
import type { AskScope } from './ask-scope'

defineProps<{ scope: AskScope }>()
const { t } = useI18n()
const thread = useAiThreadStore()
</script>

<template>
  <UiButton icon="spark" @click="thread.openDrawer(scope)">{{ t('aiAsk.button') }}</UiButton>
</template>
