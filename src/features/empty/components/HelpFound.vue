<!--
  "What Daminus found on this Mac": the ssh config, the ssh-agent and Termius, each in a row
  that says what exists. Only the rows that were missing are drawn (the Termius row only when
  Termius is installed), and "Check again" reads all of them again. Termius reads "not read" in
  neutral grey. When the config is there but nothing in it is usable, the entries that were left
  out are listed under its row.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import type { HelpView } from '../empty-state'
import HelpLeftOut from './HelpLeftOut.vue'
import HelpRow from './HelpRow.vue'

const props = defineProps<{
  view: HelpView
  /** The aliases the config lists, for the sentence of a config that works. */
  names: readonly string[]
  busy: boolean
}>()
defineEmits<{ recheck: [] }>()

const { t } = useI18n()

/** Shown in the sentence; the rest is counted by the chip. */
const NAMES_SHOWN = 3

const config = computed(() => {
  const v = props.view
  if (v.config === 'missing') {
    return {
      sub: t('empty.help.config.missing'),
      chip: t('empty.help.config.missingChip'),
      tone: 'warn' as const,
    }
  }
  if (v.config === 'unusable') {
    return {
      sub: t('empty.help.config.unusable'),
      chip: t('empty.help.config.unusableChip', { n: v.entries }, v.entries),
      tone: 'warn' as const,
    }
  }
  const shown = props.names.slice(0, NAMES_SHOWN).join(', ')
  const names = props.names.length > NAMES_SHOWN ? `${shown}, …` : shown
  return {
    sub: t('empty.help.config.ok', { n: v.hosts, names }, v.hosts),
    chip: t('empty.help.config.okChip', { n: v.hosts }, v.hosts),
    tone: 'ok' as const,
  }
})

const agent = computed(() => {
  const v = props.view
  if (v.agent === 'keys') {
    return {
      sub: t('empty.help.agent.ok', { n: v.keys }, v.keys),
      chip: t('empty.help.agent.okChip', { n: v.keys }, v.keys),
      tone: 'ok' as const,
    }
  }
  const kind = v.agent === 'unavailable' ? 'unavailable' : 'empty'
  return {
    sub: t(`empty.help.agent.${kind}`),
    chip: t(`empty.help.agent.${kind}Chip`),
    tone: 'warn' as const,
  }
})
</script>

<template>
  <UiCard class="found" as="section" :aria-label="t('empty.help.found.title')">
    <header class="head">
      <h3>{{ t('empty.help.found.title') }}</h3>
      <UiButton size="small" :busy="busy" shortcut="⇧⌘R" @click="$emit('recheck')">
        {{ busy ? t('empty.help.found.checking') : t('empty.help.found.checkAgain') }}
      </UiButton>
    </header>
    <ul class="rows">
      <HelpRow v-if="view.rows.config" icon="file" name="~/.ssh/config" v-bind="config" />
      <HelpRow v-if="view.rows.agent" icon="lock" name="ssh-agent" v-bind="agent" />
      <HelpRow
        v-if="view.rows.termius"
        icon="terminal"
        name="Termius"
        :sub="t('empty.help.termius.body')"
        :chip="t('empty.help.termius.chip')"
        tone="neutral"
      />
    </ul>
    <HelpLeftOut
      v-if="view.leftOut.length > 0"
      :rows="view.leftOut"
      :busy="busy"
      @reread="$emit('recheck')"
    />
  </UiCard>
</template>

<style scoped>
.found {
  --card-gap: 6px;
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 2px 6px;
}

h3 {
  flex-grow: 1;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
