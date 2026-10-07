<!--
  The permission rows of a reached host: what the SSH user may do on it (Docker, system logs,
  each project folder). A missing permission is not a failure; each row names what is missing,
  what it costs and the one line that fixes it, copy only. A row that is fine is plain.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LoginResult } from '@/api'
import { useSettingsStore } from '@/stores/settings'
import { formatLatency, knownGroups, permissionKey, type HostRowModel } from '@/lib/host-rows'
import { type PermissionRow, missingPermissions, permissionRows } from '@/lib/host-test'
import FixRow from '@/features/setup/components/FixRow.vue'
import UiChip from '@/ui/UiChip.vue'
import type { IconName } from '@/ui/icon-paths'

const props = defineProps<{ row: HostRowModel; login: LoginResult }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const settings = useSettingsStore()

const report = computed(() => props.login.login)
const rows = computed(() => permissionRows(props.login))
const missing = computed(() => missingPermissions(rows.value))
const groups = computed(() => (report.value ? knownGroups(report.value) : []))

const system = computed(() => {
  const r = report.value
  if (!r) return ''
  const name = props.row.system.state === 'known' ? props.row.system.name : r.distro
  return t('setupPick.perm.system', { distro: name, arch: r.arch, user: r.user })
})

function icon(row: PermissionRow): IconName {
  if (row.tone === 'ok') return 'check'
  if (row.tone === 'crit') return 'close'
  return row.kind === 'docker' && row.answer === 'stopped' ? 'clock' : 'lock'
}

function label(row: PermissionRow): string {
  if (row.kind === 'docker') return t('setupPick.perm.dockerLabel')
  if (row.kind === 'logs') return t('setupPick.perm.logsLabel')
  return t('setupPick.perm.folder', { path: row.path ?? '' })
}

/** The answer's words: the first part is the verdict, set in weight; the rest says what it costs. */
function words(row: PermissionRow): { head: string; rest: string } {
  const text = t(`setupPick.perm.${permissionKey(row)}`, { user: report.value?.user ?? '' })
  const at = text.indexOf(' · ')
  return at < 0 ? { head: text, rest: '' } : { head: text.slice(0, at), rest: text.slice(at) }
}
</script>

<template>
  <div class="panel">
    <div class="head">
      <b class="mono alias">{{ row.alias }}</b>
      <UiChip tone="ok" icon="check">
        {{
          t('setupPick.perm.reached', {
            time: row.ms === null ? '' : formatLatency(row.ms, settings.language),
          })
        }}
      </UiChip>
      <span class="grow" />
      <button
        v-if="missing > 0"
        type="button"
        class="missing"
        :aria-label="t('setupPick.perm.close', { host: row.alias })"
        @click="emit('close')"
      >
        <UiChip tone="warn" icon="warn">{{
          t('setupPick.perm.missing', { n: missing }, missing)
        }}</UiChip>
      </button>
    </div>
    <p class="line">
      {{ system }}
      <span class="mono"
        >·
        {{
          groups.length > 0
            ? t('setupPick.perm.groups', { groups: groups.join(', ') })
            : t('setupPick.perm.noGroups')
        }}</span
      >
    </p>
    <div class="rows">
      <FixRow
        v-for="r in rows"
        :key="`${r.kind}:${r.path ?? ''}`"
        :tone="r.tone === 'ok' ? 'quiet' : r.tone"
        :icon="icon(r)"
        :label="label(r)"
        :command="r.missing ? r.fix : null"
      >
        <b :class="`verdict-${r.tone}`">{{ words(r).head }}</b
        ><span class="rest">{{ words(r).rest }}</span>
      </FixRow>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0 var(--space-4) var(--space-4) 48px;
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.alias {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.grow {
  flex-grow: 1;
}

.missing {
  display: inline-flex;
  padding: 0;
  border-radius: var(--radius-full);
}

.missing:focus-visible {
  box-shadow: var(--focus-ring);
}

.line {
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-12);
}

.line .mono {
  font-size: var(--text-12);
}

.rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.verdict-warn {
  color: var(--warn-ink);
  font-weight: var(--weight-medium);
}

.verdict-crit {
  color: var(--crit-ink);
  font-weight: var(--weight-medium);
}

.rest {
  color: var(--ink-2);
}

.verdict-ok {
  color: var(--ink);
  font-weight: var(--weight-medium);
}
</style>
