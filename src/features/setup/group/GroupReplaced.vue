<!--
  A suggestion whose id is already in projects.json: Save replaces that project. The block says
  what is replaced (counted from the draft) and what stays, and offers "Keep both". It never
  blocks the save: replacing is the normal case when setup runs a second time.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { replacedCounts } from '@/lib/group-view'
import type { DraftProject } from '@/lib/setup-model'
import UiButton from '@/ui/UiButton.vue'
import UiIcon from '@/ui/UiIcon.vue'

const props = defineProps<{ draft: DraftProject; keepId: string }>()
const emit = defineEmits<{ keepBoth: [] }>()

const { t } = useI18n()
const counts = computed(() => replacedCounts(props.draft))
</script>

<template>
  <div class="replaced" data-testid="replaced">
    <div class="box">
      <div class="lines">
        <span
          ><b>{{ t('setupGroup.replaces.replaced') }}</b> ·
          {{
            t('setupGroup.replaces.replacedBody', {
              urls: t('setupGroup.replaces.urls', { n: counts.urls }, counts.urls),
              parts: t('setupGroup.replaces.parts', { n: counts.parts }, counts.parts),
            })
          }}</span
        >
        <span
          ><b>{{ t('setupGroup.replaces.kept') }}</b> ·
          {{ t('setupGroup.replaces.keptBody') }}</span
        >
      </div>
      <UiButton data-testid="keep-both" @click="emit('keepBoth')">{{
        t('setupGroup.replaces.keepBoth')
      }}</UiButton>
    </div>
    <p class="hint">
      <UiIcon name="info" :size="14" />
      <span>{{ t('setupGroup.replaces.hint', { id: keepId }) }}</span>
    </p>
  </div>
</template>

<style scoped>
.replaced {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: var(--space-1) var(--space-2) 0;
}

.box {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  background: var(--warn-soft);
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.5;
}

.lines {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.lines b {
  color: var(--warn-ink);
  font-weight: var(--weight-medium);
}

.hint {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 1.45;
}

.hint :deep(.icon) {
  flex: none;
  margin-top: 1px;
}
</style>
