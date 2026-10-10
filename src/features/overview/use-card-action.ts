// What the status row's button of an Overview card does: open the tab or project, retry the
// hosts that did not answer, or the one step that can fix why a host could not be scanned.
import { useRouter } from 'vue-router'
import { useScanPanelStore } from '@/stores/scan-panel'
import type { CardView } from './overview-card-text'
import { useHostFix } from './use-host-fix'

export function useCardAction() {
  const router = useRouter()
  const panel = useScanPanelStore()
  const fix = useHostFix()

  function open(card: CardView, tab?: string) {
    void router.push({ name: 'project', params: { id: card.id, ...(tab ? { tab } : {}) } })
  }

  function act(card: CardView) {
    const host = card.retryHosts[0]
    switch (card.action) {
      case 'retry':
        return void panel.start({ projects: [], hosts: card.retryHosts })
      case 'tab':
        return card.tab ? open(card, card.tab) : open(card)
      case 'login':
      case 'host-key':
      case 'edit':
        return host ? fix.run(card.action, host, card.outcome, card.id) : open(card)
      default:
        return open(card)
    }
  }

  return { open, act }
}
