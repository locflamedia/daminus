import type { HostOutcome } from '@/api'
import { infoFromOutcome, keyProblemOf } from '@/lib/host-key'
import { useHostKeyStore } from '@/stores/host-key'

/**
 * Opens the host key screen for a host whose scan ended on its key. The fingerprint the scan
 * carried is shown at once; the lookup then adds the recorded keys.
 */
export function useHostKeyReview() {
  const store = useHostKeyStore()
  return {
    /** Whether `outcome` is a key problem the screen can explain. */
    has: (outcome: HostOutcome | null | undefined) => keyProblemOf(outcome) !== null,
    review: (host: string, outcome: HostOutcome | null | undefined) =>
      void store.open(host, outcome ? infoFromOutcome(outcome) : null),
  }
}
