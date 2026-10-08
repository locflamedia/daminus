<!--
  Numbers of the sheet, from the board "AI payload" (2): tiles on surface-1 (radius 12, padding
  12 14): the label (11, ink-3), the value (17/500), and under Size a 4 px meter of the share of
  the data limit. "Masked" is amber. The tokens are an estimate (the provider counts for real);
  the board's cost and token limit have no data behind them yet (see ui-change-requests).
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { estimateTokens, maskedCount, sizeShare } from './payload-lib'

const props = defineProps<{ bytes: number; system: string; user: string }>()
const { t, n } = useI18n()
const fmt = useFormat()

const size = computed(() => fmt.measure(props.bytes, 'bytes').text)
const tokens = computed(() => n(estimateTokens(props.bytes)))
const masked = computed(() => maskedCount(`${props.system}\n${props.user}`))
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
      <b>{{ masked }}</b>
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
  background: var(--surface-1);
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

.warn {
  background: var(--warn-soft);
}

.warn .lab,
.warn b {
  color: var(--warn-ink);
}
</style>
