<!--
  The project cards (board "Overview · results"): three across, critical first. Cards rise 80 ms
  apart when the screen opens and are still afterwards; a card whose scan is running updates in
  place, and the order changes once, with a 350 ms spring, when the new results are saved.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { vEnter } from '@/lib/motion'
import { useScanPanelStore } from '@/stores/scan-panel'
import UiProjectCard from '@/ui/UiProjectCard.vue'
import UiTlsChip from '@/ui/UiTlsChip.vue'
import { nodeStateWords, type CardView } from './overview-card-text'

defineProps<{ cards: readonly CardView[]; old: boolean }>()

const { t } = useI18n()
const router = useRouter()
const panel = useScanPanelStore()

const states = nodeStateWords()

function open(card: CardView, tab?: string) {
  void router.push({ name: 'project', params: { id: card.id, ...(tab ? { tab } : {}) } })
}

function act(card: CardView) {
  if (card.action === 'retry') void panel.start({ projects: [], hosts: card.retryHosts })
  else if (card.action === 'tab' && card.tab) open(card, card.tab)
  else open(card)
}
</script>

<template>
  <TransitionGroup name="resort" tag="div" class="cards" :class="{ old }">
    <UiProjectCard
      v-for="(card, i) in cards"
      :key="card.id"
      v-enter="{ index: i }"
      :name="card.name"
      :domain="card.domain"
      :tint="card.tint"
      :state="card.state"
      :state-label="card.stateLabel"
      :where="card.where"
      :tags="card.tags"
      :topology="card.topology"
      :node-states="states"
      :more-label="(n: number) => t('overviewScreen.card.more', { n }, n)"
      :topology-label="t('overviewScreen.card.topology', { name: card.name })"
      :status="card.status"
      :action-label="card.actionLabel"
      :metrics="card.metrics"
      :checked-at="card.checkedAt"
      :passed-label="card.passedLabel"
      :open-label="t('overviewScreen.card.open')"
      @open="open(card)"
      @action="act(card)"
    >
      <template v-if="card.tls" #status-chip>
        <UiTlsChip :item="card.tls" />
      </template>
    </UiProjectCard>
  </TransitionGroup>
</template>

<style scoped>
.cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  flex: none;
  gap: var(--space-4);
}

/* Narrow window: the cards go two across. */
[data-range='narrow'] .cards {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

/* Old results lose colour: nothing here claims to be current. */
.cards.old {
  filter: saturate(0.55);
}

/* The one re-sort after a scan: 350 ms, a soft spring. */
.resort-move {
  transition: transform var(--dur-resort) var(--ease-settle);
}

@media (prefers-reduced-motion: reduce) {
  .resort-move {
    transition: none;
  }
}
</style>
