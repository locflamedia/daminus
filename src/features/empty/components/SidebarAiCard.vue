<!--
  The static AI card of the empty sidebar: AI is optional and off until a provider is connected.
  It holds no provider state; the link only goes to where providers are set up.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import UiIcon from '@/ui/UiIcon.vue'
import UiTag from '@/ui/UiTag.vue'

const { t } = useI18n()
</script>

<template>
  <section class="card" :aria-label="t('empty.sidebar.ai.title')">
    <div class="head">
      <span class="badge" aria-hidden="true"><UiIcon name="spark" :size="14" /></span>
      <b>{{ t('empty.sidebar.ai.title') }}</b>
      <UiTag class="tag">{{ t('empty.sidebar.ai.optional') }}</UiTag>
    </div>
    <p>{{ t('empty.sidebar.ai.body') }}</p>
    <RouterLink to="/settings/ai" class="link">
      {{ t('empty.sidebar.ai.link') }}
      <UiIcon name="chevron-right" :size="12" />
    </RouterLink>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: 14px;
  background: var(--side-card);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.badge {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-xs);
  background: var(--accent-soft);
  color: var(--accent-ink);
}

b {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.tag {
  height: 20px;
  margin-left: auto;
  padding: 0 6px;
  background: var(--surface-2);
}

p {
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 1.45;
}

.link {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: var(--space-1);
  border-radius: var(--radius-xs);
  color: var(--accent-ink);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.link:focus-visible {
  box-shadow: var(--focus-ring);
}
</style>
