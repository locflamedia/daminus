<!--
  Project card, from the board "Project card" (drawn as on Overview): the heart of Daminus.
  Six blocks in a fixed order and height, so any two cards side by side line up block for
  block:

  1. head, 40: the project tile (40, radius 12: the monogram gradient, since no framework
     mark is bundled), the name (15/500), the domain with where it runs, and the state chip at
     the right: a dot and a word for every state. A critical chip carries the one pulsing dot;
     scanning shows "waiting" with a spinner; unreachable a hollow dot;
  2. tags, 22: stack facts on one line, each with a 6 px dot in the project colour when it has
     no mark; what does not fit collapses to "+N";
  3. topology, 40: one node per run of components on a server, the roles in colour, dashed
     links between servers, no URL node (the URL is in the head);
  4. status row, 56: the single most severe issue in its severity fill with one text action,
     or "All N checks passed". While the host is read the last result stays, in grey;
  5. metrics, 72: three tiles with a value and one note line, no sparkline. While the host is
     read a tile that is being read shows two skeleton bars; an unreachable card dims them;
  6. foot, 32: when it was checked, how many checks passed, Open. The time turns warn-ink
     after 24 hours.

  Padding 16, 10 between blocks, radius 16 (a project with no stack facts has no tags block). A critical card is lifted by a rose shadow. Several
  issues never stack rows. A name too long for one line is cut with an ellipsis; the full name
  is the title. Missing data is a dash, never zero. On a pointer hover the card lifts 2 px and
  the Open chevron nudges; a press on the card opens it. Every string comes from the caller and
  is rendered as text.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useFormat } from '@/composables/use-format'
import { isStale } from '@/lib/micro'
import type { NodeState, TopologyInput } from '@/lib/topology'
import UiBrandMark from './UiBrandMark.vue'
import type { BrandName } from './brand-marks'
import UiButton from './UiButton.vue'
import UiChipMorph from './UiChipMorph.vue'
import UiDomainLink from './UiDomainLink.vue'
import UiMetricTile, { type MetricState, type NoteTone } from './UiMetricTile.vue'
import UiMonogram, { type MonogramTint } from './UiMonogram.vue'
import UiRow, { type RowTone } from './UiRow.vue'
import UiTag from './UiTag.vue'
import UiTopology from './UiTopology.vue'
import type { IconName } from './icon-paths'

export type ProjectCardState = 'crit' | 'warn' | 'ok' | 'partial' | 'scanning' | 'unreachable'

export interface ProjectCardMetric {
  label: string
  icon?: IconName
  value?: string
  unit?: string
  state?: MetricState
  /** The line under the value: what changed, "no change", or what to do. */
  note?: string
  noteTone?: NoteTone
  /** The tooltip of the clock beside the label: the number can lag. */
  hint?: string
}

export interface ProjectCardStatus {
  tone: RowTone
  icon: IconName
  /** The glyph's colour when it differs from the row (the green tick on a grey row). */
  tileTone?: RowTone
  title: string
  meta?: string
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
    /** Where it runs: "vps-hn-3", "2 servers". Follows the domain. */
    where?: string
    /** A tag with a technology mark draws it (14 px); without one, a dot in the project colour. */
    tags?: ReadonlyArray<{ label: string; swatch?: string; brand?: BrandName | null }>
    /** How many tags show before "+N". */
    maxTags?: number
    topology: readonly TopologyInput[]
    nodeStates: Record<NodeState, string>
    moreLabel: (hidden: number) => string
    topologyLabel: string
    status: ProjectCardStatus
    /** The text action of the status row: "Security ›", "Open ›", "Retry". */
    actionLabel?: string
    metrics: readonly ProjectCardMetric[]
    /** When the project was last checked; none while the first read of this scan runs. */
    checkedAt?: string | number | Date
    /** "12 of 14 passed", already worded. */
    passedLabel: string
    openLabel: string
    /** The card lifts and a press opens it. */
    interactive?: boolean
    /** Old results: nothing moves, not even the critical dot. */
    still?: boolean
  }>(),
  {
    domain: undefined,
    where: undefined,
    tint: 'blue',
    icon: undefined,
    tags: () => [],
    maxTags: 3,
    actionLabel: undefined,
    checkedAt: undefined,
    interactive: true,
    still: false,
  },
)

const emit = defineEmits<{ open: []; action: []; 'open-domain': [url: string] }>()
defineSlots<{ 'status-chip'?: () => unknown }>()

const fmt = useFormat()

const CHIP_TONE = {
  crit: 'crit',
  warn: 'warn',
  ok: 'ok',
  partial: 'neutral',
  scanning: 'info',
  unreachable: 'neutral',
} as const
const chipTone = computed(() => CHIP_TONE[props.state])
const shownTags = computed(() => props.tags.slice(0, props.maxTags))
const hiddenTags = computed(() => Math.max(0, props.tags.length - props.maxTags))
const checked = computed(() => (props.checkedAt === undefined ? '' : fmt.when(props.checkedAt)))
const stale = computed(() => props.checkedAt !== undefined && isStale(props.checkedAt))
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
    :class="[`tint-${tint}`, { 'm-lift': interactive, interactive, critical: state === 'crit' }]"
    :aria-busy="scanning || undefined"
    @click="onCardClick"
  >
    <header class="head">
      <UiMonogram :name="name" :icon="icon" :tint="tint" :size="40" />
      <span class="names">
        <b class="name" :title="name">{{ name }}</b>
        <span v-if="domain || where" class="where">
          <UiDomainLink v-if="domain" bare :domain="domain" @open="emit('open-domain', $event)" />
          <template v-if="domain && where"> · </template>{{ where }}
        </span>
      </span>
      <UiChipMorph
        class="state"
        large
        :dot="state !== 'scanning'"
        :busy="scanning"
        :pulse="state === 'crit' && !still"
        :tone="chipTone"
        :label="stateLabel"
      />
    </header>

    <!-- A project with no stack facts has no tags row at all: no blank gap. -->
    <div v-if="shownTags.length > 0" class="tags">
      <UiTag
        v-for="tag in shownTags"
        :key="tag.label"
        :swatch="tag.brand ? undefined : (tag.swatch ?? 'var(--mark)')"
      >
        <UiBrandMark v-if="tag.brand" :name="tag.brand" :size="14" />{{ tag.label }}
      </UiTag>
      <UiTag v-if="hiddenTags > 0" class="more">+{{ hiddenTags }}</UiTag>
    </div>

    <UiTopology
      :components="topology"
      mode="servers"
      url-label=""
      :states="nodeStates"
      :more-label="moreLabel"
      :label="topologyLabel"
    />

    <UiRow
      class="status"
      size="status"
      :tone="status.tone"
      :tile="status.icon"
      :tile-tone="status.tileTone"
      :title="status.title"
      :meta="status.meta"
    >
      <template v-if="actionLabel || $slots['status-chip']" #trailing>
        <!-- A certificate chip stands in for the word when the main issue is a certificate. -->
        <slot name="status-chip">
          <button
            type="button"
            class="action"
            :class="`action-${status.tone}`"
            @click="emit('action')"
          >
            {{ actionLabel }}
          </button>
        </slot>
      </template>
    </UiRow>

    <div class="metrics" :class="{ dim: state === 'unreachable' }">
      <UiMetricTile v-for="(metric, i) in metrics" :key="i" form="note" v-bind="metric" />
    </div>

    <footer class="foot">
      <span class="passed">
        <template v-if="checked"
          ><span class="when" :class="{ stale }">{{ checked }}</span> ·
        </template>
        {{ passedLabel }}
      </span>
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
  gap: 10px;
  min-width: 0;
  padding: var(--space-4);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: var(--shadow-card);
}

/* The project colour is the end stop of its tint: the dot of a tag that has no mark. */
.tint-blue {
  --mark: var(--tint-blue-2);
}

.tint-lilac {
  --mark: var(--tint-lilac-2);
}

.tint-rose {
  --mark: var(--tint-rose-2);
}

.tint-amber {
  --mark: var(--tint-amber-2);
}

.tint-green {
  --mark: var(--tint-green-2);
}

.tint-teal {
  --mark: var(--tint-teal-2);
}

.tint-coral {
  --mark: var(--tint-coral-2);
}

.tint-slate {
  --mark: var(--tint-slate-2);
}

.card.critical {
  box-shadow: var(--shadow-card-crit);
}

.interactive {
  cursor: default;
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: 40px;
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

.where {
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-12);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.state {
  margin-left: auto;
}

.tags {
  display: flex;
  gap: 6px;
  height: var(--h-chip);
  overflow: hidden;
}

.status.tone-neutral {
  background: var(--surface-1);
}

/* The main issue keeps its verb: two lines at most, then the other issues on one line. */
.status :deep(.title) {
  display: -webkit-box;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

/* The status row's one action is a word, in the band's own ink. */
.action {
  flex: none;
  border-radius: var(--radius-xs);
  color: var(--ink);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.action:focus-visible {
  box-shadow: var(--focus-ring);
}

.action-warn {
  color: var(--warn-ink);
}

.action-crit {
  color: var(--crit-ink);
}

.metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
}

.metrics.dim {
  opacity: 0.5;
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
</style>
