<!--
  The one-time steps that make a server visible to plain ssh: the key as a file, the key in the
  agent (remembered by Keychain), and one Host block per server. Only the steps whose row was
  missing are drawn and they are numbered from 1. Commands are shown whole and copied whole;
  Daminus never runs them.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { I18nT, useI18n } from 'vue-i18n'
import { shellQuote } from '@/lib/host-test'
import UiCard from '@/ui/UiCard.vue'
import UiCommandCopy from '@/ui/UiCommandCopy.vue'
import type { HelpView } from '../empty-state'

const props = defineProps<{
  steps: HelpView['steps']
  /** Termius is installed: the first step speaks of exporting from it. */
  termius: boolean
  /** The alias the test command and the Host block use. */
  alias: string
}>()

const { t } = useI18n()

/** The usual file name; the app only knows how many keys the agent holds, never which. */
const KEY_FILE = '~/.ssh/id_ed25519'
const LOCK_KEY = `chmod 600 ${KEY_FILE}`
const ADD_KEY = `ssh-add --apple-use-keychain ${KEY_FILE}`

const test = computed(() => `ssh ${shellQuote(props.alias)}`)
const list = computed(() => {
  const out: ('key' | 'agent' | 'describe' | 'add')[] = []
  if (props.steps.key) out.push('key')
  if (props.steps.agent) out.push('agent')
  if (props.steps.block) out.push(props.steps.block)
  return out
})
</script>

<template>
  <UiCard as="section" class="steps" :aria-label="t('empty.help.step.key.title')">
    <ol>
      <li v-for="(id, i) in list" :key="id" class="step">
        <span class="n" aria-hidden="true">{{ i + 1 }}</span>
        <div class="body">
          <b>{{ t(`empty.help.step.${id}.title`) }}</b>
          <template v-if="id === 'key'">
            <span>{{
              termius ? t('empty.help.step.key.body') : t('empty.help.step.key.bodyPlain')
            }}</span>
            <UiCommandCopy :command="LOCK_KEY" />
          </template>
          <UiCommandCopy v-else-if="id === 'agent'" :command="ADD_KEY" />
          <I18nT v-else :keypath="`empty.help.step.${id}.body`" tag="span" scope="global">
            <template #config><span class="mono">~/.ssh/config</span></template>
            <template #test
              ><span class="mono">{{ test }}</span></template
            >
          </I18nT>
        </div>
      </li>
    </ol>
  </UiCard>
</template>

<style scoped>
.steps {
  --card-gap: var(--space-3);
}

ol {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.step {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: var(--space-3);
  align-items: start;
}

.n {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--btn);
  color: var(--btn-ink);
  font-size: var(--text-12);
  font-weight: var(--weight-semibold);
}

.body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.body b {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.body > span {
  color: var(--ink-3);
  font-size: var(--text-12);
  line-height: 1.45;
}

.mono {
  font-size: var(--text-12);
}
</style>
