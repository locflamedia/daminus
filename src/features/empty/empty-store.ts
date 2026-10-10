// Which empty screen is up, read from what the setup store knows about this Mac and from whether
// any project exists. The help screen is kept once it has shown: when "Check again" finds what
// was missing, its rows turn green instead of the screen jumping to the first one, and the
// sidebar follows the same screen. Leaving Overview forgets it.
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useProjectsStore } from '@/stores/projects'
import { useSetupStore } from '@/stores/setup'
import {
  emptyScreen,
  helpView,
  shownRows,
  type EmptyInput,
  type EmptyScreen,
  type HelpShown,
  type HelpView,
} from './empty-state'

export const useEmptyStore = defineStore('empty', () => {
  const setup = useSetupStore()
  const projects = useProjectsStore()

  /** `projects.json` was read and holds no project: this is a first launch. */
  const active = computed(() => projects.loaded && projects.details.length === 0)
  /** The ssh config and the agent were read at least once. */
  const known = computed(() => setup.listing !== null)

  const input = computed<EmptyInput>(() => ({
    configFound: setup.configFound,
    emptyReason: setup.emptyReason,
    hosts: setup.entries.length,
    skipped: setup.skipped,
    agent: setup.environment?.agent ?? null,
    keys: setup.environment?.keys ?? 0,
  }))

  const shown = ref<HelpShown | null>(null)

  function settle(before: HelpShown | null) {
    if (!known.value) return
    if (before !== null || emptyScreen(input.value) === 'help') {
      shown.value = shownRows(input.value, before)
    }
  }

  watch([input, known], () => settle(shown.value), { immediate: true })

  /** Until the config has been read the first screen stands in. */
  const screen = computed<EmptyScreen>(() => (shown.value !== null ? 'help' : 'app'))

  const help = computed<HelpView | null>(() =>
    shown.value === null ? null : helpView(input.value, shown.value),
  )

  /** Back to deciding from scratch (the person left the empty Overview). */
  function reset() {
    shown.value = null
    settle(null)
  }

  return { active, known, input, screen, help, reset }
})
