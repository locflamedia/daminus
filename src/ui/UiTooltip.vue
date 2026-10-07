<!--
  Tooltip, from the boards "Feedback", "Micro UI" and "Motion": an ink pill (the primary
  button's fill, so it flips in dark mode), 12 px, radius 8, with an optional shortcut inside
  and a 10 x 5 arrow. It appears 400 ms after the pointer rests on the trigger, in 150 ms; if
  another tooltip closed in the last 300 ms the next one opens at once ("instant for
  neighbours"); it leaves immediately, on pointer leave, click, blur, Escape or scroll.
  Keyboard focus shows it at once, since there is no pointer to wait for. While open it is
  the trigger's `aria-describedby`. It wraps one element and adds no box of its own. `pinned`
  opens it at once for a message the person is waiting for (a copy that failed); the usual
  leave rules still close it.
-->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, onUpdated, ref, useId, watch } from 'vue'
import { useAnchored } from '@/lib/use-anchored'
import UiKbd from './UiKbd.vue'

const props = withDefaults(
  defineProps<{
    text: string
    keys?: string[]
    side?: 'top' | 'bottom'
    disabled?: boolean
    /** Opens at once and stays while true, for a message the person is waiting for. */
    pinned?: boolean
  }>(),
  { keys: () => [], side: 'top', disabled: false, pinned: false },
)

/** Tooltips that close within this window let the next one open without the delay. */
const WARM_MS = 300
let lastClosed = Number.NEGATIVE_INFINITY

const id = useId()
const root = ref<HTMLElement>()
const tip = ref<HTMLElement>()
const anchor = ref<HTMLElement>()
const open = ref(false)
let timer: number | undefined

const {
  style,
  side: placed,
  arrowLeft,
} = useAnchored(anchor, tip, {
  placement: props.side === 'top' ? 'top-center' : 'bottom-center',
  gap: 6,
})

function delay(): number {
  const warm = performance.now() - lastClosed < WARM_MS
  const value = getComputedStyle(document.documentElement).getPropertyValue('--delay-tooltip')
  const ms = Number.parseFloat(value)
  return warm ? 0 : Number.isFinite(ms) ? ms : 400
}

function show(immediate: boolean) {
  if (props.disabled || open.value) return
  window.clearTimeout(timer)
  const wait = immediate ? 0 : delay()
  const reveal = () => {
    anchor.value = (root.value?.firstElementChild as HTMLElement | null) ?? undefined
    if (!anchor.value) return
    anchor.value.setAttribute('aria-describedby', id)
    open.value = true
  }
  if (wait === 0) reveal()
  else timer = window.setTimeout(reveal, wait)
}

function hide() {
  window.clearTimeout(timer)
  timer = undefined
  if (!open.value) return
  open.value = false
  lastClosed = performance.now()
  anchor.value?.removeAttribute('aria-describedby')
  void nextTick(() => (anchor.value = undefined))
}

function onOver(event: MouseEvent) {
  if (!(event.relatedTarget instanceof Node) || !root.value?.contains(event.relatedTarget))
    show(false)
}

function onOut(event: MouseEvent) {
  if (!(event.relatedTarget instanceof Node) || !root.value?.contains(event.relatedTarget)) hide()
}

function onFocusIn(event: FocusEvent) {
  // Pointer-driven focus (a click) is not a reason to show it; keyboard focus is.
  if ((event.target as HTMLElement).matches?.(':focus-visible')) show(true)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') hide()
}

watch(
  () => props.pinned,
  (on) => (on ? show(true) : hide()),
  { flush: 'post' },
)

// An icon-only button repeats its name as a native `title`; the tooltip replaces it, so the
// system's own tip does not appear on top.
function dropNativeTitle() {
  const el = root.value?.firstElementChild
  if (el?.getAttribute('title') === props.text) el.removeAttribute('title')
}
onMounted(() => {
  dropNativeTitle()
  if (props.pinned) show(true)
})
onUpdated(dropNativeTitle)
onBeforeUnmount(hide)
</script>

<template>
  <span
    ref="root"
    class="tooltip-root"
    @mouseover="onOver"
    @mouseout="onOut"
    @focusin="onFocusIn"
    @focusout="hide"
    @pointerdown="hide"
    @keydown="onKeydown"
  >
    <slot />
    <Teleport to="body">
      <div
        v-if="open"
        :id="id"
        ref="tip"
        class="tip"
        :class="`side-${placed}`"
        :style="style"
        role="tooltip"
      >
        <span class="words">{{ text }}</span>
        <span v-if="keys.length > 0" class="keys">
          <UiKbd v-for="key in keys" :key="key" tone="on-button">{{ key }}</UiKbd>
        </span>
        <span class="arrow" :style="{ left: `${arrowLeft - 5}px` }" aria-hidden="true" />
      </div>
    </Teleport>
  </span>
</template>

<style scoped>
.tooltip-root {
  display: contents;
}

.tip {
  position: fixed;
  z-index: 60;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  max-width: 320px;
  padding: 6px var(--space-2);
  border-radius: 8px;
  background: var(--btn);
  color: var(--btn-ink);
  font-size: var(--text-12);
  line-height: var(--lh-12);
  pointer-events: none;
  animation: tip-in var(--dur-popover) var(--ease-out) both;
}

.words {
  min-width: 0;
  overflow-wrap: anywhere;
}

.keys {
  display: inline-flex;
  flex: none;
  gap: 3px;
}

.arrow {
  position: absolute;
  width: 10px;
  height: 5px;
  background: var(--btn);
  clip-path: polygon(0 0, 100% 0, 50% 100%);
}

.side-top .arrow {
  bottom: -5px;
}

.side-bottom .arrow {
  top: -5px;
  transform: scaleY(-1);
}

@keyframes tip-in {
  from {
    opacity: 0;
    translate: 0 4px;
    scale: 0.97;
  }
  to {
    opacity: 1;
    translate: 0 0;
    scale: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tip {
    animation-name: tip-fade;
  }

  @keyframes tip-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
}
</style>
