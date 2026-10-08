<!--
  The chosen finding of the Findings page, from the board "AI · Findings": a card washed in the
  severity's tint with the severity chip and the check at the top, the title (18), the AI's
  explanation (13, at most 620 px wide), the suggested command as a copy-only line and, at the
  bottom right, "Ask a follow-up". The chip, the title and the check come from the result the
  finding names; only the explanation and the command are the model's, and both are text.
  Daminus never runs the command.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiChip from '@/ui/UiChip.vue'
import UiCommandCopy from '@/ui/UiCommandCopy.vue'
import { severityWords, type ResolvedFinding } from './resolve-findings'

const props = defineProps<{ finding: ResolvedFinding }>()
const emit = defineEmits<{ followUp: [] }>()
const { t } = useI18n()

const tone = computed(() => (props.finding.tone === 'plain' ? 'neutral' : props.finding.tone))
const icon = computed(() =>
  props.finding.tone === 'crit' ? 'critical' : props.finding.tone === 'warn' ? 'warn' : 'info',
)
</script>

<template>
  <UiCard as="article" :tone="tone" class="detail">
    <header class="top">
      <UiChip
        v-if="severityWords(finding)"
        :tone="finding.tone === 'plain' ? 'plain' : finding.tone"
        :icon="icon"
        >{{ severityWords(finding) }}</UiChip
      >
      <span class="grow" />
      <span v-if="finding.item" class="check"
        >{{ finding.item.key.check }} · {{ finding.item.key.host }}</span
      >
    </header>
    <h2 class="title">{{ finding.item ? finding.title : t('aiFindings.unmatched') }}</h2>
    <p v-if="finding.why" class="why">{{ finding.why }}</p>
    <section v-if="finding.command" class="fix">
      <span class="label">{{ t('aiFindings.suggestedFix') }}</span>
      <UiCommandCopy :command="finding.command" />
    </section>
    <footer v-if="finding.why" class="actions">
      <span class="grow" />
      <UiButton variant="primary" size="small" icon="spark" @click="emit('followUp')">{{
        t('aiFindings.followUp')
      }}</UiButton>
    </footer>
  </UiCard>
</template>

<style scoped>
.detail {
  --card-gap: 14px;
  min-width: 0;
}

.top {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.grow {
  flex-grow: 1;
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

.fix {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
</style>
