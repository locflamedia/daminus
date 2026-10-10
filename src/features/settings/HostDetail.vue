<!--
  Settings › Hosts, the open host: what ssh really uses for it (and the line of the config it
  came from), the recorded host key, what the SSH user may read, how long the connect took in
  the last scans, the switch "Include in scans" and the test.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatClock } from '@/lib/format'
import { shortDistro } from '@/lib/host-test'
import { failedChip, formatSeconds, shortFingerprint } from '@/lib/hosts-settings'
import { useHostsSettingsStore } from '@/stores/hosts-settings'
import { useSettingsStore } from '@/stores/settings'
import { useSetupStore } from '@/stores/setup'
import { brandOfDistro } from '@/ui/brand-marks'
import UiBrandMark from '@/ui/UiBrandMark.vue'
import UiButton from '@/ui/UiButton.vue'
import UiChip, { type ChipTone } from '@/ui/UiChip.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiSwitch from '@/ui/UiSwitch.vue'
import HostConnectTime from './HostConnectTime.vue'
import HostPermissions from './HostPermissions.vue'

const { t } = useI18n()
const store = useHostsSettingsStore()
const setup = useSetupStore()
const settings = useSettingsStore()

/** The rows `ssh -G` fills; they read Not read while it gives no answer. */
const UNREAD_FIELDS = ['HostName', 'User', 'Port', 'IdentityFile', 'ProxyJump'] as const

const row = computed(() => store.current)
const resolved = computed(() => store.entry?.resolved ?? null)
const login = computed(() => (row.value ? (setup.logins[row.value.alias]?.login ?? null) : null))
const answer = computed(() => (row.value ? setup.answers[row.value.alias] : undefined))
// "Not tested yet" belongs to Pick hosts; here a host no run has tested shows its saved state.
const chip = computed(() => {
  const now = row.value ? setup.chip(row.value.alias) : 'queued'
  return now === 'untested' ? 'queued' : now
})
const tested = computed(
  () => row.value !== null && (chip.value !== 'queued' || setup.queue.includes(row.value.alias)),
)
const running = computed(() => {
  const now = chip.value
  if (now === 'queued') return row.value !== null && setup.queue.includes(row.value.alias)
  return now === 'connecting' || now === 'agent_wait' || now === 'testing'
})

const TONES: Record<string, ChipTone> = {
  reached: 'ok',
  host_key_unknown: 'warn',
  host_key_changed: 'crit',
  key_rejected: 'crit',
  unreachable: 'crit',
  timed_out: 'crit',
}

const headChip = computed<{ tone: ChipTone; text: string; busy: boolean } | null>(() => {
  const r = row.value
  if (!r) return null
  if (tested.value) {
    const now = chip.value
    const time = answer.value?.ms != null ? formatSeconds(answer.value.ms, settings.language) : ''
    const text =
      now === 'reached' && time
        ? t('settingsHosts.detail.reachedIn', { time })
        : t(`setupPick.chip.${now}`)
    return { tone: TONES[now] ?? 'info', text, busy: running.value }
  }
  if (r.state === 'reached' && r.lastReached) {
    return {
      tone: 'ok',
      text: t('settingsHosts.detail.reachedAt', { time: formatClock(r.lastReached) }),
      busy: false,
    }
  }
  if (r.state !== 'failed') return null
  const failed = failedChip(r.outcome)
  return { tone: TONES[failed] ?? 'crit', text: t(`setupPick.chip.${failed}`), busy: false }
})

const system = computed(() => {
  const report = login.value?.login
  if (!report) return ''
  return `${shortDistro(report.distro)} · ${report.arch}`
})

/** The distribution's mark, once a login test has said which one it is. */
const osMark = computed(() => brandOfDistro(login.value?.login?.distro))

const agentText = computed(() => {
  const agent = store.agent
  if (!agent) return ''
  if (!agent.present) return t('settingsHosts.detail.agentNone')
  return agent.has_keys
    ? t('settingsHosts.detail.agentKeys', { n: agent.keys }, agent.keys)
    : t('settingsHosts.detail.agentEmpty')
})

const keyLine = computed(() => store.hostKey?.known[0] ?? null)
const keyState = computed(() => store.hostKey?.state ?? null)

const testLabel = computed(() => {
  if (running.value) return t('settingsHosts.detail.testing')
  const ms = answer.value?.ms
  return chip.value === 'reached' && ms != null
    ? t('settingsHosts.detail.testedIn', { time: formatSeconds(ms, settings.language) })
    : t('settingsHosts.detail.test')
})
</script>

<template>
  <section v-if="row" class="card" :aria-label="row.alias">
    <div class="head">
      <span class="tile" aria-hidden="true">
        <UiBrandMark :name="osMark" :size="22"><UiIcon name="server" :size="16" /></UiBrandMark>
      </span>
      <div class="id">
        <b class="mono alias">{{ row.alias }}</b>
        <span v-if="system" class="sys">{{ system }}</span>
      </div>
      <UiChip v-if="headChip" :tone="headChip.tone" :busy="headChip.busy" class="state">
        {{ headChip.text }}
      </UiChip>
    </div>

    <dl class="fields">
      <!-- ssh gave no answer for this host (a config it refuses): never show defaults. -->
      <template v-if="resolved">
        <div class="fld">
          <dt>HostName</dt>
          <dd class="mono">{{ resolved.hostname }}</dd>
        </div>
        <div class="fld">
          <dt>User</dt>
          <dd class="mono">{{ resolved.user ?? '—' }}</dd>
        </div>
        <div class="fld">
          <dt>Port</dt>
          <dd class="mono">{{ resolved.port }}</dd>
        </div>
        <div class="fld">
          <dt>IdentityFile</dt>
          <dd class="mono">
            {{ resolved.identity_files[0] ?? '—'
            }}<template v-if="agentText"> · {{ agentText }}</template>
          </dd>
        </div>
        <div class="fld">
          <dt>ProxyJump</dt>
          <dd class="mono">{{ resolved.proxy_jump ?? '—' }}</dd>
        </div>
      </template>
      <template v-else>
        <div v-for="name in UNREAD_FIELDS" :key="name" class="fld">
          <dt>{{ name }}</dt>
          <dd class="not-read">
            {{ t('settingsHosts.detail.notRead')
            }}<template v-if="name === 'IdentityFile' && agentText"> · {{ agentText }}</template>
          </dd>
        </div>
      </template>
      <div class="fld">
        <dt>{{ t('settingsHosts.detail.from') }}</dt>
        <dd>
          {{
            t('settingsHosts.detail.fromLine', {
              file: store.entry?.host.file ?? '',
              line: store.entry?.host.line ?? 0,
            })
          }}
        </dd>
      </div>
    </dl>

    <div class="key">
      <span class="key-title">{{ t('settingsHosts.detail.hostKey') }}</span>
      <span v-if="keyLine" class="mono fp" :title="keyLine">{{ shortFingerprint(keyLine) }}</span>
      <span class="lbl" :class="{ bad: keyState === 'changed' }">
        {{ t(`settingsHosts.detail.keyNote.${keyState ?? 'none'}`) }}
      </span>
    </div>

    <HostPermissions :login="login" />
    <HostConnectTime :host="row.alias" />

    <div class="include">
      <b>{{ t('settingsHosts.detail.include') }}</b>
      <UiSwitch
        :model-value="row.included"
        :aria-label="t('settingsHosts.detail.include')"
        @update:model-value="(on: boolean) => store.setInclude(row!.alias, on)"
      />
    </div>
    <p v-if="!row.included" class="lbl">{{ t('settingsHosts.detail.includeOff') }}</p>

    <div class="actions">
      <UiButton
        :icon="running ? undefined : 'check'"
        :busy="running"
        @click="store.test(row.alias)"
      >
        {{ testLabel }}
      </UiButton>
      <UiButton
        variant="ghost"
        icon="terminal"
        disabled
        :disabled-reason="t('settingsHosts.detail.terminalOff')"
      >
        {{ t('settingsHosts.detail.terminal') }}
      </UiButton>
    </div>
  </section>
</template>

<style scoped>
.not-read {
  color: var(--ink-4);
}

.card {
  display: flex;
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
  gap: 10px;
}

.tile {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  color: var(--ink-2);
}

.id {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.alias {
  font-size: 15px;
  font-weight: var(--weight-medium);
}

.sys {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.state {
  margin-left: auto;
}

.fields {
  display: flex;
  flex-direction: column;
  margin: 0;
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
  margin: 0;
  overflow-wrap: anywhere;
}

.key {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--surface-well);
}

.key-title {
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.fp {
  color: var(--ink-2);
  font-size: var(--text-11);
  overflow-wrap: anywhere;
}

.lbl {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.lbl.bad {
  color: var(--crit-ink);
}

.include b {
  font-weight: var(--weight-medium);
}

.include {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  font-size: var(--text-13);
}

.actions {
  display: flex;
  gap: var(--space-2);
  margin-top: auto;
}
</style>
