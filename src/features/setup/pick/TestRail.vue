<!--
  The card in the sidebar that shows what the login test runs, as the core runs it: the ssh
  options and the commands of the login script, with the alias of the row in focus. Trust
  through transparency; the line is the real argv, not a paraphrase.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { TEST_OPTIONS, TEST_STEPS } from '@/lib/host-rows'
import { shellQuote } from '@/lib/host-test'
import UiIcon from '@/ui/UiIcon.vue'

defineProps<{ alias: string }>()

const { t } = useI18n()
</script>

<template>
  <section class="rail" :aria-label="t('setupPick.rail.title')">
    <h3><UiIcon name="eye" :size="16" />{{ t('setupPick.rail.title') }}</h3>
    <pre class="code" translate="no"><code><span class="dim">$</span> ssh -T \
<template v-for="o in TEST_OPTIONS" :key="o">  -o {{ o }} \
</template>  -- {{ shellQuote(alias) }} sh -s
<template v-for="s in TEST_STEPS" :key="s"><span class="dim">›</span> {{ s }}
</template></code></pre>
    <p>{{ t('setupPick.rail.note') }}</p>
  </section>
</template>

<style scoped>
.rail {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--side-hover);
}

h3 {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  color: var(--ink);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

h3 :deep(.icon) {
  color: var(--ok-solid);
}

.code {
  margin: 0;
  padding: var(--space-3);
  overflow-x: auto;
  border-radius: var(--radius-sm);
  background: var(--code);
  color: var(--code-ink);
  font: var(--weight-regular) var(--text-11) / 1.6 var(--font-mono);
}

.dim {
  color: var(--code-dim);
}

p {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 1.5;
}
</style>
