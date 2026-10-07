<!--
  Root of the three setup routes: starts the store's event subscription, reads the ssh config
  and leaves everything forgotten when the flow is cancelled. The screens fill its router view.
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useSetupStore } from '@/stores/setup'

const setup = useSetupStore()

onMounted(async () => {
  await setup.init()
  if (setup.listing === null) await setup.load()
})
onBeforeUnmount(() => setup.dispose())
</script>

<template>
  <RouterView />
</template>
