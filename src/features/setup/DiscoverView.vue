<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SetupFrame from './SetupFrame.vue'

const { t } = useI18n()
</script>

<template>
  <SetupFrame :step="2" :title="t('setupShell.discover.name')" />
</template>
