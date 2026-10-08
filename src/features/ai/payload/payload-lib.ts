// Pure helpers of the review sheet: where the masked values are in the text, the numbered lines
// of the code panel, and the rough token count. Text only; nothing here is markup.

/** A masked value: a placeholder for a name or address, or a `[redacted…]` secret. */
const MASKED = /\[(?:host|ip)-\d+\]|\[[^\]\n]*redacted[^\]\n]*\]/g

/** What a stretch of a JSON-looking line is, for the colours of the code panel. */
export type Kind = 'key' | 'str' | 'num' | 'pu' | 'plain'

export interface Piece {
  text: string
  masked: boolean
  kind: Kind
}

export interface CodeLine {
  n: number
  pieces: Piece[]
}

const TOKEN = /"(?:[^"\\\n]|\\.)*"?|-?\d+(?:\.\d+)?(?![\w.])|\s+|[^\s"{}[\],:]+|[\s\S]/g
const JSON_LINE = /^\s*[{}[\]"]/

/** Cuts a JSON-looking line into [start, end, kind]; any other line is one plain stretch. */
function kinds(line: string): Array<[number, number, Kind]> {
  if (!JSON_LINE.test(line)) return [[0, line.length, 'plain']]
  const out: Array<[number, number, Kind]> = []
  for (const m of line.matchAll(TOKEN)) {
    const at = m.index ?? 0
    const end = at + m[0].length
    let kind: Kind = 'pu'
    if (m[0].startsWith('"')) kind = /^\s*:/.test(line.slice(end)) ? 'key' : 'str'
    else if (/^-?\d/.test(m[0])) kind = 'num'
    out.push([at, end, kind])
  }
  return out
}

/** The line cut into pieces: masked or not, and the kind of each (keys, strings, numbers). */
export function pieces(line: string): Piece[] {
  const masks = [...line.matchAll(MASKED)].map((m): [number, number] => [
    m.index ?? 0,
    (m.index ?? 0) + m[0].length,
  ])
  const out: Piece[] = []
  const push = (from: number, to: number, kind: Kind, masked: boolean) => {
    if (to > from) out.push({ text: line.slice(from, to), masked, kind })
  }
  for (const [a, b, kind] of kinds(line)) {
    let at = a
    for (const [ma, mb] of masks) {
      if (mb <= at || ma >= b) continue
      push(at, Math.max(at, ma), kind, false)
      push(Math.max(at, ma), Math.min(b, mb), kind, true)
      at = Math.min(b, mb)
    }
    push(at, b, kind, false)
  }
  return out
}

/** Size in KB with one decimal as the board writes it ("0.1", "9.8"); the unit is the caller's. */
export function kilobytes(bytes: number): number {
  return Math.round((bytes / 1024) * 10) / 10
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
