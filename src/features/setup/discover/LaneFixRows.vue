<!--
  One amber row per source a host has but this login could not read, with the words that say
  what is missing and, when it can be stated truthfully, the command to copy. A source that
  does not exist (no pm2, no docker installed) is not a row: it is a zero in the counts.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import FixRow from '@/features/setup/components/FixRow.vue'
import type { IncompleteRow } from '@/lib/discover-view'

defineProps<{ rows: readonly IncompleteRow[] }>()

const { t } = useI18n()
</script>

<template>
  <FixRow
    v-for="row in rows"
    :key="row.key"
    tone="warn"
    icon="lock"
    :command="row.command"
    class="fix"
  >
    <template v-if="row.code === 'pm2_home'">
      <b>{{
        row.user
          ? t('setupDiscover.fix.pm2Home', { user: row.user })
          : t('setupDiscover.fix.pm2HomeAt', { home: row.home ?? '' })
      }}</b>
      ·
      {{
        row.login
          ? t('setupDiscover.fix.pm2HomeBody', { login: row.login })
          : t('setupDiscover.fix.pm2HomeBodyNoLogin')
      }}
    </template>
    <template v-else>
      <b>{{ t(`setupDiscover.fix.${row.code}.name`) }}</b>
      · {{ t(`setupDiscover.fix.${row.code}.body`) }}
    </template>
    <template v-if="row.code === 'pm2_home'" #detail>
      {{
        row.user
          ? t('setupDiscover.fix.pm2HomeAdd', { user: row.user })
          : t('setupDiscover.fix.pm2HomeAddAt')
      }}
    </template>
  </FixRow>
</template>

<style scoped>
.fix {
  position: relative;
}

/* The lane is narrow: the command wraps instead of scrolling and Copy drops below it, so the
   command is shown whole and not squeezed by the button. */
.fix :deep(.cmd) {
  flex-wrap: wrap;
}

.fix :deep(code) {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
</style>
