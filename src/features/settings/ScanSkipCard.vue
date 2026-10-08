<!--
  Settings › Scan, "Skip these paths": the folders du and the file checks leave out, each a mono
  tag with a cross, a tag that opens a field to add one, and the floor of the large-files list.
-->
<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { FILE_FLOORS_MB, type SkipPathProblem } from '@/lib/scan-settings'
import { useScanSettingsStore } from '@/stores/scan-settings'
import UiIcon from '@/ui/UiIcon.vue'
import UiSeg, { type SegOption } from '@/ui/UiSeg.vue'
import SettingsCard from './SettingsCard.vue'
import SettingsRow from './SettingsRow.vue'

const { t } = useI18n()
const store = useScanSettingsStore()

const adding = ref(false)
const draft = ref('')
const problem = ref<SkipPathProblem | null>(null)
const field = ref<HTMLInputElement>()
const addButton = ref<HTMLButtonElement>()

const floors = computed<SegOption[]>(() =>
  FILE_FLOORS_MB.map((n) => ({ value: String(n), label: t('settingsScan.skip.mb', { n }) })),
)

async function open() {
  adding.value = true
  problem.value = null
  await nextTick()
  field.value?.focus()
}

function close() {
  adding.value = false
  draft.value = ''
  problem.value = null
  void nextTick(() => addButton.value?.focus())
}

function submit() {
  const found = store.addSkipPath(draft.value)
  if (found === null) {
    draft.value = ''
    problem.value = null
    void nextTick(() => field.value?.focus())
    return
  }
  problem.value = found
}

function pickFloor(value: string) {
  store.setLargeFile(Number(value))
}
</script>

<template>
  <SettingsCard :title="t('settingsScan.skip.title')" :remark="t('settingsScan.skip.remark')">
    <ul class="tags" :aria-label="t('settingsScan.skip.title')">
      <li v-for="path in store.scan.skip_paths" :key="path" class="tag mono">
        {{ path }}
        <button
          type="button"
          class="cross"
          :aria-label="t('settingsScan.skip.remove', { path })"
          @click="store.removeSkipPath(path)"
        >
          <UiIcon name="close" :size="10" :stroke="1.8" />
        </button>
      </li>
      <li v-if="!adding">
        <button ref="addButton" type="button" class="tag add" @click="open">
          <UiIcon name="plus" :size="10" :stroke="1.8" />{{ t('settingsScan.skip.add') }}
        </button>
      </li>
      <li v-else class="entry">
        <input
          ref="field"
          v-model="draft"
          class="field mono"
          type="text"
          spellcheck="false"
          autocomplete="off"
          :aria-label="t('settingsScan.skip.field')"
          :aria-invalid="problem !== null"
          :placeholder="t('settingsScan.skip.placeholder')"
          @keydown.enter.prevent="submit"
          @keydown.esc.stop.prevent="close"
          @blur="draft.trim() === '' && close()"
        />
      </li>
    </ul>
    <p v-if="problem" class="problem" role="alert">
      {{ t(`settingsScan.skip.problem.${problem}`) }}
    </p>
    <SettingsRow :title="t('settingsScan.skip.floor')">
      <UiSeg
        :model-value="String(store.scan.large_file_mb)"
        :options="floors"
        :label="t('settingsScan.skip.floor')"
        semantics="radio"
        @update:model-value="pickFloor"
      />
    </SettingsRow>
  </SettingsCard>
</template>

<style scoped>
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-xs);
  background: var(--surface-1);
  color: var(--ink-2);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.tag.mono {
  font-family: var(--font-mono);
  font-weight: var(--weight-regular);
}

.cross {
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: var(--radius-xs);
  color: var(--ink-4);
}

.cross:hover {
  color: var(--ink-2);
}

.cross:focus-visible,
.add:focus-visible {
  box-shadow: var(--focus-ring);
}

.add {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.field {
  height: 26px;
  width: 220px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-xs);
  background: var(--surface-0);
  box-shadow: var(--control-ring);
  color: var(--ink);
  font-size: var(--text-11);
}

.field:focus-visible {
  outline: none;
  box-shadow: var(--field-focus-ring);
}

.field[aria-invalid='true'] {
  box-shadow: var(--field-error-ring);
}

.problem {
  margin: 0;
  color: var(--crit-ink);
  font-size: var(--text-12);
}
</style>
