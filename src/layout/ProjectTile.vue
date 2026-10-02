<!--
  The 32 px mark of a project: the main framework's logo when setup found one, else a dot in
  the project's own colour. On the rail it carries the issue count as a badge in the severity
  colour and, when it is the open project, a ring in the project's colour. In the project
  header it carries neither; the `well` surface is for a tile inside a white card.
-->
<script setup lang="ts">
import { computed } from 'vue'
import type { Level } from '@/api'
import { badgeText } from '@/lib/micro'

const props = withDefaults(
  defineProps<{
    /** `#rrggbb`, already checked. */
    color?: string | null
    /** URL of the framework logo, when known. */
    logo?: string | null
    level?: Level
    count?: number
    /** The open project: a ring in its own colour. */
    active?: boolean
    surface?: 'card' | 'well'
  }>(),
  { color: null, logo: null, level: 'ok', count: 0, active: false, surface: 'card' },
)

const badge = computed(() => badgeText(props.count))
</script>

<template>
  <span
    class="tile"
    :class="[surface, { active: active && color }]"
    :style="color ? { '--mark': color } : undefined"
  >
    <img v-if="logo" :src="logo" alt="" width="18" height="18" />
    <span v-else class="dot" :class="{ plain: !color }" />
    <b v-if="badge" class="badge" :class="level">{{ badge }}</b>
  </span>
</template>

<style scoped>
.tile {
  position: relative;
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
}

.card {
  background: var(--surface-0);
  box-shadow: var(--shadow-lift);
}

.well {
  background: var(--surface-well);
}

.card.active {
  box-shadow:
    0 0 0 2px var(--surface-0),
    0 0 0 3.5px var(--mark);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-full);
  background: var(--mark);
}

.dot.plain {
  background: var(--ink-5);
}

.badge {
  position: absolute;
  top: -4px;
  right: -4px;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: var(--accent);
  line-height: 1;
  color: var(--on-solid);
  font-size: 9px;
  font-weight: var(--weight-semibold);
}

.badge.crit {
  background: var(--crit-solid);
}

.badge.warn {
  background: var(--warn-solid);
}
</style>
