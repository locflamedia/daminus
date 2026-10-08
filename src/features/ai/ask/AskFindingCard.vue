<!--
  A finding inside an Ask answer, from the board "AI · Ask": a grey card (radius 12, padding
  12) with a mono severity tag, the title, the check at the right, the cause and each command
  the AI suggested as a copy-only line. The tag and the title come from the check the finding
  names, never from the AI; the model supplies the cause and the command. All of it is text,
  and no button here can run anything: the command line only copies.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UiCommandCopy from '@/ui/UiCommandCopy.vue'
import type { ResolvedFinding } from '../findings/resolve-findings'

defineProps<{ finding: ResolvedFinding }>()
const { t } = useI18n()
</script>

<template>
  <article class="af m-enter">
    <header class="head">
      <span v-if="finding.tone !== 'plain'" class="sev" :class="finding.tone">{{
        t(`aiAsk.tag.${finding.tone}`)
      }}</span>
      <b class="title">{{ finding.item ? finding.title : t('aiAsk.unmatched') }}</b>
      <span v-if="finding.item" class="check">{{ finding.item.key.check }}</span>
    </header>
    <dl v-if="finding.why" class="kv">
      <dt class="k">{{ t('aiAsk.cause') }}</dt>
      <dd class="v">{{ finding.why }}</dd>
    </dl>
    <UiCommandCopy v-if="finding.command" :command="finding.command" />
  </article>
</template>

<style scoped>
.af {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.sev {
  display: inline-flex;
  flex: none;
  align-items: center;
  height: 18px;
  padding: 0 5px;
  border-radius: 5px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: var(--weight-semibold);
  letter-spacing: 0.06em;
}

.sev.crit {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.sev.warn {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.sev.info {
  background: var(--info-soft);
  color: var(--info-ink);
}

.title {
  min-width: 0;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
  overflow-wrap: anywhere;
}

.check {
  margin-left: auto;
  flex: none;
  color: var(--ink-3);
  font-size: var(--text-11);
}

.kv {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: var(--space-1) 10px;
  margin: 0;
  font-size: var(--text-12);
  line-height: 1.45;
}

.k {
  padding-top: 1px;
  color: var(--ink-3);
  font-size: var(--text-11);
}

.v {
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
