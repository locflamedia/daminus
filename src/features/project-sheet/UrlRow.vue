<!--
  One URL of the project: the field with a globe, the live answer of the check on its right,
  and the words of the core under it. The answer is asked for by the row itself, 600 ms after
  the typing stops.
-->
<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Project, ProjectIssue } from '@/api'
import UiButton from '@/ui/UiButton.vue'
import ProbeResult from './ProbeResult.vue'
import SheetInput from './SheetInput.vue'
import SheetMessages from './SheetMessages.vue'
import { useSheet } from './sheet-context'
import { useUrlProbe } from './use-url-probe'

const props = defineProps<{
  index: number
  url: string
  issues: readonly ProjectIssue[]
  project: Project
}>()

const { t } = useI18n()
const sheet = useSheet()
const state = useUrlProbe(toRef(props, 'url'))

const tone = computed(() =>
  props.issues.some((i) => i.level === 'error')
    ? 'error'
    : props.issues.length > 0
      ? 'warn'
      : 'none',
)
</script>

<template>
  <li class="url">
    <div class="line">
      <SheetInput
        :model-value="url"
        :icon="'globe'"
        :tone="tone"
        mono
        :data-sheet-field="`url:${index}`"
        :aria-label="t('projectSheet.urls.row', { n: index + 1 })"
        :placeholder="t('projectSheet.urls.placeholder')"
        @update:model-value="sheet.setUrl(index, $event)"
        @blur="sheet.touch(`url:${index}`)"
      />
      <ProbeResult :state="state" />
      <UiButton
        variant="ghost"
        size="small"
        icon="close"
        class="remove"
        :aria-label="t('projectSheet.urls.remove')"
        @click="sheet.removeUrl(index)"
      />
    </div>
    <SheetMessages :issues="issues" :project="project" />
  </li>
</template>

<style scoped>
.url {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.line {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 248px 28px;
  align-items: center;
  gap: var(--space-2);
}

/* Taking a URL away is rare: the button waits for the pointer or the keyboard. */
.remove {
  opacity: 0;
  transition: opacity var(--dur-color) var(--ease-state);
}

.url:hover .remove,
.url:focus-within .remove {
  opacity: 1;
}
</style>
