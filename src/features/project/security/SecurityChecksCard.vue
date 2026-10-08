<!--
  "Checks this scan", from the board "Project · Security": the nine checks, each on its own
  row, the clean ones too, so a missing finding is visible and not assumed. At the top the
  number of critical checks with a 6 px bar of the severity mix. A row that could not be fully
  answered says how far it got ("41 of 212 · needs permission"); a certificate is its chip with
  its detail line under the row.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Item } from '@/api'
import { checkName } from '@/lib/issue-text'
import {
  tlsNeedingDetail,
  type RowState,
  type SecurityRow,
  type SeverityMix,
} from '@/lib/security-rows'
import { staggerDelay } from '@/lib/motion'
import UiCard from '@/ui/UiCard.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiTlsChip from '@/ui/UiTlsChip.vue'
import UiTooltip from '@/ui/UiTooltip.vue'
import { useMsg } from './use-msg'

const props = defineProps<{
  rows: readonly SecurityRow[]
  mix: SeverityMix
  /** "9 in 1.8 s" or "9 checks". */
  meta: string
  /** Rows pop in one after another, once, when the results arrive. */
  play: boolean
}>()

const { t } = useI18n()
const msg = useMsg()

const total = computed(() => props.mix.crit + props.mix.warn + props.mix.info + props.mix.ok)
const parts = [
  ['crit', 'var(--crit-solid)'],
  ['warn', 'var(--warn-solid)'],
  ['info', 'var(--accent)'],
  ['ok', 'var(--ok-solid)'],
] as const
const mixLabel = computed(() =>
  t('projectSecurity.checks.mix', {
    crit: props.mix.crit,
    warn: props.mix.warn,
    info: props.mix.info,
    ok: props.mix.ok,
  }),
)

const GLYPH: Record<string, string> = {
  ok: 'm3.5 8.4 3 3L12.5 5',
  crit: 'M5 5l6 6M11 5l-6 6',
  warn: 'M8 4v5 M8 11.5v.1',
  info: 'M8 5v6',
}

/** The tone of the glyph disc and of the text beside it. */
function tone(state: RowState): 'ok' | 'crit' | 'warn' | 'info' | 'quiet' {
  if (state === 'ok') return 'ok'
  if (state === 'crit' || state === 'warn' || state === 'info') return state
  if (state === 'needs_perm' || state === 'unknown') return 'warn'
  return 'quiet'
}

function valueText(row: SecurityRow): string {
  if (row.state === 'off') return t('projectSecurity.value.off')
  if (row.state === 'none') return t('projectSecurity.value.noResult')
  if (row.staleSince !== null) return t('projectSecurity.value.staleSince', { seq: row.staleSince })
  return row.value ? msg('value', row.value) : ''
}

function strongText(row: SecurityRow): string {
  return row.strong && row.staleSince === null ? msg('value', row.strong) : ''
}

function tooltip(row: SecurityRow): string {
  return row.items.map((i: Item) => i.key.target || i.key.host).join('\n')
}

function detailItems(row: SecurityRow): Item[] {
  if (row.id !== 'url.tls' || row.staleSince !== null) return []
  const lead = row.tls?.key.target
  return tlsNeedingDetail(row).filter((i) => i.key.target !== lead)
}

const label = (id: string) => checkName(id)
</script>

<template>
  <UiCard class="checks" :style="{ '--card-gap': '8px' }">
    <div class="head">
      <span class="title">{{ t('projectSecurity.checks.title') }}</span>
      <span class="meta">{{ meta }}</span>
    </div>
    <div class="mix">
      <span class="big" :class="{ none: mix.crit === 0 }">{{ mix.crit }}</span>
      <span class="word">{{ t('projectSecurity.checks.critical') }}</span>
      <div class="bar" role="img" :aria-label="mixLabel" :title="mixLabel">
        <i
          v-for="(part, i) in parts"
          v-show="mix[part[0]] > 0"
          :key="part[0]"
          :class="{ 'm-grow': play }"
          :style="{
            flex: mix[part[0]],
            background: part[1],
            '--d': staggerDelay(i, 120),
          }"
        />
        <i v-if="total === 0" class="empty" />
      </div>
    </div>
    <ul class="list" :aria-label="t('projectSecurity.checks.list')">
      <li v-for="(row, i) in rows" :key="row.id" class="item">
        <div
          class="chk"
          :class="[
            `t-${tone(row.state)}`,
            { warm: row.state === 'needs_perm' || row.state === 'unknown' },
          ]"
        >
          <span class="disc" :class="{ 'm-pop': play }" :style="{ '--d': staggerDelay(i, 300) }">
            <svg
              v-if="row.state in GLYPH"
              width="9"
              height="9"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="2.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path :d="GLYPH[row.state]" />
            </svg>
            <UiIcon v-else-if="row.state === 'needs_perm'" name="lock" :size="10" :stroke="2" />
            <UiIcon v-else-if="row.state === 'expected'" name="check" :size="10" :stroke="2" />
            <UiIcon v-else name="minus" :size="10" :stroke="2" />
          </span>
          <UiTooltip :text="tooltip(row)" :disabled="row.items.length < 2">
            <span class="id">{{ row.id }}</span>
          </UiTooltip>
          <span class="val">
            <UiTlsChip
              v-if="row.id === 'url.tls' && row.tls && row.staleSince === null"
              :item="row.tls"
              class="chip"
            />
            <template v-else>
              <b v-if="strongText(row)" class="strong">{{ strongText(row) }}</b>
              <span v-if="strongText(row)" class="sep"> · </span>
              <span class="text">{{ valueText(row) }}</span>
            </template>
            <span v-if="row.more > 0 && row.staleSince === null" class="more">{{
              t('projectSecurity.value.more', { n: row.more })
            }}</span>
            <span v-if="row.expected > 0" class="chip-expected">{{
              t('projectSecurity.card.expected')
            }}</span>
          </span>
          <span class="sr-only">{{ label(row.id) }}</span>
        </div>
        <div v-for="d in detailItems(row)" :key="d.key.target" class="detail">
          <UiTlsChip :item="d" detail />
        </div>
      </li>
    </ul>
  </UiCard>
</template>

<style scoped>
.checks {
  --card-pad: var(--space-4);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.meta {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-regular);
}

.mix {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 2px 4px;
}

.big {
  color: var(--crit-ink);
  font-size: var(--text-20);
  font-weight: var(--weight-medium);
  letter-spacing: -0.02em;
}

.big.none {
  color: var(--ink-3);
}

.word {
  color: var(--ink-2);
  font-size: var(--text-12);
}

.bar {
  display: flex;
  gap: 2px;
  width: 120px;
  height: 6px;
  margin-left: auto;
  overflow: hidden;
  border-radius: 3px;
}

.bar i {
  display: block;
}

.bar .empty {
  flex: 1;
  background: var(--surface-3);
}

.list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.chk {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  gap: var(--space-2);
  align-items: center;
  height: 28px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-xs);
  font-size: var(--text-12);
}

.item:nth-child(odd) .chk {
  background: var(--surface-1);
}

.item .chk.warm {
  background: var(--warn-soft);
}

.disc {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
}

.t-ok .disc {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.t-crit .disc {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.t-warn .disc {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.warm .disc {
  background: transparent;
}

.t-info .disc {
  background: var(--info-soft);
  color: var(--info-ink);
}

.t-quiet .disc {
  background: var(--surface-3);
  color: var(--ink-3);
}

.id {
  display: block;
  overflow: hidden;
  font-family: var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.val {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--ink-3);
  font-size: var(--text-11);
  white-space: nowrap;
}

.t-crit .val {
  color: var(--crit-ink);
  font-weight: var(--weight-medium);
}

.t-warn .val {
  color: var(--warn-ink);
  font-weight: var(--weight-medium);
}

.t-info .val {
  color: var(--info-ink);
}

.strong {
  font-weight: var(--weight-medium);
}

.more {
  color: var(--ink-3);
  font-weight: var(--weight-regular);
}

.chip-expected {
  padding: 0 5px;
  border-radius: 5px;
  background: var(--surface-3);
  color: var(--ink-2);
  font-weight: var(--weight-medium);
}

.chip :deep(.chip) {
  height: 20px;
}

.detail {
  padding: 2px var(--space-2) 6px 34px;
}

/* The card is narrow: the chip sits over its lines instead of beside them. */
.detail :deep(.tls) {
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
