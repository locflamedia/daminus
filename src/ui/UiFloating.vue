<!--
  The floating surface under every popover and menu: teleported to the end of the body and
  fixed next to its trigger, so no clipping ancestor can cut it. It follows the trigger on
  resize and scroll, flips to the other side when it would leave the window, scales in from
  the trigger's side (.96 to 1 with a fade, 150 ms) and leaves with a fade only (120 ms).
  Escape and a press outside close it (the parent decides: this only says `close`); focus
  moves in when it opens and goes back to the trigger when it closes. Under Reduce Motion
  the scale goes and the fade stays.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue'
import type { Placement } from '@/lib/anchor'
import { useFocusTrap } from '@/lib/focus-trap'
import { useAnchored } from '@/lib/use-anchored'

const props = withDefaults(
  defineProps<{
    open: boolean
    anchor: HTMLElement | null | undefined
    placement?: Placement
    role?: 'dialog' | 'menu'
    label?: string
    /** Tab cycles inside (a popover), or leaves and closes it (a menu). */
    trap?: boolean
    initialFocus?: (root: HTMLElement) => HTMLElement | null | undefined
    minWidth?: string
    /** Corner radius of the surface, so the shadow and the fill follow the content's corners. */
    radius?: string
    /** Draw it in the flow where it is placed, closed to nothing: for documentation pages. */
    inline?: boolean
  }>(),
  {
    placement: 'bottom-start',
    role: 'dialog',
    label: undefined,
    trap: true,
    initialFocus: undefined,
    minWidth: undefined,
    radius: 'var(--radius-md)',
    inline: false,
  },
)

const emit = defineEmits<{ close: [] }>()
defineSlots<{ default?: () => unknown }>()

const el = ref<HTMLElement>()
const anchorRef = toRef(props, 'anchor')
const { style } = useAnchored(anchorRef, el, { placement: props.placement })

useFocusTrap(
  el,
  computed(() => props.open && !props.inline),
  {
    onEscape: () => emit('close'),
    initialFocus: (root) => props.initialFocus?.(root),
    restoreTo: () =>
      props.anchor?.querySelector<HTMLElement>('button, [href], input, [tabindex]') ?? props.anchor,
  },
)

function onKeydown(event: KeyboardEvent) {
  if (!props.trap && event.key === 'Tab') emit('close')
}

function onOutside(event: PointerEvent) {
  const target = event.target as Node
  if (el.value?.contains(target) || props.anchor?.contains(target)) return
  emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open && !props.inline) document.addEventListener('pointerdown', onOutside, true)
    else document.removeEventListener('pointerdown', onOutside, true)
  },
  { immediate: true },
)
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside, true))
</script>

<template>
  <div
    v-if="inline && open"
    class="floating is-inline"
    :role="role"
    :aria-label="label"
    :style="[{ borderRadius: radius }, minWidth ? { minWidth } : undefined]"
  >
    <slot />
  </div>
  <Teleport v-else to="body">
    <Transition name="float">
      <div
        v-if="open"
        ref="el"
        class="floating"
        :style="[style, { borderRadius: radius }, minWidth ? { minWidth } : undefined]"
        :role="role"
        :aria-label="label"
        @keydown="onKeydown"
      >
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.floating {
  position: fixed;
  z-index: 50;
  max-width: calc(100vw - 16px);
  background: var(--surface-pop);
  box-shadow: var(--shadow-pop);
}

.is-inline {
  position: static;
  display: inline-block;
}

.float-enter-active {
  transition:
    opacity var(--dur-popover) var(--ease-out),
    transform var(--dur-popover) var(--ease-out);
}

.float-leave-active {
  transition: opacity var(--dur-menu-close) var(--ease-state);
}

.float-enter-from {
  opacity: 0;
  transform: scale(0.96);
}

.float-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .float-enter-from {
    transform: none;
  }
}
</style>
