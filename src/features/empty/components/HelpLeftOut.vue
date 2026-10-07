<!--
  "Left out (N)": every entry of the ssh config that Daminus could not list as a host, with the
  reason in a word and where it sits (`file:line`). Patterns and `Match` blocks are explained,
  not flagged: they still apply to real hosts once there are some. The list folds; "Read again"
  reads the file again.
-->
<script setup lang="ts">
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIcon from '@/ui/UiIcon.vue'
import type { LeftOutRow } from '../empty-state'

defineProps<{ rows: readonly LeftOutRow[]; busy?: boolean }>()
defineEmits<{ reread: [] }>()

const { t } = useI18n()
const open = ref(true)
const listId = useId()
</script>

<template>
  <div class="left-out">
    <div class="bar">
      <button
        type="button"
        class="toggle"
        :aria-expanded="open"
        :aria-controls="listId"
        @click="open = !open"
      >
        <UiIcon :name="open ? 'chevron-down' : 'chevron-right'" :size="12" :stroke="1.6" />
        {{ t('empty.help.leftOut.title', { n: rows.length }) }}
      </button>
      <button type="button" class="again" :disabled="busy" @click="$emit('reread')">
        <UiIcon name="refresh" :size="14" :stroke="1.6" />
        {{ t('empty.help.leftOut.readAgain') }}
      </button>
    </div>
    <ul v-show="open" :id="listId" class="list">
      <li v-for="r in rows" :key="`${r.where}|${r.name}`" class="row">
        <span class="mono name">{{ r.name }}</span>
        <span class="reason">{{ t(`empty.help.leftOut.${r.reason}`) }}</span>
        <span class="mono where">{{ r.where }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.left-out {
  display: flex;
  flex-direction: column;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-well);
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 28px;
}

.toggle,
.again {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  border-radius: var(--radius-xs);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.toggle .icon {
  color: var(--ink-4);
}

.again {
  padding: 0 var(--space-1);
  color: var(--ink-2);
}

.again:disabled {
  color: var(--ink-5);
}

.toggle:focus-visible,
.again:focus-visible {
  box-shadow: var(--focus-ring);
}

.list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr) auto;
  gap: var(--space-3);
  align-items: center;
  min-height: 28px;
  font-size: var(--text-12);
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reason {
  color: var(--ink-3);
}

.where {
  color: var(--ink-3);
  font-size: var(--text-11);
}
</style>
