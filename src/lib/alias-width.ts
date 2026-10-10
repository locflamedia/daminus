// The width an ssh alias needs in a table column, so a column of aliases is as wide as its
// longest one and is cut only when the row truly has no room left (board 31).

/** One character of an alias: Geist Mono at 13 px advances 0.6 em. */
const ALIAS_CHAR_PX = 7.8

/**
 * The `--alias` custom property for a table: the longest alias, in px. In px, not `ch`: the
 * header row is set smaller than the rows, and every row must get the same column.
 */
export function aliasWidthStyle(aliases: readonly string[]): { '--alias': string } {
  const longest = Math.max(0, ...aliases.map((a) => a.length))
  return { '--alias': `${Math.ceil(longest * ALIAS_CHAR_PX)}px` }
}
