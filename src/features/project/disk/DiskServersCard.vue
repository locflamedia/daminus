<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { diskTone } from '@/lib/rollups'
import type { FreeRow, ServerDisk } from '@/lib/project-disk'
import ProjectCard from '../common/ProjectCard.vue'

defineProps<{ disks: readonly ServerDisk[]; free: readonly FreeRow[]; manyHosts: boolean }>()

const { t } = useI18n()
const fmt = useFormat()
</script>

<template>
  <ProjectCard
    icon="server"
    soft
    :title="t('projectDisk.servers.title')"
    :meta="t('projectDisk.servers.meta')"
    :gap="10"
  >
    <div v-if="disks.some((d) => d.pct !== null)" class="disks">
      <div v-for="d in disks" :key="d.host" class="disk">
        <span class="line">
          <span class="host">{{ t('projectDisk.servers.fill', { host: d.host }) }}</span>
          <b v-if="d.pct !== null" class="pct" :class="diskTone(d.pct)">{{
            fmt.measure(d.pct, '%').text
          }}</b>
        </span>
        <div
          class="bar"
          role="img"
          :aria-label="d.pct === null ? '' : fmt.measure(d.pct, '%').text"
        >
          <i
            v-if="d.pct !== null"
            class="fill m-grow"
            :class="diskTone(d.pct)"
            :style="{ width: `${Math.min(100, d.pct)}%` }"
          />
        </div>
        <span v-if="d.shares.length" class="shares">
          {{
            d.shares
              .map(
                (s) =>
                  `${s.docker ? t('projectDisk.servers.docker') : s.label} ${fmt.measure(s.bytes, 'bytes').text}`,
              )
              .join(' · ')
          }}
        </span>
      </div>
    </div>
    <p v-else class="shares">{{ t('projectDisk.servers.none') }}</p>

    <template v-if="free.length > 0">
      <h4 class="sub">{{ t('projectDisk.free.title') }}</h4>
      <ul class="rows">
        <li v-for="r in free" :key="`${r.host}${r.kind}`" class="row">
          <span>{{
            manyHosts
              ? t('projectDisk.free.on', { what: t(`projectDisk.free.${r.kind}`), host: r.host })
              : t(`projectDisk.free.${r.kind}`)
          }}</span>
          <b class="amount">≈ {{ fmt.measure(r.bytes, 'bytes').text }}</b>
        </li>
      </ul>
      <span class="shares">{{ t('projectDisk.free.note') }}</span>
    </template>
  </ProjectCard>
</template>

<style scoped>
.disks {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.disk {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.line {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-12);
}

.host {
  font-family: var(--font-mono);
}

.pct {
  font-weight: var(--weight-medium);
}

.pct.warn {
  color: var(--warn-ink);
}

.pct.crit {
  color: var(--crit-ink);
}

.bar {
  position: relative;
  height: 8px;
  overflow: hidden;
  border-radius: 4px;
  background: var(--seg-track);
}

.fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 4px;
  background: var(--accent);
  transform-origin: left;
}

.fill.warn {
  background: var(--chart-amber);
}

.fill.crit {
  background: var(--crit-solid);
}

.shares {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-11);
}

.sub {
  margin: 6px 0 0;
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.rows {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 36px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  font-size: var(--text-12);
}

.row:nth-child(odd) {
  background: var(--surface-0);
}

.amount {
  color: var(--ok-ink);
  font-family: var(--font-mono);
  font-weight: var(--weight-medium);
}
</style>
