<!--
  One host of the scan panel (board "Scan panel"): its state, the server mark, the name with the
  projects that use it, and what it has to say at the right. The host being read opens into its
  steps so the list stays short; a host that failed says why and offers a retry. The steps follow
  the groups the scan reads in order; no time per step is measured, so none is drawn.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PanelHost } from './scan-panel-model'
import ScanPanelMark, { type MarkState } from './ScanPanelMark.vue'
import UiButton from '@/ui/UiButton.vue'
import UiIcon from '@/ui/UiIcon.vue'

const props = defineProps<{
  host: PanelHost
  /** A retry only starts once the scan has ended. */
  canRetry: boolean
}>()

const emit = defineEmits<{ retry: [host: string] }>()

const { t } = useI18n()

const mark = computed<MarkState>(() => {
  const s = props.host.segment
  return s === 'reading' ? 'running' : s === 'failed' ? 'failed' : s === 'done' ? 'done' : 'waiting'
})

const markLabel = computed(() => t(`scanPanel.mark.${props.host.segment}`))

const where = computed(() =>
  props.host.projects.length > 0 ? props.host.projects.join(' · ') : t('scanPanel.noProject'),
)

const sub = computed(() => {
  const h = props.host
  if (h.segment === 'failed') return `${where.value} · ${t(`scanHost.${h.detail}`)}`
  if (h.detail === 'partial') return `${where.value} · ${t('scanHost.partial')}`
  return where.value
})

const side = computed(() => {
  const h = props.host
  if (h.segment === 'done') return t('scanPanel.checks', { n: h.facts }, h.facts)
  if (h.segment === 'reading') return h.agentWait ? t('scanHost.agent_wait') : t('scanChip.reading')
  if (h.segment === 'waiting') return t('scanPanel.waitSlot')
  return ''
})

function stepState(s: { state: string }): MarkState {
  return s.state === 'done' ? 'done' : s.state === 'running' ? 'running' : 'waiting'
}
</script>

<template>
  <li class="host m-enter">
    <div class="line">
      <ScanPanelMark :state="mark" :label="markLabel" />
      <UiIcon name="server" :size="16" class="logo" />
      <div class="names">
        <b class="name mono">{{ host.host }}</b>
        <span class="sub" :class="{ bad: host.segment === 'failed' }">{{ sub }}</span>
      </div>
      <UiButton
        v-if="host.segment === 'failed'"
        size="small"
        icon="refresh"
        :disabled="!canRetry"
        :disabled-reason="canRetry ? undefined : t('scanPanel.retryLater')"
        @click="emit('retry', host.host)"
      >
        {{ t('scanPanel.retry') }}
      </UiButton>
      <span v-else class="side mono">{{ side }}</span>
    </div>
    <ul v-if="host.expanded" class="steps">
      <li
        v-for="step in host.steps"
        :key="step.id"
        class="step"
        :class="{ waiting: step.state === 'waiting' }"
      >
        <ScanPanelMark :state="stepState(step)" :label="t(`scanPanel.mark.${stepState(step)}`)" />
        <span class="title" :class="{ now: step.state === 'running' }">{{
          t(`scanPanel.step.${step.id}`)
        }}</span>
        <span v-if="step.state === 'running'" class="note mono">
          {{ step.agentWait ? t('scanHost.agent_wait') : t('scanChip.reading') }}
        </span>
      </li>
    </ul>
  </li>
</template>

<style scoped>
.host {
  display: flex;
  flex-direction: column;
  list-style: none;
}

.line {
  display: grid;
  grid-template-columns: 20px 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 44px;
}

.logo {
  color: var(--ink-3);
}

.names {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.name {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
  line-height: normal;
}

.sub {
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub.bad {
  color: var(--crit-ink);
}

.side {
  color: var(--ink-3);
  font-size: var(--text-11);
  white-space: nowrap;
}

.steps {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 4px 0 2px 30px;
  padding: var(--space-2) var(--space-3);
  border-radius: 12px;
  background: var(--surface-well);
  list-style: none;
}

.step {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 28px;
  font-size: var(--text-12);
}

.step.waiting {
  color: var(--ink-3);
}

.title.now {
  font-weight: var(--weight-medium);
}

.note {
  color: var(--accent-ink);
  font-size: var(--text-11);
  text-align: right;
}
</style>
