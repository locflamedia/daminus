<!--
  "Test it, then fix the usual errors": the one-line test and the two errors people actually
  hit, each with its fix. The command is only shown (the person runs it in Terminal).
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { shellQuote } from '@/lib/host-test'

const props = defineProps<{
  alias: string
  /** The step that loads the key into the agent, when this screen draws one. */
  agentStep: number | null
}>()

const { t } = useI18n()
const command = computed(() => `ssh ${shellQuote(props.alias)} 'echo ok'`)
</script>

<template>
  <section class="test">
    <b>{{ t('empty.help.test.title') }}</b>
    <div class="cmd">
      <span class="prompt" aria-hidden="true">$</span>
      <span class="text">{{ command }}</span>
      <span class="ok">{{ t('empty.help.test.ok') }}</span>
    </div>
    <div class="err">
      <span class="mono bad">{{ t('empty.help.test.permission') }}</span>
      <span>
        {{
          agentStep === null
            ? t('empty.help.test.permissionFixPlain')
            : t('empty.help.test.permissionFix', { n: agentStep })
        }}
      </span>
    </div>
    <div class="err">
      <span class="mono bad">{{ t('empty.help.test.hostKey') }}</span>
      <span>{{ t('empty.help.test.hostKeyFix') }}</span>
    </div>
  </section>
</template>

<style scoped>
.test {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--surface-0) 72%, transparent);
}

b {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.cmd {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--h-control);
  padding: 0 var(--space-3) 0 10px;
  border-radius: 9px;
  background: var(--code);
  color: var(--code-ink);
  font: var(--weight-regular) var(--text-12) var(--font-mono);
}

.prompt {
  color: var(--code-dim);
}

.text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ok {
  margin-left: auto;
  color: var(--code-ok);
}

.err {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  align-items: start;
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.45;
}

.bad {
  color: var(--crit-ink);
  font-size: var(--text-11);
}
</style>
