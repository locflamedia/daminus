// Projects and servers as the sidebar and the cards list them, taken from the latest
// report's rollups. Sorting happens when a report arrives, so order holds during a scan.
import { defineStore } from 'pinia'
import { computed } from 'vue'
import type { ProjectRollup, ServerRollup } from '@/api'
import { diskPercent, issueCount, sortProjects, sortServers } from '@/lib/rollups'
import { useReportStore } from './report'

export const useProjectsStore = defineStore('projects', () => {
  const report = useReportStore()

  const projects = computed<ProjectRollup[]>(() => sortProjects(report.latest?.projects ?? []))
  const servers = computed<ServerRollup[]>(() => sortServers(report.latest?.servers ?? []))
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

  return { projects, servers, issues, project, server, disk }
})
