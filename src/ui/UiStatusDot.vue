<!--
  Status dot, from the board "Micro UI": 8 px. Rose and amber for issues (with `halo` a 3 px
  soft ring of the same family around them), ink-5 when healthy, a hollow ring when unknown
  or unreachable, and a small ring that turns while the thing is being read. The state is
  never only the colour: the callers put the word beside it, and `label` reads it out when
  there is none. `pulse` plays the critical halo three times, then stills it (the one pulse
  of the app, for "this just turned critical").
-->
<script setup lang="ts">
export type DotState = 'crit' | 'warn' | 'ok' | 'unknown' | 'reading'

withDefaults(defineProps<{ state: DotState; halo?: boolean; pulse?: boolean; label?: string }>(), {
  halo: false,
  pulse: false,
  label: undefined,
})
</script>

<template>
  <svg
    v-if="state === 'reading'"
    class="dot spinner"
    width="10"
    height="10"
    viewBox="0 0 16 16"
    fill="none"
    stroke-width="3"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
  >
    <circle cx="8" cy="8" r="6" class="spinner-track" />
    <path d="M8 2a6 6 0 0 1 6 6" stroke-linecap="round" class="spinner-arc" />
  </svg>
  <span
    v-else
    class="dot"
    :class="[`state-${state}`, { halo, 'm-halo': pulse && state === 'crit' }]"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
  />
</template>

<style scoped>
.dot {
  display: inline-block;
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
}

.state-crit {
  background: var(--crit-solid);
}

.state-warn {
  background: var(--warn-solid);
}

.state-ok {
  background: var(--ink-5);
}

.state-unknown {
  box-shadow: inset 0 0 0 1.5px var(--ink-4);
}

.halo.state-crit {
  box-shadow: 0 0 0 3px var(--crit-soft);
}

.halo.state-warn {
  box-shadow: 0 0 0 3px var(--warn-soft);
}

.spinner {
  width: 10px;
  height: 10px;
  border-radius: 0;
  animation: dot-turn 0.9s linear infinite;
}

.spinner-track {
  stroke: var(--accent-soft);
}

.spinner-arc {
  stroke: var(--accent-ink);
}

@keyframes dot-turn {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}
</style>
