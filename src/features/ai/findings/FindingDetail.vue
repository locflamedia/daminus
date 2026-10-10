<!--
  The chosen finding of the Findings page, from the board "AI · Findings": a card washed in the
  severity's tint (the first 120 px) with the white severity chip and the check at the top, the
  title (18), the AI's explanation (13, at most 620 px wide), the suggested command as a step
  with a copy-only line under it, the note on what the AI saw and, pinned to the bottom, "Mark as
  expected" and "Ask a follow-up". The chip, the title and the check come from the result the
  finding names; only the explanation and the command are the model's, and both are text.
  Daminus never runs the command.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { formatMeasure } from '@/lib/format'
import { checkDescription } from '@/lib/issue-text'
import { fileOf } from '@/lib/security-findings'
import { dayTime } from '@/lib/security-format'
import FindingActions from '@/features/expected/FindingActions.vue'
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiChip from '@/ui/UiChip.vue'
import UiCommandCopy from '@/ui/UiCommandCopy.vue'
import UiIcon from '@/ui/UiIcon.vue'
import { openReview } from '../ask/use-ask-session'
import { severityWords, type ResolvedFinding } from './resolve-findings'

const props = defineProps<{ finding: ResolvedFinding }>()
const emit = defineEmits<{ followUp: [] }>()
const { t, locale } = useI18n()
const router = useRouter()

/**
 * Before any AI review the finding is the check's own result: what the check looks for, the
 * evidence it recorded (path · size · time for a file) and two ways on, asking the AI about this
 * one result or opening it where the check lives.
 */
const unreviewed = computed(() => (props.finding.why === '' ? props.finding.item : null))

const fromCheck = computed(() => {
  const item = unreviewed.value
  if (!item) return ''
  const desc = checkDescription(item.key.check)
  return desc
    ? t('aiFindings.fromCheck', { check: item.key.check, desc })
    : t('aiFindings.fromCheckBare', { check: item.key.check })
})

const evidence = computed(() => {
  const item = unreviewed.value
  if (!item || !item.key.target) return ''
  const file = fileOf(item)
  const parts = [file.path]
  if (file.size !== null) parts.push(formatMeasure(file.size, 'bytes').text)
  if (file.mtime !== null) parts.push(dayTime(file.mtime, locale.value as 'en' | 'vi'))
  return parts.join(' · ')
})

const securityRoute = computed(() => {
  const item = unreviewed.value
  if (!item || item.group !== 'security') return null
  return item.owner.kind === 'project'
    ? { name: 'project', params: { id: item.owner.id, tab: 'security' } }
    : { name: 'server', params: { host: item.owner.host } }
})

function askAbout() {
  const item = unreviewed.value
  if (!item) return
  const scope =
    item.owner.kind === 'project'
      ? ({ kind: 'project', id: item.owner.id } as const)
      : ({ kind: 'server', host: item.owner.host } as const)
  openReview(scope, props.finding.title)
}

const icon = computed(() =>
  props.finding.tone === 'crit' ? 'critical' : props.finding.tone === 'warn' ? 'warn' : 'info',
)
</script>

<template>
  <UiCard as="article" class="detail" :class="finding.tone">
    <header class="top">
      <UiChip
        v-if="severityWords(finding)"
        tone="plain"
        size="large"
        :icon="icon"
        class="sev"
        :class="finding.tone"
        >{{ severityWords(finding) }}</UiChip
      >
      <span class="grow" />
      <span v-if="finding.item" class="check"
        >{{ finding.item.key.check }} · {{ finding.item.key.host }}</span
      >
    </header>
    <h2 class="title">{{ finding.item ? finding.title : t('aiFindings.unmatched') }}</h2>
    <p v-if="finding.why" class="why">{{ finding.why }}</p>
    <template v-if="unreviewed">
      <p class="from">{{ fromCheck }}</p>
      <div v-if="evidence" class="evidence">{{ evidence }}</div>
      <div class="ways">
        <UiButton size="small" lifted @click="askAbout">{{ t('aiFindings.askAbout') }}</UiButton>
        <UiButton
          v-if="securityRoute"
          variant="ghost"
          size="small"
          @click="router.push(securityRoute)"
          >{{ t('aiFindings.openInSecurity') }}</UiButton
        >
      </div>
    </template>
    <section v-if="finding.command" class="fix">
      <span class="label">{{ t('aiFindings.suggestedFix') }}</span>
      <div class="step">
        <span class="pill">1</span>
        <span>{{ t('aiFindings.stepRun', { host: finding.item?.key.host ?? '' }) }}</span>
      </div>
      <UiCommandCopy class="cmd" :command="finding.command" prompt="+" />
    </section>
    <p v-if="finding.why" class="seen">
      <UiIcon name="info" :size="14" />
      <span>{{ t('aiFindings.seenNote') }}</span>
    </p>
    <footer class="actions">
      <span class="grow" />
      <FindingActions v-if="finding.item" :item="finding.item" button />
      <UiButton
        v-if="finding.why"
        class="follow"
        variant="primary"
        size="small"
        icon="spark"
        lifted
        @click="emit('followUp')"
        >{{ t('aiFindings.followUp') }}</UiButton
      >
    </footer>
  </UiCard>
</template>

<style scoped>
.detail {
  --card-gap: 14px;
  min-width: 0;
}

.detail.crit {
  background: linear-gradient(180deg, var(--card-wash-crit), var(--surface-0) 120px);
}

.detail.warn {
  background: linear-gradient(180deg, var(--card-wash-warn), var(--surface-0) 120px);
}

.top {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.grow {
  flex-grow: 1;
}

.detail .sev.crit {
  color: var(--crit-ink);
}

.detail .sev.warn {
  color: var(--warn-ink);
}

.detail .sev.info {
  color: var(--info-ink);
}

.check {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.title {
  margin: 0;
  font-size: 18px;
  font-weight: var(--weight-medium);
  letter-spacing: -0.015em;
  overflow-wrap: anywhere;
}

.why {
  max-width: 620px;
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-13);
  line-height: 1.55;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.from {
  max-width: 620px;
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.45;
  overflow-wrap: anywhere;
}

/* The evidence as the check recorded it, on the code fill; it scrolls, never cuts. */
.evidence {
  padding: 8px 10px;
  overflow-x: auto;
  border-radius: 8px;
  background: var(--code);
  color: var(--code-ink);
  font-family: var(--font-mono);
  font-size: var(--text-11);
  line-height: 1.2;
  white-space: nowrap;
}

.ways {
  display: flex;
  gap: 8px;
}

.fix {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.step {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.45;
}

.pill {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--btn);
  color: var(--btn-ink);
  font-size: 10px;
  font-weight: var(--weight-semibold);
}

.cmd {
  margin-left: 28px;
}

.seen {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--surface-1);
  color: var(--ink-2);
  font-size: var(--text-11);
  line-height: 1.45;
}

.seen .icon {
  flex: none;
  color: var(--ink-3);
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  padding-top: 12px;
}

.actions .follow {
  padding: 0 10px;
}
</style>
