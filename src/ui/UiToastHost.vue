<!--
  Where toasts appear: bottom right of the window, newest at the bottom, 8 px apart. Mount it
  once at the window root; `useToastStore().push(...)` puts a toast here. A toast rises 12 px
  and fades in over 220 ms and leaves by dropping 8 px over 200 ms; Reduce Motion keeps the
  fades. Items are a polite live region each, so the host itself adds no announcement.
-->
<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useToastStore } from '@/stores/toasts'
import UiToast from './UiToast.vue'

const store = useToastStore()
const { toasts } = storeToRefs(store)
</script>

<template>
  <div class="host">
    <TransitionGroup name="toast" tag="div" class="stack">
      <UiToast
        v-for="toast in toasts"
        :key="toast.id"
        :tone="toast.tone"
        :title="toast.title"
        :detail="toast.detail"
        :action="toast.action"
        :duration="toast.duration"
        @dismiss="store.dismiss(toast.id)"
      />
    </TransitionGroup>
  </div>
</template>

<style scoped>
.host {
  position: fixed;
  right: var(--space-4);
  bottom: var(--space-4);
  z-index: 70;
  max-width: calc(100vw - 2 * var(--space-4));
  pointer-events: none;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-end;
}

.stack > :deep(*) {
  pointer-events: auto;
}

.toast-enter-active {
  transition:
    opacity var(--dur-toast) var(--ease-out),
    transform var(--dur-toast) var(--ease-out);
}

.toast-leave-active {
  position: absolute;
  transition:
    opacity var(--dur-toast-out) var(--ease-state),
    transform var(--dur-toast-out) var(--ease-state);
}

.toast-move {
  transition: transform var(--dur-toast) var(--ease-out);
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (prefers-reduced-motion: reduce) {
  .toast-enter-from,
  .toast-leave-to {
    transform: none;
  }

  .toast-move {
    transition: none;
  }
}
</style>
