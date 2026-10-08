<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import type { SeriesPoint } from '@/lib/project-series'
import UiSkeleton from '@/ui/UiSkeleton.vue'
import ProjectCard from '../common/ProjectCard.vue'
import ProjectCurve from '../common/ProjectCurve.vue'

const props = defineProps<{
  id: string
  series: readonly SeriesPoint[]
  change: number | null
  grower: { label: string; growth: number } | null
  previousSeq: number | null
  loading: boolean
}>()

const { t } = useI18n()
const fmt = useFormat()
const values = computed(() => props.series.map((p) => p.value))
const meta = computed(() =>
  props.change === null
    ? ''
    : t('projectDisk.growth.meta', {
        n: props.series.length,
        delta: fmt.delta(props.change, 'bytes').text,
      }),
)
const label = computed(() =>
  t('projectDisk.growth.label', {
    n: props.series.length,
    from: fmt.measure(props.series[0]?.value ?? 0, 'bytes').text,
    to: fmt.measure(props.series[props.series.length - 1]?.value ?? 0, 'bytes').text,
  }),
)
const sentence = computed(() => {
  if (props.previousSeq === null) return t('projectDisk.growth.first')
  return props.grower
    ? t('projectDisk.growth.grew', {
        name: props.grower.label,
        seq: props.previousSeq,
        delta: fmt.delta(props.grower.growth, 'bytes').text,
      })
    : t('projectDisk.growth.flat', { seq: props.previousSeq })
})
</script>

<template>
  <ProjectCard icon="trend" :title="t('projectDisk.growth.title')" :meta="meta" :gap="8">
    <UiSkeleton v-if="loading" height="110px" radius="12px" tone="soft" />
    <ProjectCurve v-else :values="values" tone="amber" :label="label" :once="`disk-growth-${id}`" />
    <span class="note">{{ sentence }}</span>
  </ProjectCard>
</template>

<style scoped>
.note {
  color: var(--ink-3);
  font-size: var(--text-11);
}
</style>
