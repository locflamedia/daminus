<!--
  The entries of the ssh config that are not hosts to pick, each with the word for why: a
  wildcard sets defaults, a block without a HostName is usually a git remote. The row folds
  away; the note says wildcards are read but never listed.
-->
<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SkippedHost } from '@/api'
import { skipReasonKey } from '@/lib/host-rows'
import UiIcon from '@/ui/UiIcon.vue'

defineProps<{ skipped: readonly SkippedHost[] }>()

const { t } = useI18n()
const open = ref(true)

/** A wildcard or match block is written the way the file has it: `Host *`. */
function shown(entry: SkippedHost): string {
  return entry.reason === 'wildcard' || entry.reason === 'match'
    ? `Host ${entry.pattern}`
    : entry.pattern
}
</script>

<template>
  <div v-if="skipped.length > 0" class="left">
    <button
      type="button"
      class="toggle"
      :aria-expanded="open"
      :aria-label="t('setupPick.leftOutRow.toggle')"
      @click="open = !open"
    >
      <UiIcon name="chevron-down" :size="16" class="chev" :class="{ shut: !open }" />
    </button>
    <b class="title">{{ t('setupPick.leftOutRow.title', { n: skipped.length }) }}</b>
    <template v-if="open">
      <span v-for="s in skipped" :key="`${s.file}:${s.line}`" class="tag">
        <span class="mono">{{ shown(s) }}</span>
        {{ t(`setupPick.leftOutRow.${skipReasonKey(s.reason)}`) }}
      </span>
      <span class="note">{{ t('setupPick.leftOutRow.note') }}</span>
    </template>
  </div>
</template>

<style scoped>
.left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
  min-height: 40px;
  padding: 0 var(--space-4);
  color: var(--ink-3);
  font-size: var(--text-12);
}

.toggle {
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: var(--radius-xs);
  color: var(--ink-4);
}

.toggle:focus-visible {
  box-shadow: var(--focus-ring);
}

.chev {
  transition: transform var(--dur-state) var(--ease-out);
}

.chev.shut {
  transform: rotate(-90deg);
}

.title {
  color: var(--ink-2);
  font-weight: var(--weight-medium);
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: 20px;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--surface-1);
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.tag .mono {
  color: var(--ink-2);
}

.note {
  margin-left: auto;
}
</style>
