<!--
  The API key of a provider. A stored key is only a lock, "in Keychain" and Replace: the page
  never receives it. Typing one goes into a password field that is cleared when it is sent,
  whatever the answer, so no copy stays in the page.
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AiProviderEntry } from '@/api/bindings/AiProviderEntry'
import { useAiProvidersStore } from '@/stores/ai-providers'
import UiButton from '@/ui/UiButton.vue'
import UiField from '@/ui/UiField.vue'
import UiIcon from '@/ui/UiIcon.vue'

const props = defineProps<{ entry: AiProviderEntry }>()
const { t } = useI18n()
const store = useAiProvidersStore()

const draft = ref('')
const replacing = ref(false)

const id = computed(() => props.entry.profile.id)
const locked = computed(() => props.entry.key_set && !replacing.value)
const busy = computed(() => store.busyKey === id.value)

async function save() {
  const key = draft.value
  draft.value = ''
  if (key.trim() === '') return
  if (await store.saveKey(id.value, key)) replacing.value = false
}

function cancel() {
  draft.value = ''
  replacing.value = false
}
</script>

<template>
  <div v-if="locked" class="locked">
    <span class="lbl">{{ t('aiProviders.key.label') }}</span>
    <span class="well">
      <UiIcon name="lock" :size="16" class="lock" />
      <span class="dots" aria-hidden="true">••••••••••••••••</span>
      <span class="where">{{ t('aiProviders.key.inKeychain') }}</span>
      <UiButton variant="link" @click="replacing = true">{{
        t('aiProviders.key.replace')
      }}</UiButton>
    </span>
  </div>
  <form v-else class="entry" autocomplete="off" @submit.prevent="save">
    <UiField
      v-model="draft"
      type="password"
      mono
      :label="t('aiProviders.key.label')"
      :placeholder="
        entry.profile.key_hint
          ? t('aiProviders.key.placeholder', { hint: entry.profile.key_hint })
          : undefined
      "
      :hint="t('aiProviders.key.hint')"
      :error="store.keyErrors[id]"
    />
    <div class="actions">
      <UiButton
        type="submit"
        variant="primary"
        size="small"
        :busy="busy"
        :disabled="draft.trim() === ''"
      >
        {{ t('aiProviders.key.save') }}
      </UiButton>
      <UiButton v-if="entry.key_set" variant="ghost" size="small" @click="cancel">
        {{ t('aiProviders.key.cancel') }}
      </UiButton>
    </div>
  </form>
</template>

<style scoped>
.locked {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lbl {
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.well {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  background: var(--surface-1);
}

.lock {
  color: var(--ok-solid);
}

.dots {
  font-family: var(--font-mono);
  font-size: var(--text-12);
  letter-spacing: 0.06em;
}

.where {
  margin-left: auto;
  color: var(--ok-ink);
  font-size: var(--text-11);
}

.entry {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.actions {
  display: flex;
  gap: var(--space-2);
}
</style>
