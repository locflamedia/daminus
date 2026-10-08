<!--
  Settings › Hosts, the list: every host of the ssh config with its address, the projects that
  use it and when a scan last reached it. An unreachable host is red with the age; a host left
  out of scans is dimmed. The row that is open is washed in the accent.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { formatClock, formatWhen } from '@/lib/format'
import { useHostsSettingsStore } from '@/stores/hosts-settings'
import UiIcon from '@/ui/UiIcon.vue'

const { t } = useI18n()
const store = useHostsSettingsStore()

function reached(at: string | null, failed: boolean): string {
  if (at === null) return t('settingsHosts.list.never')
  return failed ? formatWhen(at) : formatClock(at)
}
</script>

<template>
  <section class="card" aria-labelledby="hosts-list-title">
    <h3 id="hosts-list-title" class="ct">
      <UiIcon name="server" />{{
        t('settingsHosts.list.title', { n: store.rows.length }, store.rows.length)
      }}
      <span class="m">{{ t('settingsHosts.list.columns') }}</span>
    </h3>
    <ul class="zebra">
      <li v-for="row in store.rows" :key="row.alias">
        <button
          type="button"
          class="row"
          :class="{ on: store.selected === row.alias, off: !row.included }"
          :aria-pressed="store.selected === row.alias"
          @click="store.select(row.alias)"
        >
          <i class="dot" :class="row.included ? row.state : 'off'" aria-hidden="true" />
          <span class="who">
            <b class="mono alias">{{ row.alias }}</b>
            <span class="mono target">
              {{ row.target
              }}{{ row.via ? ` ${t('settingsHosts.list.via', { host: row.via })}` : '' }}
            </span>
          </span>
          <span
            class="projects"
            :class="{ bad: row.projects.length === 0 && row.state === 'failed' }"
          >
            {{
              row.included
                ? row.projects.join(', ') || t('settingsHosts.list.noProject')
                : t('settingsHosts.list.off')
            }}
          </span>
          <span class="when" :class="{ bad: row.state === 'failed' }">
            {{ reached(row.lastReached, row.state === 'failed') }}
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: var(--space-5);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: var(--shadow-seg);
}

.ct {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 20px;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.ct :deep(svg) {
  color: var(--ink-3);
}

.m {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-regular);
}

.zebra {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.zebra > li:nth-child(odd) .row {
  background: var(--surface-well);
}

.row {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) 110px 56px;
  gap: var(--space-3);
  align-items: center;
  width: 100%;
  min-height: 52px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  font-size: var(--text-12);
  text-align: left;
}

.zebra > li .row.on {
  background: var(--accent-soft);
}

.row:focus-visible {
  box-shadow: var(--focus-ring);
}

.row.off .who,
.row.off .when {
  opacity: 0.6;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ink-5);
}

.dot.reached {
  background: var(--ok-solid);
}

.dot.failed {
  background: var(--crit-solid);
}

.who {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.alias {
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.target {
  overflow: hidden;
  color: var(--ink-3);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.projects {
  color: var(--ink-2);
  font-size: var(--text-11);
}

.when {
  color: var(--ink-3);
  font-size: var(--text-11);
  text-align: right;
}

.bad {
  color: var(--crit-ink);
}
</style>
