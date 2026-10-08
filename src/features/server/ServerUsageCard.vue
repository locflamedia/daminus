<!--
  "What uses it", from the board "Server detail": the biggest folders, Docker and big log
  files with their size, the change since the baseline scan and a bar against the largest.
  A big log is a tag on the folder that holds it. The reclaimable line is a fact from
  `docker system df`, not an instruction. Only what the checks measured is listed.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import type { Usage, UsageRow } from '@/lib/server-usage'
import UiIcon from '@/ui/UiIcon.vue'

const props = defineProps<{
  usage: Usage
  /** The scan the changes are read against; `null` without one. */
  baseline: number | null
  scope: string
}>()

const { t } = useI18n()
const fmt = useFormat()

interface RowView {
  row: UsageRow
  label: string
  tag: string | null
  size: string
  delta: string
  grew: boolean
  amber: boolean
}

const rows = computed<RowView[]>(() =>
  props.usage.rows.map((row) => ({
    row,
    label: row.kind === 'docker' ? t('serverScreen.usage.docker') : row.path,
    tag: row.log
      ? t('serverScreen.usage.log', {
          name: row.log.name,
          size: fmt.measure(row.log.bytes, 'bytes').text,
        })
      : null,
    size: fmt.measure(row.bytes, 'bytes').text,
    delta: row.delta === null ? '' : row.delta === 0 ? '0' : fmt.delta(row.delta, 'bytes').text,
    grew: row.delta !== null && row.delta > 0,
    amber: row.log !== null || row.kind === 'log',
  })),
)
</script>

<template>
  <section class="card" :aria-label="t('serverScreen.usage.title')">
    <h3 class="head">
      <UiIcon name="folder" :size="16" class="mark" />
      {{ t('serverScreen.usage.title') }}
      <span v-if="baseline !== null" class="meta">{{
        t('serverScreen.baseline.option', { seq: baseline })
      }}</span>
    </h3>
    <ul v-if="rows.length > 0" class="list">
      <li v-for="(r, i) in rows" :key="`${scope}:${r.row.id}`" class="row">
        <div class="line">
          <span class="path" :class="{ mono: r.row.kind !== 'docker' }" :title="r.label">{{
            r.label
          }}</span>
          <span v-if="r.tag" class="log">{{ r.tag }}</span>
          <span class="size">{{ r.size }}</span>
          <span class="delta" :class="{ grew: r.grew }">
            <span v-if="r.grew" class="sr-only">{{
              t('serverScreen.usage.grew', { seq: baseline ?? 0 })
            }}</span>
            {{ r.delta }}
          </span>
        </div>
        <div class="bar" aria-hidden="true">
          <i
            class="fill m-grow"
            :class="{ amber: r.amber }"
            :style="{
              width: `${Math.max(2, Math.round(r.row.share * 100))}%`,
              '--d': `${200 + i * 70}ms`,
            }"
          />
        </div>
      </li>
    </ul>
    <p v-else class="empty">{{ t('serverScreen.usage.empty') }}</p>
    <p v-if="usage.reclaimable !== null" class="note">
      <i18n-t keypath="serverScreen.usage.reclaim" scope="global">
        <template #size>
          <b>{{ fmt.measure(usage.reclaimable, 'bytes').text }}</b>
        </template>
      </i18n-t>
    </p>
  </section>
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
  box-shadow: 0 1px 2px rgba(40, 48, 90, 0.05);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.mark {
  flex: none;
  color: var(--ink-3);
}

.meta {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-regular);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.line {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
  font-size: var(--text-12);
}

.path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log {
  display: inline-flex;
  align-items: center;
  flex: none;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--radius-xs);
  background: var(--warn-soft);
  color: var(--warn-ink);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.size {
  margin-left: auto;
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.delta {
  flex: none;
  width: 56px;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  text-align: right;
  white-space: nowrap;
}

.delta.grew {
  color: var(--warn-ink);
}

.bar {
  position: relative;
  height: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--surface-2);
}

.fill {
  position: absolute;
  inset: 0 auto 0 0;
  display: block;
  border-radius: 3px;
  background: var(--accent);
}

.fill.amber {
  background: var(--chart-amber);
}

.empty {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-12);
  line-height: 1.45;
}

.note {
  margin: auto 0 0;
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 1.45;
}

.note b {
  color: var(--ink);
  font-weight: var(--weight-medium);
}
</style>
