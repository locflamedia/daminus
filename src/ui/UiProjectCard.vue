<!--
  Project card, from the board "Project card": the heart of Daminus. Six blocks in a fixed
  order and height, so any two cards side by side line up block for block:

  1. head, 36: the monogram tile, the name (15/500), the domain (12, ink-3, opens the
     browser) and the state at the right: a chip only for issues (it morphs when the state
     changes), a grey word when healthy, an accent word while scanning, grey when unreachable;
  2. tags, 22: stack facts on one line; what does not fit collapses to "+N";
  3. topology, 40: URL then each component, or the servers form;
  4. status row, 56: the single most severe issue and a count chip if there are more, or
     "All N checks passed"; Fix on a critical one, Retry on an unreachable one;
  5. metrics, 72: three tiles with their sparkline;
  6. foot, 32: when it was checked, how many checks passed, Open. The time turns warn-ink
     after 24 hours.

  Padding 16, 12 between blocks (about 380 tall). While scanning, the values blur in place
  and the layout holds. Several issues never stack rows. A name too long for one line is cut
  with an ellipsis; the full name is the title. Missing data is a dash, never zero. On a
  pointer hover the card lifts 2 px and the Open chevron nudges; a press on the card opens
  it. Every string comes from the caller and is rendered as text.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useFormat } from '@/composables/use-format'
import { isStale } from '@/lib/micro'
import type { NodeState, TopologyInput } from '@/lib/topology'
import UiButton from './UiButton.vue'
import UiChipMorph from './UiChipMorph.vue'
import UiDomainLink from './UiDomainLink.vue'
import UiMetricTile, { type MetricState } from './UiMetricTile.vue'
import UiMonogram, { type MonogramTint } from './UiMonogram.vue'
import UiRow, { type RowTone } from './UiRow.vue'
import UiTag from './UiTag.vue'
import UiTopology from './UiTopology.vue'
import type { IconName } from './icon-paths'

export type ProjectCardState = 'crit' | 'warn' | 'ok' | 'scanning' | 'unreachable'

export interface ProjectCardMetric {
  label: string
  icon?: IconName
  delta?: string
  value?: string
  unit?: string
  series?: readonly number[]
  state?: MetricState
  note?: string
  reason?: string
}

export interface ProjectCardStatus {
  tone: RowTone
  icon: IconName
  /** The glyph's colour when it differs from the row (the green tick on a grey row). */
  tileTone?: RowTone
  title: string
  meta?: string
  /** The count chip ("2 issues", "0 issues"). */
  chip?: string
}

const props = withDefaults(
  defineProps<{
    name: string
    domain?: string
    tint?: MonogramTint
    icon?: IconName
    state: ProjectCardState
    /** The state in words: "Needs a look", "Critical", "Healthy", "Scanning", "Unreachable". */
    stateLabel: string
    tags?: ReadonlyArray<{ label: string; swatch?: string }>
    /** How many tags show before "+N". */
    maxTags?: number
    topology: readonly TopologyInput[]
    topologyMode?: 'components' | 'servers'
    urlLabel: string
    nodeStates: Record<NodeState, string>
    moreLabel: (hidden: number) => string
    topologyLabel: string
    status: ProjectCardStatus
    /** The button on the status row: "Fix" on a critical issue, "Retry" when unreachable. */
    actionLabel?: string
    metrics: readonly ProjectCardMetric[]
    /** When the project was last checked. */
    checkedAt: string | number | Date
    /** "12 of 14 passed", already worded. */
    passedLabel: string
    openLabel: string
    /** The card lifts and a press opens it. */
    interactive?: boolean
    /** When set, each sparkline draws only the first time its key is seen. */
    once?: string
  }>(),
  {
    domain: undefined,
    tint: 'blue',
    icon: undefined,
    tags: () => [],
    maxTags: 3,
    topologyMode: 'components',
    actionLabel: undefined,
    interactive: true,
    once: undefined,
  },
)

const emit = defineEmits<{ open: []; action: []; 'open-domain': [url: string] }>()

const fmt = useFormat()

const chipTone = computed(() => (props.state === 'crit' ? 'crit' : 'warn'))
const showChip = computed(() => props.state === 'crit' || props.state === 'warn')
const shownTags = computed(() => props.tags.slice(0, props.maxTags))
const hiddenTags = computed(() => Math.max(0, props.tags.length - props.maxTags))
const checked = computed(() => fmt.when(props.checkedAt))
const stale = computed(() => isStale(props.checkedAt))
const scanning = computed(() => props.state === 'scanning')

function onCardClick(event: MouseEvent) {
  if (!props.interactive) return
  if ((event.target as HTMLElement).closest('a, button, input')) return
  emit('open')
}
</script>

<template>
  <article
    class="card"
    :class="{ 'm-lift': interactive, interactive }"
    :aria-busy="scanning || undefined"
    @click="onCardClick"
  >
    <header class="head">
      <UiMonogram :name="name" :icon="icon" :tint="tint" :size="36" />
      <span class="names">
        <b class="name" :title="name">{{ name }}</b>
        <UiDomainLink v-if="domain" bare :domain="domain" @open="emit('open-domain', $event)" />
      </span>
      <UiChipMorph v-if="showChip" class="state" :tone="chipTone" :label="stateLabel" />
      <span v-else class="state word" :class="`word-${state}`">{{ stateLabel }}</span>
    </header>

    <div class="tags">
      <UiTag v-for="tag in shownTags" :key="tag.label" :swatch="tag.swatch">{{ tag.label }}</UiTag>
      <UiTag v-if="hiddenTags > 0">+{{ hiddenTags }}</UiTag>
    </div>

    <UiTopology
      :components="topology"
      :mode="topologyMode"
      :url-label="urlLabel"
      :states="nodeStates"
      :more-label="moreLabel"
      :label="topologyLabel"
    />

    <UiRow
      class="status"
      :class="{ blurred: scanning }"
      size="status"
      :tone="status.tone"
      :tile="status.icon"
      :tile-tone="status.tileTone"
      :title="status.title"
      :meta="status.meta"
    >
      <template v-if="status.chip || actionLabel" #trailing>
        <span v-if="status.chip && !actionLabel" class="count" :class="`count-${status.tone}`">{{
          status.chip
        }}</span>
        <UiButton
          v-if="actionLabel"
          :variant="state === 'crit' ? 'primary' : 'secondary'"
          size="small"
          @click="emit('action')"
          >{{ actionLabel }}</UiButton
        >
      </template>
    </UiRow>

    <div class="metrics">
      <UiMetricTile
        v-for="(metric, i) in metrics"
        :key="i"
        v-bind="metric"
        :state="scanning ? 'scanning' : metric.state"
        :once="once ? `${once}-${i}` : undefined"
      />
    </div>

    <footer class="foot">
      <span class="when" :class="{ stale }">{{ checked }}</span>
      <span class="dot" aria-hidden="true">·</span>
      <span>{{ passedLabel }}</span>
      <UiButton
        variant="link"
        size="small"
        trailing-icon="chevron-right"
        class="open"
        @click="emit('open')"
      >
        <span class="open-label">{{ openLabel }}</span>
      </UiButton>
    </footer>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-0);
  box-shadow: var(--shadow-card);
}

.interactive {
  cursor: default;
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: 36px;
  min-width: 0;
}

.names {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.name {
  overflow: hidden;
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
  letter-spacing: var(--track-15);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.state {
  margin-left: auto;
}

.word {
  flex: none;
  color: var(--ink-3);
  font-size: var(--text-12);
}

.word-scanning {
  color: var(--accent-ink);
  font-weight: var(--weight-medium);
}

.tags {
  display: flex;
  gap: 6px;
  height: var(--h-chip);
  overflow: hidden;
}

/* The count chip sits white on a tinted status row, in the band's own ink. */
.count {
  display: inline-flex;
  align-items: center;
  height: var(--h-chip);
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  background: var(--surface-0);
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.count-warn {
  color: var(--warn-ink);
}

.count-crit {
  color: var(--crit-ink);
}

.status.tone-neutral {
  background: var(--surface-1);
}

.status.blurred {
  opacity: 0.35;
  filter: blur(2px);
  transition:
    opacity var(--dur-state) var(--ease-state),
    filter var(--dur-state) var(--ease-state);
}

.metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
}

.foot {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--h-control);
  padding: 0 var(--space-1) 0 var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--ink-3);
  font-size: var(--text-12);
}

.when.stale {
  color: var(--warn-ink);
  font-weight: var(--weight-medium);
}

.open {
  margin-left: auto;
  color: var(--ink);
}

@media (hover: hover) {
  .card:hover .open :deep(.icon) {
    transform: translateX(3px);
  }
}

.open :deep(.icon) {
  transition: transform var(--dur-lift) var(--ease-out);
}

@media (prefers-reduced-motion: reduce) {
  .status.blurred {
    filter: none;
  }
}
</style>
