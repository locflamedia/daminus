<!--
  The live preview beside Settings › General: a mini sidebar and a project card that re-word
  and re-format at once when the language changes, the words that never change, and the
  toast that says the switch needed no restart. The sample is fixed; nothing here is read from
  a scan.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatClock } from '@/lib/format'
import { useSettingsStore } from '@/stores/settings'
import UiIcon from '@/ui/UiIcon.vue'
import UiMonogram from '@/ui/UiMonogram.vue'

defineProps<{ toast: string | null }>()

const { t } = useI18n()
const settings = useSettingsStore()

const SAMPLE = new Date(2026, 8, 26, 13, 42)

const size = (gb: number) =>
  `${new Intl.NumberFormat(settings.language, { maximumFractionDigits: 1 }).format(gb)} GB`
const ago = computed(() =>
  t('settingsGeneral.formats.hoursAgo', { n: 2 }, { plural: 2, locale: settings.language }),
)
const clock = computed(() => formatClock(SAMPLE, settings.language))
const stats = computed(() => [
  { key: 'uptime', value: '200 · 212 ms' },
  { key: 'disk', value: size(3.2) },
  { key: 'database', value: size(1.8) },
])
const scanLine = computed(() =>
  t('settingsGeneral.preview.scan', { clock: clock.value, ago: ago.value }),
)
const count = (key: string, n: number) => t(`settingsGeneral.preview.${key}`, { n }, { plural: n })
</script>

<template>
  <aside class="preview" aria-labelledby="general-preview-title">
    <div class="top">
      <span class="live" aria-hidden="true" />
      <span id="general-preview-title">{{ t('settingsGeneral.preview.live') }}</span>
      <span class="code">{{ settings.language }}</span>
    </div>

    <div class="mini-side">
      <span class="side-row on"
        >{{ t('settingsGeneral.preview.overview') }}
        <span class="side-meta">{{ count('issues', 6) }}</span></span
      >
      <span class="side-row"
        >{{ t('settingsGeneral.preview.history') }} <span class="side-meta">12</span></span
      >
    </div>

    <div class="project">
      <div class="head">
        <span class="mark"><UiMonogram name="kho-hang" tint="rose" :size="18" /></span>
        <div class="names">
          <b>kho-hang</b>
          <span class="sub">khohang.vn · {{ count('servers', 2) }}</span>
        </div>
        <span class="chip">{{ count('critical', 2) }}</span>
      </div>
      <div class="finding">
        <b>{{ t('settingsGeneral.preview.finding') }}</b>
        <span class="link">{{ t('settingsGeneral.preview.security') }}</span>
      </div>
      <div class="stats">
        <div v-for="stat in stats" :key="stat.key" class="stat">
          <span class="stat-name">{{ t(`settingsGeneral.preview.${stat.key}`) }}</span>
          <b class="stat-value">{{ stat.value }}</b>
        </div>
      </div>
      <span class="sub">{{ scanLine }}</span>
    </div>

    <div class="never">
      <b>{{ t('settingsGeneral.preview.neverTitle') }}</b>
      <span class="mono">{{ t('settingsGeneral.preview.never') }}</span>
    </div>

    <Transition name="toast">
      <div v-if="toast" class="toast" role="status">
        <UiIcon name="check" :size="14" />{{ toast }}
      </div>
    </Transition>
  </aside>
</template>

<style scoped>
.preview {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  background: linear-gradient(160deg, var(--side-1), var(--side-2));
}

.top {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--ink-2);
  font-size: var(--text-12);
}

.live {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ok-solid);
}

.code {
  margin-left: auto;
  font-family: var(--font-mono);
}

.mini-side {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px;
  border-radius: var(--radius-md);
  background: var(--side-card);
  font-size: var(--text-12);
}

.side-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 28px;
  padding: 0 10px;
  border-radius: var(--space-2);
}

.side-row.on {
  background: var(--surface-0);
}

.side-meta {
  margin-left: auto;
  color: var(--ink-3);
}

.project {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: var(--radius-md);
  background: var(--surface-0);
  box-shadow: var(--shadow-card);
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mark {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.names {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.names b {
  font-size: 14px;
  font-weight: var(--weight-medium);
}

.sub {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.chip {
  display: inline-flex;
  align-items: center;
  height: 22px;
  margin-left: auto;
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  background: var(--crit-soft);
  color: var(--crit-ink);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.finding {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--crit-soft);
  color: var(--crit-ink);
  font-size: var(--text-12);
}

.finding b,
.link {
  font-weight: var(--weight-medium);
}

.link {
  margin-left: auto;
  white-space: nowrap;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.stat {
  padding: var(--space-2) 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.stat-name {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.stat-value {
  display: block;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.never {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--side-card);
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.45;
}

.never b {
  color: var(--ink);
  font-weight: var(--weight-medium);
}

.mono {
  font-family: var(--font-mono);
  font-size: var(--text-11);
}

.toast {
  position: absolute;
  right: var(--space-4);
  bottom: var(--space-4);
  left: var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 10px var(--space-3);
  border-radius: var(--space-3);
  background: var(--btn);
  color: var(--btn-ink);
  font-size: var(--text-12);
}

.toast-enter-active {
  transition:
    opacity var(--dur-toast) var(--ease-out),
    transform var(--dur-toast) var(--ease-out);
}

.toast-leave-active {
  transition:
    opacity var(--dur-toast-out) var(--ease-out),
    transform var(--dur-toast-out) var(--ease-out);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
