<!--
  A warning, an info line or an expected finding, folded to one line until opened, from the
  board "Project · Security": the severity tag, the problem, the check id, a short fact at the
  right and a link that opens the same evidence and plain lines a critical card carries. Info
  never alarms; it is context the critical cards can use.
-->
<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import type { ExpectedRule } from '@/api'
import type { Finding } from '@/lib/security-findings'
import { formatDate } from '@/lib/format'
import { vEnter } from '@/lib/motion'
import UiCard from '@/ui/UiCard.vue'
import SecurityFindingBody from './SecurityFindingBody.vue'
import SecurityFindingHead from './SecurityFindingHead.vue'
import { useSettingsStore } from '@/stores/settings'

const props = defineProps<{ finding: Finding; rule: ExpectedRule | null; index: number }>()

const { t } = useI18n()
const fmt = useFormat()
const settings = useSettingsStore()
const open = ref(false)
const bodyId = useId()

/** The short fact at the right of the line. */
const fact = computed(() => {
  const e = props.finding.evidence
  if (e.kind === 'port') return e.proc ? `${e.target} · ${e.proc}` : e.target
  if (e.kind === 'files') return fmt.number(e.total)
  return ''
})

/** What the expected rule says: why it was made and until when. */
const ruleLine = computed(() => {
  const r = props.rule
  if (!r) return ''
  const parts = [t(`projectSecurity.card.ruleReason.${r.reason}`)]
  if (r.until)
    parts.push(
      t('projectSecurity.card.ruleUntil', {
        date: formatDate(`${r.until}T00:00:00`, settings.language),
      }),
    )
  if (r.note) parts.push(r.note)
  return parts.join(' · ')
})

const tone = computed(() =>
  props.finding.standing === 'expected'
    ? 'neutral'
    : props.finding.level === 'warn'
      ? 'warn'
      : 'info',
)
</script>

<template>
  <UiCard v-enter="{ index, once: `sec-fold-${finding.id}` }" as="article" :tone="tone" class="row">
    <SecurityFindingHead :finding="finding">
      <template #end>
        <span v-if="fact" class="fact">{{ fact }}</span>
        <button
          type="button"
          class="toggle"
          :aria-expanded="open"
          :aria-controls="bodyId"
          @click="open = !open"
        >
          {{ open ? t('projectSecurity.card.hide') : t('projectSecurity.card.details') }}
        </button>
      </template>
    </SecurityFindingHead>
    <p v-if="ruleLine" class="rule">{{ ruleLine }}</p>
    <div v-if="open" :id="bodyId"><SecurityFindingBody :finding="finding" /></div>
  </UiCard>
</template>

<style scoped>
.row {
  --card-gap: var(--space-3);
  flex: none;
}

.fact {
  flex: none;
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: var(--text-11);
}

.toggle {
  flex: none;
  padding: 0;
  color: var(--accent-ink);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.toggle:hover {
  color: var(--accent-ink-hover);
}

.toggle:focus-visible {
  border-radius: var(--radius-xs);
  box-shadow: var(--focus-ring);
}

.rule {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-12);
  line-height: 1.45;
}
</style>
