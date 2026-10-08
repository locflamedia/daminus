<!--
  A critical finding, from the board "Project · Security": a soft severity wash that fades into
  the card under the head line, the evidence on dark, then what it means and what to do next.
  It lands once when it first appears and glows once; a rescan that changes nothing does not
  play it again.
-->
<script setup lang="ts">
import type { Finding } from '@/lib/security-findings'
import { vEnter } from '@/lib/motion'
import ExpectedBroken from '@/features/expected/ExpectedBroken.vue'
import FindingActions from '@/features/expected/FindingActions.vue'
import UiCard from '@/ui/UiCard.vue'
import SecurityFindingBody from './SecurityFindingBody.vue'
import SecurityFindingHead from './SecurityFindingHead.vue'

defineProps<{ finding: Finding; since: string; index: number }>()
</script>

<template>
  <UiCard
    v-enter="{ index, once: `sec-card-${finding.id}` }"
    as="article"
    :tone="
      finding.standing === 'expected'
        ? 'neutral'
        : finding.level === 'info'
          ? 'info'
          : finding.level
    "
    class="card"
  >
    <SecurityFindingHead :finding="finding" :since="since" large>
      <template v-if="finding.items[0]" #actions>
        <FindingActions :item="finding.items[0]" />
      </template>
    </SecurityFindingHead>
    <ExpectedBroken :items="finding.items" />
    <SecurityFindingBody :finding="finding" />
  </UiCard>
</template>

<style scoped>
.card {
  --card-gap: var(--space-3);
  box-shadow: var(--shadow-card-crit);
  flex: none;
}
</style>
