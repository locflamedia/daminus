// Settings › Data: what the app's folder holds, the retention limits, the export, and the two
// ways out (delete the history, reset the settings). The core does all of it; this store only
// asks, keeps the answer and says in a toast when something fails or finishes in the
// background.
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import {
  type AppError,
  type DataSettings,
  type DataUsage,
  type ScanSummary,
  dataClear,
  dataExport,
  dataUsage,
  historyList,
  isAppError,
  revealConfigDir,
  settingsGet,
  settingsReset,
  settingsSetData,
} from '@/api'
import { currentLocale, t } from '@/i18n'
import { errorText } from '@/lib/issue-text'
import { useSettingsStore } from './settings'
import { useToastStore } from './toasts'

const DEFAULT_RETENTION: DataSettings = { keep_scans: 20, forget_ai_after_days: 30 }

export const useDataStore = defineStore('data', () => {
  const usage = shallowRef<DataUsage | null>(null)
  const retention = ref<DataSettings>({ ...DEFAULT_RETENTION })
  /** The oldest kept scan, for the "Oldest scan" tile. */
  const oldest = shallowRef<ScanSummary | null>(null)
  const loaded = ref(false)
  /** The file the last export wrote, until the next one. */
  const exported = ref<string | null>(null)
  const exporting = ref(false)
  // Saves go one after the other, so the file ends as the last choice left it.
  let queue: Promise<unknown> = Promise.resolve()

  function fail(error: unknown) {
    const text = isAppError(error)
      ? errorText(error as AppError, currentLocale())
      : t('settingsData.failed')
    useToastStore().push({ tone: 'crit', title: text })
  }

  /** Reads the folder, the retention limits and the oldest scan. A failed read keeps the last. */
  async function load() {
    try {
      const [folder, settings, history] = await Promise.all([
        dataUsage(),
        settingsGet(),
        historyList(),
      ])
      usage.value = folder
      retention.value = { ...settings.data }
      oldest.value = history.scans[0] ?? null
      loaded.value = true
    } catch (error) {
      if (!loaded.value) fail(error)
    }
  }

  function save(next: DataSettings) {
    retention.value = next
    queue = queue
      .then(() => settingsSetData(next))
      .then(
        () => undefined,
        async (error: unknown) => {
          fail(error)
          try {
            retention.value = { ...(await settingsGet()).data }
          } catch {
            // The refusal toast is already up; the choice on screen stays until a read works.
          }
        },
      )
  }

  function setKeep(limit: number | null) {
    save({ ...retention.value, keep_scans: limit })
  }

  function setForget(days: number | null) {
    save({ ...retention.value, forget_ai_after_days: days })
  }

  async function reveal() {
    try {
      await revealConfigDir()
    } catch (error) {
      fail(error)
    }
  }

  async function exportAll() {
    if (exporting.value) return
    exporting.value = true
    try {
      exported.value = (await dataExport()).name
    } catch (error) {
      fail(error)
    } finally {
      exporting.value = false
    }
  }

  async function clearHistory() {
    try {
      const gone = await dataClear()
      exported.value = null
      useToastStore().push({
        tone: 'ok',
        title: t('settingsData.start.deleted', { count: gone }, gone),
      })
      await load()
    } catch (error) {
      fail(error)
    }
  }

  async function resetAll() {
    try {
      await settingsReset()
      await Promise.all([useSettingsStore().load(), load()])
      useToastStore().push({ tone: 'ok', title: t('settingsData.start.resetDone') })
    } catch (error) {
      fail(error)
    }
  }

  return {
    usage,
    retention,
    oldest,
    loaded,
    exported,
    exporting,
    load,
    setKeep,
    setForget,
    reveal,
    exportAll,
    clearHistory,
    resetAll,
  }
})
