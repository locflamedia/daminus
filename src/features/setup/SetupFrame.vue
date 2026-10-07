<!--
  The page frame of the three setup steps (boards 02 to 04): a breadcrumb, the title and its
  line, a live status chip at the top right, the content, and a footer that counts what the
  primary action will do. The footer sits at the bottom of the window with a frosted bar.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { vEnter } from '@/lib/motion'
import UiIcon from '@/ui/UiIcon.vue'

defineProps<{
  /** 1, 2 or 3. */
  step: number
  title: string
  /** The line under the title; a `subtitle` slot replaces it when part of it is set in mono. */
  subtitle?: string
}>()

defineSlots<{
  subtitle?: () => unknown
  status?: () => unknown
  default?: () => unknown
  summary?: () => unknown
  hint?: () => unknown
  actions?: () => unknown
}>()

const { t } = useI18n()
</script>

<template>
  <section class="frame" :aria-label="title">
    <header class="head">
      <div v-enter class="titles">
        <span class="crumbs">
          {{ t('setupShell.breadcrumb') }}
          <UiIcon name="chevron-right" :size="12" />
          <b>{{ t('setupShell.stepOf', { n: step }) }}</b>
        </span>
        <h2>{{ title }}</h2>
        <p v-if="subtitle || $slots.subtitle">
          <slot name="subtitle">{{ subtitle }}</slot>
        </p>
      </div>
      <span class="grow" />
      <span v-if="$slots.status" v-enter="{ index: 1 }" class="status">
        <slot name="status" />
      </span>
    </header>

    <div class="body"><slot /></div>

    <footer class="foot">
      <div v-if="$slots.summary" class="summary"><slot name="summary" /></div>
      <span v-if="$slots.hint" class="hint"><slot name="hint" /></span>
      <span class="grow" />
      <slot name="actions" />
    </footer>
  </section>
</template>

<style scoped>
.frame {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-5);
  min-width: 0;
  min-height: 0;
}

.head {
  display: flex;
  align-items: flex-end;
  gap: var(--space-4);
  padding-top: 28px;
}

.titles {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.crumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-3);
  font-size: var(--text-12);
}

.crumbs :deep(.icon) {
  color: var(--ink-4);
}

.crumbs b {
  color: var(--ink);
  font-weight: var(--weight-medium);
}

h2 {
  margin: 0;
  font-size: var(--text-20);
  font-weight: var(--weight-medium);
  letter-spacing: var(--track-20);
  line-height: 1.25;
}

p {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-13);
  line-height: 1.45;
}

p :deep(.mono) {
  color: var(--ink-2);
  font-size: var(--text-12);
}

.grow {
  flex-grow: 1;
}

.status {
  display: inline-flex;
  flex: none;
  align-self: flex-end;
}

.body {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  gap: var(--space-4);
  min-width: 0;
}

.foot {
  position: sticky;
  bottom: calc(-1 * var(--space-6));
  z-index: 2;
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-4);
  margin: auto calc(-1 * var(--main-pad, var(--space-8))) calc(-1 * var(--space-6));
  padding: var(--space-4) var(--main-pad, var(--space-8));
  background: color-mix(in srgb, var(--surface-0) 72%, transparent);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  backdrop-filter: blur(20px) saturate(160%);
}

.summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 280px;
  font-size: var(--text-12);
  color: var(--ink-3);
}

.hint {
  color: var(--ink-3);
  font-size: var(--text-12);
}
</style>
