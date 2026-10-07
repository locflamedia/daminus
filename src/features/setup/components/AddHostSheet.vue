<!--
  "Add a host by hand": the Host block form in a sheet, without the teaching of the empty
  screen. Daminus never writes `~/.ssh/config`; the person fills the fields, copies the block,
  pastes it there and presses Check again, which reads the config again. Opened and closed by
  the setup store's `addHostOpen` (bind it with v-model).
-->
<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { emptyFields, type HostBlockFields } from '@/lib/host-block'
import { useSetupStore } from '@/stores/setup'
import UiButton from '@/ui/UiButton.vue'
import UiSheet from '@/ui/UiSheet.vue'
import HostBlockForm from './HostBlockForm.vue'

const open = defineModel<boolean>({ required: true })

const { t } = useI18n()
const setup = useSetupStore()

const fields = ref<HostBlockFields>(emptyFields())
const checking = ref(false)

// A sheet that opens again starts from a clean form.
watch(open, (now) => {
  if (now) fields.value = emptyFields()
})

async function checkAgain() {
  checking.value = true
  try {
    await setup.reload()
  } finally {
    checking.value = false
  }
}
</script>

<template>
  <UiSheet
    :open="open"
    :title="t('empty.addHost.title')"
    :context="t('empty.addHost.context')"
    width="560px"
    @close="open = false"
  >
    <HostBlockForm v-model="fields" variant="sheet" class="body" />
    <template #footer-end>
      <UiButton @click="open = false">{{ t('empty.addHost.close') }}</UiButton>
      <UiButton variant="primary" :busy="checking" @click="checkAgain">
        {{ t('empty.addHost.checkAgain') }}
      </UiButton>
    </template>
  </UiSheet>
</template>

<style scoped>
.body {
  padding: var(--space-4);
}
</style>
