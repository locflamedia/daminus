// The project sheet: which project is being edited and what happens when it is
// saved. The sheet itself is drawn once, by `App.vue`; any screen opens it with `open()`.
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { DraftProject } from '@/lib/setup-model'

export interface SheetRequest {
  /** The project to edit: a suggestion of setup, a saved project, or an empty one. */
  draft: DraftProject
  /**
   * `setup`: Save hands the edited draft back through `onSave` and writes nothing (step 3 of
   * setup writes `projects.json` once, at the end). `saved`: Save and Remove act on
   * `projects.json` at once.
   */
  mode: 'setup' | 'saved'
  /** `setup` mode: receives the edited draft. */
  onSave?: (draft: DraftProject) => void
  /**
   * `setup` mode: "Remove from setup" drops the suggestion; the button exists only when this
   * does. A saved project is removed from `projects.json` by the sheet itself.
   */
  onRemove?: () => void
}

export const useProjectSheetStore = defineStore('project-sheet', () => {
  const request = shallowRef<SheetRequest | null>(null)
  const isOpen = ref(false)

  function open(next: SheetRequest) {
    request.value = next
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
  }

  return { request, isOpen, open, close }
})
