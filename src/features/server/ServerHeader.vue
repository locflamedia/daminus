<!--
  Header of the server page, from the board "Server detail": the breadcrumb, the alias in
  mono, one line of what the facts know about the machine (cores, memory, which scan read it
  and how long it took), the baseline menu ("vs #11") and the primary "Scan server" button.
  The operating system and the uptime are not in what the checks read, so they are not drawn.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import AskAiButton from '@/features/ai/ask/AskAiButton.vue'
import UiButton from '@/ui/UiButton.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiMenu from '@/ui/UiMenu.vue'

const props = withDefaults(
  defineProps<{
    host: string
    /** The host is one the reports know; an unknown one has no scan to read or start. */
    known?: boolean
    /** "4 cores · 7.8 GB RAM · scan #12, 13:42"; empty before anything is known. */
    meta: string
    /** Scans the baseline can be, newest first. */
    baselines: readonly number[]
    baseline: number | null
    scanning: boolean
    /** Scanning is not possible now (a project-wide scan runs, or there is nothing to scan). */
    busyReason?: string
  }>(),
  { known: true, busyReason: undefined },
)

const emit = defineEmits<{ baseline: [seq: number]; scan: [] }>()

const { t } = useI18n()
const items = computed(() =>
  props.baselines.map((seq) => ({
    id: String(seq),
    label: t('serverScreen.baseline.option', { seq }),
    checked: seq === props.baseline,
  })),
)
</script>

<template>
  <header class="server-header">
    <div class="titles">
      <RouterLink to="/" class="crumb">
        {{ t('server.breadcrumb') }}
        <UiIcon name="chevron-right" :size="12" />
      </RouterLink>
      <span class="line">
        <UiIcon name="server" :size="16" class="mark" />
        <b class="name mono">{{ host }}</b>
        <span v-if="known && meta" class="meta">{{ meta }}</span>
      </span>
    </div>
    <span class="grow" />
    <UiMenu
      v-if="known && baselines.length > 0"
      :items="items"
      :label="t('serverScreen.baseline.label')"
      placement="bottom-end"
      compact
      @select="(id) => emit('baseline', Number(id))"
    >
      <template #trigger="{ attrs, toggle }">
        <UiButton v-bind="attrs" trailing-icon="chevron-down" @click="toggle">
          {{ t('serverScreen.baseline.option', { seq: baseline ?? baselines[0] }) }}
        </UiButton>
      </template>
    </UiMenu>
    <AskAiButton v-if="known" :scope="{ kind: 'server', host }" />
    <UiButton
      v-if="known"
      variant="primary"
      shortcut="⌘R"
      :busy="scanning"
      :disabled="scanning"
      :disabled-reason="scanning ? undefined : busyReason"
      @click="emit('scan')"
    >
      <template v-if="!scanning">↳ </template
      >{{ scanning ? t('serverScreen.scanning') : t('serverScreen.scan') }}
    </UiButton>
  </header>
</template>

<style scoped>
.server-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: none;
  height: 72px;
}

/* The header sits over the page's drag strip: only its controls take the pointer, so the
   blank space and the name still drag the window. */
.server-header {
  pointer-events: none;
}

.server-header > :not(.titles, .grow),
.crumb {
  pointer-events: auto;
}

.titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  line-height: 1.3;
}

.crumb {
  display: flex;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  color: var(--ink-3);
  font-size: var(--text-12);
}

.crumb .icon {
  color: var(--ink-4);
}

.line {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  white-space: nowrap;
}

.mark {
  flex: none;
  color: var(--ink-3);
}

.name {
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
  letter-spacing: var(--track-15);
}

.meta {
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-12);
  text-overflow: ellipsis;
}

.grow {
  flex-grow: 1;
}
</style>
