<!--
  The bar above the table: the filter field (the slash key focuses it), the segments by login
  result with their counts, "Select all ready" and "Add host".
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Segment } from '@/lib/host-rows'
import UiButton from '@/ui/UiButton.vue'
import UiSearchField from '@/ui/UiSearchField.vue'
import UiSeg from '@/ui/UiSeg.vue'

const props = defineProps<{ counts: Record<Segment, number> }>()
const query = defineModel<string>('query', { required: true })
const segment = defineModel<Segment>('segment', { required: true })
const emit = defineEmits<{ selectReady: []; addHost: [] }>()

const { t } = useI18n()
const search = ref<InstanceType<typeof UiSearchField>>()

const segments = computed(() => [
  { value: 'all', label: t('setupPick.filter.all'), count: props.counts.all },
  { value: 'ready', label: t('setupPick.filter.ready'), count: props.counts.ready },
  { value: 'failed', label: t('setupPick.filter.failed'), count: props.counts.failed },
])

defineExpose({ focusSearch: () => search.value?.focus() })
</script>

<template>
  <div class="bar" :class="{ failing: counts.failed > 0 }">
    <div class="search">
      <UiSearchField
        ref="search"
        v-model="query"
        :placeholder="t('setupPick.filter.placeholder')"
        :label="t('setupPick.filter.label')"
        hint="/"
        clearable
      />
    </div>
    <UiSeg v-model="segment" :options="segments" :label="t('setupPick.filter.segments')" />
    <span class="grow" />
    <UiButton variant="link" class="accent" @click="emit('selectReady')">
      {{ t('setupPick.filter.selectReady') }}
    </UiButton>
    <UiButton icon="plus" @click="emit('addHost')">{{ t('setupPick.filter.addHost') }}</UiButton>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.search {
  width: 240px;
}

.grow {
  flex-grow: 1;
}

/* The Failed count is a small crit pill while any host failed; the other counts stay grey. */
.failing :deep(.segment:nth-child(3) .count) {
  display: inline-grid;
  place-items: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: var(--radius-full);
  background: var(--crit-soft);
  color: var(--crit-ink);
  font-size: 10px;
}

.btn.accent {
  --fg: var(--accent-ink);
}
</style>
