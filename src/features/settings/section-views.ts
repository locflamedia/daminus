import type { Component } from 'vue'
import type { SettingsSection } from '@/layout/settings-sections'
import SettingsAppearance from './SettingsAppearance.vue'
import SettingsGeneral from './SettingsGeneral.vue'

/** The screen of each Settings section that is built; the others show only their title. */
export const SECTION_VIEWS: Partial<Record<SettingsSection, Component>> = {
  general: SettingsGeneral,
  appearance: SettingsAppearance,
}
