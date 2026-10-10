// The one step that can fix a host that could not be scanned, the same on the Overview card, the
// servers strip and the scan panel: only the network is retried; a refused key is fixed in
// Settings › Hosts, a host key is reviewed, and an alias gone from ~/.ssh/config is fixed by
// editing the project that uses it.
import { useRouter } from 'vue-router'
import type { HostOutcome } from '@/api'
import { useHostKeyReview } from '@/features/host-key/use-host-key-review'
import { i18n } from '@/i18n'
import { outcomeKey } from '@/lib/outcome-label'
import { draftFromProject } from '@/lib/setup-model'
import { useHostsSettingsStore } from '@/stores/hosts-settings'
import { useProjectSheetStore } from '@/stores/project-sheet'
import { useProjectsStore } from '@/stores/projects'
import { useScanPanelStore } from '@/stores/scan-panel'
import type { IconName } from '@/ui/icon-paths'

export type HostFix = 'retry' | 'login' | 'host-key' | 'edit'

export function hostFixOf(outcome: HostOutcome | null | undefined): HostFix {
  switch (outcomeKey(outcome)) {
    case 'key_refused':
      return 'login'
    case 'host_key_changed':
    case 'host_key_unknown':
      return 'host-key'
    case 'not_in_config':
      return 'edit'
    default:
      return 'retry'
  }
}

const LABEL: Record<HostFix, string> = {
  retry: 'overviewScreen.card.retry',
  login: 'overviewScreen.card.fixLogin',
  'host-key': 'hostKey.review',
  edit: 'overviewScreen.card.editProject',
}

const ICON: Record<HostFix, IconName> = {
  retry: 'refresh',
  login: 'key',
  'host-key': 'shield',
  edit: 'edit',
}

export function hostFixLabel(fix: HostFix): string {
  return i18n.global.t(LABEL[fix])
}

export function hostFixIcon(fix: HostFix): IconName {
  return ICON[fix]
}

export function useHostFix() {
  const router = useRouter()
  const hosts = useHostsSettingsStore()
  const keys = useHostKeyReview()
  const sheet = useProjectSheetStore()
  const projects = useProjectsStore()
  const panel = useScanPanelStore()

  /** The saved project to edit for `host`: `project` when given, else the first that uses it. */
  function projectFor(host: string, project?: string) {
    return projects.details.find((p) =>
      project ? p.id === project : p.components.some((c) => c.host === host),
    )
  }

  /** Whether `fix` can be offered for `host` (an alias with no project has none to edit). */
  function can(fix: HostFix, host: string, project?: string): boolean {
    return fix !== 'edit' || projectFor(host, project) !== undefined
  }

  /** Runs the fix; a retry belongs to the caller's scan, so it does nothing here. */
  function run(fix: HostFix, host: string, outcome: HostOutcome | null, project?: string) {
    // Settings and the project sheet open under the scan panel's drawer: close it first.
    if (fix === 'login' || fix === 'edit') panel.close()
    if (fix === 'login') {
      hosts.select(host)
      void router.push({ name: 'settings', params: { section: 'hosts' } })
    } else if (fix === 'host-key') {
      keys.review(host, outcome)
    } else if (fix === 'edit') {
      const saved = projectFor(host, project)
      if (saved) sheet.open({ draft: draftFromProject(saved), mode: 'saved' })
    }
  }

  return { can, run }
}
