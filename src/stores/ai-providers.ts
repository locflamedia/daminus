// Settings › AI providers: what the core says about the eight profiles, which one is shown, the
// model lists and the last test of each. Choices are sent at once (`ai_settings_set` checks them
// and answers with the whole file) and the view is read again. A key is only ever an argument
// of `saveKey`: it is not kept here, not logged, and the core never sends it back (`key_set`).
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AiProvidersView } from '@/api/bindings/AiProvidersView'
import type { AiSettings } from '@/api/bindings/AiSettings'
import type { ModelList } from '@/api/bindings/ModelList'
import {
  type AppError,
  aiModels,
  aiProviders,
  aiSetKey,
  aiSettingsSet,
  aiTest,
  isAppError,
} from '@/api'
import { currentLocale, t } from '@/i18n'
import { errorText } from '@/lib/issue-text'
import { useToastStore } from './toasts'

export type TestState =
  { phase: 'busy' } | { phase: 'ok'; ms: number } | { phase: 'fail'; message: string }

function words(error: unknown): string {
  return isAppError(error as AppError)
    ? errorText(error as AppError, currentLocale())
    : t('aiProviders.failed')
}

/** A copy of `record` without `key`. */
function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key))
}

export const useAiProvidersStore = defineStore('aiProviders', () => {
  const view = ref<AiProvidersView | null>(null)
  const loadError = ref<string | null>(null)
  /** The provider whose panel is open; the active one is `view.provider`. */
  const viewed = ref<string | null>(null)
  const models = ref<Record<string, ModelList>>({})
  const tests = ref<Record<string, TestState>>({})
  const keyErrors = ref<Record<string, string>>({})
  const busyKey = ref<string | null>(null)

  const entries = computed(() => view.value?.providers ?? [])
  const current = computed(() => entries.value.find((e) => e.profile.id === viewed.value) ?? null)
  const on = computed(() => view.value?.provider != null)

  async function load() {
    try {
      const next = await aiProviders()
      view.value = next
      loadError.value = null
      const known = entries.value.some((e) => e.profile.id === viewed.value)
      if (!known) {
        const first = entries.value.find((e) => e.profile.tag === 'recommended')
        viewed.value = next.provider ?? first?.profile.id ?? entries.value[0]?.profile.id ?? null
      }
    } catch (error) {
      loadError.value = words(error)
    }
  }

  function settings(patch: Partial<AiSettings>): AiSettings {
    const v = view.value
    return {
      provider: v?.provider ?? null,
      model: v?.model ?? null,
      claude_code_acknowledged: v?.claude_code_ack ?? false,
      base_url: v?.base_url ?? null,
      ...patch,
    }
  }

  /** Sends the change, then reads the view again. Answers false (and says why) when refused. */
  async function apply(patch: Partial<AiSettings>): Promise<boolean> {
    try {
      await aiSettingsSet(settings(patch))
    } catch (error) {
      useToastStore().push({ tone: 'crit', title: words(error) })
      return false
    }
    await load()
    return true
  }

  /** Opens a provider's panel and makes it the active one, unless Claude Code is not accepted yet. */
  async function select(id: string) {
    viewed.value = id
    const v = view.value
    if (!v || v.provider === id) return
    if (id === 'claude-code' && !v.claude_code_ack) return
    await apply({ provider: id, model: null, base_url: null })
  }

  /** The "AI" switch: off keeps every choice, on brings back the open provider. */
  async function setOn(next: boolean) {
    if (!next) return void (await apply({ provider: null }))
    const v = view.value
    const gated = viewed.value === 'claude-code' && !v?.claude_code_ack
    const id = gated
      ? entries.value.find((e) => e.profile.tag === 'recommended')?.profile.id
      : viewed.value
    if (id) await select(id)
  }

  function setModel(model: string | null) {
    return apply({ model })
  }

  function setBaseUrl(baseUrl: string | null) {
    return apply({ base_url: baseUrl })
  }

  /** "I understand": on turns Claude Code on; off turns it off again. */
  function setAcknowledged(accepted: boolean) {
    const v = view.value
    if (accepted)
      return apply({
        claude_code_acknowledged: true,
        provider: 'claude-code',
        model: null,
        base_url: null,
      })
    return apply({
      claude_code_acknowledged: false,
      provider: v?.provider === 'claude-code' ? null : (v?.provider ?? null),
    })
  }

  /** Sends the key once and forgets it. Answers whether it was stored. */
  async function saveKey(providerId: string, key: string): Promise<boolean> {
    busyKey.value = providerId
    keyErrors.value = omit(keyErrors.value, providerId)
    try {
      await aiSetKey(providerId, key)
    } catch (error) {
      keyErrors.value = { ...keyErrors.value, [providerId]: words(error) }
      return false
    } finally {
      busyKey.value = null
    }
    models.value = omit(models.value, providerId)
    await load()
    return true
  }

  async function loadModels(providerId: string) {
    try {
      models.value = { ...models.value, [providerId]: await aiModels(providerId) }
    } catch {
      const profile = entries.value.find((e) => e.profile.id === providerId)?.profile
      models.value = {
        ...models.value,
        [providerId]: {
          models: [...(profile?.models ?? [])],
          source: 'suggested',
          manual_entry: true,
        },
      }
    }
  }

  async function test(providerId: string) {
    tests.value = { ...tests.value, [providerId]: { phase: 'busy' } }
    let next: TestState
    try {
      const answer = await aiTest(providerId)
      next = answer.ok
        ? { phase: 'ok', ms: answer.ms }
        : {
            phase: 'fail',
            message: answer.error
              ? errorText({ code: answer.error, retryable: false }, currentLocale())
              : t('aiProviders.failed'),
          }
    } catch (error) {
      next = { phase: 'fail', message: words(error) }
    }
    tests.value = { ...tests.value, [providerId]: next }
  }

  return {
    view,
    loadError,
    viewed,
    models,
    tests,
    keyErrors,
    busyKey,
    entries,
    current,
    on,
    load,
    select,
    setOn,
    setModel,
    setBaseUrl,
    setAcknowledged,
    saveKey,
    loadModels,
    test,
  }
})
