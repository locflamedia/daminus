<!--
  The "Show in Finder" button at the right of the Data title: opens the app's folder.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useDataStore } from '@/stores/data'
import UiButton from '@/ui/UiButton.vue'

const { t } = useI18n()
const data = useDataStore()
</script>

<template>
  <UiButton variant="secondary" icon="folder" @click="data.reveal()">
    {{ t('settingsData.reveal') }}
  </UiButton>
</template>
