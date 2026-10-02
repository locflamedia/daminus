<!--
  Scan step, from the board "Feedback": a row of 8 px padding and radius 10 with a 16 px state
  mark, the step's name (13/500) over one line of detail (11), and its duration at the right.
  Four states: done (green disc with a tick; "done with skips" is a done step whose detail says
  what was skipped), running (a turning ring, the command actually executing in mono, and a
  4 px progress bar that follows the real steps), waiting (a grey disc, the name in ink-3) and
  failed (a rose disc with a cross and the error in rose). Zebra rows: `shaded` tints the row
  surface-1. The state is also written for screen readers, and every word is plain text.
-->
<script setup lang="ts">
import { computed } from 'vue'
import UiProgressBar from './UiProgressBar.vue'

export type ScanStepState = 'done' | 'running' | 'waiting' | 'failed'

const props = withDefaults(
  defineProps<{
    state: ScanStepState
    title: string
    detail?: string
    /** The detail is a command or a path: mono, one line, cut with an ellipsis. */
    mono?: boolean
    /** 0 to 1 while running. */
    progress?: number
    duration?: string
    shaded?: boolean
    /** The state in words, read out but not drawn ("Done"). */
    stateLabel?: string
  }>(),
  {
    detail: undefined,
    mono: false,
    progress: undefined,
    duration: undefined,
    shaded: false,
    stateLabel: undefined,
  },
)

const detailTone = computed(() => (props.state === 'failed' ? 'crit' : 'plain'))
</script>

<template>
  <div class="step" :class="[`state-${state}`, { shaded }]">
    <span class="mark" aria-hidden="true">
      <svg v-if="state === 'running'" class="ring" viewBox="0 0 16 16" width="16" height="16">
        <circle cx="8" cy="8" r="6" fill="none" stroke-width="2" class="ring-track" />
        <path
          d="M8 2a6 6 0 0 1 6 6"
          fill="none"
          stroke-width="2"
          stroke-linecap="round"
          class="ring-arc"
        />
      </svg>
      <span v-else class="disc">
        <svg v-if="state === 'done'" viewBox="0 0 10 10" width="10" height="10" class="glyph">
          <path d="m2.2 5.2 1.8 1.8 3.8-4" />
        </svg>
        <svg
          v-else-if="state === 'failed'"
          viewBox="0 0 10 10"
          width="10"
          height="10"
          class="glyph"
        >
          <path d="m3 3 4 4M7 3 3 7" />
        </svg>
      </span>
    </span>
    <span class="text">
      <b class="title">{{ title }}</b>
      <span v-if="detail" class="detail" :class="[detailTone, { mono }]">{{ detail }}</span>
      <UiProgressBar
        v-if="state === 'running' && progress !== undefined"
        :value="progress"
        class="bar"
      />
    </span>
    <span v-if="duration" class="duration">{{ duration }}</span>
    <span v-if="stateLabel" class="sr-only">{{ stateLabel }}</span>
  </div>
</template>

<style scoped>
.step {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
}

.step.shaded {
  background: var(--surface-1);
}

.mark {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  margin-top: 1px;
}

.disc {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
}

.state-done .disc {
  background: var(--ok-solid);
}

.state-failed .disc {
  background: var(--crit-solid);
}

.state-waiting .disc {
  background: var(--surface-2);
}

.glyph {
  fill: none;
  stroke: var(--on-solid);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ring {
  animation: step-turn 0.9s linear infinite;
}

.ring-track {
  stroke: var(--accent-soft);
}

.ring-arc {
  stroke: var(--accent-ink);
}

@keyframes step-turn {
  to {
    transform: rotate(360deg);
  }
}

.text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.title {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.state-waiting .title {
  color: var(--ink-3);
}

.detail {
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-11);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail.crit {
  color: var(--crit-ink);
}

.detail.mono {
  font-family: var(--font-mono);
}

.bar {
  margin-top: var(--space-1);
}

.duration {
  color: var(--ink-3);
  font-size: var(--text-11);
}

@media (prefers-reduced-motion: reduce) {
  .ring {
    animation: none;
  }
}
</style>
