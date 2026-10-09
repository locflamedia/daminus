<!--
  The streak (board "Delight", tile 2) in the sidebar footer, above the AI provider chip: "N
  clear weeks" and N small bars that fill gold one by one, a thin line joining them to the
  last. The board draws it on the painting; here it keeps its dark translucent pill, which
  reads on the light sidebar too. Hidden at no weeks, with the switch off, or while any
  project is critical. Counted on this Mac only. With Reduce Motion the bars are simply filled.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { streakGet } from '@/api'
import { useSettingsStore } from '@/stores/settings'
import { currentDev, shouldShow } from './delight-gate'
import { useDelightStore } from './delight-store'

/** Bars drawn at most; the count in words is always the real one. */
const MAX_BARS = 12
const FILL_MS = 1100
const TOTAL_MS = 6600

const { t } = useI18n()
const settings = useSettingsStore()
const delight = useDelightStore()
const dev = currentDev().kind === 'streak'

const weeks = ref(0)
async function load() {
  try {
    weeks.value = (await streakGet()).weeks
  } catch {
    // A streak that cannot be read is simply not shown.
  }
}
onMounted(load)
watch(() => delight.completion, load)

const shown = computed(() => (dev && weeks.value === 0 ? 6 : weeks.value))
const visible = computed(
  () =>
    shown.value > 0 &&
    (dev ||
      shouldShow({
        setting: settings.appearance.streak_badge,
        hasCritical: delight.hasCritical,
      })),
)
const bars = computed(() => Math.min(shown.value, MAX_BARS))
const stepMs = computed(() => Math.min(FILL_MS, Math.round(TOTAL_MS / Math.max(1, bars.value))))
const label = computed(() => t('delight.streak.label', { n: shown.value }, shown.value))
const tip = computed(() => t('delight.streak.tip', { n: shown.value }, shown.value))
</script>

<template>
  <div v-if="visible" class="streak" role="img" :aria-label="tip" :title="tip">
    <b>{{ label }}</b>
    <span :key="shown" class="bars" :style="{ '--step': `${stepMs}ms`, '--n': bars }">
      <i class="line" />
      <i v-for="n in bars" :key="n" class="wk" :style="{ '--i': n - 1 }" />
    </span>
  </div>
</template>

<style scoped>
.streak {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  height: 32px;
  padding: 0 12px;
  border-radius: 12px;
  background: rgb(14 27 77 / 88%);
  color: #fff;
  font-size: var(--text-12);
  white-space: nowrap;
}

.streak b {
  min-width: 0;
  overflow: hidden;
  font-weight: var(--weight-medium);
  text-overflow: ellipsis;
}

.bars {
  --step: 1100ms;
  --n: 1;

  position: relative;
  display: flex;
  flex: none;
  gap: 4px;
  margin-left: auto;
}

.wk {
  --i: 0;

  position: relative;
  width: 10px;
  height: 6px;
  border-radius: 3px;
  background: #f7d052;
  animation: wk 240ms var(--ease-out) both;
  animation-delay: calc(var(--i) * var(--step));
}

/* Joins the bars, drawn at the pace they fill. */
.line {
  position: absolute;
  top: 50%;
  right: 5px;
  left: 5px;
  height: 1px;
  background: rgb(255 236 170 / 70%);
  transform-origin: left;
  animation: draw calc(var(--n) * var(--step)) linear both;
}

@keyframes wk {
  from {
    background: rgb(255 255 255 / 20%);
  }

  to {
    background: #f7d052;
  }
}

@keyframes draw {
  from {
    transform: scaleX(0);
  }

  to {
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .wk,
  .line {
    animation: none;
  }
}
</style>
