<!--
  A row that says what is missing or unreadable and the one line that fixes it (boards 02, 03
  and 25): an amber row with a glyph, the words, and the command in a white pill with Copy.
  The command is shown whole and copied whole, with control characters removed; a row with no
  command is just the words. Fixes are copy only: Daminus never runs `sudo`.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { cleanCommand } from '@/lib/command-safety'
import { useCopy } from '@/lib/use-copy'
import UiIcon from '@/ui/UiIcon.vue'
import type { IconName } from '@/ui/icon-paths'

const props = withDefaults(
  defineProps<{
    tone?: 'warn' | 'crit' | 'ok' | 'quiet'
    icon?: IconName
    /** The left column of a permission row ("System logs"); a lane's note has none. */
    label?: string
    command?: string | null
  }>(),
  { tone: 'warn', icon: 'lock', label: undefined, command: null },
)
defineSlots<{ default?: () => unknown; detail?: () => unknown }>()
const emit = defineEmits<{ copied: [command: string] }>()

const { t } = useI18n()
const { state, copy } = useCopy()
const clean = computed(() => (props.command ? cleanCommand(props.command).text : ''))

async function onCopy() {
  if (clean.value && (await copy(clean.value))) emit('copied', clean.value)
}
</script>

<template>
  <div class="fix" :class="`fix-${tone}`" :data-labelled="label !== undefined || undefined">
    <span class="tile"><UiIcon :name="icon" :size="14" /></span>
    <b v-if="label !== undefined" class="label">{{ label }}</b>
    <div class="text">
      <p><slot /></p>
      <p v-if="$slots.detail" class="detail"><slot name="detail" /></p>
      <span v-if="clean" class="cmd">
        <code><span aria-hidden="true">$</span> {{ clean }}</code>
        <button type="button" class="copy" :class="{ done: state === 'copied' }" @click="onCopy">
          <UiIcon :name="state === 'copied' ? 'check' : 'copy'" :size="12" />
          {{ state === 'copied' ? t('ui.copied') : t('ui.copy') }}
        </button>
      </span>
    </div>
  </div>
</template>

<style scoped>
.fix {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: var(--space-3);
  align-items: start;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--text-12);
  line-height: 1.45;
}

.fix[data-labelled] {
  grid-template-columns: 24px 120px minmax(0, 1fr);
}

.fix-warn {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.fix-crit {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.fix-ok {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

/* A permission that is fine: a quiet grey row with only the tile green. */
.fix-quiet {
  background: var(--surface-well);
  color: var(--ink);
}

.fix-quiet .tile {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.tile {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-xs);
  background: var(--surface-0);
}

.label {
  align-self: center;
  color: var(--ink);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.text {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

p {
  margin: 0;
}

.detail {
  color: var(--ink-2);
}

.cmd {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: var(--space-2);
  max-width: 100%;
  padding: 3px 4px 3px var(--space-3);
  border-radius: var(--radius-xs);
  background: var(--surface-0);
  color: var(--ink);
}

code {
  min-width: 0;
  overflow-x: auto;
  font: var(--weight-regular) var(--text-12) var(--font-mono);
  white-space: pre;
}

code span {
  color: var(--ink-4);
}

.copy {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex: none;
  height: 22px;
  padding: 0 var(--space-2);
  border-radius: 5px;
  background: var(--surface-1);
  color: var(--ink-2);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.copy:hover {
  background: var(--surface-2);
}

.copy.done {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.copy:focus-visible {
  box-shadow: var(--focus-ring);
}
</style>
