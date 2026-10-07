// The lanes of the discover screen, from the setup store: one per host asked, with its state,
// what it has found so far and what it could not read. Everything is derived from the records
// and the lane ends the store keeps, so a lane is as live as the events.
import { computed } from 'vue'
import {
  type HostCounts,
  type IncompleteRow,
  type LaneDetails,
  type LaneState,
  type ReadingSource,
  countsOf,
  foundIn,
  incompleteRows,
  laneDetails,
  laneState,
  readingSource,
} from '@/lib/discover-view'
import { shortDistro } from '@/lib/host-test'
import { useSetupStore } from '@/stores/setup'

export interface LaneView {
  host: string
  state: LaneState
  /** The core's outcome word for a host it could not read (auth, host key). */
  outcome: string | null
  found: number
  counts: HostCounts
  ms: number | null
  os: string | null
  via: string | null
  reading: ReadingSource
  rows: IncompleteRow[]
  details: LaneDetails
  /** Login test time of a queued host, so a slow link can be said. */
  linkMs: number | null
}

export function useDiscoverLanes() {
  const setup = useSetupStore()

  const lanes = computed<LaneView[]>(() =>
    setup.discovering.map((host) => {
      const records = setup.recordsOf(host)
      const end = setup.lanes[host]
      const progress = setup.run?.step === 'discover' ? setup.run.hosts[host] : undefined
      const report = setup.logins[host]?.login?.login ?? null
      const user = report?.user ?? null
      return {
        host,
        state: laneState(progress, end, records),
        outcome: end && end.outcome.state !== 'reached' ? end.outcome.state : null,
        found: foundIn(records),
        counts: countsOf(records),
        ms: end?.ms ?? null,
        os: report ? shortDistro(report.distro) : null,
        via: setup.result?.hosts.find((h) => h.host === host)?.resolved?.proxy_jump ?? null,
        reading: readingSource(records),
        rows: incompleteRows(records, user),
        details: laneDetails(records, end?.dropped ?? 0),
        linkMs: setup.answers[host]?.ms ?? null,
      }
    }),
  )

  return { lanes }
}
