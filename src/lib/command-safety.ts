// A command Daminus shows is a command somebody will paste into a terminal. Whatever the
// server or the model wrote, the person must be able to read exactly what they copy: no
// control characters, no characters that hide text, and a visible warning for the few
// shapes that run something unseen or delete things.

export type CommandRisk = 'pipe-to-shell' | 'base64-decode' | 'remove'

// C0 and C1 controls (this includes ESC, so ANSI sequences lose their lead byte), DEL, the
// zero-width and direction-mark characters, bidirectional overrides and isolates (they can
// reorder what is displayed), the line and paragraph separators, and the BOM.
const CONTROL =
  /[\x00-\x1f\x7f-\x9f\u{ad}\u{61c}\u{180e}\u{200b}-\u{200f}\u{2028}-\u{202e}\u{2060}-\u{2069}\u{feff}]/gu

export interface CleanCommand {
  /** What is shown and what is copied. */
  text: string
  /** How many characters were dropped; line breaks and tabs count as one space, not as a drop. */
  removed: number
}

/**
 * Makes `raw` one safe line. Line breaks and tabs become a single space (a second command on
 * the next line must never ride along unseen); other control and hidden characters are
 * removed and counted so the caller can say so.
 */
export function cleanCommand(raw: string): CleanCommand {
  let removed = 0
  const text = raw
    .replace(/[\t\r\n]+/g, ' ')
    .replace(CONTROL, () => {
      removed += 1
      return ''
    })
    .trim()
  return { text, removed }
}

// `| sh`, `| bash -s`, `| sudo bash`, `| zsh`: the output of something is executed.
const PIPE_TO_SHELL = /\|\s*(?:sudo\s+(?:-\S+\s+)*)?(?:ba|z|da|k|a)?sh\b/
// `base64 -d`, `base64 --decode`, `base64 -D` (macOS), also behind other flags.
const BASE64_DECODE = /\bbase64\b[^|;&]*?\s(?:-[a-zA-Z]*[dD][a-zA-Z]*|--decode)\b/
// `rm` as a command word: first, after `;`, `&`, `|`, `(`, a backtick, `sudo` or `xargs`.
const REMOVE = /(?:^|[;&|(`]|\bsudo\s|\bxargs\s|\bexec\s)\s*rm(?=\s|$)/m

/** Which warnings apply to `command`, in a fixed order. */
export function commandRisks(command: string): CommandRisk[] {
  const risks: CommandRisk[] = []
  if (PIPE_TO_SHELL.test(command)) risks.push('pipe-to-shell')
  if (BASE64_DECODE.test(command)) risks.push('base64-decode')
  if (REMOVE.test(command)) risks.push('remove')
  return risks
}

/**
 * `raw` as a block of text: the same filtering, but line breaks and tabs stay, because a
 * snippet (an nginx block, a few lines of SQL) is meant to be several lines. Carriage
 * returns are dropped, so a stray `\r` cannot overwrite what the line shows.
 */
export function cleanBlock(raw: string): CleanCommand {
  let removed = 0
  const text = raw
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, (ch) => {
      if (ch === '\n' || ch === '\t') return ch
      removed += 1
      return ''
    })
    .replace(/\s+$/, '')
  return { text, removed }
}
