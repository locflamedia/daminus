// What the shortcuts sheet lists: four groups of rows, each a label key and the keys drawn as
// caps. Labels translate; the keys never do. `filterGroups` marks the rows a query matches.

export interface ShortcutRow {
  id: string
  /** Message key under `shortcuts.rows`. */
  label: string
  /** The caps, as printed on the keyboard. */
  keys: readonly string[]
}

export interface ShortcutGroup {
  id: 'anywhere' | 'move' | 'project' | 'finding'
  rows: readonly ShortcutRow[]
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    id: 'anywhere',
    rows: [
      { id: 'search', label: 'search', keys: ['⌘', 'K'] },
      { id: 'scan', label: 'scan', keys: ['⌘', 'R'] },
      { id: 'ask', label: 'ask', keys: ['⌘', 'J'] },
      { id: 'settings', label: 'settings', keys: ['⌘', ','] },
      { id: 'fold', label: 'fold', keys: ['⌘', '\\'] },
      { id: 'sheet', label: 'sheet', keys: ['?'] },
    ],
  },
  {
    id: 'move',
    rows: [
      { id: 'overview', label: 'overview', keys: ['⌘', '1'] },
      { id: 'history', label: 'history', keys: ['⌘', '2'] },
      { id: 'step', label: 'step', keys: ['↓', '↑'] },
      { id: 'open', label: 'open', keys: ['↵'] },
      { id: 'back', label: 'back', keys: ['esc'] },
    ],
  },
  {
    id: 'project',
    rows: [
      { id: 'tabs', label: 'tabs', keys: ['⌘', '[', ']'] },
      { id: 'tabNumbers', label: 'tabNumbers', keys: ['1', '…', '6'] },
      { id: 'copy', label: 'copy', keys: ['C'] },
      { id: 'terminal', label: 'terminal', keys: ['T'] },
    ],
  },
  {
    id: 'finding',
    rows: [
      { id: 'expected', label: 'expected', keys: ['E'] },
      { id: 'followUp', label: 'followUp', keys: ['A'] },
      { id: 'useful', label: 'useful', keys: ['+', '−'] },
      { id: 'evidence', label: 'evidence', keys: ['space'] },
    ],
  },
]

export const SHORTCUT_COUNT = SHORTCUT_GROUPS.reduce((n, g) => n + g.rows.length, 0)

/** Whether a row answers the query: its (translated) label or its keys contain the text. */
export function rowMatches(row: ShortcutRow, label: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (q === '') return true
  return label.toLowerCase().includes(q) || row.keys.join('').toLowerCase().includes(q)
}

/** The ids of the rows that match; every row when the query is empty. */
export function matchingIds(
  query: string,
  labelOf: (row: ShortcutRow) => string,
  groups: readonly ShortcutGroup[] = SHORTCUT_GROUPS,
): Set<string> {
  const ids = new Set<string>()
  for (const g of groups)
    for (const row of g.rows) if (rowMatches(row, labelOf(row), query)) ids.add(row.id)
  return ids
}
