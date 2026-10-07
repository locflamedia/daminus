// "Do this first": when anything is critical, one strip names the single first action and what
// comes after it. It is rule-based, not AI: a fixed order of the critical checks (what shows a
// server may already be compromised, then what exposes secrets, then what only affects the
// site) and, for each check, three plain sentences. The order is a rule of this app, not a
// value the core grades, so the strip never changes a severity.
import { baseName } from './security-format'
import { criticalFindings, type Finding } from './security-findings'
import { NGINX_DENY_DOTFILES, NGINX_DENY_UPLOAD_PHP } from './security-commands'
import type { SecurityCheck } from './security-rows'

/** The critical checks, most urgent first. */
export const FIRST_ORDER: readonly SecurityCheck[] = [
  'sec.miner',
  'sec.preload',
  'sec.upload_php',
  'url.exposed',
  'url.tls',
  'url.http',
]

export interface FirstStep {
  check: SecurityCheck
  /** The finding the step is about. */
  finding: Finding
  /** Checks that are critical too and come after, in order, without the first. */
  after: SecurityCheck[]
  /** A command the strip offers to copy. */
  command: string | null
  /** The file the next sentence names (the newest uploaded PHP file), when there is one. */
  file: string | null
}

const COMMANDS: Partial<Record<SecurityCheck, string>> = {
  'sec.upload_php': NGINX_DENY_UPLOAD_PHP,
  'url.exposed': NGINX_DENY_DOTFILES,
}

/** The first action for the open critical findings; `null` when nothing is critical. */
export function doFirst(findings: readonly Finding[]): FirstStep | null {
  const crit = criticalFindings(findings).filter((f) => f.standing === 'active')
  const checks = FIRST_ORDER.filter((c) => crit.some((f) => f.check === c))
  const check = checks[0]
  if (!check) return null
  const finding = crit.find((f) => f.check === check) as Finding
  const newest = finding.evidence.kind === 'files' ? finding.evidence.files[0] : undefined
  return {
    check,
    finding,
    after: checks.slice(1),
    command: COMMANDS[check] ?? null,
    file: newest ? baseName(newest.path) : null,
  }
}
