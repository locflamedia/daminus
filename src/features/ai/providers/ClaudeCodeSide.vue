<!--
  The right column of board 09b: the honest warning with the "I understand" switch that gates
  everything, the one-glance comparison with an API key, and what each way of failing says.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAiProvidersStore } from '@/stores/ai-providers'
import UiIcon from '@/ui/UiIcon.vue'
import UiSwitch from '@/ui/UiSwitch.vue'

const { t } = useI18n()
const store = useAiProvidersStore()

const POLICY = 'https://www.anthropic.com/legal'
const ROWS = [
  ['billing', 'perToken', 'planLimits'],
  ['setup', 'keyInKeychain', 'yourLogin'],
  ['status', 'supported', 'experimental'],
] as const
const FAILS = [
  { id: 'notFound', icon: 'close', tone: 'crit' },
  { id: 'notSignedIn', icon: 'lock', tone: 'warn' },
  { id: 'limit', icon: 'clock', tone: 'quiet' },
] as const
</script>

<template>
  <div class="side">
    <section class="card warning" :aria-label="t('aiClaudeCode.warning.title')">
      <h3 class="ct"><UiIcon name="warn" :size="16" />{{ t('aiClaudeCode.warning.title') }}</h3>
      <p class="body">{{ t('aiClaudeCode.warning.body') }}</p>
      <UiSwitch
        :model-value="store.view?.claude_code_ack ?? false"
        :label="t('aiClaudeCode.warning.ack')"
        @update:model-value="store.setAcknowledged($event)"
      />
      <a class="link" :href="POLICY" target="_blank" rel="noopener noreferrer">
        {{ t('aiClaudeCode.warning.policy') }} ›
      </a>
    </section>

    <section class="card" :aria-label="t('aiClaudeCode.compare.title')">
      <h3 class="sect">{{ t('aiClaudeCode.compare.title') }}</h3>
      <div class="cmp head">
        <span />
        <b>{{ t('aiClaudeCode.compare.apiKey') }}</b>
        <b>{{ t('aiClaudeCode.name') }}</b>
      </div>
      <div v-for="[label, api, cli] in ROWS" :key="label" class="cmp">
        <span class="k">{{ t(`aiClaudeCode.compare.${label}`) }}</span>
        <span :class="{ ok: label === 'status' }">{{ t(`aiClaudeCode.compare.${api}`) }}</span>
        <span :class="{ warn: label === 'status' }">{{ t(`aiClaudeCode.compare.${cli}`) }}</span>
      </div>
    </section>

    <section class="card grow" :aria-label="t('aiClaudeCode.cannot.title')">
      <h3 class="sect">{{ t('aiClaudeCode.cannot.title') }}</h3>
      <div v-for="fail in FAILS" :key="fail.id" class="fail">
        <span class="ft" :class="fail.tone">
          <UiIcon :name="fail.icon" :size="14" />{{ t(`aiClaudeCode.cannot.${fail.id}`) }}
        </span>
        <span class="fb">{{ t(`aiClaudeCode.cannot.${fail.id}Body`) }}</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.side {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: var(--space-4);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: var(--shadow-hairline);
}

.card.grow {
  flex: 1 1 auto;
}

.warning {
  gap: 10px;
  background: linear-gradient(180deg, var(--warn-soft), var(--surface-0) 110px);
}

.ct {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--warn-ink);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.ct :deep(svg) {
  color: var(--warn-ink);
}

.body {
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.5;
}

.link {
  color: var(--accent-ink);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.sect {
  padding-bottom: 4px;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.cmp {
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-2);
  align-items: center;
  min-height: 26px;
  font-size: var(--text-12);
}

.cmp b {
  font-weight: var(--weight-medium);
}

.k {
  color: var(--ink-3);
}

.ok {
  color: var(--ok-ink);
}

.warn {
  color: var(--warn-ink);
}

.fail {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--surface-well);
}

.ft {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.ft.crit {
  color: var(--crit-ink);
}

.ft.warn {
  color: var(--warn-ink);
}

.ft.quiet {
  color: var(--ink-3);
}

.fb {
  color: var(--ink-2);
  font-size: var(--text-11);
  line-height: 1.45;
}
</style>
