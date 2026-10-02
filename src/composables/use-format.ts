// Formatters bound to the current language, for templates: they read the settings store's
// language, so a switch re-renders every number, date and unit with no reload.
import { useSettingsStore } from '@/stores/settings'
import {
  type WhenOptions,
  formatClock,
  formatDateTime,
  formatDelta,
  formatDuration,
  formatMeasure,
  formatNumber,
  formatWhen,
} from '@/lib/format'

export function useFormat() {
  const settings = useSettingsStore()
  return {
    number: (n: number) => formatNumber(n, settings.language),
    measure: (value: number, unit?: string | null) => formatMeasure(value, unit, settings.language),
    delta: (value: number, unit?: string | null) => formatDelta(value, unit, settings.language),
    duration: (ms: number) => formatDuration(ms, settings.language),
    clock: (when: string | number | Date) => formatClock(when, settings.language),
    dateTime: (when: string | number | Date) => formatDateTime(when, settings.language),
    when: (when: string | number | Date, options?: WhenOptions) =>
      formatWhen(when, Date.now(), settings.language, options),
  }
}
