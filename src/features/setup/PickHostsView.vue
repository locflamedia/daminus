<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SetupFrame from './SetupFrame.vue'

const { t } = useI18n()
</script>

<template>
  <SetupFrame :step="1" :title="t('setupShell.pick.name')" />
</template>
