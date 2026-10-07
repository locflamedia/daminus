// The rarer results on top of the timeline (`?mock=states`): the certificate states, a
// partial miner check, a database that cannot be read, and an uploads list cut at fifty.
import type { Item, Report } from '@/api'
import type { JsonValue } from '@/api/bindings/serde_json/JsonValue'
import type { ResultsBundle } from './results-bundle'

type Data = ResultsBundle & { latest: number }

function patch(report: Report, edit: (items: Item[]) => Item[]): Report {
  return { ...report, items: edit(report.items.map((i) => ({ ...i }))) }
}

function setTls(
  items: Item[],
  url: string,
  apply: Partial<Item>,
  value: number | null,
  data: Record<string, JsonValue>,
) {
  const item = items.find((i) => i.key.check === 'url.tls' && i.key.target === url)
  if (!item) return
  Object.assign(item, apply)
  item.fact = { check: 'url.tls', target: url, value, unit: 'days', data }
}

export function withStates<T extends Data>(data: T): T {
  const key = String(data.latest)
  const base = data.reports[key]
  if (!base) return data
  const report = patch(base, (items) => {
    setTls(items, 'https://tiemtra.vn', { severity: { level: 'warn' } }, 12, {})
    setTls(items, 'https://api.tiemtra.vn', { severity: { level: 'crit' } }, -5, {
      expired: true,
      untrusted: true,
    })
    setTls(items, 'https://khohang.vn', { severity: { level: 'crit' } }, 61, { mismatch: true })
    setTls(
      items,
      'https://booking.vn',
      { severity: { level: 'unknown', reason: 'unreachable' } },
      null,
      {
        error: 'refused',
      },
    )
    const miner = items.find((i) => i.key.check === 'sec.miner' && i.key.host === 'vps-hn-3')
    if (miner) {
      miner.severity = { level: 'unknown', reason: 'needs_perm' }
      miner.fact = {
        check: 'sec.miner',
        target: '',
        value: 0,
        unit: 'count',
        data: { seen: 41, total: 212 },
        unknown: 'needs_perm',
      }
    }
    const db = items.find((i) => i.key.check === 'db.size' && i.key.host === 'db-main')
    if (db) {
      db.severity = { level: 'unknown', reason: 'needs_perm' }
      db.fact = { check: 'db.size', target: 'booking', unknown: 'needs_perm' }
    }
    const upload = items.find(
      (i) => i.key.check === 'sec.upload_php' && i.severity.level === 'crit',
    )
    if (upload) {
      const more = Array.from({ length: 49 }, (_, n): Item => {
        const target = `/var/www/khohang/public/uploads/2026/09/img_${4400 + n}.php`
        return {
          ...upload,
          key: { ...upload.key, target },
          fact: {
            check: 'sec.upload_php',
            target,
            value: 1,
            unit: 'count',
            fp: `3481:${1_790_200_000 + n}:0b77e${n}`,
            data: { size: 3481, mtime: 1_790_200_000 + n * 60, total: 137 },
          },
          delta: { kind: 'still', scans_open: 3 },
        }
      })
      upload.fact = upload.fact && {
        ...upload.fact,
        data: { ...(upload.fact.data as object), total: 137 },
      }
      items.push(...more)
    }
    return items
  })
  return { ...data, reports: { ...data.reports, [key]: report } }
}
