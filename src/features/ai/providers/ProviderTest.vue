<!--
  "Test connection": one short call with the stored key. While it runs the line names the host
  being called; it ends in "Works" with the time or in the error's own words.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AiProviderEntry } from '@/api/bindings/AiProviderEntry'
import { useAiProvidersStore } from '@/stores/ai-providers'
import UiButton from '@/ui/UiButton.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiSpinner from '@/ui/UiSpinner.vue'
import { endpointHost } from './provider-state'

const props = defineProps<{ entry: AiProviderEntry }>()
const { t } = useI18n()
const store = useAiProvidersStore()

const state = computed(() => store.tests[props.entry.profile.id])
const host = computed(() =>
  endpointHost(
    props.entry,
    store.view?.provider === props.entry.profile.id ? store.view.base_url : null,
  ),
)
const missingKey = computed(() => props.entry.profile.needs_key && !props.entry.key_set)
</script>

<template>
  <div class="test">
    <UiButton
      icon="play"
      :busy="state?.phase === 'busy'"
      :disabled-reason="missingKey ? t('aiProviders.test.needsKey') : undefined"
      @click="store.test(entry.profile.id)"
    >
      {{ t('aiProviders.test.button') }}
    </UiButton>
    <span class="line" :class="{ done: state?.phase === 'ok' }" role="status" aria-live="polite">
      <template v-if="state?.phase === 'busy'">
        <UiSpinner :size="14" />
        <span class="busy">{{ t('aiProviders.test.busy', { host }) }}</span>
      </template>
      <template v-else-if="state?.phase === 'ok'">
        <span class="badge"><UiIcon name="check" :size="12" :stroke="2" /></span>
        <b class="works">{{ t('aiProviders.test.works') }}</b>
        <span class="ms">{{ state.ms }} ms</span>
      </template>
      <span v-else-if="state?.phase === 'fail'" class="fail">{{ state.message }}</span>
      <span v-else class="idle">{{ t('aiProviders.test.idle') }}</span>
    </span>
  </div>
</template>

<style scoped>
.test {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-4);
  align-items: center;
  padding: 14px;
  border-radius: 14px;
  background: var(--surface-well);
}

.test :deep(.btn) {
  --shadow: var(--shadow-ring);
}

.line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: var(--text-12);
}

.line.done {
  gap: 12px;
}

.idle {
  color: var(--ink-3);
}

.busy {
  color: var(--accent-ink);
}

.badge {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.works {
  color: var(--ok-ink);
  font-weight: var(--weight-medium);
}

.ms {
  color: var(--ink-2);
  font-family: var(--font-mono);
}

.fail {
  color: var(--crit-ink);
}
</style>
