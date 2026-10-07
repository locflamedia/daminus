import { isAppError } from '@/api'

/** The path the Rust command names when `~/.ssh` is not there (nothing was tried to open). */
const MISSING_PATH = '~/.ssh'

/** Why Finder did not open `~/.ssh`: the folder does not exist yet, or opening it failed. */
export function revealSshFailure(e: unknown): 'missing' | 'failed' {
  const code = isAppError(e) ? e.code : null
  return code?.kind === 'io' && code.path === MISSING_PATH ? 'missing' : 'failed'
}
