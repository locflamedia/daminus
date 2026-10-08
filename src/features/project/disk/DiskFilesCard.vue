<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { DEFAULT_LARGE_FILE_MB, DEFAULT_SKIP_PATHS, type LargeFile } from '@/lib/project-disk'
import UiIcon from '@/ui/UiIcon.vue'
import ProjectCard from '../common/ProjectCard.vue'

defineProps<{ files: readonly LargeFile[] }>()

const { t } = useI18n()
const fmt = useFormat()
const skipped = computed(() => DEFAULT_SKIP_PATHS.join(', '))
</script>

<template>
  <ProjectCard
    icon="file"
    :title="t('projectDisk.files.title')"
    :meta="t('projectDisk.files.meta', { mb: DEFAULT_LARGE_FILE_MB })"
    :gap="6"
  >
    <ul v-if="files.length > 0" class="rows" :aria-label="t('projectDisk.files.label')">
      <li v-for="f in files" :key="f.key" class="row" :title="`${f.host}: ${f.name}`">
        <UiIcon
          name="file"
          :size="14"
          class="glyph"
          :class="{ finding: f.finding }"
          :title="f.finding ? t('projectDisk.files.finding') : undefined"
        />
        <span class="name">{{ f.name }}</span>
        <b class="size">{{ fmt.measure(f.bytes, 'bytes').text }}</b>
      </li>
    </ul>
    <p v-else class="none">{{ t('projectDisk.files.none') }}</p>
    <span class="skipped">{{ t('projectDisk.files.skipped', { paths: skipped }) }}</span>
  </ProjectCard>
</template>

<style scoped>
.rows {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  min-height: 36px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  font-size: var(--text-12);
}

.row:nth-child(odd) {
  background: var(--surface-well);
}

.glyph {
  color: var(--ink-3);
}

.glyph.finding {
  color: var(--chart-amber);
}

.name {
  overflow: hidden;
  font-family: var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.size {
  font-family: var(--font-mono);
  font-weight: var(--weight-medium);
  text-align: right;
}

.none,
.skipped {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-11);
}
</style>
