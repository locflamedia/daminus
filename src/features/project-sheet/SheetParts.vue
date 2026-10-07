<!--
  "Parts": the pieces of the project in the order they are shown, which the user can change
  (drag the grip, or use the keys on it or the row's menu). A hatched slot keeps the place of
  a part being dragged or added; the new part lands in it.
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { draftToProject } from '@/lib/setup-model'
import { savable } from '@/lib/sheet-parts'
import UiIcon from '@/ui/UiIcon.vue'
import AddPartMenu from './AddPartMenu.vue'
import PartRow from './PartRow.vue'
import { useSheet } from './sheet-context'
import SheetMessages from './SheetMessages.vue'
import { usePartDrag } from './use-part-drag'

const { t } = useI18n()
const sheet = useSheet()
const list = ref<HTMLElement | null>()
const adding = defineModel<boolean>('adding', { default: false })

const project = computed(() => draftToProject(savable(sheet.draft)).project)
const drag = usePartDrag(
  list,
  () => sheet.draft.parts.map((p) => p.key),
  (from, to) => sheet.reorderPart(from, to),
)
const slot = computed(
  () => adding.value || drag.dragging.value !== null || sheet.draft.parts.length === 0,
)
</script>

<template>
  <section class="parts" :aria-label="t('projectSheet.parts.label')">
    <div class="head">
      <span class="label">{{ t('projectSheet.parts.label') }}</span>
      <span class="note">{{ t('projectSheet.parts.note') }}</span>
    </div>
    <div
      v-if="sheet.visible.form.length > 0"
      class="form-error"
      data-sheet-field="form"
      tabindex="-1"
    >
      <UiIcon name="close" :size="12" :stroke="2" />
      <SheetMessages :issues="sheet.visible.form" />
    </div>
    <div ref="list">
      <TransitionGroup
        tag="ul"
        name="part"
        class="list"
        data-parts-list
        :aria-label="t('projectSheet.parts.list')"
      >
        <PartRow
          v-for="(part, index) in sheet.draft.parts"
          :key="part.key"
          :part="part"
          :index="index"
          :total="sheet.draft.parts.length"
          :issues="sheet.visible.parts.get(part.key) ?? []"
          :project="project"
          :dragging="drag.dragging.value === part.key"
          :grabbed="drag.grabbed.value === part.key"
          @handle-down="drag.onPointerDown($event, part.key)"
          @handle-key="drag.onKeydown($event, part.key)"
          @focusout="drag.onBlur"
        />
      </TransitionGroup>
    </div>
    <div v-if="slot" class="slot">{{ t('projectSheet.parts.drop') }}</div>
    <div class="add">
      <AddPartMenu v-model:open="adding" />
      <span class="note">{{ t('projectSheet.parts.suggestions') }}</span>
    </div>
    <p class="sr-only" aria-live="polite">{{ sheet.announce }}</p>
  </section>
</template>

<style scoped>
.parts {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}

.label {
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.note {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.form-error {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--crit-soft);
  color: var(--crit-ink);
  font-size: var(--text-12);
}

.form-error :deep(.icon) {
  display: none;
}

.list {
  position: relative;
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.slot {
  display: grid;
  place-items: center;
  height: 44px;
  border-radius: var(--radius-sm);
  background: repeating-linear-gradient(
    135deg,
    var(--surface-well) 0 6px,
    var(--surface-1) 6px 12px
  );
  color: var(--ink-3);
  font-size: var(--text-11);
}

.add {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-top: 4px;
}

.part-enter-active {
  transition:
    opacity var(--dur-sheet) var(--ease-out),
    transform var(--dur-sheet) var(--ease-out);
}

.part-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.part-move {
  transition: transform var(--dur-slide) var(--ease-out);
}

@media (prefers-reduced-motion: reduce) {
  .part-enter-from {
    transform: none;
  }

  .part-move {
    transition: none;
  }
}
</style>
