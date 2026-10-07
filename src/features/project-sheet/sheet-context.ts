// What the pieces of the project sheet share: the draft being edited, the issues drawn on it
// and the edits the fields make. `ProjectSheet.vue` provides it; the rows inject it, so they
// stay small and never change a prop.
import { inject, type InjectionKey } from 'vue'
import type { SheetController } from './use-sheet-controller'

export const SHEET_KEY: InjectionKey<SheetController> = Symbol('project-sheet')

export function useSheet(): SheetController {
  const sheet = inject(SHEET_KEY)
  if (!sheet) throw new Error('the project sheet parts are used outside the sheet')
  return sheet
}
