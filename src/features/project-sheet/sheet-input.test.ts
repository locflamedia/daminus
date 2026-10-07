// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SheetInput from './SheetInput.vue'

const source = readFileSync(
  join(process.cwd(), 'src/features/project-sheet/SheetInput.vue'),
  'utf8',
)

describe('a sheet field with a problem', () => {
  it('marks itself invalid and carries the error state', () => {
    const wrapper = mount(SheetInput, { props: { modelValue: '', tone: 'error' } })
    expect(wrapper.classes()).toContain('tone-error')
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('true')
  })

  it('does not claim a problem when there is none', () => {
    const wrapper = mount(SheetInput, { props: { modelValue: '' } })
    expect(wrapper.classes().some((c) => c.startsWith('tone-'))).toBe(false)
    expect(wrapper.find('input').attributes('aria-invalid')).toBeUndefined()
  })

  it('keeps a red ring while focused, an amber one for a warning, never the blue focus ring', () => {
    const rule = (selector: string) =>
      new RegExp(`${selector.replace(/[.:]/g, '\\$&')} \\{([^}]*)\\}`).exec(source)?.[1] ?? ''
    expect(rule('.tone-error:focus-within')).toContain('var(--crit-solid)')
    expect(rule('.tone-warn:focus-within')).toContain('var(--warn-solid)')
    expect(rule('.tone-error:focus-within')).not.toContain('--field-focus-ring')
  })
})
