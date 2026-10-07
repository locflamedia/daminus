<!--
  The range bar of Project · History, from the board: the window (7 days, 30 days, All), the pair
  of scans every change on screen is measured between, and what the window holds. Export is
  not drawn: the core has no export command yet.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ScanSummary } from '@/api'
import { formatDate } from '@/lib/format'
import { HISTORY_RANGES, type ComparePair, type HistoryRange } from '@/lib/history-range'
import { useSettingsStore } from '@/stores/settings'
import UiIcon from '@/ui/UiIcon.vue'
import UiMenu, { type MenuItem } from '@/ui/UiMenu.vue'
import UiSeg from '@/ui/UiSeg.vue'

const props = defineProps<{
  range: HistoryRange
  scans: readonly ScanSummary[]
  pair: ComparePair | null
}>()
const emit = defineEmits<{ 'update:range': [range: HistoryRange]; pick: [pair: ComparePair] }>()

const { t } = useI18n()
const settings = useSettingsStore()

const options = computed(() =>
  HISTORY_RANGES.map((value) => ({ value, label: t(`projectHistory.range.${value}`) })),
)

const latest = computed(() => props.scans[props.scans.length - 1]?.seq)

function label(seq: number): string {
  const scan = props.scans.find((s) => s.seq === seq)
  if (!scan) return `#${seq}`
  return seq === latest.value
    ? t('projectHistory.compare.optionToday', { seq })
    : t('projectHistory.compare.option', {
        seq,
        date: formatDate(scan.finished_at, settings.language),
      })
}

function items(side: 'from' | 'to'): MenuItem[] {
  const other = side === 'from' ? props.pair?.to : props.pair?.from
  return props.scans.map((s) => ({
    id: String(s.seq),
    label: label(s.seq),
    checked: s.seq === props.pair?.[side],
    disabled:
      side === 'from'
        ? other !== undefined && s.seq >= other
        : other !== undefined && s.seq <= other,
  }))
}

function choose(side: 'from' | 'to', id: string) {
  if (!props.pair) return
  emit('pick', { ...props.pair, [side]: Number(id) })
}

const summary = computed(() => {
  const first = props.scans[0]
  const last = props.scans[props.scans.length - 1]
  if (!first || !last) return ''
  const from = formatDate(first.finished_at, settings.language)
  return props.scans.length === 1
    ? t('projectHistory.summaryOne', { from })
    : t('projectHistory.summary', {
        n: props.scans.length,
        from,
        to: formatDate(last.finished_at, settings.language),
      })
})
</script>

<template>
  <div class="bar">
    <UiSeg
      :model-value="range"
      :options="options"
      :label="t('projectHistory.range.label')"
      semantics="radio"
      @update:model-value="emit('update:range', $event as HistoryRange)"
    />
    <div
      v-if="pair"
      class="pair"
      role="group"
      :aria-label="t('projectHistory.compare.label')"
      :title="t('projectHistory.compare.hint')"
    >
      <span class="word">{{ t('projectHistory.compare.label') }}</span>
      <UiMenu
        :items="items('from')"
        :label="t('projectHistory.compare.from')"
        compact
        @select="choose('from', $event)"
      >
        <template #trigger="{ attrs, toggle }">
          <button
            v-bind="attrs"
            type="button"
            class="tag"
            :aria-label="t('projectHistory.compare.from')"
            @click="toggle"
          >
            {{ label(pair.from) }}
          </button>
        </template>
      </UiMenu>
      <UiIcon name="arrow-right" :size="14" class="arrow" />
      <UiMenu
        :items="items('to')"
        :label="t('projectHistory.compare.to')"
        compact
        @select="choose('to', $event)"
      >
        <template #trigger="{ attrs, toggle }">
          <button
            v-bind="attrs"
            type="button"
            class="tag on"
            :aria-label="t('projectHistory.compare.to')"
            @click="toggle"
          >
            {{ label(pair.to) }}
          </button>
        </template>
      </UiMenu>
    </div>
    <span class="grow" />
    <span class="summary">{{ summary }}</span>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-3);
}

.pair {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--h-control);
  padding: 0 6px 0 var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  box-shadow: var(--shadow-control);
  font-size: var(--text-12);
}

.tag {
  height: 20px;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--surface-1);
  color: var(--ink-2);
  font: var(--weight-medium) var(--text-11) var(--font-mono);
}

.tag.on {
  background: var(--info-soft);
  color: var(--info-ink);
}

.tag:focus-visible {
  box-shadow: var(--focus-ring);
}

.arrow {
  color: var(--ink-4);
}

.grow {
  flex: 1 1 0;
}

.summary {
  color: var(--ink-3);
  font-size: var(--text-12);
}
</style>
