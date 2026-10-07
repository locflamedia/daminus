<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import type { Pm2View } from '@/lib/project-containers'
import { vEnter } from '@/lib/motion'
import UiChip from '@/ui/UiChip.vue'
import UiIcon from '@/ui/UiIcon.vue'

const props = defineProps<{ app: Pm2View; now: number; index: number }>()

const { t, te } = useI18n()
const fmt = useFormat()

const online = computed(() => props.app.status === 'online')
const bad = computed(() => !online.value || props.app.restarts > 0 || !props.app.daemon)
const tone = computed(() => (!online.value ? 'crit' : bad.value ? 'warn' : 'ok'))
const text = computed(() => {
  const s = props.app.status
  if (online.value && props.app.started !== null) {
    return t('projectContainers.state.online', {
      time: fmt.duration(Math.max(0, props.now - props.app.started * 1000)),
    })
  }
  return te(`projectContainers.state.${s}`)
    ? t(`projectContainers.state.${s}`)
    : t('projectContainers.state.other', { state: s || '—' })
})
</script>

<template>
  <article v-enter class="card" :class="{ bad }" :style="{ '--d': `${index * 70}ms` }">
    <header class="head">
      <span class="mark" aria-hidden="true"><UiIcon name="terminal" :size="18" /></span>
      <div class="names">
        <b class="svc">{{ app.app }}</b>
        <span class="container">pm2 · {{ app.host }}</span>
      </div>
      <UiChip :tone="tone" class="chip">
        <i class="dot" :class="[tone, { 'm-halo': tone === 'warn' }]" aria-hidden="true" />{{
          text
        }}
      </UiChip>
    </header>
    <div class="cells">
      <div class="cell">
        <span class="label">{{ t('projectContainers.cell.instances') }}</span>
        <b class="value">{{ app.instances ?? '—' }}</b>
      </div>
      <div class="cell">
        <span class="label">{{ t('projectContainers.cell.memoryOnly') }}</span>
        <b class="value">{{
          app.memMb === null ? '—' : fmt.measure(app.memMb * 1048576, 'bytes').text
        }}</b>
      </div>
      <div class="cell">
        <span class="label">{{ t('projectContainers.cell.restarts') }}</span>
        <b class="value" :class="{ warn: app.restarts > 0 }">
          {{ app.restarts }}<span v-if="app.restarts > 0" aria-hidden="true"> ▲</span>
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
  border-radius: var(--radius-md);
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
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 10px;
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
</style>
