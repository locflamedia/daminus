// The host key screen (board "Host key changed"): which of its three faces a lookup gets, what
// Retry found, the fingerprint cut into groups, the identicon that makes two keys easy to tell
// apart, and the two lines the person runs in Terminal. The app never trusts a key itself and
// never writes known_hosts; every face ends in `ssh <alias>`, run by the person.
import type { HostKeyInfo, HostKeyState, HostOutcome } from '@/api'
import { shellQuote } from './host-test'

export type HostKeyFace = 'unknown' | 'changed' | 'unavailable'

/** What Retry found, compared with what the screen showed before. */
export type RetryResult = 'accepted' | 'still_unknown' | 'changed'

/** The part of a failed scan that tells which key problem a host had. */
export function keyProblemOf(outcome: HostOutcome | null | undefined): HostKeyState | null {
  if (outcome?.state === 'host_key_unknown') return 'unknown'
  if (outcome?.state === 'host_key_changed') return 'changed'
  return null
}

/** The key the outcome carried, so the screen has something to show before the lookup answers. */
export function infoFromOutcome(outcome: HostOutcome): HostKeyInfo | null {
  const state = keyProblemOf(outcome)
  if (!state || !('fp' in outcome)) return null
  return { state, offered: outcome.fp || null, known: [] }
}

/**
 * The face for `info`: a changed key is always the changed face, a key nobody could read is the
 * unavailable face (no fingerprint box, no comparison: the screen never guesses a key), and an
 * unknown key with a fingerprint is the first-connection face. `null` when the key is known.
 */
export function faceOf(info: HostKeyInfo | null): HostKeyFace | null {
  if (!info) return 'unavailable'
  if (info.state === 'known') return null
  if (info.state === 'changed') return 'changed'
  return info.offered ? 'unknown' : 'unavailable'
}

/** What Retry found. `null` when the lookup could not say (nothing to report). */
export function retryResult(before: HostKeyFace, after: HostKeyInfo | null): RetryResult | null {
  if (!after) return null
  if (after.state === 'known') return 'accepted'
  if (after.state === 'changed') return before === 'changed' ? null : 'changed'
  return 'still_unknown'
}

export interface FingerprintParts {
  algorithm: string
  /** `SHA256:` and the groups of four characters, as the board draws them. */
  groups: string[]
}

/** `ED25519 SHA256:Lm7r…` as the algorithm and groups of four; any other text is one group. */
export function fingerprintParts(fp: string): FingerprintParts {
  const [first, second] = fp.trim().split(/\s+/, 2)
  const hasAlgorithm = second !== undefined && /^[A-Za-z0-9-]+:/.test(second)
  const algorithm = hasAlgorithm ? (first ?? '') : ''
  const digest = hasAlgorithm ? second : (first ?? '')
  const colon = digest.indexOf(':')
  const prefix = colon >= 0 ? digest.slice(0, colon + 1) : ''
  const body = colon >= 0 ? digest.slice(colon + 1) : digest
  const groups = body.match(/.{1,4}/g) ?? []
  return { algorithm, groups: prefix ? [prefix + (groups[0] ?? ''), ...groups.slice(1)] : groups }
}

/** The fingerprint on one line, as ssh prints it (what a person compares with a console). */
export function fingerprintText(fp: string): string {
  const { groups } = fingerprintParts(fp)
  return groups.join('')
}

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

/** A 5 by 5 pattern, mirrored left to right, that is the same for the same key. */
export function identicon(seed: string): boolean[] {
  const h = hash(seed)
  const cells: boolean[] = []
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const column = c < 3 ? c : 4 - c
      cells.push(((h >>> ((r * 3 + column) % 30)) & 1) === 1)
    }
  }
  return cells
}

/** The line that accepts a key: connect once and answer yes. */
export function connectCommand(alias: string): string {
  return `ssh ${shellQuote(alias)}`
}

/** The line that forgets the recorded key of a host, for a key that really did change. */
export function forgetCommand(alias: string): string {
  return `ssh-keygen -R ${shellQuote(alias)}`
}
