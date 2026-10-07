<!--
  The sheet's header: the project's tile in its colour, the title with the id, the amber "Already
  saved" chip when a new project would replace a saved one, a line of what the project is
  made of and when it was last scanned, then `esc` and the close button.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { colorName, hostsOf } from '@/lib/setup-model'
import { useReportStore } from '@/stores/report'
import UiChip from '@/ui/UiChip.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiKbd from '@/ui/UiKbd.vue'
import UiMonogram from '@/ui/UiMonogram.vue'
import { useSheet } from './sheet-context'

defineProps<{ titleId: string; title: string }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const fmt = useFormat()
const sheet = useSheet()
const report = useReportStore()

const parts = computed(() => sheet.draft.parts.length)
const servers = computed(() => hostsOf([sheet.draft]).length)
const context = computed(() => {
  const made =
    parts.value === 0
      ? t('projectSheet.header.empty')
      : t('projectSheet.header.context', {
          parts: t('projectSheet.header.parts', { n: parts.value }, parts.value),
          servers: t('projectSheet.header.servers', { n: servers.value }, servers.value),
        })
  const when = report.latest?.scanned_at
  const scan = when ? ` · ${t('projectSheet.header.lastScan', { when: fmt.when(when) })}` : ''
  return `${sheet.draft.isNew ? '' : `${sheet.draft.id} · `}${made}${scan}`
})
const replaces = computed(() => sheet.draft.isNew && sheet.visible.replaces)
</script>

<template>
  <header class="head">
    <UiMonogram :size="40" icon="folder" :tint="colorName(sheet.draft.color) ?? 'blue'" />
    <div class="titles">
      <div class="line">
        <h2 :id="titleId" class="title">{{ title }}</h2>
        <span v-if="sheet.draft.isNew && sheet.draft.id" class="id">
          {{ t('projectSheet.id.tag') }} <span class="mono">{{ sheet.draft.id }}</span>
        </span>
        <UiChip v-if="replaces" tone="warn" icon="info">
          {{ t('projectSheet.header.replaces') }}
        </UiChip>
      </div>
      <span class="context">{{ context }}</span>
    </div>
    <span class="grow" />
    <UiKbd>esc</UiKbd>
    <button
      type="button"
      class="close"
      :aria-label="t('projectSheet.close')"
      @click="emit('close')"
    >
      <UiIcon name="close" :size="16" />
    </button>
  </header>
</template>

<style scoped>
.head {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-6) var(--space-4);
}

.titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.line {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.title {
  margin: 0;
  font-size: var(--text-20);
  font-weight: var(--weight-medium);
  letter-spacing: -0.02em;
}

.id {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.mono {
  font-family: var(--font-mono);
}

.context {
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-12);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.grow {
  flex: 1 1 auto;
}

.close {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--ink-2);
  transition: background-color var(--dur-color) var(--ease-state);
}

.close:hover {
  background: var(--surface-2);
}

.close:focus-visible {
  box-shadow: var(--focus-ring);
}
</style>
