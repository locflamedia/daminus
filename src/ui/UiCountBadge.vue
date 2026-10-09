<!--
  Count badge, from the board "Micro UI": an 18 px pill, 10.5/600, that counts issues. Solid
  rose with white text is only for critical; warnings are an amber tint, anything else a
  neutral one. Above 99 it reads 99+, and at zero it is not drawn at all. The number is
  always rendered as text; `label` gives the words for screen readers ("3 critical issues").
-->
<script setup lang="ts">
import { computed } from 'vue'
import { badgeText } from '@/lib/micro'

const props = withDefaults(
  defineProps<{ count: number; tone?: 'crit' | 'warn' | 'neutral'; label?: string }>(),
  { tone: 'neutral', label: undefined },
)

const text = computed(() => badgeText(props.count))
</script>

<template>
  <span v-if="text" class="badge" :class="`tone-${tone}`" :aria-label="label">{{ text }}</span>
</template>

<style scoped>
.badge {
  display: inline-grid;
  place-items: center;
  flex: none;
  box-sizing: border-box;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--radius-full);
  font-size: var(--text-badge-10-5);
  font-weight: var(--weight-semibold);
  line-height: 1;
}

.tone-crit {
  background: var(--crit-solid);
  color: var(--on-solid);
}

.tone-warn {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.tone-neutral {
  background: var(--surface-2);
  color: var(--ink-3);
}
</style>
