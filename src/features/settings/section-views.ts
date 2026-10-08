import type { Component } from 'vue'
import type { SettingsSection } from '@/layout/settings-sections'
import SettingsAbout from './SettingsAbout.vue'
import SettingsAppearance from './SettingsAppearance.vue'
import SettingsData from './SettingsData.vue'
import SettingsGeneral from './SettingsGeneral.vue'
import SettingsHosts from './SettingsHosts.vue'
import SettingsScan from './SettingsScan.vue'

/** The screen of each Settings section that is built; the others show only their title. */
export const SECTION_VIEWS: Partial<Record<SettingsSection, Component>> = {
  general: SettingsGeneral,
  appearance: SettingsAppearance,
  scan: SettingsScan,
  hosts: SettingsHosts,
  data: SettingsData,
  about: SettingsAbout,
}
