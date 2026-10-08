// A message of the Security tab from the `{ key, params }` the libraries return. A numeric
// `n` picks the plural form, as the messages are written.
import { useI18n } from 'vue-i18n'
import type { Msg } from '@/lib/security-rows'

export type MsgGroup = 'value' | 'title' | 'event'

export function useMsg() {
  const { t } = useI18n()
  return (group: MsgGroup, m: Msg): string => {
    const params = m.params ?? {}
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
