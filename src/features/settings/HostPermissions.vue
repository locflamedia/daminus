<!--
  Settings › Hosts, "What {user} can read": the same permission rows as Setup › Pick hosts. A
  missing one is amber with the one line that fixes it. They come from the login test, so a
  host that was not tested yet says how to read them.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LoginResult } from '@/api'
import FixRow from '@/features/setup/components/FixRow.vue'
import { permissionKey } from '@/lib/host-rows'
import { type PermissionRow, permissionRows } from '@/lib/host-test'
import type { IconName } from '@/ui/icon-paths'

const props = defineProps<{ login: LoginResult | null }>()

const { t } = useI18n()

const user = computed(() => props.login?.login?.user ?? '')
const rows = computed(() => (props.login ? permissionRows(props.login) : []))

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
</script>

<template>
  <div class="perm">
    <span class="head">
      {{
        user ? t('settingsHosts.detail.canRead', { user }) : t('settingsHosts.detail.canReadNobody')
      }}
    </span>
    <p v-if="rows.length === 0" class="empty">{{ t('settingsHosts.detail.untested') }}</p>
    <FixRow
      v-for="r in rows"
      :key="`${r.kind}:${r.path ?? ''}`"
      :tone="r.tone === 'ok' ? 'quiet' : r.tone"
      :icon="icon(r)"
      :label="label(r)"
      :command="r.missing ? r.fix : null"
    >
      {{ t(`setupPick.perm.${permissionKey(r)}`, { user }) }}
    </FixRow>
  </div>
</template>

<style scoped>
.perm {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.head {
  padding-bottom: 2px;
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.empty {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-12);
}
</style>
