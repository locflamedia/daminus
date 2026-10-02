// Rules of the small pieces on the board "Micro UI": which part of a path to cut, which way
// a delta points and whether it is good news, when a certificate or a reading turns amber.

/**
 * Cuts the middle of a path and keeps its root and its leaf, as the path chip does
 * (`/var/www/…/storage/logs`). The root is the first two segments and the leaf the last two;
 * both shrink one segment at a time until the text fits `max` characters, and as a last
 * resort the leaf itself is shortened from the front. A path that fits is returned whole.
 */
export function middleEllipsis(path: string, max = 28): string {
  if (path.length <= max) return path
  const parts = path.split('/')
  const lead = parts[0] === '' ? '/' : ''
  const segments = parts.filter((p) => p !== '')
  const join = (head: number, tail: number): string | null => {
    if (head + tail >= segments.length) return null
    const first = segments.slice(0, head).join('/')
    const last = segments.slice(segments.length - tail).join('/')
    return `${lead}${first}${first ? '/' : ''}…/${last}`
  }
  for (const [head, tail] of [
    [2, 2],
    [1, 2],
    [1, 1],
    [0, 1],
  ] as const) {
    const text = join(head, tail)
    if (text !== null && text.length <= max) return text
  }
  const leaf = segments.at(-1) ?? path
  const room = Math.max(1, max - 2)
  return `…/${leaf.length > room ? `…${leaf.slice(leaf.length - (room - 1))}` : leaf}`
}

export type DeltaDirection = 'up' | 'down' | 'flat'
export type DeltaTone = 'ok' | 'warn' | 'crit' | 'neutral'

/**
 * The arrow of a delta shows the direction and the colour says whether it is good: more
 * size is bad, more free space is good. `worse` names the direction that is bad news. A
 * change of zero is flat and neutral.
 */
export function deltaPill(
  value: number,
  worse: 'up' | 'down' = 'up',
  tone: 'warn' | 'crit' = 'warn',
): { direction: DeltaDirection; tone: DeltaTone } {
  if (value === 0 || !Number.isFinite(value)) return { direction: 'flat', tone: 'neutral' }
  const direction: DeltaDirection = value > 0 ? 'up' : 'down'
  return { direction, tone: direction === worse ? tone : 'ok' }
}

/** A certificate with days left: amber under 14, rose under 3 (expired counts as under 3). */
export function sslTone(days: number): 'ok' | 'warn' | 'crit' {
  if (days < 3) return 'crit'
  if (days < 14) return 'warn'
  return 'ok'
}

/** Hours after which a time is shown as stale (the timestamp and the card foot turn amber). */
export const STALE_AFTER_HOURS = 24

export function isStale(at: string | number | Date, now: number = Date.now()): boolean {
  const time = at instanceof Date ? at.getTime() : new Date(at).getTime()
  return Number.isFinite(time) && now - time > STALE_AFTER_HOURS * 3_600_000
}

/** The count badge's text: nothing at zero, `99+` above 99. */
export function badgeText(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null
  return count > 99 ? '99+' : String(Math.floor(count))
}

export interface MatchPart {
  text: string
  match: boolean
}

/**
 * Splits `text` around the first case-insensitive occurrence of `query`, so the matched part
 * can be set in bold ("kho" in kho-hang). The parts are plain text, never markup. An empty
 * query, or none found, gives the whole text unmatched.
 */
export function matchParts(text: string, query: string): MatchPart[] {
  const needle = query.trim().toLowerCase()
  const at = needle === '' ? -1 : text.toLowerCase().indexOf(needle)
  if (at < 0) return [{ text, match: false }]
  const parts: MatchPart[] = []
  if (at > 0) parts.push({ text: text.slice(0, at), match: false })
  parts.push({ text: text.slice(at, at + needle.length), match: true })
  if (at + needle.length < text.length) {
    parts.push({ text: text.slice(at + needle.length), match: false })
  }
  return parts
}
