<!--
  Dialog, from the board "Feedback" (Dialog, blocking): only for a decision that is unsafe to
  skip; the host key that changed is the one in v0.1. A 24 % ink scrim, a 480 px glass tray
  (radius 20) around a white card (14, padding 20) centred in the window, an icon tile (36,
  radius 10, tinted by `tone`), a title and a sentence, then the details you put in the slot,
  and the buttons at the bottom right (`footer`: the quiet one first, the primary last).

  `alert` makes it an `alertdialog`. It never closes by itself or on a press outside; Escape
  says `close` and the owner maps it to the safe choice. Focus starts on the first control
  (put the safe one first), Tab wraps, and focus returns to where it was. It fills the nearest
  positioned ancestor. Scale .98 to 1 with a fade, 200 ms; Reduce Motion keeps the fade.
-->
<script setup lang="ts">
import { ref, toRef, useId } from 'vue'
import { useFocusTrap } from '@/lib/focus-trap'
import UiIcon from './UiIcon.vue'
import type { IconName } from './icon-paths'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    description?: string
    icon?: IconName
    tone?: 'crit' | 'warn' | 'info'
    alert?: boolean
  }>(),
  { description: undefined, icon: 'shield', tone: 'crit', alert: false },
)

const emit = defineEmits<{ close: [] }>()
defineSlots<{ default?: () => unknown; footer?: () => unknown }>()

const titleId = useId()
const descId = useId()
const panel = ref<HTMLElement>()

useFocusTrap(panel, toRef(props, 'open'), { onEscape: () => emit('close') })
</script>

<template>
  <Transition name="dialog" appear>
    <div v-if="open" class="layer">
      <div class="scrim" aria-hidden="true" />
      <div
        ref="panel"
        class="tray"
        :role="alert ? 'alertdialog' : 'dialog'"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="description ? descId : undefined"
      >
        <div class="card">
          <div class="head">
            <span class="tile" :class="`tone-${tone}`"><UiIcon :name="icon" :size="18" /></span>
            <div class="texts">
              <h2 :id="titleId" class="title">{{ title }}</h2>
              <p v-if="description" :id="descId" class="description">{{ description }}</p>
            </div>
          </div>
          <slot />
          <div v-if="$slots.footer" class="foot"><slot name="footer" /></div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.layer {
  position: absolute;
  inset: 0;
  z-index: 45;
  display: grid;
  place-items: center;
  padding: var(--space-4);
}

.scrim {
  position: absolute;
  inset: 0;
  background: var(--scrim-dialog);
}

.tray {
  position: relative;
  width: 480px;
  max-width: 100%;
  padding: 6px;
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface-0) 60%, transparent);
}

.tray:focus-visible {
  box-shadow: none;
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
  border-radius: var(--radius-md);
  background: var(--surface-0);
  box-shadow: var(--shadow-overlay);
}

.head {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.tile {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
}

.tone-crit {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.tone-warn {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.tone-info {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.texts {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.title {
  margin: 0;
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
}

.description {
  color: var(--ink-2);
  font-size: var(--text-13);
  line-height: 1.45;
}

.foot {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity var(--dur-sheet) var(--ease-out);
}

.dialog-enter-active .tray,
.dialog-leave-active .tray {
  transition: transform var(--dur-sheet) var(--ease-out);
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from .tray,
.dialog-leave-to .tray {
  transform: scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .dialog-enter-from .tray,
  .dialog-leave-to .tray {
    transform: none;
  }
}
</style>
