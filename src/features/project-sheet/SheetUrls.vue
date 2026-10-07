<!--
  "URLs to check": one row per address, each probed from this Mac as you type, and a link that
  adds a row. Empty rows are ignored by the save.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { draftToProject } from '@/lib/setup-model'
import UiButton from '@/ui/UiButton.vue'
import { useSheet } from './sheet-context'
import UrlRow from './UrlRow.vue'

const { t } = useI18n()
const sheet = useSheet()
const project = computed(() => draftToProject(sheet.draft).project)
</script>

<template>
  <section class="urls" :aria-label="t('projectSheet.urls.label')">
    <div class="head">
      <span class="label">{{ t('projectSheet.urls.label') }}</span>
      <span class="note">{{ t('projectSheet.urls.note') }}</span>
    </div>
    <ul class="rows">
      <UrlRow
        v-for="(url, index) in sheet.draft.urls"
        :key="sheet.urlKeys[index]"
        :index="index"
        :url="url"
        :issues="sheet.visible.urls.get(index) ?? []"
        :project="project"
      />
    </ul>
    <UiButton variant="link" icon="plus" class="add" @click="sheet.addUrl()">
      {{ t('projectSheet.urls.add') }}
    </UiButton>
  </section>
</template>

<style scoped>
.urls {
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

.rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.add {
  align-self: flex-start;
}
</style>
