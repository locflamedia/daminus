<!--
  The provider chip at the bottom of the sidebar, from the board "AI · Findings": a translucent
  radius-14 pill with the model's name and a live dot, above Settings. It opens Settings › AI.
  Nothing is drawn while AI is off or no provider is chosen (the board draws no such state).
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useAiProviderName } from './use-ai-provider-name'

const { t } = useI18n()
const name = useAiProviderName()
</script>

<template>
  <RouterLink
    v-if="name"
    :to="{ name: 'settings', params: { section: 'ai' } }"
    class="chip"
    :aria-label="t('nav.aiProvider', { name })"
  >
    <b>{{ name }}</b>
    <span class="live" aria-hidden="true" />
  </RouterLink>
</template>

<style scoped>
.chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-0) 72%, transparent);
  color: var(--ink);
  font-size: var(--text-12);
}

.chip b {
  min-width: 0;
  overflow: hidden;
  font-weight: var(--weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip:focus-visible {
  box-shadow: var(--focus-ring);
}

.live {
  position: relative;
  flex: none;
  width: 6px;
  height: 6px;
  margin-left: auto;
  border-radius: 50%;
  background: var(--ok-ink);
}

.live::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  animation: ping 2.4s cubic-bezier(0.23, 1, 0.32, 1) infinite;
}

@keyframes ping {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--ok-ink) 40%, transparent);
  }
  70%,
  100% {
    box-shadow: 0 0 0 6px transparent;
  }
}

@media (prefers-reduced-motion: reduce) {
  .live::after {
    animation: none;
  }
}
</style>
