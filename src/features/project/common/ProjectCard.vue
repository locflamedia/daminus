<!--
  The white card the project tabs are made of (boards "Project · Overview" to "Project · Disk"):
  a 13/500 title with a 16 px glyph and a muted note at the right, then the body. `warn` is the
  paler amber card of a finding; `soft` is the translucent card that sits on the page ground.
-->
<script setup lang="ts">
import UiIcon from '@/ui/UiIcon.vue'
import type { IconName } from '@/ui/icon-paths'

withDefaults(
  defineProps<{
    icon?: IconName
    title: string
    meta?: string
    tone?: 'plain' | 'warn'
    soft?: boolean
    gap?: number
  }>(),
  { icon: undefined, meta: undefined, tone: 'plain', soft: false, gap: 12 },
)
</script>

<template>
  <section class="card" :class="[tone, { soft }]" :style="{ gap: `${gap}px` }">
    <header class="head">
      <UiIcon v-if="icon" :name="icon" :size="16" class="glyph" />
      <h3 class="title">{{ title }}</h3>
      <span v-if="meta" class="meta">{{ meta }}</span>
      <slot name="aside" />
    </header>
    <slot />
  </section>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: var(--space-4);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: var(--shadow-card);
}

.card.soft {
  background: color-mix(in srgb, var(--surface-0) 60%, transparent);
  box-shadow: none;
}

.card.warn {
  background: var(--card-wash-warn);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 20px;
}

.glyph {
  flex: none;
  color: var(--ink-3);
}

.warn .glyph {
  color: var(--warn-ink);
}

.title {
  margin: 0;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.meta {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
  white-space: nowrap;
}

.warn .meta {
  color: var(--warn-ink);
}
</style>
