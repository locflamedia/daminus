<!--
  The empty sidebar of a first launch: shimmering slots show where projects and servers will go,
  and one line says how they will be sorted. The counts above them read 0, never blank.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div class="ghosts">
    <section class="list">
      <h3 class="group">{{ t('nav.projects') }} <span>0</span></h3>
      <div class="slot" aria-hidden="true">
        <i class="dot" style="width: 8px" /><i style="width: 96px" />
      </div>
      <div class="slot" aria-hidden="true">
        <i class="dot" style="width: 8px; animation-delay: 0.2s" /><i
          style="width: 72px; animation-delay: 0.2s"
        />
      </div>
    </section>
    <section class="list">
      <h3 class="group">{{ t('nav.servers') }} <span>0</span></h3>
      <div class="slot" aria-hidden="true">
        <i class="dot" style="width: 16px; height: 16px; animation-delay: 0.4s" /><i
          style="width: 64px; animation-delay: 0.4s"
        />
      </div>
    </section>
    <p class="hint">{{ t('empty.sidebar.ghosts') }}</p>
  </div>
</template>

<style scoped>
.ghosts {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  flex: none;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.group {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 24px;
  padding: 0 var(--space-3);
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.slot {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: var(--h-control);
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
}

.slot i {
  display: block;
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--side-search), var(--skeleton-2), var(--side-search));
  background-size: 200% 100%;
  animation: shimmer 2.8s var(--ease-state) 2;
}

.slot i.dot {
  border-radius: 50%;
}

.hint {
  padding: 0 var(--space-3);
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 1.45;
}

@keyframes shimmer {
  from {
    background-position: 100% 0;
  }
  to {
    background-position: -100% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .slot i {
    animation: none;
  }
}
</style>
