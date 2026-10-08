<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import UiSkeleton from '@/ui/UiSkeleton.vue'
import ProjectCard from '../common/ProjectCard.vue'
import ProjectCurve from '../common/ProjectCurve.vue'
import type { DbSection } from './use-database-model'

const props = defineProps<{ section: DbSection; loading: boolean }>()
const { t } = useI18n()
const fmt = useFormat()

const values = computed(() => props.section.series.map((p) => p.value))
const n = computed(() => props.section.series.length)
const label = computed(() =>
  t('projectDatabase.curve.label', {
    name: props.section.item.key.target,
    n: n.value,
    from: fmt.measure(values.value[0] ?? 0, 'bytes').text,
    to: fmt.measure(values.value[n.value - 1] ?? 0, 'bytes').text,
  }),
)
const sentence = computed(() =>
  props.section.step
    ? t('projectDatabase.curve.step', {
        delta: fmt.delta(props.section.step.bytes, 'bytes').text,
        seq: props.section.step.seq,
      })
    : t('projectDatabase.curve.flat'),
)
</script>

<template>
  <ProjectCard
    icon="trend"
    :title="t('projectDatabase.curve.title', { n })"
    :meta="section.change === null ? '' : fmt.delta(section.change, 'bytes').text"
    :gap="8"
  >
    <UiSkeleton v-if="loading" height="120px" radius="12px" tone="soft" />
    <ProjectCurve
      v-else
      :values="values"
      tone="lilac"
      :height="120"
      :label="label"
      :once="`database-curve-${section.item.key.host}-${section.item.key.target}`"
    />
    <span class="note">{{ sentence }}</span>
  </ProjectCard>
</template>

<style scoped>
.note {
  color: var(--ink-3);
  font-size: var(--text-11);
}
</style>
