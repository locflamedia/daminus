<!--
  Drawer, from the boards "AI · Ask" and "Scan panel": a panel that slides in from the right
  edge and sits beside the page, not over it, so what it talks about stays readable on the
  left. No scrim. Two shapes:

  - `glass` (the AI panel): full height, 480 px, 92 % surface with a 24 px blur, a soft shadow
    on its left edge;
  - `card` (the scan panel): 440 px, inset 12 px from the top, right and bottom, radius 18,
    a solid card with the panel shadow.

  It moves 24 px with a fade over 300 ms on the drawer curve; Reduce Motion keeps the fade. It
  is a non-modal dialog (`aria-modal="false"`) that still keeps focus in while open: focus
  moves in, Tab wraps, Escape says `close` (the owner closes it), and focus returns to where
  it was. A press elsewhere is not captured, so the page beside it stays usable. It fills the
  nearest positioned ancestor.
-->
<script setup lang="ts">
import { ref, toRef } from 'vue'
import { useFocusTrap } from '@/lib/focus-trap'

const props = withDefaults(
  defineProps<{ open: boolean; label: string; variant?: 'glass' | 'card'; width?: string }>(),
  { variant: 'glass', width: undefined },
)

const emit = defineEmits<{ close: [] }>()
defineSlots<{ default?: () => unknown }>()

const panel = ref<HTMLElement>()
useFocusTrap(panel, toRef(props, 'open'), { onEscape: () => emit('close') })
</script>

<template>
  <Transition name="drawer" appear>
    <aside
      v-if="open"
      ref="panel"
      class="drawer"
      :class="`drawer-${variant}`"
      :style="width ? { width } : undefined"
      role="dialog"
      aria-modal="false"
      :aria-label="label"
    >
      <slot />
    </aside>
  </Transition>
</template>

<style scoped>
.drawer {
  position: absolute;
  z-index: 35;
  display: flex;
  flex-direction: column;
  max-width: 100%;
  overflow: hidden;
  color: var(--ink);
}

.drawer-glass {
  top: 0;
  right: 0;
  bottom: 0;
  width: 480px;
  background: color-mix(in srgb, var(--surface-0) 92%, transparent);
  box-shadow: var(--shadow-drawer);
  backdrop-filter: blur(24px) saturate(160%);
}

.drawer-glass:focus-visible {
  box-shadow: var(--shadow-drawer);
}

.drawer-card {
  top: var(--space-3);
  right: var(--space-3);
  bottom: var(--space-3);
  width: 440px;
  max-width: calc(100% - 2 * var(--space-3));
  border-radius: calc(var(--radius-md) + var(--space-1));
  background: var(--surface-0);
  box-shadow: var(--shadow-panel);
}

.drawer-card:focus-visible {
  box-shadow: var(--shadow-panel);
}

.drawer-enter-active,
.drawer-leave-active {
  transition:
    transform var(--dur-drawer) var(--ease-drawer),
    opacity var(--dur-drawer) var(--ease-drawer);
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
  transform: translateX(24px);
}

@media (prefers-reduced-motion: reduce) {
  .drawer-enter-from,
  .drawer-leave-to {
    transform: none;
  }
}
</style>
