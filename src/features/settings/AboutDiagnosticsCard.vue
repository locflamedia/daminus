<!--
  Diagnostics: whether an SSH agent answers, and a button that copies the text for a bug
  report. The text is built in the core with secrets removed; it is copied, never sent.
-->
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAboutStore } from '@/stores/about'
import UiButton from '@/ui/UiButton.vue'
import UiChip, { type ChipTone } from '@/ui/UiChip.vue'
import SettingsCard from './SettingsCard.vue'
import SettingsRow from './SettingsRow.vue'

const { t } = useI18n()
const about = useAboutStore()

const agent = computed((): { tone: ChipTone; text: string } | null => {
  if (about.agentFailed)
    return { tone: 'neutral', text: t('settingsAbout.diagnostics.agentUnknown') }
  const status = about.agent
  if (!status) return null
  if (!status.present) return { tone: 'warn', text: t('settingsAbout.diagnostics.agentNone') }
  if (!status.has_keys) return { tone: 'warn', text: t('settingsAbout.diagnostics.agentEmpty') }
  return {
    tone: 'ok',
    text: t('settingsAbout.diagnostics.agentKeys', { n: status.keys }, status.keys),
  }
})

onMounted(() => void about.loadAgent())
</script>

<template>
  <SettingsCard :title="t('settingsAbout.diagnostics.title')" tight>
    <SettingsRow :title="t('settingsAbout.diagnostics.agent')">
      <UiChip v-if="agent" :tone="agent.tone">{{ agent.text }}</UiChip>
    </SettingsRow>
    <SettingsRow
      :title="t('settingsAbout.diagnostics.copy')"
      :hint="t('settingsAbout.diagnostics.copyHint')"
    >
      <UiButton icon="copy" :busy="about.copying" @click="about.copyDiagnostics()">
        {{ t('settingsAbout.diagnostics.copy') }}
      </UiButton>
    </SettingsRow>
  </SettingsCard>
</template>
