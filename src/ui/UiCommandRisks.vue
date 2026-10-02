<!--
  The warning under a command that runs something unseen or deletes files: an amber strip
  (a choice to make, not a failure) with the shape-coded warning glyph, a title and one line
  per risk found. It is always visible, never a tooltip, and the words come from the locale
  files so a caller cannot forget them. Shared by the command line and the code block.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CommandRisk } from '@/lib/command-safety'
import UiIcon from './UiIcon.vue'

defineProps<{ risks: CommandRisk[]; removed?: number }>()
const { t } = useI18n()

const KEYS: Record<CommandRisk, string> = {
  'pipe-to-shell': 'pipeToShell',
  'base64-decode': 'base64Decode',
  remove: 'remove',
  destructive: 'destructive',
}
</script>

<template>
  <div v-if="risks.length > 0 || (removed ?? 0) > 0" class="risks" role="note">
    <UiIcon name="warn" :size="16" class="glyph" />
    <div class="text">
      <b class="title">{{ t('ui.command.riskTitle') }}</b>
      <span v-for="risk in risks" :key="risk" class="line" :data-risk="risk">{{
        t(`ui.command.risk.${KEYS[risk]}`)
      }}</span>
      <span v-if="(removed ?? 0) > 0" class="line" data-risk="removed">{{
        t('ui.command.removed', { n: removed ?? 0 }, (removed ?? 0) as number)
      }}</span>
    </div>
  </div>
</template>

<style scoped>
.risks {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-2);
  align-items: start;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.glyph {
  margin-top: 2px;
}

.text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: var(--text-12);
  line-height: var(--lh-12);
}

.title {
  font-weight: var(--weight-medium);
}

.line {
  color: var(--ink-2);
}
</style>
