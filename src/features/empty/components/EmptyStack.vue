<!--
  "Recognises out of the box": the stacks Daminus knows how to read, as 40 px tiles with one
  neutral mark each. No logos are bundled, so the mark is the name's first letter in one ink;
  hover lifts the tile.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { vEnter } from '@/lib/motion'

const { t } = useI18n()

/** Product names, not words: they read the same in every language. */
const STACK = [
  'Ubuntu',
  'Debian',
  'Docker',
  'Nginx',
  'PM2',
  'Node.js',
  'Laravel',
  'MySQL',
  'Postgres',
  'Redis',
] as const
</script>

<template>
  <section class="stack" :aria-label="t('empty.stack')">
    <span class="title">{{ t('empty.stack') }}</span>
    <ul class="tiles">
      <li v-for="(name, i) in STACK" :key="name" v-enter="{ index: i / 2 }" class="brand">
        <span class="tile" aria-hidden="true">{{ name.charAt(0) }}</span>
        <span class="name">{{ name }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.title {
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  line-height: normal;
}

.tiles {
  display: flex;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.brand {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.tile {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  box-shadow: var(--shadow-node);
  color: var(--ink-4);
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
}

.name {
  color: var(--ink-3);
  font-size: var(--text-11);
  white-space: nowrap;
}

@media (hover: hover) {
  .tile {
    transition:
      transform var(--dur-lift) var(--ease-out),
      box-shadow var(--dur-lift) var(--ease-state),
      color var(--dur-lift) var(--ease-state);
  }

  .brand:hover .tile {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lift-hover);
    color: var(--ink);
  }
}
</style>
