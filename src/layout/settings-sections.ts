import type { IconName } from '@/ui/icon-paths'

/** The Settings sections, in the order of the board's left column. */
export const SETTINGS_SECTIONS = [
  { id: 'general', icon: 'settings' },
  { id: 'appearance', icon: 'appearance' },
  { id: 'scan', icon: 'refresh' },
  { id: 'hosts', icon: 'server' },
  { id: 'ai', icon: 'spark' },
  { id: 'data', icon: 'database' },
  { id: 'about', icon: 'info' },
] as const satisfies readonly { id: string; icon: IconName }[]

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id']
