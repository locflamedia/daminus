<!--
  Three answers to "what will this do to my server": nothing installed, read-only, secrets stay
  where they are. Plain cards under the preview.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UiIcon from '@/ui/UiIcon.vue'
import type { IconName } from '@/ui/icon-paths'

const { t } = useI18n()

const CARDS: { id: 'installed' | 'readOnly' | 'secrets'; icon: IconName }[] = [
  { id: 'installed', icon: 'shield' },
  { id: 'readOnly', icon: 'eye' },
  { id: 'secrets', icon: 'lock' },
]
</script>

<template>
  <ul class="trust">
    <li v-for="c in CARDS" :key="c.id" class="card">
      <UiIcon :name="c.icon" />
      <b>{{ t(`empty.trust.${c.id}.title`) }}</b>
      <span>{{ t(`empty.trust.${c.id}.body`) }}</span>
    </li>
  </ul>
</template>

<style scoped>
.trust {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--surface-0) 72%, transparent);
}

.card .icon {
  color: var(--ok-solid);
}

b {
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
  line-height: 1.35;
}

span {
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 1.45;
}
</style>
