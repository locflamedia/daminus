<!--
  Settings › Hosts, "SSH connect time": one column per scan, the last twelve, a slow connect in
  amber, and the median beside the title.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { connectMedian, connectSeries, formatSeconds, slowestPoint } from '@/lib/hosts-settings'
import { useHistoryStore } from '@/stores/history'
import { useSettingsStore } from '@/stores/settings'

const props = defineProps<{ host: string }>()

const { t } = useI18n()
const history = useHistoryStore()
const settings = useSettingsStore()

const points = computed(() => connectSeries(history.view, props.host))
const median = computed(() => connectMedian(points.value))
const top = computed(() => Math.max(1, ...points.value.map((p) => p.ms)))
const slow = computed(() => slowestPoint(points.value))
</script>

<template>
  <div v-if="points.length > 0" class="time">
    <span class="head">
      {{ t('settingsHosts.detail.connect') }}
      <span class="meta">
        {{
          t('settingsHosts.detail.connectMeta', {
            n: points.length,
            median: formatSeconds(median ?? 0, settings.language),
          })
        }}
      </span>
    </span>
    <ul class="bars" role="img" :aria-label="t('settingsHosts.detail.connect')">
      <li
        v-for="p in points"
        :key="p.seq"
        class="bar"
        :class="{ slow: p.slow }"
        :style="{ height: `${Math.max(8, (p.ms / top) * 100)}%` }"
        :title="`#${p.seq} · ${formatSeconds(p.ms, settings.language)}`"
      />
    </ul>
    <span v-if="slow" class="lbl">
      {{
        t('settingsHosts.detail.slowest', {
          seq: slow.seq,
          time: formatSeconds(slow.ms, settings.language),
        })
      }}
    </span>
  </div>
</template>

<style scoped>
.time {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.head {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.meta,
.lbl {
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-regular);
}

.bars {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 36px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bar {
  flex: none;
  width: calc((100% - 44px) / 12);
  border-radius: 3px;
  background: var(--chart-bar-old);
}

.bar.slow {
  background: var(--chart-amber-soft);
}
</style>
