// Projects and servers as the sidebar and the cards list them, taken from the latest
// report's rollups. Sorting happens when a report arrives, so order holds during a scan.
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { type Project, type ProjectRollup, type ServerRollup, projectsList } from '@/api'
import { diskPercent, issueCount, sortProjects, sortServers } from '@/lib/rollups'
import { useReportStore } from './report'

export const useProjectsStore = defineStore('projects', () => {
  const report = useReportStore()

  const projects = computed<ProjectRollup[]>(() => sortProjects(report.latest?.projects ?? []))
  const servers = computed<ServerRollup[]>(() => sortServers(report.latest?.servers ?? []))
  /** The saved projects (name, colour, URLs): what the rollups do not carry. */
  const details = shallowRef<Project[]>([])
  /** `projects.json` was read at least once: an empty `details` then means no project yet. */
  const loaded = ref(false)

  /** Reads `projects.json` again; on failure the last read stays. */
  async function loadDetails() {
    try {
      details.value = await projectsList()
      loaded.value = true
    } catch (e) {
      console.error(e)
    }
  }

  /** The colour a project was given in setup, when it is a plain `#rrggbb`. */
  function color(id: string): string | null {
    const value = details.value.find((p) => p.id === id)?.color
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null
  }

  /** The host of the first URL the project is checked at, for the header line. */
  function domain(id: string): string | null {
    const url = details.value.find((p) => p.id === id)?.urls[0]
    if (!url) return null
    try {
      return new URL(url).hostname
    } catch {
      return null
    }
  }

  const issues = computed(() => (report.latest ? issueCount(report.latest) : 0))

  function project(id: string): ProjectRollup | undefined {
    return report.latest?.projects.find((p) => p.id === id)
  }

  function server(host: string): ServerRollup | undefined {
    return report.latest?.servers.find((s) => s.host === host)
  }

  /** Disk fill of a host in percent, from its worst `disk.fs` result. */
  function disk(host: string): number | null {
    return diskPercent(report.latest?.items ?? [], host)
  }

  return {
    projects,
    servers,
    issues,
    details,
    loaded,
    loadDetails,
    color,
    domain,
    project,
    server,
    disk,
  }
})
