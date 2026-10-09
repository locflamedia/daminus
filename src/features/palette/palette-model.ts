// What the palette lists, built from the stores' data. Pure: the host passes plain values in and
// decides what picking an id does.
import type { Level, ProjectRollup, ServerRollup } from '@/api'
import starryThumb from '@/assets/delight/starry-small.jpg'
import { SETTINGS_SECTIONS } from '@/layout/settings-sections'
import type { PaletteGroup, PaletteItem } from '@/ui/UiCommandPalette.vue'
import type { DotState } from '@/ui/UiStatusDot.vue'

export const STARRY_WORD = 'starry'
export const STARRY_ID = 'starry'

export type Translate = (key: string) => string

export interface PaletteInput {
  projects: readonly Pick<ProjectRollup, 'id' | 'level' | 'unreachable_hosts'>[]
  servers: readonly Pick<ServerRollup, 'host' | 'level'>[]
  /** Domains by project id, matched too when typing. */
  domains: Readonly<Record<string, string | null>>
  canScan: boolean
  easterEggs: boolean
  query: string
  t: Translate
}

export function dotOf(level: Level, unreachable = false): DotState {
  if (level === 'crit') return 'crit'
  if (level === 'warn') return 'warn'
  return unreachable ? 'unknown' : 'ok'
}

/** True when the typed text is the easter egg's word and the setting allows it. */
export function starryAsked(query: string, easterEggs: boolean): boolean {
  return easterEggs && query.trim().toLowerCase() === STARRY_WORD
}

export function buildGroups(input: PaletteInput): PaletteGroup[] {
  const { t } = input
  const projects: PaletteItem[] = input.projects.map((p) => {
    const domain = input.domains[p.id]
    return {
      id: `project:${p.id}`,
      label: p.id,
      dot: dotOf(p.level, p.unreachable_hosts.length > 0),
      keywords: domain ? [domain] : [],
    }
  })
  const servers: PaletteItem[] = input.servers.map((s) => ({
    id: `server:${s.host}`,
    label: s.host,
    dot: dotOf(s.level),
  }))
  const pages: PaletteItem[] = [
    { id: 'page:overview', label: t('nav.overview'), icon: 'grid' },
    { id: 'page:history', label: t('nav.history'), icon: 'clock' },
    ...SETTINGS_SECTIONS.map((s) => ({
      id: `settings:${s.id}`,
      label: `${t('nav.settings')} · ${t(`settingsNav.${s.id}`)}`,
      icon: s.icon,
    })),
  ]
  const groups: PaletteGroup[] = [
    { id: 'projects', label: t('ui.palette.projects'), items: projects },
    { id: 'servers', label: t('ui.palette.servers'), items: servers },
    { id: 'pages', label: t('palette.pages'), items: pages },
  ]
  if (input.canScan) {
    groups.push({
      id: 'commands',
      label: t('ui.palette.commands'),
      items: [{ id: 'scan', label: t('tray.scanNow'), icon: 'play' }],
    })
  }
  if (starryAsked(input.query, input.easterEggs)) {
    // The palette lists only what matches, so this row shows for the word alone.
    groups.unshift({
      id: 'egg',
      label: '',
      items: [
        {
          id: STARRY_ID,
          label: t('palette.starry'),
          subtitle: t('palette.starrySub'),
          thumb: starryThumb,
          keywords: [STARRY_WORD],
        },
      ],
    })
  }
  return groups
}
