<!--
  One of the four numbers of the server page, from the board "Server detail": the label with
  its state tag, the value large with its unit small, the change against the chosen baseline
  under it, and a 96 by 40 sparkline over the last scans. A card past its warn line gets the
  amber under-glow. The value is the core's own reading; the state tag is the core's severity.
-->
<script setup lang="ts">
import { computed } from 'vue'
import UiEmptyValue from '@/ui/UiEmptyValue.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiRoll from '@/ui/UiRoll.vue'
import UiSparkline from '@/ui/UiSparkline.vue'
import type { IconName } from '@/ui/icon-paths'
import { vEnter } from '@/lib/motion'
import type { KpiView } from './server-text'

const props = defineProps<{
  view: KpiView
  index: number
  sparkLabel: string
  /** What one arrival is: the host and the scan number, so a new scan plays it again. */
  scope: string
}>()

const ICON: Record<KpiView['id'], IconName> = {
  load: 'pulse',
  memory: 'memory',
  disk: 'disk',
  swap: 'swap',
}
const glow = computed(() => props.view.tag.tone === 'warn' || props.view.tag.tone === 'crit')
</script>

<template>
  <article class="kpi" :class="{ glow, crit: view.tag.tone === 'crit' }">
    <h3 class="head">
      <UiIcon :name="ICON[view.id]" :size="16" class="mark" />
      <span class="label">{{ view.label }}</span>
      <span class="tag" :class="`tag-${view.tag.tone}`">{{ view.tag.text }}</span>
    </h3>
    <div class="body">
      <div
        v-enter="{ index: index, kind: 'reveal', once: `${scope}:kpi:${view.id}` }"
        class="figure"
      >
        <span class="big">
          <template v-if="view.value !== null">
            <UiRoll :text="view.value" /><small>{{ view.small }}</small>
          </template>
          <UiEmptyValue
            v-else
            :reason="view.needsPermission ? 'permission' : 'none'"
            :hint="view.reason ?? undefined"
          />
        </span>
        <span class="delta" :class="`tone-${view.tone}`">
          <template v-if="view.detail">{{ view.detail }}</template>
          <template v-if="view.detail && view.change"> · </template>
          <template v-if="view.change">
            <span v-if="view.glyph" class="glyph" aria-hidden="true">{{ view.glyph }}</span>
            <span v-if="view.glyphWords" class="sr-only">{{ view.glyphWords }}</span>
            {{ view.change }}
          </template>
        </span>
      </div>
      <div class="spark">
        <UiSparkline
          :values="view.spark.values"
          :tone="view.spark.tone"
          :height="40"
          :label="sparkLabel"
          :once="`${scope}:spark:${view.id}`"
        />
      </div>
    </div>
  </article>
</template>

<style scoped>
.kpi {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 14px var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-0);
  box-shadow: 0 1px 2px rgba(40, 48, 90, 0.05);
}

.kpi.glow {
  box-shadow:
    0 1px 2px rgba(40, 48, 90, 0.05),
    0 12px 24px -16px color-mix(in srgb, var(--warn-solid) 45%, transparent);
}

.kpi.crit {
  box-shadow:
    0 1px 2px rgba(40, 48, 90, 0.05),
    0 12px 24px -16px color-mix(in srgb, var(--crit-solid) 55%, transparent);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.mark {
  flex: none;
  color: var(--ink-3);
}

.label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag {
  display: inline-flex;
  align-items: center;
  height: 20px;
  margin-left: auto;
  padding: 0 6px;
  border-radius: var(--radius-xs);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.tag-ok {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.tag-warn {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.tag-crit {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.tag-info {
  background: var(--info-soft);
  color: var(--info-ink);
}

.tag-neutral {
  background: var(--surface-1);
  color: var(--ink-3);
}

.body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px;
  gap: var(--space-2);
  align-items: end;
}

.figure {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.big {
  display: flex;
  align-items: baseline;
  font-size: var(--text-28);
  font-weight: var(--weight-medium);
  letter-spacing: -0.03em;
  line-height: 1;
}

.big small {
  margin-left: 2px;
  color: var(--ink-3);
  font-size: var(--text-13);
  font-weight: var(--weight-regular);
  letter-spacing: 0;
  white-space: nowrap;
}

.delta {
  min-height: 14px;
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tone-warn {
  color: var(--warn-ink);
}

.tone-crit {
  color: var(--crit-ink);
}

.tone-ok {
  color: var(--ok-ink);
}

.spark {
  width: 96px;
}
</style>
