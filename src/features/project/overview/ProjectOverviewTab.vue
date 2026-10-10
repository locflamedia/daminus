<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { useNow } from '@/composables/use-now'
import { staleDays } from '@/lib/staleness'
import { useLayoutRange } from '@/lib/viewport'
import { dataOf, str } from '@/lib/project-facts'
import { tabState } from '@/lib/project-tab-state'
import { useProjectsStore } from '@/stores/projects'
import { useReportStore } from '@/stores/report'
import ProjectTabShell from '../common/ProjectTabShell.vue'
import OverviewLook from './OverviewLook.vue'
import OverviewParts from './OverviewParts.vue'
import OverviewResponse from './OverviewResponse.vue'
import OverviewSkeleton from './OverviewSkeleton.vue'
import OverviewTile from './OverviewTile.vue'
import OverviewWiring from './OverviewWiring.vue'
import { useOverviewModel } from './use-overview-model'

const props = defineProps<{ id: string }>()
const { t } = useI18n()
const m = useOverviewModel(toRef(props, 'id'))
const reports = useReportStore()
const projects = useProjectsStore()
const range = useLayoutRange()
const fmt = useFormat()
const now = useNow()
const narrow = computed(() => range.value === 'narrow')

/** Overview has no group of its own: it is off only when there is nothing saved to show. */
const state = computed(() =>
  tabState({
    report: reports.latest,
    group: 'system',
    parts: m.saved.value?.components ?? [],
    rollup: projects.project(props.id),
    items: m.items.value,
  }),
)
const empty = computed(
  () => (m.saved.value?.components.length ?? 0) === 0 && (m.saved.value?.urls.length ?? 0) === 0,
)
const status = computed(() =>
  state.value.status === 'empty' && !empty.value ? 'normal' : state.value.status,
)
/** Results over a day old: the tiles go grey and say how old they are, as the board draws it. */
const age = computed(() => {
  const at = reports.latest?.scanned_at
  return staleDays(at, now.value) === null || !at ? null : fmt.when(at)
})
const mysql = computed(() => {
  const db = m.items.value.find((i) => i.key.check === 'db.size')
  return str(dataOf(db?.fact).engine) === 'mysql'
})
const slowCount = computed(
  () => m.strip.value.filter((c) => c.level === 'warn' || c.level === 'crit').length,
)
const host = computed(() => {
  const url = m.tiles.value[0]?.item?.key.target ?? m.saved.value?.urls[0] ?? ''
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
})
</script>

<template>
  <ProjectTabShell
    :project-id="id"
    :loading="m.loading.value"
    :status="status"
    :unreachable="state.unreachable"
    :stale-since="state.staleSince"
    group="system"
    :empty-title="t('projectOverview.parts.none')"
    :empty-text="t('projectOverview.wiring.none')"
  >
    <template #skeleton><OverviewSkeleton /></template>
    <div class="tiles" :class="{ narrow }">
      <OverviewTile
        v-for="(tile, i) in m.tiles.value"
        :key="tile.id"
        :tile="tile"
        :host="host"
        :mysql="mysql"
        :index="i"
        :project-id="id"
        :age="age"
      />
    </div>
    <div class="two" :class="{ narrow }">
      <OverviewWiring
        :id="id"
        :bands="m.bands.value"
        :seq="m.seq.value"
        :parts="m.rows.value.length"
      />
      <OverviewLook :id="id" :rows="m.look.value" />
    </div>
    <div class="two" :class="{ narrow }">
      <OverviewParts :rows="m.rows.value" />
      <OverviewResponse
        :cells="m.strip.value"
        :median="m.median.value"
        :worst="m.worst.value"
        :slow-count="slowCount"
        :urls="m.urlList.value"
        :exposure="m.exposure.value"
      />
    </div>
  </ProjectTabShell>
</template>

<style scoped>
.tiles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
}

.tiles.narrow {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.two {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: var(--space-3);
  align-items: stretch;
}

.two:last-child {
  flex: 1 1 auto;
  min-height: 0;
}

.two.narrow {
  grid-template-columns: minmax(0, 1fr);
}
</style>
