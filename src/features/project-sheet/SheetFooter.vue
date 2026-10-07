<!--
  The sheet's footer. Left: Remove (saved projects, or "Remove from setup"), in the critical
  ink with no dialog, and what Undo offers. Right: the unsaved changes, the errors that stop
  Save, Cancel and Save. `part` picks which half this is, so each fills a slot of the sheet.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiButton from '@/ui/UiButton.vue'
import { useSheet } from './sheet-context'

defineProps<{ part: 'start' | 'end' }>()
const { t } = useI18n()
const sheet = useSheet()

const canRemove = computed(() =>
  sheet.mode === 'setup' ? sheet.request?.onRemove !== undefined : !sheet.draft.isNew,
)
const errors = computed(() => sheet.visible.errors)
const leftOutText = computed(() =>
  sheet.leftOut > 0 ? t('projectSheet.footer.leftOut', { n: sheet.leftOut }, sheet.leftOut) : '',
)
</script>

<template>
  <template v-if="part === 'start'">
    <template v-if="canRemove">
      <UiButton
        variant="ghost"
        icon="trash"
        class="remove"
        :disabled="sheet.busy"
        @click="sheet.remove()"
      >
        {{
          sheet.mode === 'setup'
            ? t('projectSheet.footer.removeSetup')
            : t('projectSheet.footer.remove')
        }}
      </UiButton>
      <span v-if="sheet.mode === 'saved'" class="note">{{
        t('projectSheet.footer.undoNote')
      }}</span>
    </template>
    <span v-if="leftOutText" class="note left-out" :title="leftOutText">{{ leftOutText }}</span>
  </template>
  <template v-else>
    <span v-if="sheet.changes > 0" class="unsaved" role="status">
      <i class="dot" />{{ t('projectSheet.footer.unsaved', { n: sheet.changes }, sheet.changes) }}
    </span>
    <span v-if="errors > 0" class="errors" role="status">
      {{ t('projectSheet.footer.errors', { n: errors }, errors) }}
    </span>
    <UiButton variant="ghost" @click="sheet.discard()">{{
      t('projectSheet.footer.cancel')
    }}</UiButton>
    <UiButton
      variant="primary"
      shortcut="⌘S"
      :busy="sheet.busy"
      :disabled="errors > 0"
      :disabled-reason="errors > 0 ? t('projectSheet.footer.saveWhy') : undefined"
      @click="sheet.save()"
    >
      {{ t('projectSheet.footer.save') }}
    </UiButton>
  </template>
</template>

<style scoped>
.remove {
  color: var(--crit-ink);
}

.note {
  color: var(--ink-3);
  font-size: var(--text-11);
  white-space: nowrap;
}

.left-out {
  overflow: hidden;
  text-overflow: ellipsis;
}

.unsaved,
.errors {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: var(--space-2);
  font-size: var(--text-12);
  white-space: nowrap;
}

.unsaved {
  color: var(--ink-2);
}

.errors {
  color: var(--crit-ink);
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--warn-solid);
}
</style>
