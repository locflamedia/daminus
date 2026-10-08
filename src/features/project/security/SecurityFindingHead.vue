<!--
  The head line of a finding: severity tag, the problem in plain words, the check id and, at the
  right, how long it has been there. A finding that was not re-checked says since which scan; an
  expected one carries the "expected" chip. The title is a message the screen builds from the
  facts, never server text.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Finding } from '@/lib/security-findings'
import { useMsg } from './use-msg'

const props = defineProps<{
  finding: Finding
  /** The large form of a critical card (15 px title); a folded row is 13 px. */
  large?: boolean
  /** "first seen scan #10 · 2 days" or "new this scan". */
  since?: string
}>()

const { t } = useI18n()
const msg = useMsg()

const title = computed(() => msg('title', props.finding.title))
const level = computed(() => props.finding.level)
</script>

<template>
  <div class="head">
    <span class="sev" :class="level">{{ t(`projectSecurity.sev.${level}`) }}</span>
    <b class="title" :class="{ large }">{{ title }}</b>
    <span class="id">{{ finding.check }}</span>
    <span v-if="finding.standing === 'expected'" class="chip expected">{{
      t('projectSecurity.card.expected')
    }}</span>
    <span v-if="finding.standing === 'stale' && finding.staleSince !== null" class="chip stale">{{
      t('projectSecurity.card.staleSince', { seq: finding.staleSince })
    }}</span>
    <span class="grow" />
    <slot name="end"
      ><span v-if="since" class="since">{{ since }}</span></slot
    >
    <slot name="actions" />
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.sev {
  display: inline-flex;
  flex: none;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  border-radius: 6px;
  font: var(--weight-semibold) 10px var(--font-mono);
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.sev.crit {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.sev.warn {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.sev.info {
  background: var(--info-soft);
  color: var(--info-ink);
}

.title {
  flex: 0 1 auto;
  min-width: 0;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.title.large {
  font-size: var(--text-15);
}

.id {
  flex: none;
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: var(--text-11);
}

.chip {
  flex: none;
  white-space: nowrap;
  height: 20px;
  padding: 0 6px;
  border-radius: 6px;
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  line-height: 20px;
}

.chip.expected {
  background: var(--surface-3);
  color: var(--ink-2);
}

.chip.stale {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.grow {
  flex: 1 1 0;
}

.since {
  flex: none;
  color: var(--ink-3);
  font-size: var(--text-11);
  white-space: nowrap;
}
</style>
