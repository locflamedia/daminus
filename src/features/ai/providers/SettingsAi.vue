<!--
  Settings › AI providers (boards 09 and 09b): the "AI" switch in the page header, the eight
  provider tiles, and under them the open provider with its privacy card, or Claude Code with
  its warning, comparison and failure cases. Everything saves at once.
-->
<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAiProvidersStore } from '@/stores/ai-providers'
import UiBanner from '@/ui/UiBanner.vue'
import UiButton from '@/ui/UiButton.vue'
import UiSwitch from '@/ui/UiSwitch.vue'
import ClaudeCodeDetail from './ClaudeCodeDetail.vue'
import ClaudeCodeSide from './ClaudeCodeSide.vue'
import ProviderDetail from './ProviderDetail.vue'
import ProviderGrid from './ProviderGrid.vue'
import ProviderPrivacy from './ProviderPrivacy.vue'
import { isClaudeCode } from './provider-state'

const { t } = useI18n()
const store = useAiProvidersStore()

onMounted(() => void store.load())
</script>

<template>
  <Teleport to="#settings-actions" defer>
    <span class="master">
      <span class="word" aria-hidden="true">{{ t('aiProviders.ai') }}</span>
      <UiSwitch
        :model-value="store.on"
        :aria-label="t('aiProviders.ai')"
        size="compact"
        :disabled="!store.view"
        @update:model-value="store.setOn($event)"
      />
    </span>
  </Teleport>
  <div class="ai">
    <UiBanner
      v-if="store.loadError"
      tone="crit"
      icon="critical"
      :title="t('aiProviders.loadFailed')"
      :text="store.loadError"
      alert
    >
      <template #trailing>
        <UiButton size="small" @click="store.load()">{{ t('aiProviders.retry') }}</UiButton>
      </template>
    </UiBanner>
    <ProviderGrid />
    <div v-if="store.current" class="layout">
      <template v-if="isClaudeCode(store.current)">
        <ClaudeCodeDetail :entry="store.current" />
        <ClaudeCodeSide />
      </template>
      <template v-else>
        <ProviderDetail :entry="store.current" />
        <ProviderPrivacy />
      </template>
    </div>
  </div>
</template>

<style scoped>
.ai {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
  flex: 1 1 auto;
  container-type: inline-size;
}

.master {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: 32px;
  padding: 0 12px;
  border-radius: 10px;
  background: var(--surface-0);
  box-shadow: 0 1px 2px rgba(40, 48, 90, 0.08);
  font-size: var(--text-12);
}

.word {
  font-weight: var(--weight-medium);
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: var(--space-4);
  align-items: stretch;
  flex: 1 1 auto;
}

@container (max-width: 760px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
