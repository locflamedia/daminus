// The languages the language select lists, in the order of the board: the two the app ships,
// then the ones that are not translated yet with the share that is. A language is one locale
// file plus one row here; a row with `progress` is shown dimmed and cannot be chosen.
import { type Locale } from '@/i18n'
import type { SelectOption } from '@/ui/UiSelect.vue'

export const LANGUAGE_OPTIONS: readonly SelectOption[] = [
  { value: 'en', label: 'English', code: 'en', flag: 'gb' },
  { value: 'vi', label: 'Tiếng Việt', detail: 'Vietnamese', code: 'vi', flag: 'vn' },
  { value: 'ja', label: '日本語', detail: 'Japanese', code: 'ja', flag: 'jp', progress: 12 },
  { value: 'ko', label: '한국어', detail: 'Korean', code: 'ko', flag: 'kr', progress: 0 },
  {
    value: 'zh-Hans',
    label: '简体中文',
    detail: 'Chinese',
    code: 'zh-Hans',
    flag: 'cn',
    progress: 0,
  },
  { value: 'fr', label: 'Français', detail: 'French', code: 'fr', flag: 'fr', progress: 34 },
]

/** The name of a language in itself, for the toast that says the app switched. */
export function nativeName(locale: Locale): string {
  return LANGUAGE_OPTIONS.find((o) => o.value === locale)?.label ?? locale
}
