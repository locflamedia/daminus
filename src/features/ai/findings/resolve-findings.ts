// A finding of the reply, tied to the result it names. The model only ranks and explains: the
// severity, the title and the place come from the result (the check) found through the key Rust
// attached to the finding, never from the model's text. A finding with no key, or whose result is
// no longer in the report, is kept and shown without a severity.
import type { AiFinding, CheckKey, Item, Report, Severity } from '@/api'
import { currentLocale, type Locale } from '@/i18n'
import { cleanText } from '@/lib/command-safety'
import { issueText, severityText } from '@/lib/issue-text'
import type { AskedFinding } from '@/stores/ai-thread'

export type FindingTone = 'crit' | 'warn' | 'info' | 'plain'

export interface ResolvedFinding {
  /** The id of the reply (`c3`). */
  id: string
  rank: number
  /** The model's explanation; it is text, never markup. */
  why: string
  /** To read and copy; never run. */
  command: string | null
  /** The result it names, or `null` when the id names nothing in the report. */
  item: Item | null
  severity: Severity | null
  tone: FindingTone
  /** The sentence for the result ("kho-hang: .env is readable"), or the id when unresolved. */
  title: string
  /** The project (or the server) the result belongs to, for the chip. */
  owner: string | null
  /** The target (or the host when it has none), for the line under the title after the owner. */
  where: string | null
}

export function toneOf(severity: Severity | null): FindingTone {
  if (severity === null) return 'plain'
  switch (severity.level) {
    case 'crit':
    case 'warn':
    case 'info':
      return severity.level
    default:
      return 'plain'
  }
}

function ownerName(item: Item): string {
  return item.owner.kind === 'project' ? item.owner.id : item.owner.host
}

/** Rank order: 1 is the most urgent; ties keep the order they arrived in. */
export function byRank<T extends AiFinding>(findings: readonly T[]): T[] {
  return findings
    .map((finding, i) => ({ finding, i }))
    .sort((a, b) => a.finding.rank - b.finding.rank || a.i - b.i)
    .map(({ finding }) => finding)
}

function sameKey(a: CheckKey, b: CheckKey): boolean {
  return a.host === b.host && a.check === b.check && a.target === b.target
}

export function resolveFindings(
  findings: readonly AskedFinding[],
  report: Report | null,
  locale: Locale = currentLocale(),
): ResolvedFinding[] {
  return byRank(findings).map((finding) => {
    const key = finding.key
    const item = (key && report?.items.find((i) => sameKey(i.key, key))) || null
    const severity = item?.severity ?? null
    return {
      id: finding.id,
      rank: finding.rank,
      why: cleanText(finding.why),
      command: finding.suggested_command,
      item,
      severity,
      tone: toneOf(severity),
      title: item
        ? issueText({ key: item.key, params: {}, severity: item.severity }, locale)
        : finding.id,
      owner: item ? ownerName(item) : null,
      where: item ? item.key.target || item.key.host : null,
    }
  })
}

/** The words for the chip: the check's severity ("Critical"), nothing for an unresolved id. */
export function severityWords(finding: ResolvedFinding, locale: Locale = currentLocale()) {
  return finding.severity ? severityText(finding.severity, locale) : null
}
