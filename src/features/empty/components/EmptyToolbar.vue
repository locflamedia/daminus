<!--
  The Overview header of an empty app: the title, "No scans yet", the agent chip when the agent
  holds keys, and Scan all, visible but off (a tooltip says to add a project first) so the next
  screen's main action is already learned.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import PageHeader from '@/layout/PageHeader.vue'
import UiButton from '@/ui/UiButton.vue'

defineProps<{ keys?: number }>()
const { t } = useI18n()
</script>

<template>
  <PageHeader :title="t('nav.overview')" :meta="t('toolbar.noScan')">
    <template #actions>
      <span v-if="keys" class="agent"
        ><i class="dot" aria-hidden="true" />{{ t('empty.agentChip', { n: keys }, keys) }}</span
      >
      <UiButton
        class="scan"
        variant="primary"
        disabled
        :disabled-reason="t('empty.scanOff')"
        shortcut="⌘R"
      >
        ↳ {{ t('toolbar.scanAll') }}
      </UiButton>
    </template>
  </PageHeader>
</template>

<style scoped>
.agent {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: var(--h-control);
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--surface-0) 70%, transparent);
  color: var(--ink-3);
  font-size: var(--text-12);
  white-space: nowrap;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ok-solid);
}

/* Off, but drawn as the button it will become: the dark fill at 32 %. */
.scan.btn-off {
  background: var(--btn);
  color: var(--btn-ink);
  opacity: 0.32;
}
</style>
