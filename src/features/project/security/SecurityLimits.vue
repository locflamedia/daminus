<!--
  "Not checked in v0.1", from the board "Project · Security": what the security group does not
  look for, in plain words, on the same screen as the results, so a clean result is read for
  what it is.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { staggerDelay } from '@/lib/motion'
import UiIcon from '@/ui/UiIcon.vue'

defineProps<{ play: boolean }>()

const { t } = useI18n()
const LATER = ['scanner', 'baseline', 'cron'] as const
</script>

<template>
  <section class="limits" :aria-label="t('projectSecurity.limits.title')">
    <div class="head"><UiIcon name="info" :size="16" />{{ t('projectSecurity.limits.title') }}</div>
    <p class="text">{{ t('projectSecurity.limits.text') }}</p>
    <ul class="list">
      <li
        v-for="(key, i) in LATER"
        :key="key"
        class="item"
        :class="{ 'm-late': play }"
        :style="{ '--d': staggerDelay(i, 120) }"
      >
        <span class="dot" />
        {{ t(`projectSecurity.limits.${key}`) }}
        <span class="tag">{{ t('projectSecurity.limits.soon') }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.limits {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--surface-0) 60%, transparent);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.head .icon {
  color: var(--ink-3);
}

.text {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 1.5;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}

.item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--ink-2);
  font-size: var(--text-12);
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ink-4);
}

.tag {
  height: 20px;
  margin-left: auto;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--surface-1);
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  line-height: 20px;
}
</style>
