<!--
  Toast, from the boards "Feedback" and "Motion": a 360 px ink card (radius 14, the primary
  button's fill, so it flips in dark mode) for what finishes in the background or confirms an
  invisible action: a mark (a tick on green, a tick on white, or a rose dot for a failure), a
  title, one line of detail, and at most one action in the accent (Show, Retry, Undo). A 2 px
  bar under the text runs out over the auto-hide time (5 s; an Undo toast takes 8). Hovering
  or focusing the toast pauses the clock and the bar; leaving resumes it where it stopped.

  It says `dismiss` when the time is up or after the action ran. It is a polite live region.
  Never use it for an error that needs a decision: that goes inline.
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { ToastAction, ToastTone } from '@/stores/toasts'

const props = withDefaults(
  defineProps<{
    tone?: ToastTone
    title: string
    detail?: string
    action?: ToastAction
    /** Milliseconds until it hides; 0 keeps it. */
    duration?: number
  }>(),
  { tone: 'neutral', detail: undefined, action: undefined, duration: 5000 },
)

const emit = defineEmits<{ dismiss: [] }>()

const paused = ref(false)
let remaining = props.duration
let startedAt = 0
let timer: number | undefined

function start() {
  if (props.duration <= 0) return
  startedAt = performance.now()
  timer = window.setTimeout(() => emit('dismiss'), remaining)
}

function pause() {
  if (paused.value || props.duration <= 0) return
  paused.value = true
  window.clearTimeout(timer)
  remaining = Math.max(0, remaining - (performance.now() - startedAt))
}

function resume() {
  if (!paused.value) return
  paused.value = false
  start()
}

function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget
  if (!(next instanceof Node) || !(event.currentTarget as HTMLElement).contains(next)) resume()
}

function runAction() {
  props.action?.run()
  emit('dismiss')
}

onMounted(start)
onBeforeUnmount(() => window.clearTimeout(timer))
</script>

<template>
  <div
    class="toast"
    role="status"
    @pointerenter="pause"
    @pointerleave="resume"
    @focusin="pause"
    @focusout="onFocusOut"
  >
    <span class="mark" :class="`mark-${tone}`" aria-hidden="true">
      <svg v-if="tone !== 'crit'" class="tick" viewBox="0 0 10 10" width="10" height="10">
        <path d="m2.2 5.2 1.8 1.8 3.8-4" />
      </svg>
    </span>
    <span class="texts">
      <b class="title" :class="{ solo: !detail }">{{ title }}</b>
      <span v-if="detail" class="detail">{{ detail }}</span>
    </span>
    <button v-if="action" type="button" class="action" @click="runAction">
      {{ action.label }}
      <kbd v-if="action.hint" class="hint">{{ action.hint }}</kbd>
    </button>
    <span v-if="duration > 0" class="timer" aria-hidden="true">
      <i class="timer-fill" :class="{ paused }" :style="{ animationDuration: `${duration}ms` }" />
    </span>
  </div>
</template>

<style scoped>
.toast {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 360px;
  max-width: 100%;
  padding: var(--space-3);
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--btn);
  color: var(--btn-ink);
  line-height: normal;
  box-shadow: var(--shadow-pop);
}

.mark {
  display: grid;
  place-items: center;
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-full);
}

.tick {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.mark-ok {
  background: var(--toast-ok-bg);
  color: var(--toast-ok-ink);
}

.mark-ok .tick {
  scale: var(--toast-ok-glyph);
}

.mark-neutral {
  background: var(--btn-ink);
  color: var(--btn);
}

.mark-crit {
  background: var(--crit-solid);
}

.texts {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.title {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
  line-height: normal;
}

/* A toast with one line only (a confirmation) is set in regular weight. */
.title.solo {
  font-weight: var(--weight-regular);
}

.detail {
  color: var(--on-btn-ink-2);
  font-size: var(--text-12);
  line-height: normal;
}

.action {
  flex: none;
  padding: var(--space-1);
  border-radius: var(--radius-xs);
  color: var(--on-btn-accent);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
  line-height: normal;
}

.hint {
  margin-left: var(--space-1);
  font: inherit;
  opacity: 0.7;
}

.action:hover {
  text-decoration: underline;
}

.timer {
  position: absolute;
  right: var(--space-3);
  bottom: 0;
  left: var(--space-3);
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: color-mix(in srgb, var(--btn-ink) 18%, transparent);
  overflow: hidden;
}

.timer-fill {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--on-btn-accent);
  transform-origin: left;
  animation: toast-timer linear forwards;
}

.timer-fill.paused {
  animation-play-state: paused;
}

@keyframes toast-timer {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}
</style>
