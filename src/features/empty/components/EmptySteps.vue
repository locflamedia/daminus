<!--
  The three steps of setup as equal cards with honest time estimates. Nothing is done yet, so
  the counter reads 0 of 3 and the first step is the active one: the accent tile and a short
  bar that grows in once. The cards arrive 80 ms apart.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { vEnter } from '@/lib/motion'
import UiIcon from '@/ui/UiIcon.vue'
import type { IconName } from '@/ui/icon-paths'

const { t } = useI18n()

const STEPS: { id: 'pick' | 'discover' | 'group'; icon: IconName }[] = [
  { id: 'pick', icon: 'server' },
  { id: 'discover', icon: 'search' },
  { id: 'group', icon: 'folder' },
]
</script>

<template>
  <section class="steps" :aria-label="t('empty.steps.title')">
    <div class="head">
      <span class="title">{{ t('empty.steps.title') }}</span>
      <span class="mono count">{{ t('empty.steps.progress', { done: 0, total: 3 }) }}</span>
    </div>
    <ol class="cards">
      <li
        v-for="(s, i) in STEPS"
        :key="s.id"
        v-enter="{ index: i }"
        class="step"
        :class="{ active: i === 0 }"
      >
        <div class="top">
          <span class="tile"><UiIcon :name="s.icon" /></span>
          <span class="mono n">{{ i + 1 }}</span>
        </div>
        <div class="text">
          <b>{{ t(`empty.steps.${s.id}.title`) }}</b>
          <span>{{ t(`empty.steps.${s.id}.body`) }}</span>
        </div>
        <div class="time">
          <UiIcon name="clock" :size="12" />{{ t(`empty.steps.${s.id}.time`) }}
        </div>
        <span v-if="i === 0" class="bar m-grow" aria-hidden="true" />
      </li>
    </ol>
  </section>
</template>

<style scoped>
.steps {
  --step-card-h: 192px;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--ink-3);
  font-size: var(--text-11);
}

.title {
  font-weight: var(--weight-medium);
}

.cards {
  display: flex;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.step {
  position: relative;
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
  min-height: var(--step-card-h);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--surface-0) 72%, transparent);
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tile {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--ink-3);
}

.active .tile {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.n {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.text {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.text b {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.text span {
  color: var(--ink-3);
  font-size: var(--text-12);
  line-height: 1.45;
}

.time {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
}

.time .icon {
  color: var(--ink-4);
}

.bar {
  position: absolute;
  right: var(--space-4);
  bottom: 0;
  left: var(--space-4);
  height: 2px;
  border-radius: 2px;
  background: var(--accent);
  transform: scaleX(0.12);
  transform-origin: left;
}

/* At 1280 the cards are ~143 px wide: a little less padding keeps the time estimate on one line. */
@media (max-width: 1360px) {
  .step {
    padding-inline: var(--space-3);
  }
}

@media (hover: hover) {
  .step {
    transition:
      transform var(--dur-lift) var(--ease-out),
      box-shadow var(--dur-lift) var(--ease-state),
      background-color var(--dur-lift) var(--ease-state);
  }

  .step:hover {
    transform: translateY(-2px);
    background: var(--surface-0);
    box-shadow: var(--shadow-lift-hover);
  }
}
</style>
