<!--
  The endpoint of a provider that has none of its own (a compatible server), or a different one
  for any other. https only; plain http is accepted for this Mac. The same rule the core
  applies, so the message comes before a refused save.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AiProviderEntry } from '@/api/bindings/AiProviderEntry'
import { useAiProvidersStore } from '@/stores/ai-providers'
import UiButton from '@/ui/UiButton.vue'
import UiField from '@/ui/UiField.vue'
import { checkBaseUrl } from './provider-state'

const props = defineProps<{ entry: AiProviderEntry }>()
const { t } = useI18n()
const store = useAiProvidersStore()

const saved = computed(() =>
  store.view?.provider === props.entry.profile.id ? store.view.base_url : null,
)
const draft = ref(saved.value ?? '')
const touched = ref(false)

watch(saved, (value) => (draft.value = value ?? ''))

const problem = computed(() =>
  touched.value && draft.value.trim() !== '' ? checkBaseUrl(draft.value) : null,
)
const hint = computed(() =>
  props.entry.profile.base_url
    ? t('aiProviders.baseUrl.hint', { default: props.entry.profile.base_url })
    : t('aiProviders.baseUrl.hintNone'),
)

function use() {
  touched.value = true
  const raw = draft.value.trim()
  if (raw === '' || checkBaseUrl(raw) !== null) return
  void store.setBaseUrl(raw)
}

function reset() {
  touched.value = false
  draft.value = ''
  void store.setBaseUrl(null)
}
</script>

<template>
  <form class="url" @submit.prevent="use">
    <UiField
      v-model="draft"
      type="url"
      mono
      :label="t('aiProviders.baseUrl.label')"
      :placeholder="entry.profile.base_url || 'https://'"
      :hint="hint"
      :error="problem ? t(`aiProviders.baseUrl.${problem}`) : undefined"
      @update:model-value="touched = true"
    />
    <div class="actions">
      <UiButton type="submit" size="small" :disabled="draft.trim() === ''">{{
        t('aiProviders.baseUrl.use')
      }}</UiButton>
      <UiButton v-if="saved" variant="ghost" size="small" @click="reset">{{
        t('aiProviders.baseUrl.reset')
      }}</UiButton>
    </div>
  </form>
</template>

<style scoped>
.url {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.actions {
  display: flex;
  gap: var(--space-2);
}
</style>
