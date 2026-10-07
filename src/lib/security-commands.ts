// The commands the Security tab offers to copy. Nothing here runs: a person pastes it into
// their own terminal, so every command is built from fixed words plus values that were
// checked or quoted, and is shown through the command-safety filter before it is copied.
import { cleanCommand } from './command-safety'

/** nginx: deny dotfiles (`.env`, `.git`) but keep `.well-known` for certificate renewal. */
export const NGINX_DENY_DOTFILES = String.raw`location ~ /\.(?!well-known) { deny all; }`

/** nginx: never hand a PHP file under an uploads folder to PHP. */
export const NGINX_DENY_UPLOAD_PHP = String.raw`location ~* /(?:uploads|storage/app/public)/.*\.(?:php|phtml|phar|pht)$ { deny all; }`

/** POSIX single quoting: the text is one word whatever characters it holds. */
export function shellQuote(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`
}

/** A host alias from the ssh config: letters, digits, dot, dash, underscore. */
const SAFE_ALIAS = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * `scp` of one file from a host to the current folder, or `null` when the host is not a plain
 * alias (an `@local` result has no host to copy from) or the path is not absolute.
 */
export function scpCommand(host: string, path: string): string | null {
  if (!SAFE_ALIAS.test(host) || !path.startsWith('/')) return null
  const clean = cleanCommand(path)
  if (clean.removed > 0 || clean.text !== path) return null
  return `scp ${shellQuote(`${host}:${path}`)} .`
}
