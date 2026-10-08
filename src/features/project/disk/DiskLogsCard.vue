<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { dirOf, listLogsCommand, type LogFinding } from '@/lib/project-disk'
import UiCommandCopy from '@/ui/UiCommandCopy.vue'
import ProjectCard from '../common/ProjectCard.vue'

const props = defineProps<{ logs: readonly LogFinding[] }>()

const { t } = useI18n()
const fmt = useFormat()
const largest = computed(() => [...props.logs].sort((a, b) => b.bytes - a.bytes)[0])
const command = computed(() => {
  const log = largest.value
  const dir = log ? dirOf(log.path) : null
  return log && dir ? listLogsCommand(log.host, dir) : null
})
const name = computed(() => largest.value?.path.split('/').pop() ?? '')
</script>

<template>
  <ProjectCard
    v-if="largest"
    icon="warn"
    tone="warn"
    :title="t('projectDisk.logs.title')"
    :meta="t('projectDisk.logs.meta')"
    :gap="8"
  >
    <p class="text">
      {{
        t(
          'projectDisk.logs.text',
          { n: logs.length, name, size: fmt.measure(largest.bytes, 'bytes').text },
          logs.length,
        )
      }}
    </p>
    <UiCommandCopy v-if="command" :command="command" />
  </ProjectCard>
</template>

<style scoped>
.text {
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.45;
}
</style>
