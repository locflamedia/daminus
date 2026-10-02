<!--
  Payload viewer, from the board "AI": the exact JSON that is sent, shown before it is sent,
  on a grey well in mono 11. Redactions are marked in rose so a person can verify them: any
  `[redacted]`, `[ip redacted]` or `[… redacted]` token is drawn on a rose tint (radius 4).
  Under it three chips: the size in bytes, how many values were redacted and where it goes
  ("to Anthropic"). The text is a plain string split into pieces; nothing in it is ever
  treated as markup or as an instruction, and log text inside it is data.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import UiChip from './UiChip.vue'

const props = defineProps<{
  /** The JSON text, exactly as it will be sent. */
  payload: string
  /** Where it goes ("Anthropic"). */
  provider: string
  label?: string
}>()

const { t } = useI18n()
const fmt = useFormat()

const REDACTION = /\[[^\]\n]*redacted\]/g

const pieces = computed(() => {
  const out: Array<{ text: string; redacted: boolean }> = []
  let last = 0
  for (const m of props.payload.matchAll(REDACTION)) {
    const at = m.index ?? 0
    if (at > last) out.push({ text: props.payload.slice(last, at), redacted: false })
    out.push({ text: m[0], redacted: true })
    last = at + m[0].length
  }
  if (last < props.payload.length) out.push({ text: props.payload.slice(last), redacted: false })
  return out
})
const redactions = computed(() => pieces.value.filter((p) => p.redacted).length)
const size = computed(
  () => fmt.measure(new TextEncoder().encode(props.payload).length, 'bytes').text,
)
</script>

<template>
  <div class="viewer">
    <pre
      class="json"
      tabindex="0"
      role="region"
      :aria-label="label ?? t('ui.payload.label')"
    ><template
        v-for="(piece, i) in pieces"
        :key="i"
      ><mark v-if="piece.redacted" class="red">{{ piece.text }}</mark><template v-else>{{ piece.text }}</template></template></pre>
    <div class="chips">
      <UiChip>{{ size }}</UiChip>
      <UiChip :tone="redactions > 0 ? 'crit' : 'neutral'">{{
        t('ui.payload.redacted', { n: redactions }, redactions)
      }}</UiChip>
      <UiChip>{{ t('ui.payload.sentTo', { provider }) }}</UiChip>
    </div>
  </div>
</template>

<style scoped>
.viewer {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.json {
  margin: 0;
  padding: var(--space-3);
  overflow-x: auto;
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--ink);
  font: var(--weight-regular) var(--text-11) / 1.6 var(--font-mono);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.json:focus-visible {
  box-shadow: var(--focus-ring);
}

.red {
  padding: 0 4px;
  border-radius: 4px;
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
