<!--
  The provider card at the bottom of the sidebar (boards Overview, AI · Ask): a translucent
  radius-14 card with the provider's logo, the model's name and a live dot that pings once, and
  under it the provider and where its key is kept. It opens Settings › AI.
  Nothing is drawn while AI is off or no provider is chosen (the board draws no such state).
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useAiProvidersStore } from '@/stores/ai-providers'
import UiBrandMark from '@/ui/UiBrandMark.vue'
import { useAiModelMark, useAiProviderName } from './use-ai-provider-name'

const { t } = useI18n()
const name = useAiProviderName()
const providers = useAiProvidersStore()

/** The chosen provider's profile: its logo and the second line under the model. */
const entry = computed(() => {
  const view = providers.view
  return view?.providers.find((p) => p.profile.id === view.provider) ?? null
})
const mark = useAiModelMark()
const sub = computed(() => {
  const e = entry.value
  if (!e) return ''
  return e.key_set ? `${e.profile.name} · ${t('nav.aiKeychain')}` : e.profile.name
})
</script>

<template>
  <RouterLink
    v-if="name"
    :to="{ name: 'settings', params: { section: 'ai' } }"
    class="chip"
    :aria-label="t('nav.aiProvider', { name })"
  >
    <span class="row">
      <UiBrandMark :name="mark" :size="16" />
      <b>{{ name }}</b>
      <span class="live" aria-hidden="true" />
    </span>
    <span v-if="sub" class="sub">{{ sub }}</span>
  </RouterLink>
</template>

<style scoped>
.chip {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-0) 72%, transparent);
  color: var(--ink);
  font-size: var(--text-12);
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sub {
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-11);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip b {
  font-size: var(--text-13);
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
  animation: ping 600ms cubic-bezier(0.23, 1, 0.32, 1) 1;
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
