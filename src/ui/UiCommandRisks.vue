<!--
  The note under a command that runs something unseen or deletes files, from the board "AI"
  (Command safety): an amber panel (a choice to make, not a failure) with the shape-coded
  warning glyph and the title "Read before you run this", then one line for each risk found,
  a short bold name, a dot and what it does. It is always visible, never a tooltip, and the
  words come from the locale files so a caller cannot forget them. Shared by the command line
  and the code block.
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
  'docker-group': 'dockerGroup',
}
</script>

<template>
  <div v-if="risks.length > 0 || (removed ?? 0) > 0" class="risks" role="note">
    <span class="title"
      ><UiIcon name="warn" :size="14" :stroke="1.6" class="glyph" />{{
        t('ui.command.riskTitle')
      }}</span
    >
    <span v-for="risk in risks" :key="risk" class="line" :data-risk="risk"
      ><b class="lead">{{ t(`ui.command.risk.${KEYS[risk]}.lead`) }}</b> ·
      {{ t(`ui.command.risk.${KEYS[risk]}.rest`) }}</span
    >
    <span v-if="(removed ?? 0) > 0" class="line" data-risk="removed">{{
      t('ui.command.removed', { n: removed ?? 0 }, (removed ?? 0) as number)
    }}</span>
  </div>
</template>

<style scoped>
.risks {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--warn-soft);
}

.title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--warn-ink);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.glyph {
  flex: none;
  color: var(--warn-solid);
}

.line {
  padding-left: 22px;
  color: var(--ink-2);
  font-size: var(--text-12);
}

.lead {
  font-weight: var(--weight-medium);
}
</style>
