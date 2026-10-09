<!--
  The tip for people whose hosts live in Termius, which keeps its own list: export it once
  into the ssh config, then reload. Reload reads the config again and keeps the ticks.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UiButton from '@/ui/UiButton.vue'
import UiBrandMark from '@/ui/UiBrandMark.vue'
import UiKbd from '@/ui/UiKbd.vue'

defineProps<{ busy: boolean }>()
const emit = defineEmits<{ reload: [] }>()

const { t } = useI18n()
</script>

<template>
  <div class="tip">
    <span class="tile" aria-hidden="true"><UiBrandMark name="termius" :size="20" /></span>
    <div class="text">
      <b>{{ t('setupPick.termius.title') }}</b>
      <i18n-t scope="global" keypath="setupPick.termius.body" tag="span">
        <template #file><span class="mono">~/.ssh/config</span></template>
      </i18n-t>
    </div>
    <span class="grow" />
    <UiButton icon="refresh" :busy="busy" @click="emit('reload')">
      {{ t('setupPick.termius.reload') }}<UiKbd>⇧⌘R</UiKbd>
    </UiButton>
  </div>
</template>

<style scoped>
.tip {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-0) 72%, transparent);
}

.tile {
  display: grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  box-shadow: var(--shadow-lift);
  color: var(--ink-2);
}

.text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  color: var(--ink-3);
  font-size: var(--text-12);
  line-height: 1.4;
}

.text b {
  color: var(--ink);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.text .mono {
  color: var(--ink-2);
  font-size: var(--text-11);
}

.grow {
  flex-grow: 1;
}
</style>
