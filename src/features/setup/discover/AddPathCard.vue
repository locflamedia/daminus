<!--
  "Something missing?": what discover cannot know (an app run by systemd or cron) can be added
  by its folder. The host is one of the hosts that can be read, the path must be absolute; the
  folder then shows up under "Not in a project" in the next step.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isAbsPath } from '@/lib/setup-model'
import UiButton from '@/ui/UiButton.vue'
import UiField from '@/ui/UiField.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiPopover from '@/ui/UiPopover.vue'
import UiSelect from '@/ui/UiSelect.vue'

const props = defineProps<{ hosts: readonly string[] }>()
/** Returns false when the folder is already added. */
const emit = defineEmits<{ add: [host: string, path: string, done: (ok: boolean) => void] }>()

const { t } = useI18n()
const open = ref(false)
const host = ref('')
const path = ref('')
const error = ref<string | undefined>()

const options = computed(() => props.hosts.map((h) => ({ value: h, label: h })))
watch(
  () => props.hosts,
  (hosts) => {
    if (!hosts.includes(host.value)) host.value = hosts[0] ?? ''
  },
  { immediate: true },
)
watch(path, () => (error.value = undefined))

function submit() {
  const clean = path.value.trim()
  if (!isAbsPath(clean)) {
    error.value = t('setupDiscover.add.invalid')
    return
  }
  emit('add', host.value, clean, (ok) => {
    if (!ok) {
      error.value = t('setupDiscover.add.exists')
      return
    }
    path.value = ''
    open.value = false
  })
}
</script>

<template>
  <section class="card">
    <b class="title"><UiIcon name="folder" :size="16" />{{ t('setupDiscover.add.title') }}</b>
    <p>{{ t('setupDiscover.add.body') }}</p>
    <UiPopover v-model:open="open" :label="t('setupDiscover.add.button')" width="300px">
      <template #trigger="{ attrs, toggle }">
        <UiButton
          v-bind="attrs"
          icon="plus"
          class="trigger"
          data-testid="add-path"
          :disabled="hosts.length === 0"
          @click="toggle"
        >
          {{ t('setupDiscover.add.button') }}
        </UiButton>
      </template>
      <form class="form" @submit.prevent="submit">
        <UiSelect v-model="host" :label="t('setupDiscover.add.host')" :options="options" />
        <UiField
          v-model="path"
          mono
          :label="t('setupDiscover.add.path')"
          :hint="t('setupDiscover.add.hint')"
          :error="error"
          placeholder="/var/www/shop"
        />
        <UiButton variant="primary" type="submit" :disabled="path.trim() === ''">
          {{ t('setupDiscover.add.submit') }}
        </UiButton>
      </form>
    </UiPopover>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-0) 72%, transparent);
}

.title {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.title :deep(.icon) {
  color: var(--ink-3);
}

p {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 1.45;
}

.trigger {
  align-self: flex-start;
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
