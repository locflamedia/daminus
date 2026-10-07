// How the sheet finds a field to focus: every input that can hold an error carries a
// `data-sheet-field` of this form.
import type { FieldTarget } from '@/lib/sheet-issues'

export function fieldName(target: FieldTarget): string {
  switch (target.kind) {
    case 'url':
      return `url:${target.index}`
    case 'part':
      return `part:${target.key}`
    default:
      return target.kind
  }
}

export function fieldSelector(target: FieldTarget): string {
  return `[data-sheet-field="${fieldName(target)}"]`
}
