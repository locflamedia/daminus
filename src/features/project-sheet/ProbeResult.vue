<!--
  The live answer of a URL row: a status dot, the code and the time, a chip with the days left
  on the certificate (amber under three weeks, red once expired); a failure in words with the
  reason in small type. While the field rests it keeps the last answer, faded.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { type ProbeState, tlsTone, verdictOf } from '@/lib/sheet-url-probe'
import type { UrlCheck } from '@/api'
import UiChip from '@/ui/UiChip.vue'
import UiSpinner from '@/ui/UiSpinner.vue'

const props = defineProps<{ state: ProbeState }>()
const { t } = useI18n()
const fmt = useFormat()

const shown = computed<UrlCheck | null>(() => {
  if (props.state.kind === 'done') return props.state.check
  if (props.state.kind === 'wait') return props.state.previous
  return null
})
const verdict = computed(() => (shown.value ? verdictOf(shown.value) : null))
const tls = computed(() => {
  const days = shown.value?.tls_days
  if (days === null || days === undefined) return null
  const tone = tlsTone(days)
  const amount = fmt.measure(Math.abs(days), 'days').text
  return {
    tone,
    text:
      tone === 'crit'
        ? t('projectSheet.probe.tlsExpired', { days: amount })
        : t('projectSheet.probe.tls', { days: amount }),
  }
})
</script>

<template>
  <span
    class="result"
    :class="{ stale: state.kind === 'wait' }"
    role="status"
    :aria-busy="state.kind === 'busy' || undefined"
  >
    <template v-if="state.kind === 'busy'">
      <UiSpinner :size="12" />
      <span class="quiet">{{ t('projectSheet.probe.checking') }}</span>
    </template>
    <template v-else-if="verdict?.kind === 'up' || verdict?.kind === 'status'">
      <i class="dot" :class="verdict.kind === 'up' ? 'ok' : 'crit'" />
      <b class="word" :class="verdict.kind === 'up' ? 'ok' : 'crit'">{{ verdict.status }}</b>
      <span v-if="verdict.ms !== null" class="ms">{{ fmt.duration(verdict.ms) }}</span>
      <UiChip v-if="tls" :tone="tls.tone" icon="lock" :title="t('projectSheet.probe.tlsTitle')">
        {{ tls.text }}
      </UiChip>
    </template>
    <template v-else-if="verdict?.kind === 'failed'">
      <i class="dot crit" />
      <b class="word crit">{{ t(`projectSheet.probe.failure.${verdict.failure}.title`) }}</b>
      <span class="quiet">{{ t(`projectSheet.probe.failure.${verdict.failure}.why`) }}</span>
    </template>
  </span>
</template>

<style scoped>
.result {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  overflow: hidden;
  font-size: var(--text-12);
  white-space: nowrap;
  transition: opacity var(--dur-color) var(--ease-state);
}

.result.stale {
  opacity: 0.5;
}

.dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
}

.dot.ok {
  background: var(--ok-solid);
}

.dot.crit {
  background: var(--crit-solid);
}

.word {
  font-weight: var(--weight-medium);
}

.word.ok {
  color: var(--ok-ink);
}

.word.crit {
  color: var(--crit-ink);
}

.quiet {
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-11);
  text-overflow: ellipsis;
}

.ms {
  flex: none;
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: var(--text-11);
}

.chip {
  flex: none;
  height: 20px;
  border-radius: 6px;
}
</style>
