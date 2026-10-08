<!--
  The model of a provider: the list the provider's own API gave (a dropdown with the first
  suggestion marked default), or, when the list could not be read, a field to type the name
  into. The suggested models of the profile sit under it as chips either way.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AiProviderEntry } from '@/api/bindings/AiProviderEntry'
import { useAiProvidersStore } from '@/stores/ai-providers'
import UiButton from '@/ui/UiButton.vue'
import UiField from '@/ui/UiField.vue'
import { markOf } from './provider-state'
import UiSelect, { type SelectOption } from '@/ui/UiSelect.vue'

const props = defineProps<{ entry: AiProviderEntry }>()
const { t } = useI18n()
const store = useAiProvidersStore()

const id = computed(() => props.entry.profile.id)
const list = computed(() => store.models[id.value])
const chosen = computed(() => (store.view?.provider === id.value ? store.view.model : null))
const first = computed(() => props.entry.profile.models[0] ?? '')
const typed = ref('')

watch(
  [id, () => props.entry.key_set],
  () => {
    typed.value = ''
    void store.loadModels(id.value)
  },
  { immediate: true },
)

const options = computed((): SelectOption[] => {
  const names = list.value?.models ?? []
  const all = chosen.value && !names.includes(chosen.value) ? [chosen.value, ...names] : names
  return all.map((value) => ({
    value,
    label: value,
    meta: value === first.value ? t('aiProviders.model.default') : undefined,
  }))
})

function pick(model: string) {
  if (model !== '') void store.setModel(model)
}

function useTyped() {
  const name = typed.value.trim()
  if (name !== '') void store.setModel(name)
}
</script>

<template>
  <div class="model">
    <div v-if="list && !list.manual_entry" class="pick">
      <UiSelect
        :model-value="chosen ?? first"
        :options="options"
        :label="t('aiProviders.model.label')"
        variant="model"
        @update:model-value="pick"
      >
        <template #lead
          ><span class="lead" aria-hidden="true">{{ markOf(entry) }}</span></template
        >
      </UiSelect>
      <span class="count">
        {{ t('aiProviders.model.listed', { n: list.models.length }) }}
        <UiButton
          variant="ghost"
          size="small"
          icon="refresh"
          :aria-label="t('aiProviders.model.refresh')"
          @click="store.loadModels(id)"
        />
      </span>
    </div>
    <form v-else-if="list" class="manual" @submit.prevent="useTyped">
      <UiField
        v-model="typed"
        mono
        :label="t('aiProviders.model.label')"
        :placeholder="chosen ?? (first || t('aiProviders.model.example'))"
        :hint="t('aiProviders.model.manual')"
      />
      <UiButton type="submit" size="small" :disabled="typed.trim() === ''">{{
        t('aiProviders.model.use')
      }}</UiButton>
    </form>
    <div
      v-if="entry.profile.models.length"
      class="chips"
      :aria-label="t('aiProviders.model.suggested')"
      role="group"
    >
      <button
        v-for="name in entry.profile.models"
        :key="name"
        type="button"
        class="chip"
        :class="{ on: (chosen ?? first) === name }"
        @click="store.setModel(name)"
      >
        {{ name }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.model {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.pick {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2);
  align-items: end;
}

.lead {
  display: grid;
  place-items: center;
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 5px;
  background: var(--surface-well);
  font-size: 9px;
  font-weight: var(--weight-medium);
  line-height: 1;
}

.count {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  color: var(--ink-3);
  font-size: var(--text-11);
}

.manual {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2);
  align-items: end;
}

.manual :deep(.field) {
  min-width: 0;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  background: var(--surface-1);
  color: var(--ink-2);
  font-family: var(--font-mono);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.chip.on {
  background: var(--accent-soft);
  color: var(--accent-ink);
}
</style>
