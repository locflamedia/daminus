<!--
  The calm banner over results more than a day old (board "Overview · old results"): what was
  true, when, and what a scan costs; a quiet chip for expected rules and the one button that
  fixes it. Nothing here pretends the numbers are current.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { useReportStore } from '@/stores/report'
import { useScanPanelStore } from '@/stores/scan-panel'
import { useSettingsStore } from '@/stores/settings'
import UiButton from '@/ui/UiButton.vue'
import UiIcon from '@/ui/UiIcon.vue'

const props = defineProps<{ days: number; tookMs: number | null }>()

const { t } = useI18n()
const fmt = useFormat()
const reports = useReportStore()
const panel = useScanPanelStore()
const settings = useSettingsStore()

const report = computed(() => reports.latest)
const issues = computed(() =>
  report.value ? report.value.counts.crit + report.value.counts.warn : 0,
)
/** The weekday the scan was read on: "Sunday", "Chủ nhật". */
const day = computed(() =>
  report.value?.scanned_at
    ? new Intl.DateTimeFormat(settings.language === 'en' ? 'en-US' : settings.language, {
        weekday: 'long',
      }).format(new Date(report.value.scanned_at))
    : '',
)
const expected = computed(() => report.value?.counts.expected ?? 0)
const due = computed(() => report.value?.rules_due.length ?? 0)

const chip = computed(() => {
  const head = t('overview.expected', { n: expected.value })
  const tail =
    due.value > 0 ? t('overview.reviewDue', { n: due.value }) : t('overviewScreen.stale.noneDue')
  return `${head} · ${tail}`
})

const text = computed(() => {
  const was =
    issues.value === 0
      ? t('overviewScreen.stale.clear', { day: day.value })
      : t('overviewScreen.stale.open', {
          issues: t('nav.issues', { n: issues.value }, issues.value),
          day: day.value,
        })
  return props.tookMs === null
    ? was
    : `${was} ${t('overviewScreen.stale.cost', { took: fmt.duration(props.tookMs) })}`
})
</script>

<template>
  <section class="banner m-enter" role="status">
    <span class="tile"><UiIcon name="clock" :size="18" /></span>
    <div class="words">
      <b>{{ t('overviewScreen.stale.title', { n: days }, days) }}</b>
      <span>{{ text }}</span>
    </div>
    <span class="grow" />
    <span v-if="expected > 0" class="chip">
      <UiIcon name="check-circle" :size="12" :stroke="1.8" />
      {{ chip }}
    </span>
    <UiButton variant="primary" lifted class="sheen" shortcut="⌘R" @click="panel.start()">
      ↳ {{ t('overviewScreen.stale.scanNow') }}
    </UiButton>
  </section>
</template>

<style scoped>
.banner {
  display: flex;
  align-items: center;
  flex: none;
  gap: 14px;
  padding: 14px var(--space-4);
  border-radius: var(--radius-md);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--warn-soft) 55%, var(--surface-0)),
    var(--surface-0)
  );
}

.tile {
  display: grid;
  flex: none;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.words {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  line-height: 1.3;
}

.words b {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.words span {
  color: var(--ink-2);
  font-size: var(--text-12);
}

.grow {
  flex-grow: 1;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.sheen {
  position: relative;
  overflow: hidden;
}

.sheen::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(105deg, transparent 35%, rgb(255 255 255 / 30%) 50%, transparent 65%);
  background-size: 250% 100%;
  content: '';
  pointer-events: none;
  animation: sheen 4s 1s infinite;
}

@keyframes sheen {
  0% {
    background-position: 130% 0;
  }

  25%,
  100% {
    background-position: -60% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sheen::after {
    animation: none;
    opacity: 0;
  }
}
</style>
