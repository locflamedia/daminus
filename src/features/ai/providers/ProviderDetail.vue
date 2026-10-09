<!--
  The open provider of the board's left card: monogram and name, the key (when it needs one),
  the model and the connection test. Claude Code has its own card (`ClaudeCodeDetail.vue`).
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AiProviderEntry } from '@/api/bindings/AiProviderEntry'
import { useAiProvidersStore } from '@/stores/ai-providers'
import UiChip from '@/ui/UiChip.vue'
import ProviderBaseUrl from './ProviderBaseUrl.vue'
import ProviderKey from './ProviderKey.vue'
import ProviderModel from './ProviderModel.vue'
import ProviderTest from './ProviderTest.vue'
import ProviderMark from './ProviderMark.vue'
import { isActive, needsBaseUrl } from './provider-state'

const props = defineProps<{ entry: AiProviderEntry }>()
const { t } = useI18n()
const store = useAiProvidersStore()

const active = computed(() => (store.view ? isActive(props.entry, store.view) : false))
const adapterKey = computed(() =>
  props.entry.profile.needs_key ? 'aiProviders.adapter' : 'aiProviders.adapterNoKey',
)
const adapterName = computed(() => props.entry.profile.adapter ?? props.entry.profile.id)
</script>

<template>
  <section class="card" :aria-label="entry.profile.name">
    <header class="head">
      <span class="mark" aria-hidden="true"><ProviderMark :entry="entry" :size="22" /></span>
      <div class="who">
        <b class="name">{{ entry.profile.name }}</b>
        <i18n-t :keypath="adapterKey" tag="span" class="adapter" scope="global">
          <template #adapter
            ><span class="mono">{{ adapterName }}</span></template
          >
        </i18n-t>
      </div>
      <UiChip v-if="active" tone="info" size="tag" class="status">{{
        t('aiProviders.active')
      }}</UiChip>
    </header>
    <ProviderBaseUrl v-if="needsBaseUrl(entry)" :entry="entry" />
    <ProviderKey v-if="entry.profile.needs_key" :entry="entry" />
    <ProviderModel :entry="entry" />
    <ProviderTest :entry="entry" />
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  min-height: 0;
  padding: var(--space-5);
  border-radius: 14px;
  background: var(--surface-0);
  box-shadow: var(--shadow-hairline);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.mark {
  display: grid;
  place-items: center;
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--surface-well);
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
}

.who {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  line-height: normal;
}

.name {
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
}

.adapter {
  color: var(--ink-3);
  font-size: var(--text-12);
}

.mono {
  font-family: var(--font-mono);
}

.status {
  margin-left: auto;
}
</style>
