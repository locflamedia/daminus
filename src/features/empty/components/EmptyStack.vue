<!--
  "Recognises out of the box": the stacks Daminus knows how to read, as 40 px tiles with the
  owner's mark at 20 px, greyed to one ink until hover. A colour wave walks across the row every
  6 s, as if each stack is being recognised: the grey face and the colour face cross-fade (only
  opacity moves), 140 ms apart. Under reduced motion the row stays grey and still.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { vEnter } from '@/lib/motion'
import type { BrandName } from '@/ui/brand-marks'
import UiBrandMark from '@/ui/UiBrandMark.vue'

const { t } = useI18n()

/** Product names, not words: they read the same in every language. */
const STACK: readonly { name: string; mark: BrandName }[] = [
  { name: 'Ubuntu', mark: 'ubuntu' },
  { name: 'Debian', mark: 'debian' },
  { name: 'Docker', mark: 'docker' },
  { name: 'Nginx', mark: 'nginx' },
  { name: 'PM2', mark: 'pm2' },
  { name: 'Node.js', mark: 'nodejs' },
  { name: 'Laravel', mark: 'laravel' },
  { name: 'MySQL', mark: 'mysql' },
  { name: 'Postgres', mark: 'postgresql' },
  { name: 'Redis', mark: 'redis' },
]

/** One step of the wave between two neighbouring tiles. */
const WAVE_STEP_MS = 140
</script>

<template>
  <section class="stack" :aria-label="t('empty.stack')">
    <span class="title">{{ t('empty.stack') }}</span>
    <ul class="tiles">
      <li v-for="(item, i) in STACK" :key="item.name" v-enter="{ index: i / 2 }" class="known">
        <span class="tile" aria-hidden="true">
          <UiBrandMark class="layer grey" :name="item.mark" :size="20" />
          <UiBrandMark
            class="layer colour"
            :name="item.mark"
            :size="20"
            :style="{ animationDelay: `${i * WAVE_STEP_MS}ms` }"
          />
        </span>
        <span class="name">{{ item.name }}</span>
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

.known {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.tile {
  position: relative;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  box-shadow: var(--shadow-node);
}

/* Both faces sit on the same spot; the colour one fades in over the grey one. */
.layer {
  grid-area: 1 / 1;
}

.grey {
  filter: grayscale(1) brightness(0.45);
  opacity: 0.5;
}

.colour {
  opacity: 0;
  animation: wave 6s linear infinite;
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
      box-shadow var(--dur-lift) var(--ease-state);
  }

  .colour {
    transition: opacity var(--dur-lift) var(--ease-state);
  }

  .known:hover .tile {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lift-hover);
  }

  .known:hover .colour {
    opacity: 1;
    animation: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .colour {
    animation: none;
  }
}

/* The board's wave: grey, a short colour beat, back to grey for the rest of the 6 s. */
@keyframes wave {
  0%,
  2% {
    opacity: 0;
  }
  7%,
  13% {
    opacity: 1;
  }
  20%,
  100% {
    opacity: 0;
  }
}
</style>
