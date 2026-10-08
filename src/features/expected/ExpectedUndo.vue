<!--
  Undo on a row of the Expected group (board "Mark as expected"): takes the rule out, so the
  finding is an issue again on the next report read.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useExpectedStore } from '@/stores/expected'

defineProps<{ ruleId: string; check: string }>()

const { t } = useI18n()
const store = useExpectedStore()
</script>

<template>
  <button
    type="button"
    class="undo"
    :title="t('expected.undo.title', { check })"
    @click="store.undo(ruleId)"
  >
    {{ t('expected.undo.label') }}
  </button>
</template>

<style scoped>
.undo {
  padding: 0 4px;
  color: var(--accent-ink);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.undo:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.undo:focus-visible {
  border-radius: 4px;
  box-shadow: var(--focus-ring);
}
</style>
