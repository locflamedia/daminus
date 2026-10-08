// Settings › Hosts: which host is open, which hosts a scan leaves out, and the test of one host.
// The hosts themselves, the login tests and their answers live in the setup store; this store
// adds the choice "include in scans" (kept by the core in projects.json) and what is selected.
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  type AgentStatus,
  type HostKeyInfo,
  agentStatus,
  hostKeyCheck,
  hostsExcluded,
  hostsSetInclude,
} from '@/api'
import { t } from '@/i18n'
import { hostsRows } from '@/lib/hosts-settings'
import { useHistoryStore } from './history'
import { useProjectsStore } from './projects'
import { useReportStore } from './report'
import { useSetupStore } from './setup'
import { useToastStore } from './toasts'

export const useHostsSettingsStore = defineStore('hostsSettings', () => {
  const setup = useSetupStore()
  const report = useReportStore()
  const projects = useProjectsStore()
  const history = useHistoryStore()

  const excluded = ref<string[]>([])
  const selected = ref<string | null>(null)
  const agent = ref<AgentStatus | null>(null)
  const loading = ref(false)
  /** What the open host offers and what is recorded for it; `null` until it is looked at. */
  const hostKey = ref<HostKeyInfo | null>(null)
  // Changes go one after the other, so the file ends as the last choice left it.
  let queue: Promise<unknown> = Promise.resolve()

  const rows = computed(() =>
    hostsRows(setup.entries, report.latest?.servers ?? [], projects.details, excluded.value),
  )
  const current = computed(() => rows.value.find((r) => r.alias === selected.value) ?? null)
  const entry = computed(() => setup.entries.find((e) => e.host.alias === selected.value) ?? null)

  /** Reads the ssh config, the hosts left out, the agent and what the scans know of each host. */
  async function load() {
    loading.value = true
    try {
      await Promise.all([
        setup.load(),
        projects.loadDetails(),
        report.latest ? Promise.resolve() : report.loadLatest(),
        history.load(),
        hostsExcluded().then((list) => (excluded.value = list)),
        agentStatus().then((status) => (agent.value = status)),
      ])
    } catch (e) {
      console.error(e)
    } finally {
      loading.value = false
    }
    const first = setup.entries[0]?.host.alias ?? null
    if (!setup.entries.some((e) => e.host.alias === selected.value)) {
      selected.value = first
      if (first) void loadHostKey(first)
    }
  }

  /** Looks at the key a host offers, without logging in. */
  async function loadHostKey(alias: string) {
    hostKey.value = null
    try {
      const info = await hostKeyCheck(alias)
      if (selected.value === alias) hostKey.value = info
    } catch {
      // A host that does not answer has no key to show.
    }
  }

  function select(alias: string) {
    if (selected.value === alias) return
    selected.value = alias
    void loadHostKey(alias)
  }

  function withHost(list: string[], alias: string, include: boolean): string[] {
    const rest = list.filter((h) => h !== alias)
    return include ? rest : [...rest, alias]
  }

  /** "Include in scans": takes effect on the next scan; the report shows it at once. */
  function setInclude(alias: string, include: boolean): Promise<void> {
    excluded.value = withHost(excluded.value, alias, include)
    const run: Promise<void> = queue.then(async () => {
      try {
        const answer = await hostsSetInclude(alias, include)
        // Only the last answer is the file as it ends; an earlier one would undo a later click.
        if (queue === run) excluded.value = answer
        await report.loadLatest()
      } catch {
        if (queue === run) excluded.value = withHost(excluded.value, alias, !include)
        useToastStore().push({ tone: 'crit', title: t('settingsHosts.saveFailed') })
      }
    })
    queue = run
    return run
  }

  /** Tests the open host again: connect, read the system and the permissions, disconnect. */
  function test(alias: string) {
    setup.retest(alias)
  }

  return {
    excluded,
    selected,
    agent,
    loading,
    hostKey,
    rows,
    current,
    entry,
    load,
    select,
    setInclude,
    test,
  }
})
