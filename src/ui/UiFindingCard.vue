<!--
  AI finding, expanded, from the boards "AI" and "Components": a grey well (radius 14,
  padding 12, 12 between blocks) with six blocks in a fixed order:

  1. header, 28 px: the severity chip, the project chip (white) and, at the right, when it
     first appeared ("new in #42");
  2. title, 15/500: the problem in plain words, never the check id;
  3. cause, 13: two sentences at most, what happened and why it matters;
  4. evidence: key and value rows taken from scan data, never generated (mono 11), on white;
  5. fix: a code block with a file path comment and a copy button, commands only;
  6. actions: "Copy fix" is the primary, follow-ups are secondary and "Mark as known" is last.

  Everything is rendered as text: the model may select and explain evidence, it cannot add
  markup. A finding is resolved only by a later scan; see `UiFindingRow` for its lifecycle.
-->
<script setup lang="ts">
import { useId } from 'vue'
import type { CodeLanguage } from '@/lib/code-tokens'
import UiChip from './UiChip.vue'
import UiCodeBlock from './UiCodeBlock.vue'

export interface FindingEvidence {
  key: string
  value: string
  /** Rose for a value that is the problem ("200 OK" on a file that must not be served). */
  tone?: 'crit' | 'plain'
}

withDefaults(
  defineProps<{
    severity: 'crit' | 'warn' | 'info'
    /** The severity in words ("Critical"). */
    severityLabel: string
    project: string
    since?: string
    title: string
    cause?: string
    evidence?: readonly FindingEvidence[]
    fix?: string
    fixLanguage?: CodeLanguage
    /** Names the fix block for assistive technology. */
    fixLabel?: string
  }>(),
  {
    since: undefined,
    cause: undefined,
    evidence: () => [],
    fix: undefined,
    fixLanguage: 'plain',
    fixLabel: undefined,
  },
)
defineSlots<{ cause?: () => unknown; actions?: () => unknown }>()

const titleId = useId()
</script>

<template>
  <article class="finding" :aria-labelledby="titleId">
    <header class="head">
      <UiChip :tone="severity === 'info' ? 'info' : severity">{{ severityLabel }}</UiChip>
      <UiChip tone="plain">{{ project }}</UiChip>
      <span v-if="since" class="since">{{ since }}</span>
    </header>
    <h3 :id="titleId" class="title">{{ title }}</h3>
    <p v-if="cause || $slots.cause" class="cause">
      <slot name="cause">{{ cause }}</slot>
    </p>
    <dl v-if="evidence.length > 0" class="evidence">
      <template v-for="row in evidence" :key="row.key">
        <dt class="key">{{ row.key }}</dt>
        <dd class="value" :class="{ crit: row.tone === 'crit' }">{{ row.value }}</dd>
      </template>
    </dl>
    <UiCodeBlock v-if="fix" :code="fix" :language="fixLanguage" :label="fixLabel" />
    <div v-if="$slots.actions" class="actions"><slot name="actions" /></div>
  </article>
</template>

<style scoped>
.finding {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-1);
}

.head {
  display: flex;
  align-items: center;
  gap: 6px;
  height: var(--h-control-sm);
}

.since {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
}

.title {
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
  line-height: 1.35;
}

.cause {
  color: var(--ink-2);
  font-size: var(--text-13);
  line-height: 1.5;
}

.evidence {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: var(--space-1) var(--space-3);
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  font-size: var(--text-11);
}

.key {
  color: var(--ink-3);
}

.value {
  margin: 0;
  overflow-wrap: anywhere;
  font-family: var(--font-mono);
}

.value.crit {
  color: var(--crit-ink);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
