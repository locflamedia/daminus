// A command Daminus shows is a command somebody will paste into a terminal. Whatever the
// server or the model wrote, the person must be able to read exactly what they copy: no
// control characters, no characters that hide text, and a visible warning for the few
// shapes that run something unseen or delete things.

export type CommandRisk =
  'pipe-to-shell' | 'base64-decode' | 'remove' | 'destructive' | 'docker-group'

// C0 and C1 controls (this includes ESC, so ANSI sequences lose their lead byte), DEL, the
// zero-width and direction-mark characters, bidirectional overrides and isolates (they can
// reorder what is displayed), the line and paragraph separators, the BOM, the Unicode tag
// block and the variation selectors (both can carry text that renders as nothing), and the
// blank filler characters.
const CONTROL =
  /[\x00-\x1f\x7f-\x9f\u{ad}\u{34f}\u{61c}\u{115f}\u{1160}\u{180e}\u{200b}-\u{200f}\u{2028}-\u{202e}\u{2060}-\u{2069}\u{2800}\u{3164}\u{fe00}-\u{fe0f}\u{feff}\u{ffa0}\u{e0000}-\u{e007f}\u{e0100}-\u{e01ef}]/gu

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

// The part that names a shell or an interpreter after a pipe, with an optional path
// (`/bin/sh`, `/usr/bin/env bash`), `sudo` and `env` in front.
const RUNNER_PREFIX = String.raw`\|\s*(?:sudo\s+(?:-\S+\s+)*)?(?:(?:\S*\/)?env\s+(?:\S+=\S*\s+)*)?(?:\S*\/)?`
// `| sh`, `| bash -s`, `| sudo bash`, `| /bin/zsh`, `| env bash`: the output of something runs.
const PIPE_TO_SHELL = new RegExp(`${RUNNER_PREFIX}(?:ba|z|da|k|a|c|tc|fi)?sh\\b`)
// `| python`, `| python3 -`, `| perl`, `| node`: an interpreter that reads its program from
// the pipe. With a script or a module (`python -m json.tool`) it is only a filter.
const PIPE_TO_INTERPRETER = new RegExp(
  `${RUNNER_PREFIX}(?:python[0-9.]*|perl|ruby|node|php|lua)(?:\\s+-)?\\s*(?:$|[|;&)])`,
  'm',
)
// `sh -c "$(curl ...)"`, `eval "$(...)"`, `source <(curl ...)`: text another command makes runs.
const RUN_SUBSTITUTION = new RegExp(
  [
    String.raw`\b(?:(?:ba|z|da|k|a)?sh)\s+-\w*c\w*\s+["']?(?:\$\(|\x60)`,
    String.raw`\beval\s+[^|;&]*?(?:\$\(|\x60)`,
    String.raw`(?:^|[;&|(\s])(?:source|\.)\s+<\(`,
  ].join('|'),
  'm',
)
// `base64 -d`, `base64 --decode`, `base64 -D` (macOS), also behind other flags.
const BASE64_DECODE = /\bbase64\b[^|;&]*?\s(?:-[a-zA-Z]*[dD][a-zA-Z]*|--decode)\b/
// `rm` as a command word: first, after `;`, `&`, `|`, `(`, a backtick, `sudo` or `xargs`; also
// `find ... -delete` and `shred`.
const REMOVE =
  /(?:^|[;&|(`]|\bsudo\s|\bxargs\s|\bexec\s)\s*(?:rm|shred)(?=\s|$)|\bfind\b[^|;&]*\s-delete\b/m
// Writes to a device or formats it, and changes of owner or mode over a whole tree.
const DESTRUCTIVE = new RegExp(
  [
    String.raw`\bdd\b[^|;&]*\bof=`,
    String.raw`\b(?:mkfs(?:\.\w+)?|wipefs|fdisk|parted)\s`,
    String.raw`>\s*/dev/(?:sd|nvme|vd|xvd|hd|disk|mmcblk)`,
    String.raw`\b(?:chmod|chown|chgrp)\s+(?:-\w+\s+)*-\w*R`,
  ].join('|'),
  'm',
)

// Puts an account in the docker group: `usermod -aG docker deploy`, `usermod -G www,docker x`,
// `gpasswd -a deploy docker`, `adduser deploy docker`. Anyone in that group can start a
// container that mounts the whole disk, which is root on the server.
const DOCKER_GROUP = new RegExp(
  [
    String.raw`\busermod\b[^|;&]*\s(?:-\w*G|--groups)\s+(?:[\w.-]+,)*docker(?:,|\s|$)`,
    String.raw`\b(?:gpasswd\s+(?:-a|--add)|adduser|addgroup)\s+\S+\s+docker(?:\s|$)`,
  ].join('|'),
  'm',
)

/** Which warnings apply to `command`, in a fixed order. */
export function commandRisks(command: string): CommandRisk[] {
  const risks: CommandRisk[] = []
  if (
    PIPE_TO_SHELL.test(command) ||
    PIPE_TO_INTERPRETER.test(command) ||
    RUN_SUBSTITUTION.test(command)
  ) {
    risks.push('pipe-to-shell')
  }
  if (BASE64_DECODE.test(command)) risks.push('base64-decode')
  if (REMOVE.test(command)) risks.push('remove')
  if (DESTRUCTIVE.test(command)) risks.push('destructive')
  if (DOCKER_GROUP.test(command)) risks.push('docker-group')
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
