<!--
  "What discover reads", in the sidebar: the read-only commands the discover script really
  runs, six lines, no hidden probes (see `crates/core/discover/discover.sh`). The script never
  opens a `.env`; it only lists and tests them.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UiIcon from '@/ui/UiIcon.vue'

const { t } = useI18n()

/** What the script runs, one source per line, in the order it reads them. */
const LINES = [
  'read nginx.conf',
  'docker ps -a --format',
  'pm2 jlist',
  'read /proc/PID/comm',
  'read /proc/net/tcp',
  "find <code dirs> -name '.env*'",
] as const
</script>

<template>
  <Teleport to="#setup-rail" defer>
    <section class="rail" :aria-label="t('setupDiscover.rail.title')">
      <header>
        <UiIcon name="eye" :size="16" />
        <b>{{ t('setupDiscover.rail.title') }}</b>
      </header>
      <ul class="code">
        <li v-for="line in LINES" :key="line">
          <span aria-hidden="true">›</span> <code>{{ line }}</code>
        </li>
      </ul>
      <p>{{ t('setupDiscover.rail.note') }}</p>
    </section>
  </Teleport>
</template>

<style scoped>
.rail {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: 14px;
  background: var(--side-card);
}

header {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  color: var(--ok-ink);
}

header b {
  color: var(--ink);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.code {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: var(--space-2) 10px;
  border-radius: 10px;
  background: var(--code);
  color: var(--code-ink);
  font: var(--text-11) / 1.55 var(--font-mono);
  list-style: none;
}

.code span {
  color: var(--code-dim);
}

code {
  font: inherit;
  overflow-wrap: anywhere;
}

p {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 1.45;
}
</style>
