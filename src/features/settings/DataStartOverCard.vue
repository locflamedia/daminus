<!--
  "Start over": delete the history with a hold (no dialog; a click opens one for those who
  cannot hold), and a quieter link that also resets the settings behind a confirm.
-->
<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDataStore } from '@/stores/data'
import UiConfirm from '@/ui/UiConfirm.vue'
import UiHoldButton from '@/ui/UiHoldButton.vue'

const { t } = useI18n()
const data = useDataStore()

const asking = ref(false)

function reset() {
  asking.value = false
  void data.resetAll()
}
</script>

<template>
  <section class="card" :aria-label="t('settingsData.start.title')">
    <h3 class="title">{{ t('settingsData.start.title') }}</h3>
    <p class="body">{{ t('settingsData.start.body') }}</p>
    <UiHoldButton
      class="start-hold"
      :label="t('settingsData.start.hold')"
      :action-label="t('settingsData.start.action')"
      :hint="t('settingsData.start.holdHint')"
      :confirm-title="t('settingsData.start.confirmTitle')"
      :confirm-body="t('settingsData.start.confirmBody')"
      :confirm-label="t('settingsData.start.action')"
      @confirm="data.clearHistory()"
    />
    <button type="button" class="reset" @click="asking = true">
      {{ t('settingsData.start.reset') }}
    </button>
    <UiConfirm
      :open="asking"
      :title="t('settingsData.start.resetTitle')"
      :body="t('settingsData.start.resetBody')"
      :confirm-label="t('settingsData.start.resetConfirm')"
      @confirm="reset"
      @cancel="asking = false"
    />
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: var(--space-4);
  border-radius: 16px;
  background: linear-gradient(180deg, var(--crit-soft), var(--surface-0) 90px);
  box-shadow: var(--shadow-hairline);
}

.title {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.body {
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.5;
}

.start-hold {
  align-self: flex-start;
}

.reset {
  margin-top: auto;
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: none;
  color: var(--crit-ink);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
  cursor: pointer;
}

.reset:hover {
  text-decoration: underline;
}
</style>
