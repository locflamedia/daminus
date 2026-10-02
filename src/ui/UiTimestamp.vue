<!--
  Timestamp, from the board "Micro UI": a 12 px clock and the time ("11:58", "yesterday
  18:40", "3 d ago") in ink-3. After 24 hours it turns warn-ink and medium, because a stale
  reading is a thing to notice. The tooltip has the full date and, when given, the scan
  number. The words come from the locale, so en and vi switch live.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { isStale } from '@/lib/micro'
import UiIcon from './UiIcon.vue'
import UiTooltip from './UiTooltip.vue'

const props = defineProps<{ at: string | number | Date; seq?: number; now?: number }>()

const { t } = useI18n()
const fmt = useFormat()

const text = computed(() => fmt.when(props.at))
const stale = computed(() => isStale(props.at, props.now))
const full = computed(() =>
  props.seq === undefined
    ? fmt.dateTime(props.at)
    : `${fmt.dateTime(props.at)} · ${t('ui.scanNumber', { seq: props.seq })}`,
)
</script>

<template>
  <UiTooltip :text="full">
    <time class="time" :class="{ stale }" :datetime="new Date(at).toISOString()" tabindex="0">
      <UiIcon name="clock" :size="12" />{{ text }}
    </time>
  </UiTooltip>
</template>

<style scoped>
.time {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: var(--radius-xs);
  color: var(--ink-3);
  font-size: var(--text-12);
  white-space: nowrap;
}

.time:focus-visible {
  box-shadow: var(--focus-ring);
}

.stale {
  color: var(--warn-ink);
  font-weight: var(--weight-medium);
}
</style>
