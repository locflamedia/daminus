<!--
  Root of the three setup routes: starts the store's event subscription, reads the ssh config
  and leaves everything forgotten when the flow is cancelled. It also holds the "Add a host by
  hand" sheet (⌘N opens it from any step). The screens fill its router view.
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useSetupStore } from '@/stores/setup'
import AddHostSheet from './components/AddHostSheet.vue'

const setup = useSetupStore()

function onKeydown(e: KeyboardEvent) {
  if (e.defaultPrevented || !e.metaKey || e.shiftKey || e.key.toLowerCase() !== 'n') return
  e.preventDefault()
  setup.addHostOpen = true
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  await setup.init()
  if (setup.listing === null) await setup.load()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  setup.dispose()
})
</script>

<template>
  <RouterView />
  <AddHostSheet v-model="setup.addHostOpen" />
</template>
