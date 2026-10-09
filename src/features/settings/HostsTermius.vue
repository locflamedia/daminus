<!--
  Settings › Hosts, "Hosts in Termius?": Termius keeps hosts in its own vault, so there is no
  importer; the card shows the Host block to copy into ~/.ssh/config once.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { copyText } from '@/api'
import { TERMIUS_TEMPLATE } from '@/lib/hosts-settings'
import { useSetupStore } from '@/stores/setup'
import UiBrandMark from '@/ui/UiBrandMark.vue'
import UiButton from '@/ui/UiButton.vue'
import UiCodeBlock from '@/ui/UiCodeBlock.vue'

const { t } = useI18n()
const setup = useSetupStore()
</script>

<template>
  <section class="card" aria-labelledby="hosts-termius-title">
    <h3 id="hosts-termius-title" class="ct">
      <UiBrandMark name="termius" :size="16" />{{ t('settingsHosts.termius.title') }}
      <span class="m">{{ t('settingsHosts.termius.guide') }}</span>
    </h3>
    <i18n-t scope="global" keypath="settingsHosts.termius.body" tag="p" class="body">
      <template #file><span class="mono">~/.ssh/config</span></template>
    </i18n-t>
    <UiCodeBlock
      :code="TERMIUS_TEMPLATE"
      language="ssh"
      :copyable="false"
      :label="t('settingsHosts.termius.block')"
    />
    <div class="actions">
      <UiButton size="small" @click="setup.addHostOpen = true">
        {{ t('settingsHosts.termius.show') }}
      </UiButton>
      <UiButton size="small" variant="ghost" @click="copyText(TERMIUS_TEMPLATE)">
        {{ t('settingsHosts.termius.copy') }}
      </UiButton>
    </div>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: var(--space-4);
  border-radius: 16px;
  background: linear-gradient(180deg, var(--accent-soft), var(--surface-0) 90px);
  box-shadow: var(--shadow-hairline);
}

.ct {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 20px;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.ct :deep(svg) {
  color: var(--ink-3);
}

.m {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-regular);
}

.body {
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.5;
}

.actions {
  display: flex;
  gap: var(--space-2);
}
</style>
