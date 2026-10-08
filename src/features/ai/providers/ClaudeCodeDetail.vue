<!--
  Claude Code (Beta), the left card of board 09b: what Daminus found (the program, the sign-in,
  what it never reads), the model that is passed through, the exact way it is called and the
  test. Everything below the warning stays dimmed and out of reach until "I understand".
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AiProviderEntry } from '@/api/bindings/AiProviderEntry'
import { useAiProvidersStore } from '@/stores/ai-providers'
import UiButton from '@/ui/UiButton.vue'
import UiChip from '@/ui/UiChip.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiSeg from '@/ui/UiSeg.vue'
import { formatNumber } from '@/lib/format'
import { isActive } from './provider-state'

const props = defineProps<{ entry: AiProviderEntry }>()
const { t } = useI18n()
const store = useAiProvidersStore()

const view = computed(() => store.view)
const claude = computed(() => view.value?.claude_code)
const ack = computed(() => view.value?.claude_code_ack ?? false)
const active = computed(() => (view.value ? isActive(props.entry, view.value) : false))
const state = computed(() => store.tests['claude-code'])
const model = computed(
  () => (view.value?.provider === 'claude-code' ? view.value.model : null) ?? 'default',
)

const models = computed(() => [
  { value: 'default', label: t('aiClaudeCode.modelDefault') },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
])

function pick(value: string) {
  void store.setModel(value === 'default' ? null : value)
}
</script>

<template>
  <section class="card" :aria-label="t('aiClaudeCode.name')">
    <header class="head">
      <span class="mark" aria-hidden="true">C</span>
      <div class="who">
        <b class="name"
          >{{ t('aiClaudeCode.name') }} <span class="beta">{{ t('aiClaudeCode.beta') }}</span></b
        >
        <span class="sub">{{ t('aiClaudeCode.sub') }}</span>
      </div>
      <UiChip v-if="active" tone="info" size="large" class="status">{{
        t('aiProviders.active')
      }}</UiChip>
    </header>

    <dl v-if="claude" class="facts">
      <div class="fld">
        <dt>{{ t('aiClaudeCode.program') }}</dt>
        <dd v-if="claude.found" class="mono">
          {{ t('aiClaudeCode.programFound', { version: claude.version ?? '' }) }}
        </dd>
        <dd v-else class="bad">
          <UiIcon name="close" :size="14" />{{ t('aiClaudeCode.programMissing') }}
          <UiButton variant="link" @click="store.load()">{{
            t('aiClaudeCode.checkAgain')
          }}</UiButton>
        </dd>
      </div>
      <div class="fld">
        <dt>{{ t('aiClaudeCode.signedIn') }}</dt>
        <dd v-if="claude.found && claude.logged_in">
          {{
            t('aiClaudeCode.signedInValue', {
              method: claude.auth_method ?? t('aiClaudeCode.name'),
            })
          }}
        </dd>
        <dd v-else-if="claude.found" class="warn">
          <UiIcon name="lock" :size="14" />{{ t('aiClaudeCode.signedInNo') }}
          <UiButton variant="link" @click="store.load()">{{
            t('aiClaudeCode.checkAgain')
          }}</UiButton>
        </dd>
        <dd v-else class="quiet">–</dd>
      </div>
      <div class="fld">
        <dt>{{ t('aiClaudeCode.reads') }}</dt>
        <dd>{{ t('aiClaudeCode.readsValue') }}</dd>
      </div>
    </dl>

    <div class="gated" :inert="!ack" :class="{ dim: !ack }">
      <div class="rowx">
        <div>
          <b>{{ t('aiClaudeCode.model') }}</b>
          <span class="lbl">{{ t('aiClaudeCode.modelDesc') }}</span>
        </div>
        <UiSeg
          :model-value="model"
          :options="models"
          :label="t('aiClaudeCode.modelName')"
          semantics="radio"
          @update:model-value="pick"
        />
      </div>

      <div class="how">
        <span class="sect">{{ t('aiClaudeCode.how') }}</span>
        <div class="cmd">
          <span class="dollar">$</span>
          <span class="text"
            >claude -p --output-format json --model {{ model }} &lt; redacted-payload.json</span
          >
        </div>
        <span class="lbl">{{ t('aiClaudeCode.howNote') }}</span>
      </div>

      <div class="test">
        <UiButton
          :icon="state?.phase === 'ok' ? undefined : 'start'"
          :busy="state?.phase === 'busy'"
          :disabled-reason="ack ? undefined : t('aiClaudeCode.test.needsAck')"
          @click="store.test('claude-code')"
        >
          <template v-if="state?.phase === 'busy'">{{ t('aiClaudeCode.test.busy') }}</template>
          <span v-else-if="state?.phase === 'ok'" class="done">
            <UiIcon name="check" :size="16" :stroke="2" class="okmark" />{{
              t('aiClaudeCode.test.works', { s: formatNumber(Math.round(state.ms / 100) / 10) })
            }}
          </span>
          <template v-else>{{ t('aiClaudeCode.test.button') }}</template>
        </UiButton>
        <span class="line" role="status" aria-live="polite">
          <span v-if="state?.phase === 'fail'" class="bad">{{ state.message }}</span>
          <span v-else-if="state?.phase === 'ok'">{{ t('aiClaudeCode.test.counted') }}</span>
          <span v-else>{{ t('aiClaudeCode.test.idle') }}</span>
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  align-self: stretch;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-4);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: var(--shadow-hairline);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.mark {
  display: grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--surface-well);
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
}

.who {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.name {
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
}

.beta {
  padding: 0 6px;
  border-radius: 6px;
  background: var(--warn-soft);
  color: var(--warn-ink);
  font-size: 10px;
  line-height: 18px;
}

.sub,
.lbl,
.quiet {
  color: var(--ink-3);
  font-size: var(--text-12);
}

.status {
  margin-left: auto;
}

.facts {
  display: flex;
  flex-direction: column;
}

.fld {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: var(--space-3);
  align-items: center;
  min-height: 34px;
  font-size: var(--text-12);
}

.fld dt {
  color: var(--ink-3);
}

.fld dd {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
}

.mono {
  font-family: var(--font-mono);
}

.bad {
  color: var(--crit-ink);
}

.warn {
  color: var(--warn-ink);
}

.gated {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.gated.dim {
  opacity: 0.5;
}

.rowx {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-4);
  align-items: center;
  min-height: 40px;
}

.rowx b {
  display: block;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.how {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sect {
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.cmd {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border-radius: 9px;
  background: var(--code);
  color: var(--code-ink);
  font: 400 var(--text-12) var(--font-mono);
}

.dollar {
  color: var(--code-dim);
}

.text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.test {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--surface-well);
}

.line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  font-size: var(--text-12);
  color: var(--ink-2);
}

.done {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--ok-ink);
}
</style>
