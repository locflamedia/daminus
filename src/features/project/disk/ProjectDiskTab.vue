<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLayoutRange } from '@/lib/viewport'
import ProjectTabShell from '../common/ProjectTabShell.vue'
import DiskFilesCard from './DiskFilesCard.vue'
import DiskGrowthCard from './DiskGrowthCard.vue'
import DiskLogsCard from './DiskLogsCard.vue'
import DiskServersCard from './DiskServersCard.vue'
import DiskSkeleton from './DiskSkeleton.vue'
import DiskTreemapCard from './DiskTreemapCard.vue'
import { useDiskModel } from './use-disk-model'

const props = defineProps<{ id: string }>()
const { t } = useI18n()
const m = useDiskModel(toRef(props, 'id'))
const range = useLayoutRange()
const narrow = computed(() => range.value === 'narrow')
</script>

<template>
  <ProjectTabShell
    :loading="m.loading.value"
    :status="m.state.value.status"
    :unreachable="m.state.value.unreachable"
    :stale-since="m.state.value.staleSince"
    group="disk"
    :empty-title="t('projectDisk.empty.title')"
    :empty-text="t('projectDisk.empty.text')"
  >
    <template #skeleton><DiskSkeleton /></template>
    <div class="grid" :class="{ narrow }">
      <DiskTreemapCard
        :id="id"
        :total="m.total.value"
        :views="m.views.value"
        :tiles="m.tiles.value"
        :partial="m.partial.value"
      />
      <div class="stack">
        <DiskGrowthCard
          :id="id"
          :series="m.series.value"
          :change="m.change.value"
          :grower="m.grower.value"
          :previous-seq="m.previousSeq.value"
          :loading="m.curveLoading.value"
        />
        <DiskLogsCard :logs="m.projectLogs.value" />
      </div>
      <DiskFilesCard :files="m.files.value" />
      <DiskServersCard
        :disks="m.disks.value"
        :free="m.free.value"
        :many-hosts="m.hosts.value.length > 1"
      />
    </div>
  </ProjectTabShell>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: var(--space-3);
  align-items: stretch;
}

.grid.narrow {
  grid-template-columns: minmax(0, 1fr);
}

.stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
