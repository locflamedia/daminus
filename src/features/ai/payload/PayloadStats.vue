<!--
  Numbers of the sheet, from the board "AI payload" (2): tiles on surface-1 (radius 12, padding
  12 14): the label (11, ink-3), the value (17/500), and under Size a 4 px meter of the share of
  the data limit. "Masked" is amber. The tokens are an estimate (the provider counts for real);
  the board's cost and token limit have no data behind them yet (see ui-change-requests).
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { prefersReducedMotion } from '@/lib/motion'
import { estimateTokens, kilobytes, maskedCount, sizeShare } from './payload-lib'

const props = defineProps<{ bytes: number; system: string; user: string }>()
const { t, n } = useI18n()

const size = computed(
  () => `${n(kilobytes(props.bytes), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KB`,
)
const tokens = computed(() => n(estimateTokens(props.bytes)))
const masked = computed(() => maskedCount(`${props.system}\n${props.user}`))

// The masked count climbs from 0 to its value when the numbers first appear (the board's "counts
// up as the scanner passes"); later changes and Reduce Motion show the value at once.
const COUNT_MS = 900
const shown = ref(prefersReducedMotion() ? masked.value : 0)
let frame = 0
function climb(to: number) {
  const t0 = performance.now()
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / COUNT_MS)
    shown.value = Math.round(to * (1 - (1 - k) ** 3))
    frame = k < 1 ? requestAnimationFrame(step) : 0
  }
  frame = requestAnimationFrame(step)
}
onMounted(() => {
  if (shown.value !== masked.value) climb(masked.value)
})
watch(masked, (v) => {
  cancelAnimationFrame(frame)
  shown.value = v
})
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <div class="stats">
    <div class="st">
      <span class="lab">{{ t('ai.payload.size') }}</span>
      <b>{{ size }}</b>
      <div class="track">
        <i class="fill" :style="{ transform: `scaleX(${sizeShare(bytes)})` }" />
      </div>
    </div>
    <div class="st">
      <span class="lab">{{ t('ai.payload.tokens') }}</span>
      <b>≈ {{ tokens }}</b>
    </div>
    <div class="st warn">
      <span class="lab">{{ t('ai.payload.masked') }}</span>
      <b aria-hidden="true">{{ shown }}</b>
      <span class="sr">{{ masked }}</span>
      <span class="lab">{{ t('ai.payload.maskedNote') }}</span>
    </div>
  </div>
</template>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding: 0 var(--space-6) var(--space-4);
}

.st {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--surface-well);
}

.lab {
  color: var(--ink-3);
  font-size: var(--text-11);
}

b {
  font-size: 17px;
  font-weight: var(--weight-medium);
  letter-spacing: -0.01em;
}

.track {
  height: 4px;
  overflow: hidden;
  border-radius: 2px;
  background: var(--surface-2);
}

.fill {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--accent);
  transform-origin: left;
  transition: transform 300ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}

.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

.warn {
  position: relative;
  background: var(--warn-soft);
}

.warn .lab,
.warn b {
  color: var(--warn-ink);
}
</style>
