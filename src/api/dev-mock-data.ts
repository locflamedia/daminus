// Development only: answers the data commands in a plain browser, with a folder that holds
// twelve scans and shrinks to nothing when the history is cleared.
import type { DataUsage } from './bindings/DataUsage'

const MB = 1_000_000

function fresh(): DataUsage {
  const scan_sizes = Array.from({ length: 12 }, (_, i) => Math.round((0.62 + i * 0.145) * MB))
  return {
    path: '~/Library/Application Support/dev.daminus.app',
    files: 15,
    scans: 12,
    scans_bytes: scan_sizes.reduce((a, b) => a + b, 0),
    config_bytes: 38_400,
    logs_bytes: Math.round(1.1 * MB),
    scan_sizes,
  }
}

let usage = fresh()

/** Back to twelve scans, for a test that starts from a fresh folder. */
export function resetDataMock(): void {
  usage = fresh()
}

/** The answer for `cmd`, or `undefined` when it is not a data command. */
export function dataAnswer(cmd: string): unknown {
  if (cmd === 'data_usage') return structuredClone(usage)
  if (cmd === 'data_export') return { name: 'daminus-scans.json' }
  if (cmd === 'data_clear') {
    const gone = usage.scans
    usage = { ...usage, files: usage.files - gone, scans: 0, scans_bytes: 0, scan_sizes: [] }
    return gone
  }
  return undefined
}
