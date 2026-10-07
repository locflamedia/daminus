<!--
  Pairs: where the front end and the back end of one project run apart, joined by a dashed
  line that flows. Until a name matches across hosts the strip says so, hatched, in the space
  it will take.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Pair, PairSide } from '@/lib/discover-view'

defineProps<{ pairs: readonly Pair[] }>()

const { t } = useI18n()

/** The host when the two are on different hosts, else the port that tells them apart. */
function side(s: PairSide, apart: boolean): string {
  if (apart) return s.port === null ? s.host : `${s.host} :${s.port}`
  return s.port === null ? s.host : `:${s.port}`
}
</script>

<template>
  <div class="pairs">
    <p v-if="pairs.length === 0" class="empty">{{ t('setupDiscover.pairs.empty') }}</p>
    <div
      v-for="pair in pairs"
      :key="pair.key"
      class="pair m-enter"
      role="img"
      :aria-label="
        t('setupDiscover.pairs.label', {
          project: pair.name,
          be: side(pair.be, pair.apart),
          fe: side(pair.fe, pair.apart),
        })
      "
    >
      <div class="end">
        <span class="role">{{ t('setupDiscover.pairs.be') }}</span>
        <span class="mono">{{ side(pair.be, pair.apart) }}</span>
      </div>
      <svg class="line" height="12" aria-hidden="true">
        <line x1="0" y1="6" x2="100%" y2="6" />
        <circle cx="0" cy="6" r="2.5" />
        <circle cx="100%" cy="6" r="2.5" />
      </svg>
      <div class="end right">
        <span class="role">{{ t('setupDiscover.pairs.fe') }}</span>
        <span class="mono">{{ side(pair.fe, pair.apart) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pairs {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 48px;
  margin: 0;
  border-radius: var(--radius-sm);
  background: repeating-linear-gradient(135deg, var(--hatch-1) 0 6px, var(--hatch-2) 6px 12px);
  color: var(--ink-3);
  font-size: var(--text-11);
}

.pair {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  min-width: 0;
  height: 48px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--tint-rose-2) 14%, var(--surface-0)),
    color-mix(in srgb, var(--tint-lilac-2) 14%, var(--surface-0))
  );
}

.end {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  white-space: nowrap;
}

.right {
  text-align: right;
}

.role {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.mono {
  font: var(--weight-medium) var(--text-11) var(--font-mono);
}

.line {
  flex: 1 1 auto;
  min-width: 24px;
  margin: 0 3px;
  overflow: visible;
  fill: var(--tint-rose-2);
}

.line line {
  fill: none;
  stroke: var(--tint-rose-2);
  stroke-width: 1.5;
  stroke-dasharray: 3 4;
  stroke-linecap: round;
  animation: flow 0.9s linear infinite;
}

@keyframes flow {
  to {
    stroke-dashoffset: -14;
  }
}

@media (prefers-reduced-motion: reduce) {
  .line line {
    animation: none;
  }
}
</style>
