<!--
  Sheet, from the boards "Feedback" (Sheet) and "Project sheet": for editing (add or edit a
  project, settings, permission help). A centred card over the window, 760 px wide (a narrower
  window keeps 24 px margins) and at most 88 % of the window high: a glass tray (radius 20 on
  every corner) around a white card (14). The page behind is dimmed by the sheet scrim and
  blurred 3 px. Header 56 (title 15/500, context 12 in ink-3, close 28), a body that scrolls
  while header and footer stay, and a 64 px footer on surface-1: the destructive action on the
  left (`footer-start`), cancel and save on the right (`footer-end`).

  It does not close itself. Escape and the close button say `close` and the owner decides, so
  a form with unsaved changes can ask once before it goes; a press on the scrim does nothing,
  so a stray click never loses an edit. Focus moves in and stays in (Tab wraps) and returns to
  where it was. It fills the nearest positioned ancestor (mount it at the window root).
  `pinned` is for a sheet with a form (Add host, Edit project): its top edge stays 64 px below
  the window's top and it only grows down, so an error line appearing under a field never moves
  what is above it; past 88 % of the space below that edge the body scrolls.
  200 ms: scale .98 and 8 px up with a fade; Reduce Motion keeps the fade.
-->
<script setup lang="ts">
import { computed, ref, toRef, useId, useSlots } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFocusTrap } from '@/lib/focus-trap'
import UiIcon from './UiIcon.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    context?: string
    /** The card's width; 760px unless a screen needs another. */
    width?: string
    closeLabel?: string
    /** A plain white card with no glass tray, 36 px from the window's top and bottom (the AI
     * payload board). */
    plain?: boolean
    /** Focus the panel itself on open, not the first control (no ring on a close control). */
    focusPanel?: boolean
    /** A form sheet: pinned 64 px below the window's top instead of centred. */
    pinned?: boolean
  }>(),
  {
    context: undefined,
    width: '760px',
    closeLabel: undefined,
    plain: false,
    focusPanel: false,
    pinned: false,
  },
)

const emit = defineEmits<{ close: [] }>()
defineSlots<{
  /** Replaces the whole header (a sheet with its own tile and chips); gets the title's id. */
  header?: (props: { titleId: string; close: () => void }) => unknown
  default?: () => unknown
  'footer-start'?: () => unknown
  'footer-end'?: () => unknown
}>()

const { t } = useI18n()
const slots = useSlots()
const titleId = useId()
const panel = ref<HTMLElement>()

useFocusTrap(panel, toRef(props, 'open'), {
  onEscape: () => emit('close'),
  initialFocus: (root) => (props.focusPanel ? root : undefined),
})

const hasFooter = computed(() => !!slots['footer-start'] || !!slots['footer-end'])
</script>

<template>
  <Transition name="sheet" appear>
    <div v-if="open" class="layer" :class="{ plain, pinned: pinned && !plain }">
      <div class="scrim" aria-hidden="true" />
      <div
        ref="panel"
        class="tray"
        :class="{ plain }"
        :style="{ width }"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
      >
        <div class="card">
          <slot name="header" :title-id="titleId" :close="() => emit('close')">
            <header class="head">
              <h2 :id="titleId" class="title">{{ title }}</h2>
              <span v-if="context" class="context">{{ context }}</span>
              <button
                type="button"
                class="close"
                :aria-label="closeLabel ?? t('ui.close')"
                @click="emit('close')"
              >
                <UiIcon name="close" :size="14" />
              </button>
            </header>
          </slot>
          <div class="body"><slot /></div>
          <footer v-if="hasFooter" class="foot">
            <slot name="footer-start" />
            <span class="spacer" />
            <slot name="footer-end" />
          </footer>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.layer {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.scrim {
  position: absolute;
  inset: 0;
  background: var(--scrim-sheet);
  backdrop-filter: blur(var(--scrim-blur));
}

.tray {
  position: relative;
  display: flex;
  flex-direction: column;
  max-width: calc(100% - 2 * var(--space-6));
  max-height: 88%;
  padding: 6px;
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface-0) 60%, transparent);
  box-shadow: var(--shadow-overlay);
  transform-origin: 50% 0;
}

.tray:focus-visible {
  box-shadow: var(--shadow-overlay);
}

/* Pinned (a form): the top edge stays put; the sheet grows down and its body scrolls past
   88 % of the height below that edge (the tray's max-height resolves against it). */
.layer.pinned {
  align-items: flex-start;
  padding-top: 64px;
}

/* Plain: one white card, radius 20, 36 px from the top and bottom of the window. */
.layer.plain {
  align-items: stretch;
  padding: 36px 0;
}

.layer.plain .scrim {
  background: var(--scrim-dialog);
}

.tray.plain,
.tray.plain:focus-visible {
  max-height: none;
  padding: 0;
  border-radius: var(--radius-lg);
  background: var(--surface-0);
  box-shadow: var(--shadow-sheet-plain);
  transform-origin: 50% 50%;
}

.tray.plain:focus-visible {
  outline: none;
}

.tray.plain .card {
  border-radius: var(--radius-lg);
}

.tray.plain .foot {
  background: var(--surface-well);
}

.card {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--surface-0);
}

.head {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-3);
  height: var(--h-status-row);
  padding: 0 var(--space-5);
}

.title {
  margin: 0;
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
  letter-spacing: var(--track-15);
}

.context {
  color: var(--ink-3);
  font-size: var(--text-12);
}

.close {
  display: grid;
  place-items: center;
  width: var(--h-control-sm);
  height: var(--h-control-sm);
  margin-left: auto;
  border-radius: 8px;
  background: var(--surface-1);
  color: var(--ink-3);
  transition: background-color var(--dur-color) var(--ease-state);
}

.close:hover {
  background: var(--surface-2);
}

.body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-2);
  min-height: 0;
  padding: var(--space-2) var(--space-5);
  overflow-y: auto;
}

.foot {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-2);
  height: 64px;
  padding: 0 var(--space-5);
  background: var(--surface-1);
}

.spacer {
  flex: 1 1 auto;
}

/* Vue waits for the transition on the root element, so the fade lives there and carries the
   scrim and the tray with it; the tray's own rise runs under it. */
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity var(--dur-sheet) var(--ease-out);
}

.sheet-enter-active .tray,
.sheet-leave-active .tray {
  transition: transform var(--dur-sheet) var(--ease-out);
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

.sheet-enter-from .tray,
.sheet-leave-to .tray {
  transform: translateY(8px) scale(0.98);
}

.sheet-enter-from .tray.plain,
.sheet-leave-to .tray.plain {
  transform: scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .sheet-enter-from .tray,
  .sheet-leave-to .tray {
    transform: none;
  }
}
</style>
