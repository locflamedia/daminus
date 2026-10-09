// Decides what a key press means for the window-wide shortcuts. Pure, so the rules (no single
// letter inside a text field, no clash with a screen that owns a key) can be tested directly.
export type GlobalAction = 'sheet' | 'settings' | 'overview' | 'history' | 'scan'

export interface KeyContext {
  /** The route the person is on. */
  route: string
  /** A screen that owns its own keys (setup) or has nothing to act on. */
  suspended: boolean
  scanning: boolean
  /** At least one project exists, so a scan has something to read. */
  canScan: boolean
}

/** True when the key press started in something the person types into. */
export function inTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag !== 'INPUT') return false
  const type = (target as HTMLInputElement).type
  return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'file', 'color'].includes(
    type,
  )
}

export function globalAction(e: KeyboardEvent, ctx: KeyContext): GlobalAction | null {
  if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey) return null
  if (ctx.suspended) return null
  if (e.metaKey) {
    if (e.shiftKey) return null
    if (e.key === ',') return ctx.route === 'settings' ? null : 'settings'
    // On a project page ⌘1 to ⌘6 are that page's tabs.
    if (e.key === '1')
      return ctx.route === 'overview' || ctx.route === 'project' ? null : 'overview'
    if (e.key === '2') return ctx.route === 'history' || ctx.route === 'project' ? null : 'history'
    // The Overview takes ⌘R itself; elsewhere it starts the same scan.
    if (e.key.toLowerCase() === 'r') {
      if (ctx.route === 'overview' || ctx.scanning || !ctx.canScan) return null
      return 'scan'
    }
    return null
  }
  // `?` is a character, not a letter: it needs shift on most layouts and is the only key
  // here that works without a modifier.
  if (e.key === '?' && !inTextField(e.target)) return 'sheet'
  return null
}
