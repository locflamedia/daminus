// Asks the core what is wrong with the project in the sheet, a moment after the last edit.
// Only the newest answer counts, and a failed call keeps the last answer.
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { type Project, type ProjectIssue, projectsValidate } from '@/api'
import { issuesOfProject } from '@/lib/sheet-issues'
import { savable } from '@/lib/sheet-parts'
import { type DraftProject, draftToProject } from '@/lib/setup-model'

/** The pause after the last edit before the core is asked. */
export const VALIDATE_DELAY_MS = 200

export function useSheetValidation(
  draft: Ref<DraftProject>,
  /** The other projects of the setup, so an id taken by one of them is found. */
  others: () => Project[],
) {
  const issues = ref<ProjectIssue[]>([])
  let timer: ReturnType<typeof setTimeout> | null = null
  let requests = 0

  async function run(): Promise<ProjectIssue[]> {
    const mine = ++requests
    const { project } = draftToProject(savable(draft.value))
    try {
      const all = await projectsValidate([...others(), project])
      if (mine === requests) issues.value = issuesOfProject(all, project.id)
    } catch (e) {
      console.error(e)
    }
    return issues.value
  }

  function clear() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  watch(
    draft,
    () => {
      clear()
      timer = setTimeout(() => void run(), VALIDATE_DELAY_MS)
    },
    { deep: true },
  )
  onBeforeUnmount(clear)

  /** Asks now (the draft just changed or is about to be saved) and waits for the answer. */
  function validateNow(): Promise<ProjectIssue[]> {
    clear()
    return run()
  }

  function reset(next: ProjectIssue[] = []) {
    clear()
    requests += 1
    issues.value = next
  }

  return { issues, validateNow, reset }
}
