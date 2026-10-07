<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import type { DiskPathView, DiskTileModel } from '@/lib/project-disk'
import UiBanner from '@/ui/UiBanner.vue'
import UiTreemap from '@/ui/UiTreemap.vue'
import ProjectCard from '../common/ProjectCard.vue'

const props = defineProps<{
  id: string
  total: number
  views: readonly DiskPathView[]
  tiles: readonly DiskTileModel[]
  partial: boolean
}>()

const { t } = useI18n()
const fmt = useFormat()
const paths = computed(() => props.views.map((v) => v.path).join(' + '))
const tiles = computed(() =>
  props.tiles.map((m) => ({
    ...m.tile,
    label: m.tile.other ? t('projectDisk.tiles.other') : m.tile.label,
  })),
)
</script>

<template>
  <ProjectCard
    icon="disk"
    :title="t('projectDisk.tiles.title', { size: fmt.measure(total, 'bytes').text })"
    :meta="t('projectDisk.tiles.meta', { paths })"
  >
    <UiTreemap
      v-if="tiles.length > 0"
      :tiles="tiles"
      :label="t('projectDisk.tiles.label')"
      :once="`disk-treemap-${id}`"
    />
    <p v-else class="none">{{ t('projectDisk.tiles.none') }}</p>
    <UiBanner v-if="partial" tone="warn" icon="warn" :title="t('projectDisk.tiles.partial')" />
  </ProjectCard>
</template>

<style scoped>
.none {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-12);
}
</style>
