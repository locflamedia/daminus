<!--
  Also listening: the ports that have a listener but no site or app to account for them, kept
  and not hidden. A database port open to the internet is amber now and a real finding in the
  first security scan.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Listening } from '@/lib/discover-view'
import UiIcon from '@/ui/UiIcon.vue'

defineProps<{ ports: readonly Listening[]; fresh: ReadonlySet<string> }>()

const { t } = useI18n()
</script>

<template>
  <section class="card" :aria-label="t('setupDiscover.columns.listening')">
    <header class="sec">
      <UiIcon name="grid" :size="16" />
      <b>{{ t('setupDiscover.columns.listening') }}</b>
      <span class="ct">{{ t('setupDiscover.columns.listeningMeta') }}</span>
    </header>
    <ul v-if="ports.length > 0" class="ports">
      <li
        v-for="p in ports"
        :key="p.key"
        class="port"
        :class="{ warn: p.publicDb, fresh: fresh.has(p.key) }"
      >
        <b>:{{ p.port }}</b>
        {{
          p.publicDb
            ? t('setupDiscover.listening.public', { host: p.host })
            : p.proc
              ? t('setupDiscover.listening.pill', { proc: p.proc, host: p.host })
              : t('setupDiscover.listening.bare', { host: p.host })
        }}
      </li>
    </ul>
    <p v-else class="none">{{ t('setupDiscover.listening.none') }}</p>
    <p class="foot">{{ t('setupDiscover.listening.note') }}</p>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-0) 72%, transparent);
}

.sec {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  height: 28px;
  padding: 0 var(--space-1);
  color: var(--ink-2);
}

.sec b {
  color: var(--ink);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.ct {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-12);
}

.ports {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0 var(--space-1);
  list-style: none;
}

.port {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--ink-2);
  font: var(--text-11) var(--font-mono);
}

.port b {
  font-weight: var(--weight-medium);
}

.warn {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.fresh {
  animation: m-rise var(--dur-enter) var(--ease-out) both;
}

.none,
.foot {
  margin: 0;
  padding: 0 var(--space-1);
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 1.45;
}

@media (prefers-reduced-motion: reduce) {
  .fresh {
    animation: none;
  }
}
</style>
