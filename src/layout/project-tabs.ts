/** The tabs of a project, in the order of the board's segmented control. */
export const PROJECT_TABS = [
  'overview',
  'disk',
  'database',
  'containers',
  'security',
  'history',
] as const

export type ProjectTab = (typeof PROJECT_TABS)[number]

export function isProjectTab(value: unknown): value is ProjectTab {
  return typeof value === 'string' && (PROJECT_TABS as readonly string[]).includes(value)
}
