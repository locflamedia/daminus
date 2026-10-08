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

  `wide` is the board "Host key changed": a 680 px white card (padding 28, radius 20, gap 18) with
  no tray, a 3 px blur on the scrim and a 48 px icon tile; a critical tile is a gradient with a
  pulsing halo, and an `alert` that is wide comes in at scale .96 and nudges three times
  sideways in 300 ms. `#title` replaces the plain title text (the host in mono); a button
  marked `data-dialog-primary` takes focus first.
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
    tone?: 'crit' | 'warn' | 'info' | 'neutral'
    alert?: boolean
    wide?: boolean
  }>(),
  { description: undefined, icon: 'shield', tone: 'crit', alert: false, wide: false },
)

const emit = defineEmits<{ close: [] }>()
defineSlots<{ default?: () => unknown; footer?: () => unknown; title?: () => unknown }>()

const titleId = useId()
const descId = useId()
const panel = ref<HTMLElement>()

useFocusTrap(panel, toRef(props, 'open'), {
  onEscape: () => emit('close'),
  initialFocus: (root) => root.querySelector<HTMLElement>('[data-dialog-primary]'),
})
</script>

<template>
  <Transition name="dialog" appear>
    <div v-if="open" class="layer" :class="{ wide, shakes: wide && alert }">
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
            <span class="tile" :class="`tone-${tone}`"
              ><UiIcon :name="icon" :size="wide ? 24 : 18"
            /></span>
            <div class="texts">
              <h2 :id="titleId" class="title">
                <slot name="title">{{ title }}</slot>
              </h2>
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

.tone-neutral {
  background: var(--surface-1);
  color: var(--ink-3);
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
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
}

.wide .scrim {
  backdrop-filter: blur(3px);
}

.wide .tray {
  width: 680px;
  padding: 0;
  background: none;
}

.wide .card {
  gap: 18px;
  padding: 28px;
  border-radius: var(--radius-lg);
}

.wide .head {
  gap: var(--space-4);
}

.wide .texts {
  gap: 6px;
}

.wide .tile {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
}

.wide .tile.tone-crit {
  background: linear-gradient(
    150deg,
    color-mix(in srgb, var(--crit-solid), var(--surface-0) 14%),
    var(--crit-ink)
  );
  color: var(--surface-0);
  animation: dialog-halo 1.8s var(--ease-out) infinite;
}

.wide .title {
  font-size: 20px;
  letter-spacing: -0.02em;
}

.wide .description {
  line-height: 1.5;
}

.wide .foot {
  gap: 10px;
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

/* The critical dialog stops you: it lands at .96 and nudges three times sideways in 300 ms. */
.shakes.dialog-enter-active .tray {
  transition: none;
  animation: dialog-shake 500ms var(--ease-out) both;
}

.shakes.dialog-enter-from .tray {
  transform: none;
}

@keyframes dialog-shake {
  0% {
    transform: scale(0.96);
  }

  40% {
    transform: none;
  }

  55% {
    transform: translateX(-6px);
  }

  75% {
    transform: translateX(5px);
  }

  90% {
    transform: translateX(-3px);
  }

  100% {
    transform: none;
  }
}

@keyframes dialog-halo {
  0% {
    box-shadow: 0 0 0 0 var(--crit-halo);
  }

  70%,
  100% {
    box-shadow: 0 0 0 14px transparent;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dialog-enter-from .tray,
  .dialog-leave-to .tray {
    transform: none;
  }

  .shakes.dialog-enter-active .tray,
  .wide .tile.tone-crit {
    animation: none;
  }
}
</style>
