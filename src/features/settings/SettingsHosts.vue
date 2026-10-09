<!--
  Settings › Hosts: the hosts of the ssh config and the one that is open. Connection details
  stay in ~/.ssh/config; Daminus reads them and never stores a key. Reload and Add host sit in
  the header of the section.
-->
<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AddHostSheet from '@/features/setup/components/AddHostSheet.vue'
import { useHostsSettingsStore } from '@/stores/hosts-settings'
import { useSetupStore } from '@/stores/setup'
import UiButton from '@/ui/UiButton.vue'
import HostDetail from './HostDetail.vue'
import HostsLeftOut from './HostsLeftOut.vue'
import HostsList from './HostsList.vue'
import HostsTermius from './HostsTermius.vue'

const { t } = useI18n()
const store = useHostsSettingsStore()
const setup = useSetupStore()

onMounted(() => {
  void setup.init().then(() => store.load())
})
</script>

<template>
  <Teleport to="#settings-actions" defer>
    <UiButton icon="refresh" :busy="store.loading" @click="store.load()">
      {{ t('settingsHosts.reload') }}
    </UiButton>
    <UiButton icon="plus" @click="setup.addHostOpen = true">{{ t('settingsHosts.add') }}</UiButton>
  </Teleport>
  <div class="hosts">
    <div class="layout">
      <div class="column">
        <HostsList />
        <HostsTermius />
        <HostsLeftOut />
      </div>
      <HostDetail />
    </div>
  </div>
  <AddHostSheet v-model="setup.addHostOpen" />
</template>

<style scoped>
.hosts {
  container-type: inline-size;
  min-width: 0;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 420px;
  gap: var(--space-4);
}

.column {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

@container (max-width: 800px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
