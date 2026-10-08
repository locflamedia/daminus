<!--
  What is inside a finding, from the board "Project · Security": the evidence on dark, the footer
  of a list that was cut ("Showing 50 of 137 · newest first"), then two plain lines (what it
  means, what to do next) beside the buttons that copy a command. Daminus never runs a command:
  it shows it, and what is copied is what is shown.
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCopy } from '@/lib/use-copy'
import { cleanCommand } from '@/lib/command-safety'
import { cutList, type Finding } from '@/lib/security-findings'
import { dayTime } from '@/lib/security-format'
import { NGINX_DENY_DOTFILES, NGINX_DENY_UPLOAD_PHP, scpCommand } from '@/lib/security-commands'
import { useSettingsStore } from '@/stores/settings'
import UiButton from '@/ui/UiButton.vue'
import UiCommandCopy from '@/ui/UiCommandCopy.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiTlsChip from '@/ui/UiTlsChip.vue'
import SecurityEvidence from './SecurityEvidence.vue'

const props = defineProps<{ finding: Finding }>()

const { t } = useI18n()
const settings = useSettingsStore()

const id = computed(() => props.finding.check.replace('.', '_'))
const evidence = computed(() => props.finding.evidence)
const cut = computed(() => cutList(evidence.value))

const newest = computed(() => {
  const e = evidence.value
  return e.kind === 'files' ? e.files[0] : undefined
})

const doText = computed(() => {
  const when = newest.value?.mtime
  const key = `projectSecurity.do.${id.value}`
  return t(key, { when: when ? dayTime(when, settings.language) : '' })
})

const miner = computed(() => {
  const e = evidence.value
  return e.kind === 'miner' && e.seen !== null && e.total !== null && e.seen < e.total ? e : null
})

const isExposed = computed(() => props.finding.check === 'url.exposed')
const tlsItem = computed(() => (evidence.value.kind === 'tls' ? evidence.value.item : null))

/** The commands this finding can hand over; each is a label and the text to copy. */
const commands = computed(() => {
  const out: { id: string; label: string; command: string }[] = []
  if (props.finding.check === 'sec.upload_php' && newest.value) {
    const scp = scpCommand(props.finding.items[0]?.key.host ?? '', newest.value.path)
    if (scp) out.push({ id: 'scp', label: t('projectSecurity.card.copyScp'), command: scp })
  }
  if (isExposed.value) {
    out.push({
      id: 'nginx',
      label: t('projectSecurity.card.copyNginxFix'),
      command: NGINX_DENY_DOTFILES,
    })
  }
  if (props.finding.check === 'sec.upload_php') {
    out.push({
      id: 'rule',
      label: t('projectSecurity.first.copyRule'),
      command: NGINX_DENY_UPLOAD_PHP,
    })
  }
  return out
})

const { copy } = useCopy()
const shown = ref<string | null>(null)

/** Copies the cleaned command and keeps it on screen, so what was copied can be read. */
async function copyCommand(command: { id: string; command: string }) {
  shown.value = command.id
  await copy(cleanCommand(command.command).text)
}

const shownCommand = computed(() => commands.value.find((c) => c.id === shown.value))
const tone = computed(() => props.finding.level)
</script>

<template>
  <div class="body">
    <div v-if="tlsItem" class="tls"><UiTlsChip :item="tlsItem" detail /></div>
    <SecurityEvidence v-else :evidence="evidence" :check="finding.check" />

    <div v-if="cut" class="cut">
      <span
        >{{ t('projectSecurity.cut.showing') }}
        <b>{{ t('projectSecurity.cut.showingOf', cut) }}</b> ·
        {{ t('projectSecurity.cut.newestFirst') }}</span
      >
      <span class="rest">{{
        t('projectSecurity.cut.notListed', { n: cut.total - cut.listed })
      }}</span>
    </div>

    <p v-if="miner" class="coverage">
      <b>{{
        t('projectSecurity.card.checkedProcesses', { seen: miner.seen, total: miner.total })
      }}</b>
      · {{ t('projectSecurity.card.checkedProcessesWhy') }}
    </p>

    <div class="foot">
      <div class="what" :class="`tone-${tone}`">
        <UiIcon name="info" :size="16" class="mark" />
        <span>{{ t(`projectSecurity.means.${id}`) }}</span>
        <UiIcon name="chevron-right" :size="16" class="step" />
        <span>{{ doText }}</span>
        <template v-if="isExposed">
          <UiIcon name="info" :size="16" class="step" />
          <span
            ><b>{{ t('projectSecurity.exposed.whyNoMarkLead') }}</b>
            {{ t('projectSecurity.exposed.whyNoMark') }}</span
          >
        </template>
      </div>
      <div v-if="commands.length > 0 || isExposed" class="actions">
        <UiButton
          v-for="c in commands"
          :key="c.id"
          size="small"
          icon="copy"
          :aria-expanded="shown === c.id"
          @click="copyCommand(c)"
          >{{ c.label }}</UiButton
        >
        <span v-if="isExposed" class="nomark"
          ><UiIcon name="info" :size="12" />{{ t('projectSecurity.exposed.noMarkLine') }}</span
        >
      </div>
    </div>
    <UiCommandCopy v-if="shownCommand" :command="shownCommand.command" />
  </div>
</template>

<style scoped>
.body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.tls {
  padding: 2px 0;
}

.cut {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 30px;
  padding: 0 10px;
  border-radius: var(--radius-xs);
  background: var(--surface-1);
  color: var(--ink-3);
  font-size: var(--text-11);
}

.cut b {
  color: var(--ink);
  font-weight: var(--weight-medium);
}

.cut .rest {
  margin-left: auto;
}

.coverage {
  margin: 0;
  color: var(--warn-ink);
  font-size: var(--text-11);
  line-height: 1.45;
}

.coverage b {
  font-weight: var(--weight-medium);
}

.foot {
  display: grid;
  grid-template-columns: minmax(0, 1fr) fit-content(240px);
  gap: var(--space-4);
  align-items: end;
}

.what {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 6px var(--space-2);
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.45;
}

.what b {
  color: var(--ink);
  font-weight: var(--weight-medium);
}

.what .mark {
  color: var(--ink-3);
}

.what.tone-crit .mark {
  color: var(--crit-ink);
}

.what.tone-warn .mark {
  color: var(--warn-ink);
}

.what.tone-info .mark {
  color: var(--info-ink);
}

.what .step {
  color: var(--ink-2);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
}

.nomark {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-3);
  font-size: var(--text-11);
}

.nomark .icon {
  color: var(--ink-4);
}
</style>
