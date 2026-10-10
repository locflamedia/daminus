// A message of the Security tab from the `{ key, params }` the libraries return. A numeric
// `n` picks the plural form, as the messages are written; a `reason` (why a check could not
// answer) is the core's code and is shown in the app language.
import { useI18n } from 'vue-i18n'
import type { Msg } from '@/lib/security-rows'

export type MsgGroup = 'value' | 'title' | 'event'

const REASONS = new Set(['needs_perm', 'timeout', 'unreachable', 'missing', 'unsupported'])

export function useMsg() {
  const { t, locale } = useI18n()
  return (group: MsgGroup, m: Msg): string => {
    const raw = m.params ?? {}
    const reason = raw.reason
    const params =
      typeof reason === 'string' && REASONS.has(reason)
        ? { ...raw, reason: t(`unknown.${reason}`).toLocaleLowerCase(locale.value) }
        : raw
    const n = params.n
    const plural = typeof n === 'number' ? n : undefined
    const key =
      group === 'value'
        ? `projectSecurity.value.${m.key}`
        : group === 'title'
          ? `projectSecurity.title.${m.key}`
          : `projectSecurity.event.${m.key}`
    return plural === undefined ? t(key, params) : t(key, params, plural)
  }
}
