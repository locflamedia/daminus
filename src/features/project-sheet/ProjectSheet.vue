<!--
  The project sheet, drawn once over the whole window (mounted by `App.vue`). Any screen opens
  it through `useProjectSheetStore().open(...)`. It edits a copy of the project: Cancel and
  Escape discard it (Escape asks first when something changed), Save writes it, or in setup
  hands it back without writing.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { errorText } from '@/lib/issue-text'
import { useProjectSheetStore } from '@/stores/project-sheet'
import UiBanner from '@/ui/UiBanner.vue'
import UiConfirm from '@/ui/UiConfirm.vue'
import UiSheet from '@/ui/UiSheet.vue'
import SheetBasics from './SheetBasics.vue'
import SheetFooter from './SheetFooter.vue'
import SheetHeader from './SheetHeader.vue'
import SheetParts from './SheetParts.vue'
import SheetUrls from './SheetUrls.vue'
import { SHEET_KEY } from './sheet-context'
import { useSheetController } from './use-sheet-controller'

const { t } = useI18n()
const store = useProjectSheetStore()
const sheet = useSheetController()
provide(SHEET_KEY, sheet)

const adding = ref(false)

watch(
  [() => store.isOpen, () => store.request],
  ([open, request]) => {
    if (!open || !request) return
    sheet.begin(request)
    // The name is where typing starts, not the close button the focus trap would pick.
    window.setTimeout(() => sheet.focusField({ kind: 'name' }), 60)
  },
  { immediate: true },
)

const title = computed(() =>
  t(sheet.draft.isNew ? 'projectSheet.title.new' : 'projectSheet.title.edit'),
)

// ⌘S saves (or goes to the first error), ⌘⇧N opens "Add part".
function onKeydown(event: KeyboardEvent) {
  if (!store.isOpen || !event.metaKey || event.ctrlKey || event.altKey) return
  if (event.code === 'KeyS' && !event.shiftKey) {
    event.preventDefault()
    void sheet.save()
  } else if (event.code === 'KeyN' && event.shiftKey) {
    event.preventDefault()
    adding.value = true
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <UiSheet :open="store.isOpen" :title="title" @close="sheet.requestClose()">
    <template #header="{ titleId, close }">
      <SheetHeader :title-id="titleId" :title="title" @close="close" />
    </template>
    <div class="content">
      <UiBanner
        v-if="sheet.errorTitle"
        tone="crit"
        icon="critical"
        :title="sheet.errorTitle"
        :text="sheet.error ? errorText(sheet.error) : undefined"
        alert
      />
      <SheetBasics />
      <SheetUrls />
      <SheetParts v-model:adding="adding" />
    </div>
    <template #footer-start><SheetFooter part="start" /></template>
    <template #footer-end><SheetFooter part="end" /></template>
  </UiSheet>
  <UiConfirm
    :open="sheet.confirmOpen"
    :title="t('projectSheet.confirm.title')"
    :body="t('projectSheet.confirm.body', { n: sheet.changes }, sheet.changes)"
    :confirm-label="t('projectSheet.confirm.discard')"
    :cancel-label="t('projectSheet.confirm.keep')"
    @confirm="sheet.discard()"
    @cancel="sheet.confirmOpen = false"
  />
</template>

<style scoped>
.content {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: 0 var(--space-1) var(--space-3);
}
</style>
