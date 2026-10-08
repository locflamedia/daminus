// Pure helpers of the review sheet: where the masked values are in the text, the numbered lines
// of the code panel, and the rough token count. Text only; nothing here is markup.

/** A masked value: a placeholder for a name or address, or a `[redacted…]` secret. */
const MASKED = /\[(?:host|ip)-\d+\]|\[[^\]\n]*redacted[^\]\n]*\]/g

export interface Piece {
  text: string
  masked: boolean
}

export interface CodeLine {
  n: number
  pieces: Piece[]
}

/** The line cut into plain and masked pieces. */
export function pieces(line: string): Piece[] {
  const out: Piece[] = []
  let last = 0
  for (const m of line.matchAll(MASKED)) {
    const at = m.index ?? 0
    if (at > last) out.push({ text: line.slice(last, at), masked: false })
    out.push({ text: m[0], masked: true })
    last = at + m[0].length
  }
  if (last < line.length) out.push({ text: line.slice(last), masked: false })
  return out
}

/** How many masked values `text` holds. */
export function maskedCount(text: string): number {
  return [...text.matchAll(MASKED)].length
}

/** The system text and the user text as one numbered listing, in the order they are sent. */
export function codeLines(system: string, user: string): CodeLine[] {
  return `${system}\n${user}`.split('\n').map((line, i) => ({ n: i + 1, pieces: pieces(line) }))
}

/** A rough token count (four bytes a token); the provider counts for real. */
export function estimateTokens(bytes: number): number {
  return Math.round(bytes / 4)
}

/** The width of the size meter: the share of the 200 KB the data may take. */
export function sizeShare(bytes: number, max = 200 * 1024): number {
  return Math.min(1, Math.max(0, bytes / max))
}
