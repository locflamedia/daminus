<!--
  The left column of the setup screens (boards 02 to 04): the brand row says "Setup 2 / 3",
  the three steps are drawn as a stepper (done: a green tick, the current one: a white card
  with a ring that fills as the step goes, the next: a quiet disc), then a slot for what the
  screen runs (`#setup-rail` receives it by teleport) and the reassurance that nothing is
  saved yet. "Cancel setup" leaves and forgets everything; Esc does the same.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import brandMark from '../../assets/brand/app-mark-flat-64.png'
import { useSetupDraftsStore } from '@/stores/setup-drafts'
import { SETUP_STEPS, useSetupStore, type SetupScreen } from '@/stores/setup'
import UiIcon from '@/ui/UiIcon.vue'
import UiKbd from '@/ui/UiKbd.vue'
import type { IconName } from '@/ui/icon-paths'

const props = defineProps<{ screen: SetupScreen }>()
const emit = defineEmits<{ cancel: [] }>()

const { t } = useI18n()
const setup = useSetupStore()
const drafts = useSetupDraftsStore()

const index = computed(() => SETUP_STEPS.indexOf(props.screen))

const ICONS: Record<SetupScreen, IconName> = { pick: 'server', discover: 'search', group: 'folder' }

/** How far the current step is, for its ring (0 to 1). */
const fraction = computed(() => {
  if (props.screen === 'pick') {
    const asked = setup.ticked.length
    return asked === 0 ? 0 : (setup.ready.length + setup.failedHosts.length) / asked
  }
  if (props.screen === 'discover') {
    const lanes = setup.discovering
    return lanes.length === 0 ? 0 : lanes.filter((h) => setup.lanes[h]).length / lanes.length
  }
  return 0.66
})

/** The line under a step's name: what it is for, then what it came to. */
function sub(step: SetupScreen): string {
  const at = SETUP_STEPS.indexOf(step)
  if (step === 'pick') {
    if (at === index.value) return t('setupShell.pick.idle')
    const parts = [t('setupShell.pickReady', { n: setup.ready.length })]
    if (setup.skippedHosts.length > 0) {
      parts.push(t('setupShell.pickSkipped', { n: setup.skippedHosts.length }))
    }
    return parts.join(', ')
  }
  if (step === 'discover') {
    if (at > index.value) return t('setupShell.discover.idle')
    const total = setup.discovering.length
    const done = setup.discovering.filter((h) => setup.lanes[h]).length
    if (at === index.value && done < total) return t('setupShell.discoverProgress', { done, total })
    return t('setupShell.discoverDone', { finds: setup.finds, hosts: total })
  }
  if (at > index.value) return t('setupShell.group.idle')
  const n = drafts.summary.projects
  return t('setupShell.groupSuggested', { n }, n)
}

function state(step: SetupScreen): 'done' | 'current' | 'next' {
  const at = SETUP_STEPS.indexOf(step)
  return at < index.value ? 'done' : at === index.value ? 'current' : 'next'
}

const RING = 2 * Math.PI * 14
</script>

<template>
  <nav class="sidebar" :aria-label="t('setupShell.stepList')">
    <span class="lights" aria-hidden="true" />
    <div class="brand">
      <img :src="brandMark" alt="" width="22" height="22" />
      <b>{{ t('setupShell.name') }}</b>
      <span class="mono progress">{{ t('setupShell.progress', { n: index + 1 }) }}</span>
    </div>

    <ol class="steps">
      <span class="line" :class="{ done: index > 0 }" aria-hidden="true" />
      <li
        v-for="step in SETUP_STEPS"
        :key="step"
        class="step"
        :class="state(step)"
        :aria-current="state(step) === 'current' ? 'step' : undefined"
      >
        <span class="disc">
          <svg
            v-if="state(step) === 'current'"
            class="ring"
            width="32"
            height="32"
            viewBox="0 0 32 32"
            aria-hidden="true"
          >
            <circle cx="16" cy="16" r="14" class="track" />
            <circle
              cx="16"
              cy="16"
              r="14"
              class="arc"
              :stroke-dasharray="`${Math.max(0.06, fraction) * RING} ${RING}`"
            />
          </svg>
          <UiIcon :name="state(step) === 'done' ? 'check' : ICONS[step]" :size="16" />
        </span>
        <span class="text">
          <b>{{ t(`setupShell.${step}.name`) }}</b>
          <span>{{ sub(step) }}</span>
        </span>
      </li>
    </ol>

    <div id="setup-rail" class="rail-slot" />

    <div class="saved">
      <b><UiIcon name="lock" :size="16" />{{ t('setupShell.nothingSaved') }}</b>
      <template v-if="screen === 'pick'">{{ t('setupShell.nothingSavedPick') }}</template>
      <template v-else-if="screen === 'discover'">{{
        t('setupShell.nothingSavedDiscover')
      }}</template>
    </div>
    <button type="button" class="cancel" @click="emit('cancel')">
      {{ t('setupShell.cancel') }}
      <UiKbd tone="on-glass">esc</UiKbd>
    </button>
  </nav>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  height: 100%;
  min-width: 0;
  padding: var(--space-4);
  overflow-y: auto;
  background: linear-gradient(165deg, var(--side-1), var(--side-2) 58%, var(--side-3));
  line-height: normal;
}

.lights {
  flex: none;
  height: var(--lights-row);
}

:global(:root[data-fullscreen='true']) .lights {
  display: none;
}

:global(:root[data-fullscreen='true']) .sidebar {
  padding-top: var(--side-top-fullscreen);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
  height: var(--h-control);
  padding: 0 var(--space-1);
  font-size: var(--text-15);
}

.brand b {
  font-weight: var(--weight-medium);
}

.brand img {
  display: block;
  flex: none;
}

.progress {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
}

.steps {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  flex: none;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* The line joins the discs: grey and soft while ahead, accent once the step before is done. */
.line {
  position: absolute;
  top: 40px;
  bottom: 40px;
  left: 27px;
  width: 2px;
  border-radius: 2px;
  background: linear-gradient(
    var(--accent-mid),
    color-mix(in srgb, var(--surface-0) 70%, transparent) 40%
  );
}

.line.done {
  background: linear-gradient(
    var(--ok-solid),
    var(--accent-mid) 60%,
    color-mix(in srgb, var(--surface-0) 70%, transparent)
  );
}

.step {
  position: relative;
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  line-height: 1.35;
}

.step.current {
  background: var(--surface-0);
  box-shadow: var(--shadow-lift);
}

.disc {
  position: relative;
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--surface-0) 70%, transparent);
  color: var(--ink-4);
}

.step.done .disc {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.step.current .disc {
  background: transparent;
  color: var(--accent-ink);
}

.ring {
  position: absolute;
  inset: 0;
  transform: rotate(-90deg);
  fill: none;
  stroke-width: 2.4;
}

.ring .track {
  stroke: var(--accent-soft);
}

.ring .arc {
  stroke: var(--accent);
  stroke-linecap: round;
  transition: stroke-dasharray var(--dur-bar) var(--ease-out);
}

.text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: var(--text-11);
  color: var(--ink-3);
}

.text b {
  color: var(--ink-2);
  font-size: var(--text-13);
  font-weight: var(--weight-regular);
}

.step.current .text b {
  color: var(--ink);
  font-weight: var(--weight-medium);
}

.rail-slot:empty {
  display: none;
}

.saved {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: auto;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--side-hover);
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 1.45;
}

.saved b {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--ink);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.saved b :deep(.icon) {
  color: var(--ink-3);
}

.cancel {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: none;
  height: var(--h-control);
  margin-top: calc(-1 * var(--space-2));
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--ink-2);
  font-size: var(--text-13);
  text-align: left;
  transition: background-color var(--dur-color) var(--ease-state);
}

.cancel:hover {
  background: var(--side-hover);
}

.cancel:focus-visible {
  box-shadow: var(--focus-ring);
}

.cancel :deep(.kbd) {
  margin-left: auto;
}
</style>
