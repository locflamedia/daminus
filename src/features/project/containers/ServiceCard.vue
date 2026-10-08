<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { MEMORY_HINT_PCT } from '@/lib/presentation-hints'
import { troubled, uptimeMs, type ServiceView } from '@/lib/project-containers'
import { vEnter } from '@/lib/motion'
import { brandOfImage } from '@/ui/brand-marks'
import UiBrandMark from '@/ui/UiBrandMark.vue'
import UiChip from '@/ui/UiChip.vue'
import UiIcon from '@/ui/UiIcon.vue'
import CpuLine from './CpuLine.vue'

const props = defineProps<{
  service: ServiceView
  cpu: readonly number[]
  now: number
  index: number
}>()

const { t, te } = useI18n()
const fmt = useFormat()

const bad = computed(() => troubled(props.service))
const up = computed(() => uptimeMs(props.service, props.now))
const chipTone = computed(() =>
  props.service.state !== 'running' ? 'crit' : bad.value ? 'warn' : 'ok',
)
const chipText = computed(() => {
  const s = props.service
  if (up.value !== null) {
    const time = fmt.duration(up.value)
    return s.restarts > 0
      ? t('projectContainers.state.runningRestarted', { time, n: s.restarts })
      : t('projectContainers.state.running', { time })
  }
  return te(`projectContainers.state.${s.state}`)
    ? t(`projectContainers.state.${s.state}`)
    : t('projectContainers.state.other', { state: s.state })
})
const memBad = computed(() => (props.service.memPct ?? 0) >= MEMORY_HINT_PCT)
</script>

<template>
  <article v-enter class="card" :class="{ bad }" :style="{ '--d': `${index * 70}ms` }">
    <header class="head">
      <span class="mark" aria-hidden="true"
        ><UiBrandMark :name="brandOfImage(service.image) ?? 'docker'" :size="18"
          ><UiIcon name="container" :size="18" /></UiBrandMark
      ></span>
      <div class="names">
        <b class="svc">{{ service.svc }}</b>
        <span class="container">{{ service.name }}</span>
      </div>
      <UiChip :tone="chipTone" class="chip">
        <i
          class="dot"
          :class="[chipTone, { 'm-halo': chipTone === 'warn' }]"
          aria-hidden="true"
        />{{ chipText }}
      </UiChip>
    </header>
    <div class="cells">
      <div class="cell">
        <span class="label">{{ t('projectContainers.cell.cpu') }}</span>
        <b class="value">{{ service.cpu === null ? '—' : fmt.measure(service.cpu, '%').text }}</b>
        <CpuLine
          v-if="cpu.length > 2"
          :values="cpu"
          :tone="bad ? 'warn' : 'accent'"
          :once="`containers-cpu-${service.name}`"
        />
      </div>
      <div class="cell">
        <span class="label">
          {{
            service.limit === null
              ? t('projectContainers.cell.memoryOnly')
              : t('projectContainers.cell.memory')
          }}
        </span>
        <b class="value">
          {{ service.mem === null ? '—' : fmt.measure(service.mem, 'bytes').text }}
          <span v-if="service.limit !== null" class="muted"
            >/ {{ fmt.measure(service.limit, 'bytes').text }}</span
          >
        </b>
        <div
          v-if="service.memPct !== null"
          class="bar"
          role="img"
          :aria-label="fmt.measure(service.memPct, '%').text"
        >
          <i
            class="fill m-grow"
            :class="{ warn: memBad }"
            :style="{ width: `${service.memPct}%` }"
          />
        </div>
        <span v-else class="muted small">{{ t('projectContainers.cell.noLimit') }}</span>
      </div>
      <div class="cell">
        <span class="label">{{ t('projectContainers.cell.restarts') }}</span>
        <b class="value" :class="{ warn: service.restarts > 0 }">
          {{ service.restarts }}<span v-if="service.restarts > 0" aria-hidden="true"> ▲</span>
        </b>
      </div>
    </div>
  </article>
</template>

<style scoped>
.dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--ok-solid);
}

.dot.warn {
  background: var(--warn-solid);
}

.dot.crit {
  background: var(--crit-solid);
}

.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: var(--space-4);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: var(--shadow-card);
}

.card.bad {
  box-shadow:
    var(--shadow-card),
    0 16px 32px -20px var(--chart-amber);
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mark {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--surface-well);
  color: var(--ink-3);
}

.names {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.svc {
  font-size: 14px;
  font-weight: var(--weight-medium);
}

.container {
  overflow: hidden;
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip {
  margin-left: auto;
}

.cells {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.label {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.value {
  font-family: var(--font-mono);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.value.warn {
  color: var(--warn-ink);
}

.muted {
  color: var(--ink-3);
  font-weight: var(--weight-regular);
}

.small {
  font-family: var(--font-mono);
  font-size: var(--text-11);
}

.bar {
  position: relative;
  height: 6px;
  margin-top: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--seg-track);
}

.fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 3px;
  background: var(--accent);
  transform-origin: left;
}

.fill.warn {
  background: var(--chart-amber);
}
</style>
