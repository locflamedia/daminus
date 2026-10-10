<!--
  The help screen of an app with no project, for a Mac whose ssh is not ready: no `~/.ssh/config`
  (or one with no host Daminus can use) and/or an ssh-agent with no key. It says what exists,
  shows the steps that make servers visible to plain ssh, builds the Host block live, and checks
  again. Only the rows that were missing, and their steps, are
  drawn. "Import" turns live once the config has a host and the agent a key.
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { I18nT, useI18n } from 'vue-i18n'
import HostBlockForm from '@/features/setup/components/HostBlockForm.vue'
import { EXAMPLES, buildHostBlock, emptyFields, type HostBlockFields } from '@/lib/host-block'
import { vEnter } from '@/lib/motion'
import { useSetupStore } from '@/stores/setup'
import UiButton from '@/ui/UiButton.vue'
import UiIcon from '@/ui/UiIcon.vue'
import HelpFound from './components/HelpFound.vue'
import HelpSteps from './components/HelpSteps.vue'
import HelpTest from './components/HelpTest.vue'
import type { HelpView } from './empty-state'

const props = defineProps<{ view: HelpView }>()
defineEmits<{ import: []; add: []; recheck: [] }>()

const { t } = useI18n()
const setup = useSetupStore()

const fields = ref<HostBlockFields>(emptyFields())

/** The test line and the steps speak of the alias being typed, once it is a valid one. */
const alias = computed(() => {
  const block = buildHostBlock(fields.value)
  const typed = fields.value.alias.trim()
  return typed !== '' && block.errors.alias === undefined ? typed : EXAMPLES.alias
})

const names = computed(() => setup.entries.map((e) => e.host.alias))
const stepCount = computed(() => props.view.stepCount)
const agentStep = computed(() => (props.view.steps.agent ? (props.view.steps.key ? 2 : 1) : null))
const importLabel = computed(() =>
  t('empty.help.importHosts', { n: props.view.hosts }, props.view.hosts),
)
</script>

<template>
  <div class="help">
    <div class="left">
      <header v-enter class="top">
        <span class="mark">
          <UiIcon
            :name="view.headline === 'noConfig' ? 'terminal' : 'server'"
            :size="26"
            :stroke="1.4"
          />
        </span>
        <div class="words">
          <h2>{{ t(`empty.help.headline.${view.headline}`, { n: view.hosts }, view.hosts) }}</h2>
          <I18nT v-if="stepCount === 3" keypath="empty.help.subtitle" tag="p" scope="global">
            <template #ssh><span class="mono">ssh</span></template>
          </I18nT>
          <I18nT
            v-else-if="stepCount > 0"
            keypath="empty.help.subtitleFew"
            tag="p"
            scope="global"
            :plural="stepCount"
          >
            <template #ssh><span class="mono">ssh</span></template>
            <template #n>{{ stepCount }}</template>
          </I18nT>
        </div>
      </header>

      <div v-enter="{ index: 1 }" class="cards">
        <HelpFound :view="view" :names="names" :busy="setup.loading" @recheck="$emit('recheck')" />
        <HelpSteps v-if="stepCount > 0" :steps="view.steps" :done="view.done" :alias="alias" />
        <HelpTest :alias="alias" :agent-step="agentStep" />
      </div>
    </div>

    <div v-enter="{ index: 2 }" class="right">
      <HostBlockForm v-if="view.steps.block" v-model="fields" />
      <span v-else class="grow" />
      <div class="buttons">
        <UiButton class="by-hand" @click="$emit('add')">{{ t('empty.byHand') }}</UiButton>
        <UiButton
          class="import"
          variant="primary"
          lifted
          shortcut="⏎"
          :disabled="!view.canImport"
          :disabled-reason="view.canImport ? undefined : t('empty.help.importOff')"
          @click="$emit('import')"
        >
          {{ importLabel }}
        </UiButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.help {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 420px;
  gap: var(--space-5);
  flex: 1 0 auto;
  min-width: 0;
}

.left,
.right {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.top {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.mark {
  display: grid;
  flex: none;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: linear-gradient(150deg, var(--wash-1), var(--wash-2) 55%, var(--wash-3));
  box-shadow: 0 16px 32px -16px color-mix(in srgb, var(--accent) 55%, transparent);
  color: var(--on-solid);
  animation: float 6s var(--ease-in-out) 1;
}

.words {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

h2 {
  font-size: 22px;
  font-weight: var(--weight-medium);
  letter-spacing: -0.022em;
  line-height: 1.2;
}

.words p {
  color: var(--ink-2);
  font-size: var(--text-13);
  line-height: 1.5;
}

.cards {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-3);
}

.cards > :deep(.card) {
  flex: none;
}

.grow {
  flex: 1 1 auto;
}

.buttons {
  display: flex;
  gap: var(--space-2);
}

.buttons > * {
  flex: 1;
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .mark {
    animation: none;
  }
}
</style>
