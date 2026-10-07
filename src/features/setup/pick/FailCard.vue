<!--
  The card a failed login test opens under its row, inline and never a modal: the plain reason
  for the outcome, the one line that fixes it (copy only), and Skip host or Retry. A host key
  that is not trusted yet shows the fingerprint the server offers. The raw ssh message is not
  available to the app, only the outcome, so the sentence is the reason.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { HostKeyInfo, HostOutcome } from '@/api'
import { CONNECT_TIMEOUT_S, type CardKind, type HostRowModel, netReason } from '@/lib/host-rows'
import { addKeyCommand, shellQuote } from '@/lib/host-test'
import UiButton from '@/ui/UiButton.vue'
import CopyLine from './CopyLine.vue'

const props = defineProps<{
  row: HostRowModel
  kind: CardKind
  outcome: HostOutcome | null
  hostKey: HostKeyInfo | null
}>()
const emit = defineEmits<{ skip: []; retry: [] }>()

const { t } = useI18n()

const warn = computed(() => props.kind === 'host_key_unknown')
const keyCommand = computed(() => addKeyCommand(props.row.identityFiles))

const offered = computed(() => {
  const fromOutcome =
    props.outcome &&
    (props.outcome.state === 'host_key_unknown' || props.outcome.state === 'host_key_changed')
      ? props.outcome.fp
      : null
  return props.hostKey?.offered ?? fromOutcome
})

const sentence = computed(() => {
  switch (props.kind) {
    case 'key_rejected':
      return keyCommand.value
        ? t('setupPick.fail.key_rejected')
        : t('setupPick.fail.key_rejected_nokey')
    case 'unreachable': {
      const cause = props.outcome?.state === 'unreachable' ? props.outcome.cause : null
      return t(`setupPick.fail.unreachable.${netReason(cause)}`)
    }
    case 'timed_out':
      return t('setupPick.fail.timed_out', { n: CONNECT_TIMEOUT_S })
    case 'host_key_unknown':
      return t('setupPick.fail.host_key_unknown')
    default:
      return t('setupPick.fail.host_key_changed')
  }
})

// A host key that is not trusted yet is accepted by connecting once by hand; a changed one is
// not something to paste a command for.
const command = computed(() => {
  if (props.kind === 'key_rejected') return keyCommand.value
  if (props.kind === 'host_key_unknown') return `ssh ${shellQuote(props.row.alias)}`
  return null
})
</script>

<template>
  <div class="card" :class="{ warn }" role="group" :aria-label="row.alias">
    <div class="text">
      <span v-if="offered" class="fp">
        {{ t('setupPick.fail.offered') }} <span class="mono">{{ offered }}</span>
      </span>
      <template v-if="kind === 'host_key_changed' && hostKey && hostKey.known.length > 0">
        <span v-for="known in hostKey.known" :key="known" class="fp">
          {{ t('setupPick.fail.known') }} <span class="mono">{{ known }}</span>
        </span>
      </template>
      <span class="reason">{{ sentence }}</span>
      <CopyLine v-if="command" :command="command" />
      <span v-if="kind === 'key_rejected'" class="termius">
        <i18n-t
          scope="global"
          :keypath="keyCommand ? 'setupPick.fail.termius' : 'setupPick.fail.termiusNoLine'"
          tag="span"
        >
          <template #dir><span class="mono">~/.ssh/</span></template>
        </i18n-t>
      </span>
    </div>
    <div class="actions">
      <UiButton class="skip" @click="emit('skip')">{{ t('setupPick.fail.skip') }}</UiButton>
      <UiButton icon="refresh" @click="emit('retry')">{{ t('setupPick.fail.retry') }}</UiButton>
    </div>
  </div>
</template>

<style scoped>
.card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-4);
  align-items: center;
  margin: 0 var(--space-4) var(--space-4) 48px;
  padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  background: var(--crit-soft);
}

.card.warn {
  background: var(--warn-soft);
}

.text {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.fp {
  color: var(--ink-2);
  font-size: var(--text-11);
  overflow-wrap: anywhere;
}

.fp .mono {
  color: var(--crit-ink);
}

.warn .fp .mono {
  color: var(--warn-ink);
}

.reason {
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.45;
}

.termius {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-2);
  font-size: var(--text-11);
}

.skip {
  --bg: color-mix(in srgb, var(--surface-0) 70%, transparent);
  --shadow: none;
}

.actions {
  display: flex;
  gap: var(--space-2);
}
</style>
