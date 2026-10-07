<!--
  Confirmation, from the board "Actions" (Hold to confirm, reachable by everyone): the dialog
  a click, or an activation from VoiceOver, Switch or Voice Control, opens in place of the
  hold. 380 wide, a white card (radius 16, padding 18) on a 22 % scrim. The title asks the
  question; the body says what goes and what stays. Focus starts on Cancel, Escape cancels,
  and the confirm button is solid critical with white text and names the action. It covers
  the window (or, with `contained`, the nearest positioned ancestor, for the gallery). Scale
  .98 to 1 with a fade; Reduce Motion keeps the fade.
-->
<script setup lang="ts">
import { ref, toRef, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFocusTrap } from '@/lib/focus-trap'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    body?: string
    confirmLabel: string
    cancelLabel?: string
    contained?: boolean
  }>(),
  { body: undefined, cancelLabel: undefined, contained: false },
)

const emit = defineEmits<{ confirm: []; cancel: [] }>()

const { t } = useI18n()
const titleId = useId()
const bodyId = useId()
const panel = ref<HTMLElement>()

useFocusTrap(panel, toRef(props, 'open'), { onEscape: () => emit('cancel') })
</script>

<template>
  <Teleport to="body" :disabled="contained">
    <Transition name="confirm" appear>
      <div v-if="open" class="layer" :class="{ contained }">
        <div class="scrim" aria-hidden="true" />
        <div
          ref="panel"
          class="card"
          role="alertdialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-describedby="body ? bodyId : undefined"
        >
          <h2 :id="titleId" class="title">{{ title }}</h2>
          <p v-if="body" :id="bodyId" class="body">{{ body }}</p>
          <div class="foot">
            <button type="button" class="btn cancel" @click="emit('cancel')">
              {{ cancelLabel ?? t('ui.cancel') }}
            </button>
            <button type="button" class="btn confirm" @click="emit('confirm')">
              {{ confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.layer {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: var(--space-4);
}

.layer.contained {
  position: absolute;
  z-index: 45;
}

.scrim {
  position: absolute;
  inset: 0;
  background: var(--scrim-sheet);
}

.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 380px;
  max-width: 100%;
  padding: 18px;
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: var(--shadow-overlay);
}

.title {
  margin: 0;
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
}

.body {
  color: var(--ink-2);
  font-size: var(--text-13);
  line-height: 1.45;
}

.foot {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.btn {
  display: inline-flex;
  align-items: center;
  height: var(--h-control);
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.cancel {
  background: var(--secondary-bg);
  box-shadow: var(--secondary-shadow);
  color: var(--ink);
}

.confirm {
  background: var(--crit-solid);
  color: var(--on-solid);
}

.btn:focus-visible {
  box-shadow:
    var(--secondary-shadow),
    0 0 0 2px var(--ring-gap),
    0 0 0 4px var(--accent);
}

.confirm:focus-visible {
  box-shadow:
    0 0 0 2px var(--ring-gap),
    0 0 0 4px var(--accent);
}

.confirm-enter-active,
.confirm-leave-active {
  transition: opacity var(--dur-sheet) var(--ease-out);
}

.confirm-enter-active .card,
.confirm-leave-active .card {
  transition: transform var(--dur-sheet) var(--ease-out);
}

.confirm-enter-from,
.confirm-leave-to {
  opacity: 0;
}

.confirm-enter-from .card,
.confirm-leave-to .card {
  transform: scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .confirm-enter-from .card,
  .confirm-leave-to .card {
    transform: none;
  }
}
</style>
