<!--
  Hold to confirm, from the boards "Settings · Data" and "Actions": a destructive action with
  no dialog. A rose fill sweeps across the button while it is held (1.5 s, linear), and snaps
  back in 200 ms when let go early. Pointer or keyboard (Space or Enter held down); `confirm`
  fires once when the fill completes. The sweep is progress, not decoration, so it keeps
  running under Reduce Motion; only the snap back becomes instant.

  The hold is not the only way in. A click that ends before the hold has started to fill (under
  300 ms), or any activation that is not a held press (VoiceOver, Switch Control, Voice
  Control), opens a confirmation dialog with the same result: `confirmTitle` asks the question,
  `confirmBody` says what goes and what stays, `confirmLabel` names the action. The button
  reads as `actionLabel` ("Clear history"), described by "Hold to confirm, or press to open a
  confirmation".
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import UiConfirm from './UiConfirm.vue'
import UiIcon from './UiIcon.vue'
import type { IconName } from './icon-paths'

const props = withDefaults(
  defineProps<{
    label: string
    icon?: IconName
    /** How long the button has to be held, in ms. */
    duration?: number
    /** The line under the button that says how to use it ("Hold for 1.5 s..."). */
    hint?: string
    disabled?: boolean
    /** The action as a screen reader names it: "Clear history". The visible label when absent. */
    actionLabel?: string
    /** The confirmation a click opens: the question, what goes and what stays, the button. */
    confirmTitle?: string
    confirmBody?: string
    confirmLabel?: string
    cancelLabel?: string
    /** Keeps the confirmation inside the nearest positioned ancestor (the gallery). */
    contained?: boolean
  }>(),
  {
    icon: 'close',
    duration: 1500,
    hint: undefined,
    disabled: false,
    actionLabel: undefined,
    confirmTitle: undefined,
    confirmBody: undefined,
    confirmLabel: undefined,
    cancelLabel: undefined,
    contained: false,
  },
)

const emit = defineEmits<{ confirm: [] }>()

/** A click that ends before the fill has visibly started opens the confirmation. */
const CLICK_MS = 300

const { t } = useI18n()
const hintId = useId()
const announceId = useId()
const holding = ref(false)
const asking = ref(false)
let timer: number | undefined
let startedAt = 0

const style = computed(() => ({ '--hold': `${props.duration}ms` }))

function start() {
  if (props.disabled || holding.value) return
  holding.value = true
  startedAt = Date.now()
  timer = window.setTimeout(finish, props.duration)
}

function cancel() {
  window.clearTimeout(timer)
  timer = undefined
  holding.value = false
}

function finish() {
  cancel()
  emit('confirm')
}

function onPointerDown(event: PointerEvent) {
  if (event.button === 0) start()
}

function onPointerUp() {
  const quick = holding.value && Date.now() - startedAt < CLICK_MS
  cancel()
  if (quick) ask()
}

/** An activation with no pointer or key behind it: what assistive technology sends. */
function onClick(event: MouseEvent) {
  if (event.detail === 0) ask()
}

function ask() {
  if (props.disabled || !props.confirmTitle) return
  asking.value = true
}

function onConfirm() {
  asking.value = false
  emit('confirm')
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== ' ' && event.key !== 'Enter') return
  event.preventDefault()
  if (!event.repeat) start()
}

function onKeyUp(event: KeyboardEvent) {
  if (event.key === ' ' || event.key === 'Enter') cancel()
}

onBeforeUnmount(cancel)
</script>

<template>
  <span class="hold-wrap">
    <button
      type="button"
      class="hold"
      :class="{ holding }"
      :style="style"
      :disabled="disabled"
      :aria-label="actionLabel"
      :aria-describedby="
        confirmTitle ? (hint ? `${announceId} ${hintId}` : announceId) : hint ? hintId : undefined
      "
      @pointerdown="onPointerDown"
      @pointerup="onPointerUp"
      @pointerleave="cancel"
      @pointercancel="cancel"
      @contextmenu="cancel"
      @keydown="onKeyDown"
      @keyup="onKeyUp"
      @blur="cancel"
      @click="onClick"
    >
      <UiIcon :name="icon" :size="14" :stroke="2" />
      {{ label }}
      <span class="fill" aria-hidden="true">
        <UiIcon :name="icon" :size="14" :stroke="2" />
        {{ label }}
      </span>
    </button>
    <span v-if="confirmTitle" :id="announceId" class="sr-only">{{ t('ui.holdAnnounce') }}</span>
    <span v-if="hint" :id="hintId" class="hint">{{ hint }}</span>
    <UiConfirm
      v-if="confirmTitle"
      :open="asking"
      :title="confirmTitle"
      :body="confirmBody"
      :confirm-label="confirmLabel ?? label"
      :cancel-label="cancelLabel"
      :contained="contained"
      @confirm="onConfirm"
      @cancel="asking = false"
    />
  </span>
</template>

<style scoped>
.hold-wrap {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.hold {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--h-control);
  padding: 0 var(--space-3);
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--crit-soft);
  color: var(--crit-ink);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
  line-height: 1;
  white-space: nowrap;
  user-select: none;
  -webkit-user-select: none;
}

.hold:focus-visible {
  box-shadow:
    0 0 0 2px var(--ring-gap),
    0 0 0 4px var(--accent);
}

/* The same label again in white, revealed left to right by the clip. */
.fill {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-3);
  background: var(--crit-solid);
  color: var(--surface-0);
  clip-path: inset(0 100% 0 0);
  transition: clip-path var(--dur-state) var(--ease-out);
}

.holding .fill {
  clip-path: inset(0 0 0 0);
  transition: clip-path var(--hold) linear;
}

.hold:disabled {
  background: var(--surface-1);
  color: var(--ink-5);
}

.hint {
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: var(--lh-11);
}

@media (prefers-reduced-motion: reduce) {
  .fill {
    transition: none;
  }

  .holding .fill {
    transition: clip-path var(--hold) linear;
  }
}
</style>
