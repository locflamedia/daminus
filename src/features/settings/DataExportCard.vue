<!--
  "Export": a sample of the file (values of an .env are never in it) and the buttons. The file
  goes to Downloads; its name is shown after it is written. Import is on the board but has no
  command behind it yet, so it stays off.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useDataStore } from '@/stores/data'
import UiButton from '@/ui/UiButton.vue'
import UiIcon from '@/ui/UiIcon.vue'
import DataCard from './DataCard.vue'

const { t } = useI18n()
const data = useDataStore()

type Part = { text: string; tone?: 'key' | 'warn' }
const k = (text: string): Part => ({ text, tone: 'key' })
const p = (text: string): Part => ({ text })

const SAMPLE: Part[][] = [
  [p('{')],
  [p('  '), k('"scan"'), p(': 12, '), k('"at"'), p(': "2026-09-26T13:42+07:00",')],
  [p('  '), k('"projects"'), p(': [{')],
  [p('    '), k('"id"'), p(': "tiemtra",')],
  [p('    '), k('"disk"'), p(': {'), k('"bytes"'), p(': 5798205849,')],
  [p('             '), k('"delta"'), p(': 966367641},')],
  [p('    '), k('"db"'), p(': {'), k('"engine"'), p(': "postgres",')],
  [p('           '), k('"env"'), p(': '), { text: '"[not stored]"', tone: 'warn' }, p('},')],
  [p('    '), k('"findings"'), p(': [ … 2 ]')],
  [p('  }, … ]')],
  [p('}')],
]
</script>

<template>
  <DataCard
    :title="t('settingsData.export.title')"
    icon="arrow-down"
    :aside="t('settingsData.export.remark')"
  >
    <div class="code" role="img" :aria-label="t('settingsData.export.sample')">
      <div v-for="(line, i) in SAMPLE" :key="i" class="line">
        <span v-for="(part, j) in line" :key="j" :class="part.tone">{{ part.text }}</span>
      </div>
    </div>
    <div class="actions">
      <UiButton variant="secondary" :busy="data.exporting" @click="data.exportAll()">
        {{ t('settingsData.export.all') }}
      </UiButton>
      <UiButton variant="ghost" disabled>{{ t('settingsData.export.import') }}</UiButton>
      <span v-if="data.exported" class="done" role="status">
        <UiIcon name="check" :size="12" :stroke="2" />
        {{ t('settingsData.export.done', { name: data.exported }) }}
      </span>
    </div>
  </DataCard>
</template>

<style scoped>
.code {
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--code);
  color: var(--code-ink);
  font: 400 10.5px/1.65 var(--font-mono);
  overflow-x: auto;
}

.line {
  white-space: pre;
}

.key {
  color: var(--code-key);
}

.warn {
  color: var(--code-warn);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.done {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  margin-left: auto;
  white-space: nowrap;
  color: var(--ok-ink);
  font-size: var(--text-11);
  animation: arrive var(--dur-enter, 300ms) var(--ease-out) both;
}

@keyframes arrive {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}
</style>
