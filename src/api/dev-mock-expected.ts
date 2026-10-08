// Development only: the "Mark as expected" rules and the host key lookup, layered over the
// result screens' mock so both flows can be tried in a plain browser.
//   ?mock=security&sec=<scenario>   a PHP file in uploads: ⋯ › Mark as expected…, then Undo
//   ?mock=host-key                  legacy-shop's key is unknown (Retry: still unknown, then accepted)
//   ?mock=host-key-changed          its key changed (both fingerprints)
//   ?mock=host-key-unavailable      its fingerprint could not be read
import type { ExpectedDraft, ExpectedRule, HostKeyInfo, HostOutcome, Item, Report } from './index'

type Handler = (cmd: string, args: Record<string, unknown>) => unknown

const KEY_HOST = 'legacy-shop'
const RECORDED = 'ED25519 SHA256:q3F8vN2kLx7Tq0Ybe1WmZc4R9sPdH6uJt5Ao8Gk9Xk'
const OFFERED = 'ED25519 SHA256:Lm7rC1pQe9Vx3Ns0Kd8Tg2Yh5Bw6Fj4Zu7Ha1Mo2Pa'

type Face = 'unknown' | 'changed' | 'unavailable'
const FACES: Record<string, Face> = {
  'host-key': 'unknown',
  'host-key-changed': 'changed',
  'host-key-unavailable': 'unavailable',
}

function refused(detail: string) {
  return Promise.reject({ code: { kind: 'schema_invalid' }, params: { detail }, retryable: false })
}

function keyOutcome(face: Face): HostOutcome {
  return face === 'changed'
    ? { state: 'host_key_changed', fp: OFFERED }
    : { state: 'host_key_unknown', fp: face === 'unknown' ? OFFERED : '' }
}

/** The key lookup: the third look finds an unknown key accepted, as if Terminal had run. */
function lookup(face: Face, looks: number): HostKeyInfo {
  if (face === 'changed') return { state: 'changed', offered: OFFERED, known: [RECORDED] }
  const offered = face === 'unknown' ? OFFERED : null
  return looks >= 3
    ? { state: 'known', offered, known: offered ? [offered] : [] }
    : { state: 'unknown', offered, known: [] }
}

function covers(rule: ExpectedRule, item: Item): boolean {
  const k = item.key
  return rule.host === k.host && rule.check === k.check && rule.target === k.target
}

function applyRules(report: Report, rules: readonly ExpectedRule[]): Report {
  let moved = 0
  const items = report.items.map((item) => {
    const rule = rules.find((r) => covers(r, item))
    const level = item.severity.level
    if (!rule || (level !== 'warn' && level !== 'crit') || item.disposition.kind === 'expected') {
      return item
    }
    if (rule.fp && rule.fp !== item.fact?.fp) return { ...item, rule_broken: rule.id }
    moved++
    return { ...item, disposition: { kind: 'expected' as const, rule: rule.id } }
  })
  if (moved === 0) return { ...report, items }
  const counts = { ...report.counts, expected: report.counts.expected + moved }
  for (const item of items) {
    const was = report.items.find((i) => i.key === item.key)
    if (was && was.disposition.kind !== 'expected' && item.disposition.kind === 'expected') {
      const level = item.severity.level
      if (level === 'crit' || level === 'warn') counts[level] = Math.max(0, counts[level] - 1)
    }
  }
  return { ...report, items, counts }
}

function build(draft: ExpectedDraft, latest: Report, taken: number): ExpectedRule | Promise<never> {
  const item = latest.items.find(
    (i) =>
      i.key.host === draft.host && i.key.check === draft.check && i.key.target === draft.target,
  )
  if (!item) return refused('rule_no_result')
  const level = item.severity.level
  if (level !== 'warn' && level !== 'crit') return refused('rule_not_an_issue')
  const dated = level === 'crit' || draft.reason === 'accepted_risk'
  if (dated && draft.review_days === null) return refused('rule_needs_date')
  if (level === 'crit' && draft.covers === 'any_evidence') return refused('rule_critical_any')
  if (draft.note.length > 200) return refused('rule_note')
  const until = draft.review_days
    ? new Date(Date.now() + draft.review_days * 86_400_000).toISOString().slice(0, 10)
    : null
  return {
    id: `r-dev-${taken}`,
    host: draft.host,
    check: draft.check,
    target: draft.target,
    fp: draft.covers === 'as_it_is' ? (item.fact?.fp ?? null) : null,
    reason: draft.reason,
    until: until as ExpectedRule['until'],
    note: draft.note,
  }
}

export function withExpectedAndHostKey(inner: Handler, variant: string): Handler {
  const added: ExpectedRule[] = []
  const face = FACES[variant]
  let looks = 0
  const shaped = (report: Report): Report => {
    const withKey = face
      ? {
          ...report,
          servers: report.servers.map((s) =>
            s.host === KEY_HOST ? { ...s, outcome: keyOutcome(face) } : s,
          ),
        }
      : report
    return applyRules(withKey, added)
  }
  return (cmd, args) => {
    switch (cmd) {
      case 'report_latest':
      case 'report_at': {
        const got = inner(cmd, args)
        return got instanceof Promise ? got.then((r) => shaped(r as Report)) : shaped(got as Report)
      }
      case 'rules_list': {
        const base = inner(cmd, args) as ExpectedRule[]
        return [...base, ...added]
      }
      case 'rules_add': {
        const latest = inner('report_latest', {}) as Report
        const rule = build(args.draft as ExpectedDraft, latest, added.length)
        if (rule instanceof Promise) return rule
        added.push(rule)
        return rule
      }
      case 'rules_remove': {
        const at = added.findIndex((r) => r.id === args.id)
        if (at >= 0) added.splice(at, 1)
        return at >= 0
      }
      case 'host_key_check':
        return face ? lookup(face, ++looks) : null
      default:
        return inner(cmd, args)
    }
  }
}
