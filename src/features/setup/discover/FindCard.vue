<!--
  A column of finds: a card with its kind's glyph, its name and a count on the right, the rows
  as they arrive, and, while hosts are still being read, a shimmer slot the height of the next
  row, so a find that lands does not move what is below it.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UiIcon from '@/ui/UiIcon.vue'
import UiSkeleton from '@/ui/UiSkeleton.vue'
import type { IconName } from '@/ui/icon-paths'

defineProps<{
  title: string
  icon: IconName
  /** Right-aligned words ("nginx · 4"); a `meta` slot can hold a rolling number. */
  meta?: string
  /** A shimmer slot waits at the end. */
  waiting?: boolean
  empty?: boolean
}>()
defineSlots<{ default?: () => unknown; meta?: () => unknown; footer?: () => unknown }>()

const { t } = useI18n()
</script>

<template>
  <section class="card" :aria-label="title" :aria-busy="waiting || undefined">
    <header class="sec">
      <UiIcon :name="icon" :size="16" />
      <b>{{ title }}</b>
      <span class="ct"
        ><slot name="meta">{{ meta }}</slot></span
      >
    </header>
    <ul class="rows">
      <slot />
    </ul>
    <p v-if="empty && !waiting" class="none">{{ t('setupDiscover.columns.empty') }}</p>
    <div v-if="waiting" class="slot" aria-hidden="true">
      <UiSkeleton width="32px" height="32px" radius="10px" tone="soft" />
      <div class="lines">
        <UiSkeleton width="120px" height="9px" tone="soft" />
        <UiSkeleton width="190px" height="7px" tone="soft" />
      </div>
    </div>
    <div v-if="$slots.footer" class="foot"><slot name="footer" /></div>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  border-radius: 14px;
  background: var(--surface-0);
  box-shadow: var(--shadow-card);
}

.sec {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  height: 28px;
  padding: 0 var(--space-1) var(--space-1);
  color: var(--ink-2);
}

.sec b {
  color: var(--ink);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.ct {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-12);
}

.rows {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
}

.none {
  margin: 0;
  padding: var(--space-2);
  color: var(--ink-3);
  font-size: var(--text-12);
}

.slot {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: var(--space-3);
  align-items: center;
  height: 48px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.foot {
  margin-top: auto;
  padding-top: var(--space-2);
}

.lines {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
