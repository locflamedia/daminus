// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import UiSelect, { type SelectOption } from './UiSelect.vue'

const models: SelectOption[] = [
  { value: 'sonnet', label: 'claude-sonnet-5', meta: 'default' },
  { value: 'opus', label: 'claude-opus-5-5', meta: 'deeper' },
  { value: 'haiku', label: 'claude-haiku-4-5', meta: 'fast' },
]

const languages: SelectOption[] = [
  { value: 'en', label: 'English', code: 'en', flag: 'gb' },
  { value: 'vi', label: 'Tiếng Việt', detail: 'Vietnamese', code: 'vi', flag: 'vn' },
  { value: 'ja', label: '日本語', detail: 'Japanese', code: 'ja', flag: 'jp', progress: 12 },
  { value: 'fr', label: 'Français', detail: 'French', code: 'fr', flag: 'fr', progress: 34 },
]

let mounted: VueWrapper | undefined
afterEach(() => {
  mounted?.unmount()
  mounted = undefined
})

function make(props: Record<string, unknown>) {
  mounted = mount(UiSelect, { props: props as never, attachTo: document.body })
  return mounted
}

const options = (w: VueWrapper) => w.findAll('[role="option"]')

describe('UiSelect (default)', () => {
  const base = { modelValue: 'sonnet', options: models, label: 'Model' }

  it('is a labelled button that shows the current value and opens a listbox', async () => {
    const wrapper = make(base)
    const trigger = wrapper.get('button.field')
    expect(wrapper.get('label').attributes('for')).toBe(trigger.attributes('id'))
    expect(trigger.attributes('aria-haspopup')).toBe('listbox')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(trigger.text()).toBe('claude-sonnet-5')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)

    await trigger.trigger('click')
    expect(wrapper.get('[role="listbox"]').attributes('aria-label')).toBe('Model')
    expect(options(wrapper).map((o) => o.get('.name').text())).toEqual([
      'claude-sonnet-5',
      'claude-opus-5-5',
      'claude-haiku-4-5',
    ])
    expect(options(wrapper).map((o) => o.attributes('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
    ])
    expect(options(wrapper)[0]?.find('svg.tick').exists()).toBe(true)
    expect(options(wrapper)[1]?.get('.meta').text()).toBe('deeper')
  })

  it('moves the text box into the field while open, with the value as placeholder', async () => {
    const wrapper = make(base)
    await wrapper.get('button.field').trigger('click')
    const input = wrapper.get('input[role="combobox"]')
    expect(input.attributes('placeholder')).toBe('claude-sonnet-5')
    expect(input.attributes('aria-expanded')).toBe('true')
    expect(input.attributes('aria-controls')).toBe(wrapper.get('[role="listbox"]').attributes('id'))
    expect(document.activeElement).toBe(input.element)
  })

  it('picks a clicked row and closes', async () => {
    const wrapper = make(base)
    await wrapper.get('button.field').trigger('click')
    await options(wrapper)[1]?.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['opus']])
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  })

  it('does not emit when the current value is picked again', async () => {
    const wrapper = make(base)
    await wrapper.get('button.field').trigger('click')
    await options(wrapper)[0]?.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('opens from the keyboard and picks with the arrows and Enter', async () => {
    const wrapper = make(base)
    await wrapper.get('button.field').trigger('keydown', { key: 'ArrowDown' })
    const input = wrapper.get('input')
    expect(input.attributes('aria-activedescendant')).toBe(options(wrapper)[0]?.attributes('id'))
    await input.trigger('keydown', { key: 'ArrowDown' })
    await input.trigger('keydown', { key: 'ArrowDown' })
    await input.trigger('keydown', { key: 'ArrowDown' })
    // Past the last row it wraps to the first.
    expect(input.attributes('aria-activedescendant')).toBe(options(wrapper)[0]?.attributes('id'))
    await input.trigger('keydown', { key: 'ArrowUp' })
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')).toEqual([['haiku']])
  })

  it('closes on Escape without picking, and returns to the field', async () => {
    const wrapper = make(base)
    await wrapper.get('button.field').trigger('click')
    await wrapper.get('input').trigger('keydown', { key: 'ArrowDown' })
    await wrapper.get('input').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(document.activeElement).toBe(wrapper.get('button.field').element)
  })

  it('stops Escape from reaching the window behind', async () => {
    const wrapper = make(base)
    await wrapper.get('button.field').trigger('click')
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    wrapper.get('input').element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('filters while typing and picks the first match with Enter', async () => {
    const wrapper = make(base)
    await wrapper.get('button.field').trigger('click')
    await wrapper.get('input').setValue('haiku')
    expect(options(wrapper)).toHaveLength(1)
    await wrapper.get('input').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')).toEqual([['haiku']])
  })

  it('offers a last row for a value that is not listed and takes what was typed', async () => {
    const wrapper = make({ ...base, customLabel: 'Type a model id…' })
    await wrapper.get('button.field').trigger('click')
    expect(options(wrapper).at(-1)?.text()).toBe('Type a model id…')
    await wrapper.get('input').setValue('claude-fable-1')
    expect(options(wrapper)).toHaveLength(1)
    await wrapper.get('input').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')).toEqual([['claude-fable-1']])
  })

  it('keeps the menu open when the custom row is chosen with nothing typed', async () => {
    const wrapper = make({ ...base, customLabel: 'Type a model id…' })
    await wrapper.get('button.field').trigger('click')
    await options(wrapper).at(-1)?.trigger('click')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('shows a value that is not in the list as it is', () => {
    const wrapper = make({ ...base, modelValue: 'claude-fable-1' })
    expect(wrapper.get('button.field').text()).toBe('claude-fable-1')
  })

  it('closes on a press outside, not on one inside', async () => {
    const wrapper = make(base)
    await wrapper.get('button.field').trigger('click')
    wrapper
      .get('[role="listbox"]')
      .element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  })

  it('can start open and can be disabled', async () => {
    const open = make({ ...base, defaultOpen: true })
    expect(open.find('[role="listbox"]').exists()).toBe(true)
    open.unmount()
    const off = make({ ...base, disabled: true })
    expect(off.get('button.field').attributes('disabled')).toBeDefined()
  })

  it('names itself by aria-label when it has no visible label', () => {
    const wrapper = make({ modelValue: 'sonnet', options: models, accessibleName: 'Model' })
    expect(wrapper.find('label').exists()).toBe(false)
    expect(wrapper.get('button.field').attributes('aria-label')).toBe('Model')
  })
})

describe('UiSelect (language)', () => {
  const base = {
    modelValue: 'en',
    options: languages,
    variant: 'language',
    accessibleName: 'App language',
    searchPlaceholder: 'Search languages',
    pendingLabel: 'Not translated yet',
    helpLabel: 'Help translate Daminus',
    emptyLabel: 'No language found',
  }

  it('shows the flag and name of the current language on the field', () => {
    const wrapper = make(base)
    const trigger = wrapper.get('button.field')
    expect(trigger.text()).toBe('English')
    expect(trigger.find('svg.flag').exists()).toBe(true)
  })

  it('opens with a search box, rows with flag, names and code, and the current one ticked', async () => {
    const wrapper = make(base)
    await wrapper.get('button.field').trigger('click')
    const search = wrapper.get('input[role="combobox"]')
    expect(search.attributes('placeholder')).toBe('Search languages')
    expect(document.activeElement).toBe(search.element)

    const [en, vi] = options(wrapper)
    expect(en?.find('svg.flag').exists()).toBe(true)
    expect(en?.find('svg.tick').exists()).toBe(true)
    expect(en?.get('.code').text()).toBe('en')
    expect(vi?.get('.name').text()).toBe('Tiếng Việt')
    expect(vi?.get('.detail').text()).toBe('Vietnamese')
    expect(vi?.find('svg.tick').exists()).toBe(false)
  })

  it('lists untranslated languages last, dimmed, with their share, and cannot pick them', async () => {
    const wrapper = make(base)
    await wrapper.get('button.field').trigger('click')
    const group = wrapper.get('[role="group"]')
    expect(group.attributes('aria-label')).toBe('Not translated yet')
    expect(group.get('.group-label').text()).toBe('Not translated yet')
    const rows = group.findAll('[role="option"]')
    expect(rows.map((r) => r.get('.percent').text())).toEqual(['12%', '34%'])
    expect(rows.every((r) => r.attributes('aria-disabled') === 'true')).toBe(true)
    await rows[0]?.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
  })

  it('skips the untranslated rows with the arrow keys', async () => {
    const wrapper = make(base)
    await wrapper.get('button.field').trigger('click')
    const search = wrapper.get('input')
    await search.trigger('keydown', { key: 'ArrowDown' })
    await search.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')).toEqual([['vi']])
  })

  it('finds a language by its English name, its code or without accents', async () => {
    const wrapper = make(base)
    await wrapper.get('button.field').trigger('click')
    await wrapper.get('input').setValue('viet')
    expect(options(wrapper).map((o) => o.get('.name').text())).toEqual(['Tiếng Việt'])
    await wrapper.get('input').setValue('franc')
    expect(options(wrapper).map((o) => o.get('.name').text())).toEqual(['Français'])
    await wrapper.get('input').setValue('JA')
    expect(options(wrapper).map((o) => o.get('.name').text())).toEqual(['日本語'])
  })

  it('says when nothing matches', async () => {
    const wrapper = make(base)
    await wrapper.get('button.field').trigger('click')
    await wrapper.get('input').setValue('zzz')
    expect(options(wrapper)).toHaveLength(0)
    expect(wrapper.get('.empty').text()).toBe('No language found')
  })

  it('ends with a link to help translate that emits help', async () => {
    const wrapper = make(base)
    await wrapper.get('button.field').trigger('click')
    const help = wrapper.get('button.help')
    expect(help.text()).toBe('Help translate Daminus')
    await help.trigger('click')
    expect(wrapper.emitted('help')).toHaveLength(1)
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
  })

  it('picks a language by click', async () => {
    const wrapper = make(base)
    await wrapper.get('button.field').trigger('click')
    await options(wrapper)[1]?.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['vi']])
  })
})
